import { useEffect, useState } from 'react'
import { Form, Input, DatePicker, InputNumber, Select, Button, message, Modal, Table as AntTable } from 'antd'
import { SearchOutlined, PlusOutlined, GiftOutlined, PercentageOutlined, ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { getOrder, updateOrder } from '@/api/orders'
import type { OrderLine } from '@/types/order'
import CustomerContactPopup, { type CustomerContactResult, type Contact } from '@/components/CustomerContactPopup'
import { getBestMatch, matchProduct, searchProducts, type Product } from '@/utils/productMatcher'
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

function ProductModal({ open, suggestName, onSelect, onCancel }: { open: boolean; suggestName: string; onSelect: (p: Product) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const results = query.trim() ? searchProducts(query) : suggestName ? matchProduct(suggestName, 20).map(r => r.product) : searchProducts('')
  return (
    <Modal title="Chọn hàng hóa" open={open} onCancel={onCancel} width="90vw" style={{ maxWidth: 1000 }} footer={null} zIndex={1200}>
      <Input.Search placeholder="Tìm theo tên hoặc mã hàng hóa..." value={query} onChange={e => setQuery(e.target.value)} className="mb-3" allowClear autoFocus />
      {suggestName && !query && <div className="mb-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded">Gợi ý: <strong>{suggestName}</strong></div>}
      <AntTable size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={results} rowKey="code"
        scroll={{ x: 'max-content' }}
        onRow={record => ({ onClick: () => onSelect(record as Product), className: 'cursor-pointer hover:bg-blue-50' })}
        columns={[
          { title: 'Mã hàng hóa', dataIndex: 'code', width: 120 },
          { title: 'Tên hàng hóa', dataIndex: 'name', width: 320 },
          { title: 'ĐVT', dataIndex: 'uom', width: 80 },
          { title: 'Đơn giá', dataIndex: 'price', width: 120, render: (v: number) => v ? v.toLocaleString('vi-VN') : '\u2014' },
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
  const quantity = Number(line.quantity) || 1
  const unitPrice = Number(product.price) || 0
  return {
    ...line,
    ocr_product_code: product.code,
    product_name_original: product.name,
    uom_original: product.uom,
    unit_price: unitPrice,
    tax_rate: productTaxRate(product),
    line_total: unitPrice && quantity ? unitPrice * quantity : line.line_total,
    mapping_status: 'mapped',
  }
}

function isSystemLine(line: Partial<OrderLine>): boolean {
  return line.mapping_status === 'overridden'
}

type PopupType = 'customer' | null
type CustomerData = Record<string, string>

function contactToCustomerData(contact: Contact, matchedCustomer: CustomerData | null): CustomerData {
  const addr = contact.delivery_address || contact.address || ''
  return {
    ...(matchedCustomer || {}),
    contact: contact.name,
    contact_code: contact.code,
    contact_phone: contact.phone || contact.phone_work || '',
    contact_email: contact.email || contact.email_personal || '',
    ...(addr && !matchedCustomer ? { invoice_address: addr, delivery_address: addr } : {}),
    ...(contact.city && !matchedCustomer ? { invoice_city: contact.city } : {}),
  }
}

interface Props {
  orderId: string
  onSaved?: () => void
}

function toCustomerData(record?: Record<string, unknown> | null): CustomerData | null {
  if (!record) return null
  const value = (key: string) => String(record[key] ?? '')
  const invoiceAddress = value('invoice_address') || value('invoice_street')
  const deliveryAddress = value('delivery_address') || value('delivery_street') || invoiceAddress
  const name = value('name') || value('customer_name') || value('invoice_customer')
  const owner = value('owner') || value('customer_owner') || value('invoice_buyer')
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
    delivery_receiver: value('delivery_receiver') || owner,
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

export default function OrderDetailForm({ orderId, onSaved }: Props) {
  const [form] = Form.useForm()
  const [lines, setLines] = useState<OrderLine[]>([])
  const [productModalIdx, setProductModalIdx] = useState<number | null>(null)
  const [activePopup, setActivePopup] = useState<PopupType>(null)
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedCustomerData, setSelectedCustomerData] = useState<CustomerData>({})
  const [selectedContactName, setSelectedContactName] = useState('')
  const [loading, setLoading] = useState(true)
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountValue, setDiscountValue] = useState<number | null>(null)
  const [discountModalOpen, setDiscountModalOpen] = useState(false)

  const setCustField = (key: string, val: string) =>
    setSelectedCustomerData(prev => ({ ...prev, [key]: val }))

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
        salesperson: String(extra?.salesperson || ''),
        credit_days: String(extra?.credit_days || ''),
        contact: String(extra?.contact || ''),
      })
      setSelectedContactName(String(extra?.contact || ''))
      // Auto-map
      const mappedLines = (order.lines || []).map(line => {
        if (line.mapping_status === 'mapped') return line
        const match = getBestMatch(line.product_name_original || line.ocr_product_code || '')
        if (match) {
          return applyProductToLine(line, match)
        }
        return line
      })
      setLines(mappedLines)
      setLoading(false)
    }).catch(() => { setLoading(false) })
  }, [orderId, form])

  // Tự động đồng bộ tổng tiền khi đổi dòng hàng
  useEffect(() => {
    if (loading) return
    const subtotal = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
    form.setFieldValue('total_amount', subtotal)
  }, [lines, form, loading])

  const updateLine = (i: number, field: string, value: unknown) => {
    setLines(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: value }; return u })
  }

  const deleteLine = (i: number) => {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    const values = form.getFieldsValue()
    const meta: Record<string, string> = {
      ...buildExtraData(selectedCustomerData),
      order_type: values.order_type || 'Kênh MT',
      salesperson: selectedCustomerData.salesperson || '',
      credit_days: selectedCustomerData.credit_days || '',
      contact: selectedContactName || selectedCustomerData.contact || '',
    }
    try {
      await updateOrder(orderId, {
        ...values,
        order_date: values.order_date ? (values.order_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        delivery_date: values.delivery_date ? (values.delivery_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        recipient_name: selectedCustomer || null,
        description: selectedCustomerData.invoice_address || null,
        extra_data: meta,
        lines,
      })
      message.success('Đã lưu')
      onSaved?.()
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
    } else {
      const matchedData = result.customer ? toCustomerData(result.customer as unknown as Record<string, unknown>) : null
      const merged = contactToCustomerData(result.contact, matchedData)
      setSelectedCustomer(matchedData?.name || result.contact.organization || result.contact.name)
      setSelectedCustomerData({ ...merged, ...prevExtra })
      setSelectedContactName(result.contact.name)
      if (result.customer) form.setFieldValue('partner_id', result.customer.code)
    }
    setActivePopup(null)
  }

  const unmappedLines = lines.filter(l => l.mapping_status === 'pending')
  const hasUnmappedItems = unmappedLines.length > 0
  const total = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)

  if (loading) return <div className="text-center py-10 text-gray-400">Đang tải...</div>

  return (
    <div>
      {/* Thông tin chung */}
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Thông tin chung</h2>
      <Form form={form} layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label={<>Số đơn hàng <span className="text-red-500">*</span></>} name="order_number" rules={[{ required: true, message: 'Nhập số đơn hàng' }]}><Input /></Form.Item>
          <Form.Item label={<>Ngày đặt hàng <span className="text-red-500">*</span></>} name="order_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label="Số PO" name="po_number"><Input /></Form.Item>
          <Form.Item label="Hạn giao hàng" name="delivery_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label="Khách hàng"><InputWithPopup value={selectedCustomer} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('customer')} /></Form.Item>
          <Form.Item label="Liên hệ">
            <div className="flex gap-1">
              <Input value={selectedContactName} onChange={e => { setSelectedContactName(e.target.value); setCustField('contact', e.target.value) }} placeholder="Nhập hoặc chọn từ danh sách" className="flex-1" />
              <Button icon={<SearchOutlined />} onClick={() => setActivePopup('customer')} title="Chọn từ danh sách" />
            </div>
          </Form.Item>
          <Form.Item label={<>Hạn thanh toán <span className="text-red-500">*</span></>} name="payment_due"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label={<>Giá trị đơn hàng <span className="text-red-500">*</span></>} name="total_amount"><InputNumber className="w-full" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v!.replace(/,/g, '') as unknown as number} /></Form.Item>
          <Form.Item label={<>Loại đơn hàng <span className="text-red-500">*</span></>} name="order_type" initialValue="Kênh MT"><Select placeholder="- Chọn -" options={[{ value: 'Kênh MT', label: 'Kênh MT' }, { value: 'Khách lẻ', label: 'Khách lẻ' }, { value: 'B2B', label: 'B2B' }, { value: 'Kênh GT', label: 'Kênh GT' }]} /></Form.Item>
          <Form.Item label={<>Tình trạng <span className="text-red-500">*</span></>}><Select defaultValue="not_done" options={[{ value: 'not_done', label: 'Chưa thực hiện' }, { value: 'in_progress', label: 'Đang thực hiện' }, { value: 'done', label: 'Hoàn thành' }]} /></Form.Item>
          <Form.Item label="Nhân viên bán hàng"><Input value={selectedCustomerData.salesperson || ''} onChange={e => setCustField('salesperson', e.target.value)} placeholder="VD: KM-1989 Nguyễn Văn Ân" /></Form.Item>
          <Form.Item label="Số ngày được nợ"><Input value={selectedCustomerData.credit_days || ''} onChange={e => setCustField('credit_days', e.target.value)} placeholder="VD: 30" /></Form.Item>
        </div>
      </Form>

      {/* Hàng hóa */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Thông tin hàng hóa</h2>
          <span className="text-xs text-gray-400">{lines.length} dòng</span>
        </div>
        {hasUnmappedItems && (
          <div className="mb-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-1.5">
            <ExclamationCircleOutlined /><span>{unmappedLines.length}/{lines.length} dòng chưa map</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-1 py-2 w-6"></th>
                <th className="px-2 py-2 text-left w-8">STT</th>
                <th className="px-2 py-2 text-left w-28">Mã hàng hóa</th>
                <th className="px-2 py-2 text-left min-w-[150px]">Diễn giải</th>
                <th className="px-2 py-2 text-left w-14">ĐVT</th>
                <th className="px-2 py-2 text-right w-14">SL</th>
                <th className="px-2 py-2 text-right w-20">Đơn giá</th>
                <th className="px-2 py-2 text-right w-22">Thành tiền</th>
                <th className="px-2 py-2 text-right w-12">Thuế</th>
                <th className="px-2 py-2 text-right w-20">Tổng</th>
                <th className="px-2 py-2 text-center w-12"></th>
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
                return (
                  <tr key={line.id || idx} className={`border-b border-gray-100 hover:bg-blue-50/30 ${isPending ? 'bg-orange-50/50' : ''}`}>
                    <td className="px-1 py-1 text-center">{isPending && <span className="text-orange-400">⚠</span>}</td>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1 flex items-center gap-1">
                      <EditableCell value={line.ocr_product_code} onChange={v => updateLine(idx, 'ocr_product_code', v)} placeholder="Mã SP" />
                      {!systemLine && <button className="text-blue-400 hover:text-blue-600 shrink-0" onClick={() => setProductModalIdx(idx)}><SearchOutlined /></button>}
                    </td>
                    <td className="px-2 py-1"><EditableCell value={line.product_name_original} onChange={v => updateLine(idx, 'product_name_original', v)} placeholder="Tên SP" /></td>
                    <td className="px-2 py-1"><EditableCell value={line.uom_original} onChange={v => updateLine(idx, 'uom_original', v)} placeholder="ĐVT" /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.quantity} type="number" onChange={v => updateLine(idx, 'quantity', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.unit_price} type="number" onChange={v => updateLine(idx, 'unit_price', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.line_total} type="number" onChange={v => updateLine(idx, 'line_total', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.tax_rate} type="number" onChange={v => updateLine(idx, 'tax_rate', v)} /></td>
                    <td className="px-2 py-1 text-right font-medium">{totalLine ? totalLine.toLocaleString('vi-VN') : '0'}</td>
                    <td className="px-2 py-1 text-center">
                      <button className="text-red-500 hover:text-red-700 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50" onClick={() => deleteLine(idx)} title="Xóa dòng"><DeleteOutlined /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                <td colSpan={7} className="px-2 py-2 text-right">Tổng cộng</td>
                <td className="px-2 py-2 text-right">{total.toLocaleString('vi-VN')}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setProductModalIdx(-1)}>Chọn hàng hóa</Button>
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: '', product_name_original: '', quantity: 1, unit_price: 0, line_total: 0, uom_original: '', discount_rate: 0, discount_amount: 0, tax_rate: 0, mapping_status: 'pending' } as unknown as OrderLine])}>Thêm dòng</Button>
          <Button size="small" icon={<GiftOutlined />}>Khuyến mại</Button>
          <Button size="small" icon={<PercentageOutlined />} onClick={() => { setDiscountMode('amount'); setDiscountValue(null); setDiscountModalOpen(true); }}>Chiết khấu</Button>
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
          <Form.Item label="Điện thoại"><Input value={selectedCustomerData.phone || ''} onChange={e => setCustField('phone', e.target.value)} /></Form.Item>
          <Form.Item label="Email"><Input value={selectedCustomerData.email || ''} onChange={e => setCustField('email', e.target.value)} /></Form.Item>
          <Form.Item label="Lĩnh vực"><Input value={selectedCustomerData.field || ''} onChange={e => setCustField('field', e.target.value)} /></Form.Item>
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
            setLines(prev => prev.map((line, idx) => idx === productModalIdx ? applyProductToLine(line, p) : line))
          } else {
            setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: p.code, product_name_original: p.name, quantity: 1, unit_price: p.price || 0, line_total: p.price || 0, uom_original: p.uom, tax_rate: productTaxRate(p), mapping_status: 'mapped' } as unknown as OrderLine])
          }
          setProductModalIdx(null)
        }}
        onCancel={() => setProductModalIdx(null)}
      />

      {/* Customer + Contact popup */}
      <CustomerContactPopup
        open={!!activePopup}
        onSelect={handleCustomerContactResult}
        onCancel={() => setActivePopup(null)}
      />

      {/* Discount modal */}
      {discountModalOpen && (
        <Modal
          open
          width={500}
          centered
          title="Chiết khấu đơn hàng"
          footer={null}
          onCancel={() => setDiscountModalOpen(false)}
        >
          <div className="pt-4">
            <div className="grid grid-cols-[140px_1fr] items-center gap-4 mb-4">
              <span className="text-sm font-medium">Chiết khấu theo:</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={discountMode === 'amount'} onChange={() => setDiscountMode('amount')} /> Số tiền</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={discountMode === 'percent'} onChange={() => setDiscountMode('percent')} /> Phần trăm (%)</label>
              </div>
            </div>
            <div className="grid grid-cols-[140px_1fr] items-center gap-4 mb-6">
              <span className="text-sm font-medium">Giá trị:</span>
              <InputNumber
                autoFocus
                className="w-full"
                min={0}
                max={discountMode === 'percent' ? 100 : undefined}
                value={discountValue}
                onChange={v => setDiscountValue(Number(v))}
                formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              />
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button onClick={() => setDiscountModalOpen(false)}>Hủy</Button>
              <Button type="primary" onClick={() => {
                if (!discountValue || discountValue <= 0) return message.warning('Nhập giá trị chiết khấu');
                const amt = discountMode === 'percent' ? Math.round(total * discountValue / 100) : discountValue;
                setLines(prev => [...prev, {
                  id: `new-${Date.now()}`,
                  ocr_product_code: 'CKĐH',
                  product_name_original: 'Chiết khấu đơn hàng',
                  quantity: 1,
                  unit_price: -amt,
                  line_total: -amt,
                  uom_original: '',
                  discount_rate: 0,
                  discount_amount: 0,
                  tax_rate: 0,
                  mapping_status: 'overridden'
                } as unknown as OrderLine]);
                setDiscountModalOpen(false);
                message.success('Đã áp dụng chiết khấu');
              }}>Áp dụng</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

