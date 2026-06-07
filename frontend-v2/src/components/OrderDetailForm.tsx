import { useEffect, useState, useMemo } from 'react'
import { Form, Input, DatePicker, InputNumber, Select, Button, message, Modal, Table as AntTable, Spin, Tooltip, Tag } from 'antd'
import { SearchOutlined, PlusOutlined, ExclamationCircleOutlined, DeleteOutlined, CheckOutlined, TagsOutlined } from '@ant-design/icons'
import { getOrder, updateOrder } from '@/api/orders'
import client from '@/api/client'

// ── UOM normalization ─────────────────────────────────────────────────────────
function uomGroup(uom: string): string {
  const u = (uom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/^(th[uù]ng|thung|box|cs|carton|ctn)$/.test(u)) return 'thùng'
  if (/^(chai|bottle|pc|pcs|piece)$/.test(u)) return 'chai'
  if (/^(lon|can|bi[nh]h?)$/.test(u)) return 'lon'
  if (/^(b[ìi]nh|binh)$/.test(u)) return 'bình'
  if (/^(l[oô]c|loc|pack)$/.test(u)) return 'lốc'
  return u
}
function isSignificantUomChange(from: string, to: string): boolean {
  const gFrom = uomGroup(from)
  const gTo   = uomGroup(to)
  if (!from || !to || gFrom === gTo) return false
  // chai/lon/bình → thùng/lốc = meaningful (different pricing unit)
  return gTo === 'thùng' || gTo === 'lốc'
}

// ── Người thực hiện (executor → MISA owner_name) ────────────────────────────
const LS_KEY = 'misa_salesperson'
const DEFAULT_SALESPERSON = 'Hà Mộng Thúy (KM0139)'
const SALESPERSON_OPTIONS = [
  'Đỗ Thị Mỹ Dung (ar-km@satoricompany.vn)',
  'Hà Mộng Thúy (KM0139)',
  'Lê Thị Hồng Hân (KM1602)',
  'Nguyễn Thị Ngọc Thắng (KM0115)',
  'Nguyễn Thị Tuyến (tuyen.nguyen@satoricompany.vn)',
  'TRẦN MINH QUỐC (quoc.tran@satoricompany.vn)',
  'Trần Ngọc Nhi (KM1847)',
  'Trương Thanh Vũ (ktth@satoricompany.vn)',
].map(v => ({ value: v, label: v }))

function getSavedSalesperson(): string {
  try { return localStorage.getItem(LS_KEY) || DEFAULT_SALESPERSON } catch { return DEFAULT_SALESPERSON }
}
function saveSalesperson(v: string) {
  try { localStorage.setItem(LS_KEY, v) } catch {}
}

// ── Nhân viên bán hàng (custom_field4 → MISA) ────────────────────────────────
const LS_NV_KEY = 'misa_nv_ban_hang'
const DEFAULT_NV = 'KM1989-Nguyễn Văn Ân'
const NV_OPTIONS = [
  'Trần Hữu Thành',
  'Võ Chí Thông',
  'KM1989-Nguyễn Văn Ân',
  'KD0209-Lê Văn Vinh',
  'KD0045-Nguyễn Đình Việt',
  'KD0003-Nguyễn Thị Mai Hân',
  'KM1349-Mai Tiến Hợp',
  'KD0002-Nguyễn Huỳnh Sơn',
  'KD0217-Nguyễn Thị Như Thảo',
  'KM4048-Lê Ngân Vương',
  'KM1753-Cao Viết Thắng',
  'KD0092-Đỗ Thành Công',
  'KM0189-Doãn Thị Ngư',
].map(v => ({ value: v, label: v }))

function getSavedNV(): string {
  try { return localStorage.getItem(LS_NV_KEY) || DEFAULT_NV } catch { return DEFAULT_NV }
}
function saveNV(v: string) {
  try { localStorage.setItem(LS_NV_KEY, v) } catch {}
}
import type { OrderLine } from '@/types/order'
import CustomerContactPopup, { type CustomerContactResult, type Contact } from '@/components/CustomerContactPopup'
import { matchProduct, searchProducts, type Product } from '@/utils/productMatcher'
import { getProducts } from '@/utils/catalogStore'
import { getUomConversion, type UomConversionResult } from '@/utils/uomConversion'
import type { PriceOverride } from '@/components/SelectPopup'
import ContactSelectPopup from '@/components/ContactSelectPopup'
import dayjs from 'dayjs'

function EditableCell({ value, type = 'text', onChange, placeholder }: { value: string | number | null | undefined; type?: 'text' | 'number'; onChange: (val: unknown) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value)
  useEffect(() => { setLocalVal(value) }, [value])
  if (!editing) {
    return (<div className="cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 min-h-[22px] text-xs" onClick={() => setEditing(true)}>{type === 'number' && localVal != null ? Number(localVal).toLocaleString('vi-VN') : localVal || <span className="text-gray-300">{placeholder || '\u2014'}</span>}</div>)
  }
  return type === 'number' ? (<InputNumber size="small" autoFocus value={localVal as number} onChange={v => setLocalVal(v)} onBlur={() => { setEditing(false); onChange(localVal) }} onPressEnter={() => { setEditing(false); onChange(localVal) }} className="w-full" />) : (<Input size="small" autoFocus value={localVal as string} onChange={e => setLocalVal(e.target.value)} onBlur={() => { setEditing(false); onChange(localVal) }} onPressEnter={() => { setEditing(false); onChange(localVal) }} />)
}

function InputWithPopup({ value, placeholder, onPopupClick }: { value?: string; placeholder?: string; onPopupClick: () => void }) {
  return (
    <div className="flex items-center gap-0">
      <Input value={value} placeholder={placeholder || '- Không chọn -'} readOnly className="flex-1" />
      <Button icon={<SearchOutlined />} onClick={onPopupClick} className="border-l-0 rounded-l-none" title="Chọn từ danh sách" />
    </div>
  )
}

function ProductModal({ open, suggestName, onSelect, onCancel, priceOverrides }: { open: boolean; suggestName: string; onSelect: (p: Product) => void; onCancel: () => void; priceOverrides?: Map<string, PriceOverride> }) {
  const [query, setQuery] = useState('')
  const results = query.trim() ? searchProducts(query) : suggestName ? matchProduct(suggestName, 20).map(r => r.product) : searchProducts('')
  return (
    <Modal title="Chọn hàng hóa" open={open} onCancel={onCancel} width="90vw" style={{ maxWidth: 1000 }} footer={null} zIndex={1200}>
      <Input.Search placeholder="Tìm theo tên hoặc mã hàng hóa..." value={query} onChange={e => setQuery(e.target.value)} className="mb-3" allowClear autoFocus />
      {suggestName && !query && <div className="mb-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded">Gợi ý: <strong>{suggestName}</strong></div>}
      {priceOverrides && priceOverrides.size > 0 && (
        <div className="mb-2 text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded flex items-center gap-1">
          <TagsOutlined /><span>Hàng nền vàng có giá chiết khấu áp dụng cho khách hàng này</span>
        </div>
      )}
      <AntTable size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={results} rowKey="code"
        scroll={{ x: 900, y: 360 }}
        rowClassName={(r: any) => priceOverrides?.has(r.code) ? '!bg-amber-50' : ''}
        onRow={record => ({ onClick: () => onSelect(record as Product), className: 'cursor-pointer hover:bg-blue-50' })}
        columns={[
          { title: 'Mã hàng hóa', dataIndex: 'code', width: 120 },
          { title: 'Tên hàng hóa', dataIndex: 'name', width: 280 },
          { title: 'Loại HH', dataIndex: 'product_type', width: 110 },
          { title: 'ĐVT', dataIndex: 'uom', width: 80 },
          {
            title: 'Đơn giá', dataIndex: 'price', width: 140,
            render: (v: number, r: any) => {
              const ov = priceOverrides?.get(r.code)
              if (ov) return <span className="flex items-center gap-1">
                {v ? <span className="line-through text-slate-400 text-[10px]">{v.toLocaleString('vi-VN')}</span> : null}
                <span className="font-bold text-orange-700 bg-orange-100 border border-orange-300 rounded px-1 text-[11px]">{ov.unit_price.toLocaleString('vi-VN')} {'đ'} {'★'}</span>
              </span>
              return v ? v.toLocaleString('vi-VN') : '\u2014'
            }
          },
          { title: 'Thuế', dataIndex: 'tax_rate', width: 80 },
          { title: 'Tính chất', dataIndex: 'property', width: 140 },
        ]}
        locale={{ emptyText: 'Không tìm thấy hàng hóa' }} />
    </Modal>
  )
}

function productTaxRate(product: Product): number {
  return parseFloat(String(product.tax_rate || '').replace('%', '')) || 0
}

function applyProductToLine(line: OrderLine, product: Product): OrderLine {
  const savedPrice = Number(line.unit_price) || 0
  const catalogPrice = Number(product.price) || 0
  const unitPrice = savedPrice || catalogPrice
  return {
    ...line,
    ocr_product_code: product.code,           // luôn dùng code catalog sau khi map
    product_name_original: line.product_name_original || product.name,
    uom_original: product.uom,                // luôn dùng UOM từ catalog
    unit_price: unitPrice,
    tax_rate: productTaxRate(product) !== 0 ? productTaxRate(product) : (line.tax_rate ?? 0),
    line_total: line.line_total,              // giữ nguyên từ PDF
    mapping_status: 'mapped',
  }
}

function isSystemLine(line: Partial<OrderLine>): boolean {
  return line.mapping_status === 'overridden'
}

type PopupType = 'customer' | 'contact' | null
type CustomerData = Record<string, string>

function contactToCustomerData(contact: Contact, matchedCustomer: CustomerData | null): CustomerData {
  const addr = contact.delivery_address || contact.address || ''
  return {
    ...(matchedCustomer || {}),
    // Contact là tuyệt đối — override tất cả delivery + phone + email
    ...(addr ? { invoice_address: addr, invoice_street: addr, delivery_address: addr, delivery_street: addr } : {}),
    ...(contact.city ? { invoice_city: contact.city, delivery_city: contact.city } : {}),
    ...(contact.district ? { invoice_district: contact.district, delivery_district: contact.district } : {}),
    ...(contact.ward ? { invoice_ward: contact.ward, delivery_ward: contact.ward } : {}),
    ...(contact.phone || contact.phone_work ? { delivery_phone: contact.phone || contact.phone_work || '' } : {}),
    contact: contact.name,
    contact_code: contact.code,
    contact_phone: contact.phone || contact.phone_work || '',
    contact_email: contact.email || contact.email_personal || '',
    contact_organization: contact.organization || '',
    owner: contact.name,
    invoice_buyer: contact.name,
    delivery_receiver: contact.name,
  }
}

interface Props {
  orderId: string
  onSaved?: () => void
  onLocalSaved?: (updatedLines: OrderLine[]) => void
}

function toCustomerData(record?: Record<string, unknown> | null): CustomerData | null {
  if (!record) return null
  const value = (key: string) => String(record[key] ?? '')
  const invoiceAddress = value('invoice_address') || value('invoice_street')
  const deliveryAddress = value('delivery_address') || value('delivery_street') || invoiceAddress
  const name = value('name') || value('customer_name') || value('invoice_customer')
  const owner = value('invoice_buyer') || ''
  const phone = value('phone') || value('customer_phone') || value('delivery_phone')
  return {
    code: value('code') || value('customer_code'),
    type: value('type') || value('customer_type'),
    name,
    tax_code: value('tax_code') || value('customer_tax_code'),
    phone,
    email: value('email'),
    field: value('field'),
    owner,
    description: value('description'),
    invoice_address: invoiceAddress,
    invoice_city: value('invoice_city'),
    invoice_district: value('invoice_district'),
    invoice_ward: value('invoice_ward'),
    delivery_address: deliveryAddress,
    delivery_receiver: value('delivery_receiver') || value('name') || value('customer_name') || '',
    delivery_phone: value('delivery_phone') || phone,
    delivery_city: value('delivery_city'),
    delivery_district: value('delivery_district'),
    delivery_ward: value('delivery_ward'),
  }
}

function buildExtraData(customer: CustomerData): Record<string, string> {
  return {
    ...customer,
    customer_code: customer.code || '',
    customer_type: customer.type || '',
    customer_name: customer.name || '',
    customer_tax_code: customer.tax_code || '',
    customer_phone: customer.phone || '',
    customer_owner: customer.owner || '',
    invoice_customer: customer.name || '',
    invoice_buyer: customer.owner || '',
    invoice_street: customer.invoice_address || '',
    delivery_receiver: customer.delivery_receiver || customer.owner || '',
    delivery_phone: customer.delivery_phone || customer.phone || '',
    delivery_street: customer.delivery_address || customer.invoice_address || '',
  }
}

export default function OrderDetailForm({ orderId, onSaved, onLocalSaved }: Props) {
  const [form] = Form.useForm()
  const [lines, setLines] = useState<OrderLine[]>([])
  const [productModalIdx, setProductModalIdx] = useState<number | null>(null)
  const [activePopup, setActivePopup] = useState<PopupType>(null)
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedCustomerData, setSelectedCustomerData] = useState<CustomerData>({})
  const [selectedContactName, setSelectedContactName] = useState('')
  // "fuzzy" = hệ thống tự ghép theo tên/địa chỉ khi OCR — CHƯA chắc đúng, cần kế toán
  // tự kiểm tra; "tax_code"/"manual" = đáng tin cậy (khớp MST hoặc người dùng tự chọn)
  const [customerMatchType, setCustomerMatchType] = useState('')
  const [contactMatchType, setContactMatchType] = useState('')
  const [salesperson, setSalesperson] = useState(getSavedNV)
  const [loading, setLoading] = useState(true)
  const [nextNo, setNextNo] = useState('')
  const [pricebooks, setPricebooks] = useState<Array<{code:string;name:string;items:Array<{product_code:string;unit_price:number}>}>>([])
  const [vouchers, setVouchers] = useState<Array<{code:string;name:string;type:string;customers:string[];items:any[];is_active:boolean;multiplier:boolean}>>([])
  const [selectedVoucher, setSelectedVoucher] = useState<typeof vouchers[0] | null>(null)
  const [selectedPricebook, setSelectedPricebook] = useState<typeof pricebooks[0] | null>(null)
  const [deletingLineIdx, setDeletingLineIdx] = useState<number | null>(null)
  const [pendingChange, setPendingChange] = useState<{
    lineIdx: number; product: Product
    uomFrom?: string; uomTo?: string; uomChanged: boolean
    pbPrice?: number; pbName?: string; currentPrice?: number
  } | null>(null)
  const [pendingUomConversion, setPendingUomConversion] = useState<{
    lineIdx: number
    nextLine: OrderLine
    conversion: UomConversionResult
  } | null>(null)

  // Build pricebook price map for product selection
  const priceOverrides = useMemo(() => {
    const map = new Map<string, PriceOverride>()
    for (const pb of pricebooks) {
      for (const item of pb.items) {
        if (!map.has(item.product_code))
          map.set(item.product_code, { unit_price: item.unit_price, pricebook_name: pb.name, pricebook_code: pb.code })
      }
    }
    return map
  }, [pricebooks])

  const setCustField = (key: string, val: string) =>
    setSelectedCustomerData(prev => ({ ...prev, [key]: val }))

  useEffect(() => {
    client.get('/misa/sale-orders/next-no').then(r => setNextNo(r.data.next_no)).catch(() => {})
  }, [])

  // Fetch pricebooks + vouchers when customer code is known
  useEffect(() => {
    const code = selectedCustomerData.code || selectedCustomerData.customer_code
    if (!code) { setPricebooks([]); setVouchers([]); return }
    client.get('/misa/price-books/for-customers', { params: { codes: code } })
      .then(r => setPricebooks(r.data?.[code] || []))
      .catch(() => setPricebooks([]))
    client.get('/vouchers/for-customers', { params: { codes: code } })
      .then(r => setVouchers(r.data?.[code] || []))
      .catch(() => setVouchers([]))
  }, [selectedCustomerData.code, selectedCustomerData.customer_code])

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    getOrder(orderId).then(order => {
      form.setFieldsValue({
        order_number: order.order_number || '',
        order_date: order.order_date ? dayjs(order.order_date) : null,
        delivery_date: order.delivery_date ? dayjs(order.delivery_date) : null,
        total_amount: order.total_amount,
        po_number: order.po_number,
        order_type: String(order.extra_data?.order_type || 'Kênh MT'),
        payment_due: order.order_date ? dayjs(order.order_date).add(1, 'month') : null,
      })
      const extra = order.extra_data as Record<string, unknown> | null
      const customerData = toCustomerData(extra)
      const baseData: CustomerData = customerData || {}
      setSelectedCustomer(baseData.name || order.recipient_name || '')
      setSelectedCustomerData({
        ...baseData,
        salesperson: String(extra?.executor || getSavedSalesperson()),
        credit_days: String(extra?.credit_days || ''),
        contact: String(extra?.contact || ''),
      })
      setSelectedContactName(String(extra?.contact || ''))
      setCustomerMatchType(String(extra?.customer_match_type || ''))
      setContactMatchType(String(extra?.contact_match_type || ''))
      if (extra?.salesperson) setSalesperson(String(extra.salesperson))
      // Chỉ fill thông tin cho MAPPED lines từ catalog. Pending lines giữ nguyên.
      const allProducts = getProducts()
      const mappedLines = (order.lines || []).map(line => {
        if (line.mapping_status !== 'mapped') return line  // pending = giữ nguyên, không auto-map
        // Mapped: tìm product từ DB relationship code
        const dbCode = line.product_code as string | null
        if (dbCode) {
          const exactMatch = allProducts.find(p => p.code === dbCode)
          if (exactMatch) return applyProductToLine(line, exactMatch)
        }
        return line
      })
      setLines(mappedLines)
      setLoading(false)
    }).catch(() => { setLoading(false) })
  }, [orderId, form])

  // Tự động đồng bộ tổng tiền (bao gồm thuế) khi đổi dòng hàng
  useEffect(() => {
    if (loading) return
    const totalWithTax = lines.reduce((s, l) => {
      const lt = Number(l.line_total) || 0
      const tx = Math.round(lt * (Number(l.tax_rate) || 0) / 100)
      return s + lt + tx
    }, 0)
    form.setFieldValue('total_amount', totalWithTax)
  }, [lines, form, loading])

  const updateLine = (i: number, field: string, value: unknown) => {
    const current = lines[i]
    if ((field === 'uom_original' || field === 'quantity') && current) {
      const products = getProducts()
      const product = products.find(p => p.code === current.ocr_product_code || p.code === (current as any).product_code || p.code === (current as any).product_code_mapped)
        || matchProduct(current.product_name_original || '', 1)[0]?.product
      const nextLine = { ...current, [field]: value } as OrderLine
      const conversion = getUomConversion({
        quantity: nextLine.quantity,
        sourceUom: nextLine.uom_original,
        targetUom: product?.uom,
        product,
        fallbackProductName: nextLine.product_name_original || '',
      })

      if (conversion && conversion.fromUom !== conversion.toUom) {
        setPendingUomConversion({ lineIdx: i, nextLine, conversion })
        return
      }
    }

    setLines(prev => {
      const u = [...prev]
      const line = { ...u[i], [field]: value }
      // Auto-recalculate line_total when unit_price or quantity changes
      if (field === 'unit_price' || field === 'quantity') {
        const price = Number(field === 'unit_price' ? value : line.unit_price) || 0
        const qty = Number(field === 'quantity' ? value : line.quantity) || 0
        if (price > 0 && qty > 0) line.line_total = price * qty
      }
      // Auto-recalculate unit_price when line_total or quantity changes
      if (field === 'line_total') {
        const total = Number(value) || 0
        const qty = Number(line.quantity) || 0
        if (total > 0 && qty > 0) line.unit_price = Math.round(total / qty)
      }
      u[i] = line
      return u
    })
  }

  const applyUomConversion = () => {
    if (!pendingUomConversion) return
    const { lineIdx, nextLine, conversion } = pendingUomConversion
    setLines(prev => {
      const u = [...prev]
      const line = {
        ...nextLine,
        quantity: conversion.convertedQty,
        uom_original: conversion.toUom,
      }
      const currentTotal = Number(nextLine.line_total) || 0
      const price = Number(line.unit_price) || 0
      if (currentTotal > 0 && conversion.convertedQty > 0) {
        line.line_total = currentTotal
        line.unit_price = Math.round(currentTotal / conversion.convertedQty)
      } else if (price > 0) {
        line.line_total = price * conversion.convertedQty
      }
      u[lineIdx] = line
      return u
    })
    setPendingUomConversion(null)
  }

  const keepUomConversionOriginal = () => {
    if (!pendingUomConversion) return
    const { lineIdx, nextLine } = pendingUomConversion
    setLines(prev => {
      const u = [...prev]
      const line = { ...nextLine }
      const price = Number(line.unit_price) || 0
      const qty = Number(line.quantity) || 0
      if (price > 0 && qty > 0) line.line_total = price * qty
      u[lineIdx] = line
      return u
    })
    setPendingUomConversion(null)
  }

  const buildSavePayload = (nextLines: OrderLine[]) => {
    const values = form.getFieldsValue()
    const paymentDue = values.payment_due ? (values.payment_due as dayjs.Dayjs).format('DD/MM/YYYY') : ''
    const meta: Record<string, string> = {
      ...buildExtraData(selectedCustomerData),
      order_type: values.order_type || 'Kênh MT',
      executor: selectedCustomerData.salesperson || getSavedSalesperson(),
      salesperson: salesperson || getSavedNV(),
      credit_days: selectedCustomerData.credit_days || '',
      contact: selectedContactName || selectedCustomerData.contact || '',
      payment_due: paymentDue,
      customer_match_type: customerMatchType,
      contact_match_type: contactMatchType,
    }
    return {
      ...values,
      order_number: nextNo || values.order_number,
      order_date: values.order_date ? (values.order_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      delivery_date: values.delivery_date ? (values.delivery_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      recipient_name: selectedCustomer || null,
      description: selectedCustomerData.invoice_address || null,
      extra_data: meta,
      lines: nextLines,
    }
  }

  const isUnitPriceDiscountVoucher = (voucher: typeof vouchers[0]) =>
    (voucher.type || '').toLowerCase().includes('giảm tiền trên đơn giá')

  const findVoucherLine = (nextLines: OrderLine[], item: any) => nextLines.find(line => {
    if (isSystemLine(line)) return false
    const codes = new Set([
      (line as any).product_code_mapped,
      line.ocr_product_code,
      (line as any).temp_code,
      (line as any).product_code,
    ].filter(Boolean))
    return codes.has(item.product_code)
  })

  const voucherAllConditionsMet = (voucher: typeof vouchers[0]) =>
    !!voucher.items?.length && voucher.items.every(item => {
      const matchedLine = findVoucherLine(lines, item)
      return matchedLine && (Number(matchedLine.quantity) || 0) >= Number(item.quantity || 0)
    })

  const applyVoucher = async (voucher: typeof vouchers[0]) => {
    const missing: string[] = []
    const insufficient: string[] = []

    for (const item of voucher.items || []) {
      const matchedLine = findVoucherLine(lines, item)
      if (!matchedLine) {
        missing.push(`${item.product_code} - ${item.product_name}`)
        continue
      }
      const orderedQty = Number(matchedLine.quantity) || 0
      if (orderedQty < Number(item.quantity || 0)) {
        insufficient.push(`${item.product_code} (cần ${item.quantity}, có ${orderedQty})`)
      }
    }

    if (missing.length || insufficient.length) {
      const detail: string[] = []
      if (missing.length) detail.push(`Thiếu sản phẩm:\n• ${missing.join('\n• ')}`)
      if (insufficient.length) detail.push(`Chưa đủ số lượng:\n• ${insufficient.join('\n• ')}`)
      message.error({ content: detail.join('\n\n'), duration: 6 })
      return
    }

    let nextLines: OrderLine[] = []

    if (isUnitPriceDiscountVoucher(voucher)) {
      const discountItems = new Map((voucher.items || []).map(item => [item.product_code, item]))
      let appliedCount = 0
      let totalDiscount = 0

      nextLines = lines.map(line => {
        if (isSystemLine(line)) return line
        const matchedItem = [
          (line as any).product_code_mapped,
          line.ocr_product_code,
          (line as any).temp_code,
          (line as any).product_code,
        ].filter(Boolean).map(code => discountItems.get(code as string)).find(Boolean)
        if (!matchedItem) return line

        const discountAmount = Number((matchedItem as any).discount_amount) || 0
        if (discountAmount <= 0) return line

        const qty = Number(line.quantity) || 0
        const currentUnitPrice = Number(line.unit_price) || (qty > 0 ? (Number(line.line_total) || 0) / qty : 0)
        const nextUnitPrice = Math.max(currentUnitPrice - discountAmount, 0)
        appliedCount += 1
        totalDiscount += discountAmount * Math.max(qty, 1)
        return { ...line, unit_price: nextUnitPrice, line_total: nextUnitPrice * qty }
      })

      await updateOrder(orderId, buildSavePayload(nextLines))
      setLines(nextLines)
      onLocalSaved?.(nextLines)
      message.success(`Đã trừ ${totalDiscount.toLocaleString('vi-VN')}đ từ ${appliedCount} dòng hàng`)
      setSelectedVoucher(null)
      return
    }

    const giftLines = (voucher.items || []).map((item, idx) => {
      const matchedLine = findVoucherLine(lines, item)!
      const orderedQty = Number(matchedLine.quantity) || 0
      const multiplier = voucher.multiplier ? Math.floor(orderedQty / Number(item.quantity || 1)) : 1
      let giftQty = multiplier * Number(item.gift_quantity || 0)
      if (Number(item.max_per_order) > 0) giftQty = Math.min(giftQty, Number(item.max_per_order))
      return {
        id: `gift-${voucher.code}-${idx}-${item.gift_product_code}`,
        temp_code: item.gift_product_code,
        product_name_original: `[Tặng] ${item.gift_product_name}`,
        ocr_product_code: item.gift_product_code,
        product_code_mapped: item.gift_product_code,
        uom_original: item.gift_uom,
        quantity: giftQty,
        unit_price: 0,
        line_total: 0,
        tax_rate: 0,
        mapping_status: 'overridden',
      } as unknown as OrderLine
    })

    const giftCodes = new Set(giftLines.map(line => (line as any).temp_code || line.ocr_product_code || ''))
    const cleanLines = lines.filter(line =>
      !(isSystemLine(line) && giftCodes.has((line as any).temp_code || line.ocr_product_code || ''))
    )
    nextLines = [...cleanLines, ...giftLines]
    await updateOrder(orderId, buildSavePayload(nextLines))
    setLines(nextLines)
    onLocalSaved?.(nextLines)
    message.success(`Đã thêm ${giftLines.length} dòng tặng hàng`)
    setSelectedVoucher(null)
  }

  const deleteLine = async (i: number) => {
    if (deletingLineIdx !== null) return
    const previousLines = lines
    const nextLines = lines.filter((_, idx) => idx !== i)
    setLines(nextLines)
    setDeletingLineIdx(i)
    try {
      await updateOrder(orderId, buildSavePayload(nextLines))
      message.success('Đã xóa dòng và tự lưu')
      onLocalSaved?.(nextLines)
    } catch (e: any) {
      setLines(previousLines)
      message.error(e.message || 'Xóa dòng thất bại')
    } finally {
      setDeletingLineIdx(null)
    }
  }

  const handleSave = async () => {
    try {
      await updateOrder(orderId, buildSavePayload(lines))
      message.success('Đã lưu — bạn có thể Lưu với MISA')
      onLocalSaved?.(lines)
    } catch (e: any) { message.error(e.message || 'Lưu thất bại') }
  }


  const handleCustomerContactResult = (result: CustomerContactResult) => {
    const prevExtra = { salesperson: selectedCustomerData.salesperson || '', credit_days: selectedCustomerData.credit_days || '' }
    if (result.type === 'customer') {
      const d = toCustomerData(result.customer as unknown as Record<string, unknown>) || {}
      setSelectedCustomer(d.name || '')
      setSelectedCustomerData({ ...d, ...prevExtra, contact: selectedContactName })
      setSelectedContactName('')
      form.setFieldValue('partner_id', result.customer.code)
      // Người dùng vừa tự chọn KH từ danh sách — coi là đã xác nhận thủ công
      setCustomerMatchType('manual')
    } else {
      // Contact selected: only update contact name, keep customer unchanged unless there's a match
      const matchedData = result.customer ? toCustomerData(result.customer as unknown as Record<string, unknown>) : null
      if (matchedData) {
        // Found matching company — update customer too
        const merged = contactToCustomerData(result.contact, matchedData)
        setSelectedCustomer(matchedData.name || '')
        setSelectedCustomerData({ ...merged, ...prevExtra })
        form.setFieldValue('partner_id', result.customer!.code)
        setCustomerMatchType('manual')
      } else {
        // No company match — only set contact, keep current customer data
        setSelectedCustomerData(prev => ({ ...prev, contact: result.contact.name }))
      }
      setSelectedContactName(result.contact.name)
      // Người dùng vừa tự chọn LH từ danh sách — coi là đã xác nhận thủ công
      setContactMatchType('manual')
    }
    setActivePopup(null)
  }

  const unmappedLines = lines.filter(l => l.mapping_status === 'pending' && !isSystemLine(l))
  const hasUnmappedItems = unmappedLines.length > 0
  const total = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)

  if (loading) return <div className="text-center py-10 text-gray-400">Đang tải...</div>

  return (
    <div>
      {/* Thông tin chung */}
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Thông tin chung</h2>
      <Form form={form} layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label={<>Số đơn hàng <span className="text-red-500">*</span></>} name="order_number">
            <Input
              disabled
              value={nextNo}
              placeholder={nextNo ? nextNo : 'Đang tải...'}
              suffix={!nextNo ? <Spin size="small" /> : undefined}
              className="bg-gray-50 text-gray-700 font-medium"
            />
          </Form.Item>
          <Form.Item label={<>Ngày đặt hàng <span className="text-red-500">*</span></>} name="order_date">
            <DatePicker
              className="w-full"
              format="DD/MM/YYYY"
              onChange={date => {
                form.setFieldValue('payment_due', date ? date.add(1, 'month') : null)
              }}
            />
          </Form.Item>
          <Form.Item label="Số PO" name="po_number"><Input /></Form.Item>
          <Form.Item label="Hạn giao hàng" name="delivery_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label={<span className="flex items-center gap-1.5">Khách hàng{customerMatchType === 'fuzzy' && (
            <Tooltip title="Hệ thống tự động ghép theo tên/MST trên chứng từ — vui lòng kiểm tra lại trước khi tin tưởng số liệu">
              <Tag color="orange" className="text-[10px] leading-4 m-0">Tự động ghép — chưa xác nhận</Tag>
            </Tooltip>
          )}</span>}>
            <InputWithPopup value={selectedCustomer} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('customer')} />
          </Form.Item>
          <Form.Item label={<span className="flex items-center gap-1.5">Liên hệ{contactMatchType === 'fuzzy' && (
            <Tooltip title="Hệ thống tự động ghép theo tên công ty/địa chỉ giao hàng — vui lòng kiểm tra lại trước khi tin tưởng số liệu">
              <Tag color="orange" className="text-[10px] leading-4 m-0">Tự động ghép — chưa xác nhận</Tag>
            </Tooltip>
          )}</span>}>
            <div className="flex gap-1">
              <Input value={selectedContactName} onChange={e => { setSelectedContactName(e.target.value); setCustField('contact', e.target.value); setContactMatchType('manual') }} placeholder="Nhập hoặc chọn từ danh sách" className="flex-1" />
              <Button icon={<SearchOutlined />} onClick={() => setActivePopup('contact')} title="Chọn người liên hệ" />
            </div>
          </Form.Item>
          {/* Address confirm banner when contact has address */}
          {selectedCustomerData.contact && selectedCustomerData.contact_address && (
            <div className="col-span-2 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-xs flex items-center justify-between gap-2">
              <span className="text-blue-700">
                <strong>LH {selectedCustomerData.contact}</strong> có địa chỉ: {selectedCustomerData.contact_address}
              </span>
              <Button size="small" type="primary"
                onClick={() => {
                  const addr = selectedCustomerData.contact_address || ''
                  setCustField('invoice_address', addr)
                  setCustField('invoice_street', addr)
                  setCustField('delivery_address', addr)
                  setCustField('delivery_street', addr)
                  if (selectedCustomerData.contact_phone) {
                    setCustField('delivery_phone', selectedCustomerData.contact_phone)
                  }
                }}>
                Áp địa chỉ vào HĐ & GH
              </Button>
            </div>
          )}
          <Form.Item label={<>Hạn thanh toán <span className="text-red-500">*</span></>} name="payment_due"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label={<>Giá trị đơn hàng <span className="text-red-500">*</span></>} name="total_amount"><InputNumber className="w-full" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v!.replace(/,/g, '') as unknown as number} /></Form.Item>
          <Form.Item label={<>Loại đơn hàng <span className="text-red-500">*</span></>} name="order_type" initialValue="Kênh MT"><Select placeholder="- Chọn -" options={[{ value: 'Kênh MT', label: 'Kênh MT' }, { value: 'Khách lẻ', label: 'Khách lẻ' }, { value: 'B2B', label: 'B2B' }, { value: 'Kênh GT', label: 'Kênh GT' }]} /></Form.Item>
          <Form.Item label={<>Tình trạng <span className="text-red-500">*</span></>}><Select defaultValue="not_done" options={[{ value: 'not_done', label: 'Chưa thực hiện' }, { value: 'in_progress', label: 'Đang thực hiện' }, { value: 'done', label: 'Hoàn thành' }]} /></Form.Item>
          <Form.Item label="Người thực hiện">
            <Select
              value={selectedCustomerData.salesperson || getSavedSalesperson()}
              onChange={v => { setCustField('salesperson', v); saveSalesperson(v) }}
              options={SALESPERSON_OPTIONS}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="Số ngày được nợ"><Input value={selectedCustomerData.credit_days || ''} onChange={e => setCustField('credit_days', e.target.value)} placeholder="VD: 30" /></Form.Item>
          <Form.Item label="Nhân viên bán hàng">
            <Select
              value={salesperson}
              onChange={v => { setSalesperson(v); saveNV(v) }}
              options={NV_OPTIONS}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn nhân viên bán hàng"
            />
          </Form.Item>
        </div>
      </Form>

      {/* Hàng hóa */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Thông tin hàng hóa</h2>
          <span className="text-xs text-gray-400">{lines.length} dòng · xóa dòng sẽ tự lưu</span>
        </div>
        {/* Voucher + Chính sách giá */}
        {(vouchers.length > 0 || pricebooks.length > 0) && (
          <div className="mb-3 border border-slate-200 rounded-lg overflow-hidden text-xs">
            {vouchers.length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
                <span className="text-slate-400 font-medium shrink-0 w-28">Voucher ({vouchers.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {vouchers.map(v => (
                    <button key={v.code} onClick={() => setSelectedVoucher(v)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 border border-purple-300 text-purple-700 hover:bg-purple-50 font-mono font-semibold transition-colors">
                      <TagsOutlined style={{fontSize:10}} />{v.code}
                      <span className="font-normal text-slate-500 ml-1 max-w-[140px] truncate">{v.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pricebooks.length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="text-slate-400 font-medium shrink-0 w-28">Chính sách giá ({pricebooks.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {pricebooks.map(pb => (
                    <button key={pb.code} onClick={() => setSelectedPricebook(pb)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 border border-orange-300 text-orange-700 hover:bg-orange-50 font-mono font-semibold transition-colors">
                      <TagsOutlined style={{fontSize:10}} />{pb.code}
                      <span className="font-normal text-slate-500 ml-1 max-w-[140px] truncate">{pb.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {hasUnmappedItems && (
          <div className="mb-3 flex items-center justify-between text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-1.5">
            <span className="flex items-center gap-2">
              <ExclamationCircleOutlined />
              <span><strong>{unmappedLines.length}</strong>/{lines.filter(l => !isSystemLine(l)).length} dòng chưa map hàng hóa — dùng nút <SearchOutlined /> ở cột thao tác để chọn</span>
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-1 py-2 w-6"></th>
                <th className="px-2 py-2 text-left w-8">STT</th>
                <th className="px-2 py-2 text-left w-36">Mã hàng hóa</th>
                <th className="px-2 py-2 text-left min-w-[140px]">Diễn giải</th>
                <th className="px-2 py-2 text-left w-12">ĐVT</th>
                <th className="px-2 py-2 text-right w-12">SL</th>
                <th className="px-2 py-2 text-right w-22">Đơn giá</th>
                <th className="px-2 py-2 text-right w-22">Thành tiền</th>
                <th className="px-2 py-2 text-center w-16">Thuế</th>
                <th className="px-2 py-2 text-right w-22">Tiền thuế</th>
                <th className="px-2 py-2 text-right w-22">Tổng tiền</th>
                <th className="px-2 py-2 text-center w-24"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const amt = Number(line.line_total) || 0
                const txRate = Number(line.tax_rate) || 0
                const txAmt = Math.round(amt * txRate / 100)
                const totalLine = amt + txAmt
                const isPending = line.mapping_status === 'pending'
                const systemLine = isSystemLine(line)
                const conf = (!isPending || systemLine) ? null : (() => {
                  const r = matchProduct(line.product_name_original, 1)
                  if (!r.length) return null
                  return { score: r[0].score, product: r[0].product }
                })()
                const pbOv = line.ocr_product_code ? priceOverrides.get(line.ocr_product_code) : undefined
                const dotColor = systemLine ? 'bg-slate-400' : !isPending ? 'bg-emerald-500'
                  : conf && conf.score >= 0.85 ? 'bg-emerald-400' : conf && conf.score >= 0.5 ? 'bg-yellow-400' : 'bg-red-400'
                return (
                  <tr key={line.id || idx} className={`border-b border-gray-100 hover:bg-blue-50/30 ${isPending ? 'bg-orange-50/30' : ''} ${pbOv ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-1 py-1 text-center">
                      <Tooltip title={!isPending ? 'Đã xác nhận' : conf && conf.score >= 0.85 ? 'Gợi ý tốt' : conf ? 'Cần xem lại' : 'Chưa tìm thấy'}>
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor}`} />
                      </Tooltip>
                    </td>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1 min-w-0">
                        {isPending && !systemLine ? (
                          conf ? (
                            <Tooltip title={`Gợi ý map: ${conf.product.code} - ${Math.round(conf.score * 100)}%`}>
                              <span className={`font-mono text-xs font-semibold truncate ${
                                conf.score >= 0.85 ? 'text-emerald-700'
                                  : conf.score >= 0.5 ? 'text-amber-600'
                                  : 'text-red-500'
                              }`}>
                                {conf.product.code}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="font-mono text-xs text-red-400">—</span>
                          )
                        ) : (
                          <span className="font-mono text-slate-900 text-xs font-semibold truncate">{line.ocr_product_code || '—'}</span>
                        )}
                        {pbOv && <Tooltip title={`CK: ${pbOv.pricebook_name}`}><span className="text-[10px] text-orange-600 bg-orange-100 rounded px-1">★CK</span></Tooltip>}
                      </div>
                    </td>
                    <td className="px-2 py-1"><EditableCell value={line.product_name_original} onChange={v => updateLine(idx, 'product_name_original', v)} placeholder="Tên SP" /></td>
                    <td className="px-2 py-1"><EditableCell value={line.uom_original} onChange={v => updateLine(idx, 'uom_original', v)} placeholder="ĐVT" /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.quantity} type="number" onChange={v => updateLine(idx, 'quantity', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.unit_price} type="number" onChange={v => updateLine(idx, 'unit_price', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.line_total} type="number" onChange={v => updateLine(idx, 'line_total', v)} /></td>
                    <td className="px-2 py-1 text-center"><EditableCell value={line.tax_rate} type="number" onChange={v => updateLine(idx, 'tax_rate', v)} placeholder="%" /></td>
                    <td className="px-2 py-1 text-right text-slate-600">{txAmt ? txAmt.toLocaleString('vi-VN') : '—'}</td>
                    <td className="px-2 py-1 text-right font-semibold">{totalLine ? totalLine.toLocaleString('vi-VN') : '—'}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-end gap-1">
                        {isPending && !systemLine && conf && conf.score >= 0.85 && (
                          <Tooltip title={`Xác nhận map ${conf.product.code}`}>
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => {
                                const chg = { uomChanged: isSignificantUomChange(line.uom_original||'', conf!.product.uom), pbPrice: priceOverrides.get(conf!.product.code)?.unit_price, pbName: priceOverrides.get(conf!.product.code)?.pricebook_name, currentPrice: Number(line.unit_price)||0 }
                                if (chg.uomChanged || (chg.pbPrice && chg.pbPrice !== chg.currentPrice)) {
                                  setPendingChange({ lineIdx: idx, product: conf!.product, uomFrom: line.uom_original ?? undefined, uomTo: conf!.product.uom, ...chg })
                                } else {
                                  setLines(prev => prev.map((l,i) => i===idx ? applyProductToLine(l, conf!.product) : l))
                                }
                              }}
                            >
                              <CheckOutlined style={{fontSize:12}} />
                            </button>
                          </Tooltip>
                        )}
                        {!systemLine && (
                          <Tooltip title={isPending ? 'Chọn hàng hóa để map' : 'Đổi hàng hóa đã map'}>
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-blue-200 text-blue-500 hover:bg-blue-50"
                              onClick={() => setProductModalIdx(idx)}
                            >
                              <SearchOutlined style={{fontSize:12}} />
                            </button>
                          </Tooltip>
                        )}
                      <button
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => deleteLine(idx)}
                        disabled={deletingLineIdx !== null}
                        title={deletingLineIdx === idx ? 'Đang xóa và tự lưu...' : 'Xóa dòng và tự lưu'}
                      >
                        <DeleteOutlined />
                      </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-xs">
                <td colSpan={7} className="px-2 py-2 text-right text-slate-600">Tổng cộng</td>
                <td className="px-2 py-2 text-right">{total.toLocaleString('vi-VN')}</td>
                <td className="px-2 py-2 text-center text-slate-400">—</td>
                <td className="px-2 py-2 text-right text-slate-600">{lines.reduce((s,l)=>{const r=Number(l.tax_rate)||0;return s+Math.round((Number(l.line_total)||0)*r/100)},0).toLocaleString('vi-VN')}</td>
                <td className="px-2 py-2 text-right text-emerald-700">{lines.reduce((s,l)=>{const amt=Number(l.line_total)||0;const tx=Math.round(amt*(Number(l.tax_rate)||0)/100);return s+amt+tx},0).toLocaleString('vi-VN')}</td>
                <td colSpan={1}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setProductModalIdx(-1)}>Chọn hàng hóa</Button>
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: '', product_name_original: '', quantity: 1, unit_price: 0, line_total: 0, uom_original: '', discount_rate: 0, discount_amount: 0, tax_rate: 0, mapping_status: 'pending' } as unknown as OrderLine])}>Thêm dòng</Button>
        </div>
      </div>

      {/* Thông tin hóa đơn */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2 mt-6">Thông tin hóa đơn</h2>
      <Form layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label="Mã khách hàng"><Input value={selectedCustomerData.code || ''} onChange={e => setCustField('code', e.target.value)} /></Form.Item>
          <Form.Item label="Loại khách hàng"><Input value={selectedCustomerData.type || ''} onChange={e => setCustField('type', e.target.value)} /></Form.Item>
          <Form.Item label="Tên khách hàng (HĐ)"><Input value={selectedCustomerData.name || ''} onChange={e => { setCustField('name', e.target.value); setSelectedCustomer(e.target.value) }} /></Form.Item>
          <Form.Item label="Mã số thuế"><Input value={selectedCustomerData.tax_code || ''} onChange={e => setCustField('tax_code', e.target.value)} /></Form.Item>
          <Form.Item label="Người mua hàng"><Input value={selectedCustomerData.owner || ''} onChange={e => setCustField('owner', e.target.value)} /></Form.Item>
          <Form.Item label="Địa chỉ (HĐ)"><Input value={selectedCustomerData.invoice_address || ''} onChange={e => setCustField('invoice_address', e.target.value)} /></Form.Item>
          <Form.Item label="Tỉnh/TP (HĐ)"><Input value={selectedCustomerData.invoice_city || ''} onChange={e => setCustField('invoice_city', e.target.value)} /></Form.Item>
          <Form.Item label="Quận/Huyện (HĐ)"><Input value={selectedCustomerData.invoice_district || ''} onChange={e => setCustField('invoice_district', e.target.value)} /></Form.Item>
          <Form.Item label="Phường/Xã (HĐ)"><Input value={selectedCustomerData.invoice_ward || ''} onChange={e => setCustField('invoice_ward', e.target.value)} /></Form.Item>
          <Form.Item label="Mô tả"><Input value={selectedCustomerData.description || ''} onChange={e => setCustField('description', e.target.value)} /></Form.Item>
        </div>
      </Form>

      {/* Thông tin giao hàng */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2 mt-4">Thông tin giao hàng</h2>
      <Form layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label="Người nhận hàng"><Input value={selectedCustomerData.delivery_receiver || selectedCustomerData.owner || ''} onChange={e => setCustField('delivery_receiver', e.target.value)} /></Form.Item>
          <Form.Item label="Điện thoại"><Input value={selectedCustomerData.delivery_phone || selectedCustomerData.phone || ''} onChange={e => setCustField('delivery_phone', e.target.value)} /></Form.Item>
          <Form.Item label="Địa chỉ (GH)"><Input value={selectedCustomerData.delivery_address || selectedCustomerData.invoice_address || ''} onChange={e => setCustField('delivery_address', e.target.value)} /></Form.Item>
          <Form.Item label="Tỉnh/TP (GH)"><Input value={selectedCustomerData.delivery_city || selectedCustomerData.invoice_city || ''} onChange={e => setCustField('delivery_city', e.target.value)} /></Form.Item>
          <Form.Item label="Quận/Huyện (GH)"><Input value={selectedCustomerData.delivery_district || ''} onChange={e => setCustField('delivery_district', e.target.value)} /></Form.Item>
          <Form.Item label="Phường/Xã (GH)"><Input value={selectedCustomerData.delivery_ward || ''} onChange={e => setCustField('delivery_ward', e.target.value)} /></Form.Item>
        </div>
      </Form>

      {/* Save button */}
      <div className="flex justify-end mt-4 pt-3 border-t border-gray-200">
        <Button type="primary" onClick={handleSave}>Lưu thay đổi</Button>
      </div>

      {/* Product modal */}
      <ProductModal
        open={productModalIdx !== null}
        suggestName={productModalIdx !== null && productModalIdx >= 0 ? lines[productModalIdx]?.product_name_original || '' : ''}
        onSelect={p => {
          if (productModalIdx !== null && productModalIdx >= 0) {
            const line = lines[productModalIdx]
            const pbOverride = priceOverrides.get(p.code)
            const uomChanged = isSignificantUomChange(line.uom_original || '', p.uom)
            const currentPrice = Number(line.unit_price) || 0
            const pbPrice = pbOverride?.unit_price
            const priceChanged = !!pbPrice && pbPrice !== currentPrice

            if (uomChanged || priceChanged) {
              setPendingChange({
                lineIdx: productModalIdx, product: p,
                uomFrom: line.uom_original ?? undefined, uomTo: p.uom, uomChanged,
                pbPrice, pbName: pbOverride?.pricebook_name, currentPrice,
              })
              setProductModalIdx(null)
              return
            }
            setLines(prev => prev.map((l, idx) => idx === productModalIdx ? applyProductToLine(l, p) : l))
          } else {
            setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: p.code, product_name_original: p.name, quantity: 1, unit_price: p.price || 0, line_total: p.price || 0, uom_original: p.uom, tax_rate: productTaxRate(p), mapping_status: 'mapped' } as unknown as OrderLine])
          }
          setProductModalIdx(null)
        }}
        onCancel={() => setProductModalIdx(null)}
        priceOverrides={priceOverrides}
      />

      {/* Confirmation popup: UOM change + pricebook price */}
      {pendingChange && (
        <Modal
          open
          centered
          title="Xác nhận thay đổi khi map hàng hóa"
          width={500}
          onCancel={() => { setPendingChange(null); setProductModalIdx(null) }}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => {
                // Apply without any changes (keep original UOM + price)
                setLines(prev => prev.map((l, idx) => idx === pendingChange.lineIdx
                  ? { ...applyProductToLine(l, pendingChange.product), uom_original: l.uom_original, unit_price: l.unit_price }
                  : l))
                setPendingChange(null)
              }}>Giữ nguyên</Button>
              <Button type="primary" onClick={() => {
                // Apply all suggested changes
                const line = lines[pendingChange.lineIdx]
                const applied = applyProductToLine(line, pendingChange.product)
                const finalPrice = pendingChange.pbPrice || applied.unit_price
                const qty = Number(line.quantity) || 1
                const finalLineTotal = finalPrice && qty ? finalPrice * qty : applied.line_total
                const conversion = getUomConversion({
                  quantity: line.quantity,
                  sourceUom: line.uom_original,
                  targetUom: pendingChange.product.uom,
                  product: pendingChange.product,
                  fallbackProductName: line.product_name_original || '',
                })
                if (conversion) {
                  setPendingUomConversion({
                    lineIdx: pendingChange.lineIdx,
                    nextLine: { ...applied, unit_price: finalPrice, line_total: finalLineTotal },
                    conversion,
                  })
                  setPendingChange(null)
                  return
                }
                setLines(prev => prev.map((l, idx) => idx === pendingChange.lineIdx
                  ? { ...applied, unit_price: finalPrice, line_total: finalLineTotal }
                  : l))
                setPendingChange(null)
              }}>Áp dụng thay đổi</Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            {pendingChange.uomChanged && (
              <div className="border border-amber-200 bg-amber-50 rounded p-3">
                <div className="font-semibold text-amber-800 mb-1">Đổi đơn vị tính</div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500 line-through">{pendingChange.uomFrom || '—'}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-emerald-700 font-semibold">{pendingChange.uomTo}</span>
                </div>
                <div className="text-xs text-amber-600 mt-1">Lưu ý: đơn vị thay đổi có thể ảnh hưởng đến số lượng và đơn giá</div>
              </div>
            )}
            {pendingChange.pbPrice && pendingChange.pbPrice !== pendingChange.currentPrice && (
              <div className="border border-orange-200 bg-orange-50 rounded p-3">
                <div className="font-semibold text-orange-800 mb-1">Áp dụng giá chiết khấu — {pendingChange.pbName}</div>
                <div className="flex items-center gap-2 text-sm">
                  {pendingChange.currentPrice ? <>
                    <span className="text-slate-400 line-through">{pendingChange.currentPrice.toLocaleString('vi-VN')}</span>
                    <span>→</span>
                  </> : null}
                  <span className="text-orange-700 font-bold text-base">{pendingChange.pbPrice.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {pendingUomConversion && (
        <Modal
          open
          centered
          title="Xác nhận quy đổi số lượng"
          width={540}
          onCancel={() => setPendingUomConversion(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={keepUomConversionOriginal}>Giữ số lượng gốc</Button>
              <Button type="primary" onClick={applyUomConversion}>Áp dụng quy đổi</Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="border border-blue-200 bg-blue-50 rounded p-3">
              <div className="font-semibold text-blue-800 mb-1">{pendingUomConversion.conversion.productLabel}</div>
              <div className="text-slate-700">{pendingUomConversion.conversion.reason}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded p-3">
                <div className="text-xs text-slate-500 mb-1">Số lượng OCR/nhập</div>
                <div className="font-semibold text-slate-800">
                  {pendingUomConversion.conversion.originalQty.toLocaleString('vi-VN')} {pendingUomConversion.conversion.fromUom}
                </div>
              </div>
              <div className="border border-emerald-200 bg-emerald-50 rounded p-3">
                <div className="text-xs text-emerald-700 mb-1">Số lượng sau quy đổi</div>
                <div className="font-bold text-emerald-800">
                  {pendingUomConversion.conversion.convertedQty.toLocaleString('vi-VN')} {pendingUomConversion.conversion.toUom}
                </div>
              </div>
            </div>
            <div className="font-mono text-xs bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-700">
              {pendingUomConversion.conversion.formula}
            </div>
            <p className="text-xs text-slate-500">
              Bấm <strong>Áp dụng quy đổi</strong> để ghi số lượng đã chuyển đổi vào ô SL và đổi ĐVT về đơn vị của công ty.
            </p>
          </div>
        </Modal>
      )}

      {/* Voucher detail popup */}
      {selectedVoucher && (
        <Modal open width={860} centered footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSelectedVoucher(null)}>Đóng</Button>
            <Button
              type="primary"
              disabled={!voucherAllConditionsMet(selectedVoucher)}
              title={voucherAllConditionsMet(selectedVoucher) ? '' : 'Chưa đủ điều kiện áp dụng'}
              onClick={() => applyVoucher(selectedVoucher)}
            >
              {isUnitPriceDiscountVoucher(selectedVoucher) ? 'Áp dụng giảm giá' : 'Áp dụng khuyến mại'}
            </Button>
          </div>
        }
          title={<span><TagsOutlined className="mr-2 text-purple-500" />{selectedVoucher.code} — {selectedVoucher.name}</span>}
          onCancel={() => setSelectedVoucher(null)} zIndex={1300}>
          <div className="text-xs grid grid-cols-3 gap-2 mb-3 border border-slate-200 rounded px-3 py-2 bg-slate-50">
            <div><span className="text-slate-500">Loại:</span> {selectedVoucher.type}</div>
            <div><span className="text-slate-500">Nhân hệ số:</span> {selectedVoucher.multiplier ? 'Có' : 'Không'}</div>
            <div><span className="text-slate-500">KH:</span> {selectedVoucher.customers?.length ? selectedVoucher.customers.join(', ') : 'Tất cả'}</div>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-1.5 text-left">Mua</th><th className="px-2 py-1.5 text-center w-16">ĐVT</th>
              <th className="px-2 py-1.5 text-right w-16">SL mua</th><th className="px-2 py-1.5 text-left">Tặng</th>
              <th className="px-2 py-1.5 text-right w-16">SL tặng</th><th className="px-2 py-1.5 text-right w-20">Max/đơn</th>
            </tr></thead>
            <tbody>{selectedVoucher.items?.map((it: any, i: number) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-2 py-1"><span className="font-mono font-semibold">{it.product_code}</span> · {it.product_name}</td>
                <td className="px-2 py-1 text-center text-slate-500">{it.uom}</td>
                <td className="px-2 py-1 text-right font-semibold">{it.quantity}</td>
                <td className="px-2 py-1"><span className="font-mono font-semibold text-emerald-700">{it.gift_product_code}</span> · {it.gift_product_name}</td>
                <td className="px-2 py-1 text-right font-semibold text-emerald-700">{it.gift_quantity}</td>
                <td className="px-2 py-1 text-right text-slate-400">{it.max_per_order || '∞'}</td>
              </tr>
            ))}</tbody>
          </table>
        </Modal>
      )}

      {/* Pricebook detail popup */}
      {selectedPricebook && (
        <Modal open width={760} centered footer={<Button onClick={() => setSelectedPricebook(null)}>Đóng</Button>}
          title={<span><TagsOutlined className="mr-2 text-orange-500" />{selectedPricebook.code} — {selectedPricebook.name}</span>}
          onCancel={() => setSelectedPricebook(null)} zIndex={1300}>
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-1.5 text-left">Mã hàng</th><th className="px-2 py-1.5 text-left">Tên</th>
              <th className="px-2 py-1.5 text-center w-16">ĐVT</th><th className="px-2 py-1.5 text-right w-28">Đơn giá (CK)</th>
            </tr></thead>
            <tbody>{selectedPricebook.items?.map((it: any, i: number) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-2 py-1 font-mono font-semibold text-blue-600">{it.product_code}</td>
                <td className="px-2 py-1 text-slate-700">{it.product_name}</td>
                <td className="px-2 py-1 text-center text-slate-500">{it.uom}</td>
                <td className="px-2 py-1 text-right font-bold text-orange-700">{it.unit_price?.toLocaleString('vi-VN')} đ</td>
              </tr>
            ))}</tbody>
          </table>
        </Modal>
      )}

      {/* Customer popup (customer only) */}
      <CustomerContactPopup
        open={activePopup === 'customer'}
        onSelect={handleCustomerContactResult}
        onCancel={() => setActivePopup(null)}
        initialTab="customer"
        initialSearch={selectedCustomer || ''}
      />

      {/* Contact popup (separate, no tabs) */}
      <ContactSelectPopup
        open={activePopup === 'contact'}
        onSelect={(contact, matchedCustomer) => {
          const result: CustomerContactResult = matchedCustomer
            ? { type: 'contact', contact: contact as any, customer: matchedCustomer as any }
            : { type: 'contact', contact: contact as any, customer: null }
          handleCustomerContactResult(result)
          setActivePopup(null)
        }}
        onCancel={() => setActivePopup(null)}
      />

    </div>
  )
}

