import { useEffect, useState } from 'react'
import { Form, Input, DatePicker, InputNumber, Select, Button, message, Modal, Table as AntTable } from 'antd'
import { SearchOutlined, PlusOutlined, ExclamationCircleOutlined, DeleteOutlined } from '@ant-design/icons'
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
      <Input value={value} placeholder={placeholder || '- KhÃ´ng chá»n -'} readOnly className="flex-1" />
      <Button icon={<SearchOutlined />} onClick={onPopupClick} className="border-l-0 rounded-l-none" title="Chá»n tá»« danh sÃ¡ch" />
    </div>
  )
}

function ProductModal({ open, suggestName, onSelect, onCancel }: { open: boolean; suggestName: string; onSelect: (p: Product) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const results = query.trim() ? searchProducts(query) : suggestName ? matchProduct(suggestName, 20).map(r => r.product) : searchProducts('')
  return (
    <Modal title="Chá»n hÃ ng hÃ³a" open={open} onCancel={onCancel} width="90vw" style={{ maxWidth: 1000 }} footer={null} zIndex={1200}>
      <Input.Search placeholder="TÃ¬m theo tÃªn hoáº·c mÃ£ hÃ ng hÃ³a..." value={query} onChange={e => setQuery(e.target.value)} className="mb-3" allowClear autoFocus />
      {suggestName && !query && <div className="mb-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded">Gá»£i Ã½: <strong>{suggestName}</strong></div>}
      <AntTable size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={results} rowKey="code"
        scroll={{ x: 'max-content' }}
        onRow={record => ({ onClick: () => onSelect(record as Product), className: 'cursor-pointer hover:bg-blue-50' })}
        columns={[
          { title: 'MÃ£ hÃ ng hÃ³a', dataIndex: 'code', width: 120 },
          { title: 'TÃªn hÃ ng hÃ³a', dataIndex: 'name', width: 320 },
          { title: 'ÄVT', dataIndex: 'uom', width: 80 },
          { title: 'ÄÆ¡n giÃ¡', dataIndex: 'price', width: 120, render: (v: number) => v ? v.toLocaleString('vi-VN') : '\u2014' },
          { title: 'Thuáº¿', dataIndex: 'tax_rate', width: 80 },
          { title: 'TÃ­nh cháº¥t', dataIndex: 'property', width: 140 },
        ]}
        locale={{ emptyText: 'KhÃ´ng tÃ¬m tháº¥y hÃ ng hÃ³a' }} />
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
        order_type: String(order.extra_data?.order_type || 'KÃªnh MT'),
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

  // Tá»± Ä‘á»™ng Ä‘á»“ng bá»™ tá»•ng tiá»n khi Ä‘á»•i dÃ²ng hÃ ng
  useEffect(() => {
    if (loading) return
    const subtotal = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
    form.setFieldValue('total_amount', subtotal)
  }, [lines, form, loading])

  const updateLine = (i: number, field: string, value: unknown) => {
    setLines(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: value }; return u })
  }

  const buildSavePayload = (nextLines: OrderLine[]) => {
    const values = form.getFieldsValue()
    const meta: Record<string, string> = {
      ...buildExtraData(selectedCustomerData),
      order_type: values.order_type || 'KÃªnh MT',
      salesperson: selectedCustomerData.salesperson || '',
      credit_days: selectedCustomerData.credit_days || '',
      contact: selectedContactName || selectedCustomerData.contact || '',
    }
    return {
      ...values,
      order_date: values.order_date ? (values.order_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      delivery_date: values.delivery_date ? (values.delivery_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      recipient_name: selectedCustomer || null,
      description: selectedCustomerData.invoice_address || null,
      extra_data: meta,
      lines: nextLines,
    }
  }

  const deleteLine = async (i: number) => {
    const nextLines = lines.filter((_, idx) => idx !== i)
    setLines(nextLines)
    try {
      await updateOrder(orderId, buildSavePayload(nextLines))
      message.success('Đã xóa dòng')
      onSaved?.()
    } catch (e: any) {
      message.error(e.message || 'Xóa dòng thất bại')
    }
  }

  const handleSave = async () => {
    try {
      await updateOrder(orderId, buildSavePayload(lines))
      message.success('ÄÃ£ lÆ°u')
      onSaved?.()
    } catch (e: any) { message.error(e.message || 'LÆ°u tháº¥t báº¡i') }
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

  if (loading) return <div className="text-center py-10 text-gray-400">Äang táº£i...</div>

  return (
    <div>
      {/* ThÃ´ng tin chung */}
      <h2 className="text-sm font-semibold text-gray-700 mb-4">ThÃ´ng tin chung</h2>
      <Form form={form} layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label={<>Sá»‘ Ä‘Æ¡n hÃ ng <span className="text-red-500">*</span></>} name="order_number" rules={[{ required: true, message: 'Nháº­p sá»‘ Ä‘Æ¡n hÃ ng' }]}><Input /></Form.Item>
          <Form.Item label={<>NgÃ y Ä‘áº·t hÃ ng <span className="text-red-500">*</span></>} name="order_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label="Sá»‘ PO" name="po_number"><Input /></Form.Item>
          <Form.Item label="Háº¡n giao hÃ ng" name="delivery_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label="KhÃ¡ch hÃ ng"><InputWithPopup value={selectedCustomer} placeholder="- KhÃ´ng chá»n -" onPopupClick={() => setActivePopup('customer')} /></Form.Item>
          <Form.Item label="LiÃªn há»‡">
            <div className="flex gap-1">
              <Input value={selectedContactName} onChange={e => { setSelectedContactName(e.target.value); setCustField('contact', e.target.value) }} placeholder="Nháº­p hoáº·c chá»n tá»« danh sÃ¡ch" className="flex-1" />
              <Button icon={<SearchOutlined />} onClick={() => setActivePopup('customer')} title="Chá»n tá»« danh sÃ¡ch" />
            </div>
          </Form.Item>
          <Form.Item label={<>Háº¡n thanh toÃ¡n <span className="text-red-500">*</span></>} name="payment_due"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label={<>GiÃ¡ trá»‹ Ä‘Æ¡n hÃ ng <span className="text-red-500">*</span></>} name="total_amount"><InputNumber className="w-full" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v!.replace(/,/g, '') as unknown as number} /></Form.Item>
          <Form.Item label={<>Loáº¡i Ä‘Æ¡n hÃ ng <span className="text-red-500">*</span></>} name="order_type" initialValue="KÃªnh MT"><Select placeholder="- Chá»n -" options={[{ value: 'KÃªnh MT', label: 'KÃªnh MT' }, { value: 'KhÃ¡ch láº»', label: 'KhÃ¡ch láº»' }, { value: 'B2B', label: 'B2B' }, { value: 'KÃªnh GT', label: 'KÃªnh GT' }]} /></Form.Item>
          <Form.Item label={<>TÃ¬nh tráº¡ng <span className="text-red-500">*</span></>}><Select defaultValue="not_done" options={[{ value: 'not_done', label: 'ChÆ°a thá»±c hiá»‡n' }, { value: 'in_progress', label: 'Äang thá»±c hiá»‡n' }, { value: 'done', label: 'HoÃ n thÃ nh' }]} /></Form.Item>
          <Form.Item label="NhÃ¢n viÃªn bÃ¡n hÃ ng"><Input value={selectedCustomerData.salesperson || ''} onChange={e => setCustField('salesperson', e.target.value)} placeholder="VD: KM-1989 Nguyá»…n VÄƒn Ã‚n" /></Form.Item>
          <Form.Item label="Sá»‘ ngÃ y Ä‘Æ°á»£c ná»£"><Input value={selectedCustomerData.credit_days || ''} onChange={e => setCustField('credit_days', e.target.value)} placeholder="VD: 30" /></Form.Item>
        </div>
      </Form>

      {/* HÃ ng hÃ³a */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">ThÃ´ng tin hÃ ng hÃ³a</h2>
          <span className="text-xs text-gray-400">{lines.length} dÃ²ng</span>
        </div>
        {hasUnmappedItems && (
          <div className="mb-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-1.5">
            <ExclamationCircleOutlined /><span>{unmappedLines.length}/{lines.length} dÃ²ng chÆ°a map</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-1 py-2 w-6"></th>
                <th className="px-2 py-2 text-left w-8">STT</th>
                <th className="px-2 py-2 text-left w-28">MÃ£ hÃ ng hÃ³a</th>
                <th className="px-2 py-2 text-left min-w-[150px]">Diá»…n giáº£i</th>
                <th className="px-2 py-2 text-left w-14">ÄVT</th>
                <th className="px-2 py-2 text-right w-14">SL</th>
                <th className="px-2 py-2 text-right w-20">ÄÆ¡n giÃ¡</th>
                <th className="px-2 py-2 text-right w-22">ThÃ nh tiá»n</th>
                <th className="px-2 py-2 text-right w-12">Thuáº¿</th>
                <th className="px-2 py-2 text-right w-20">Tá»•ng</th>
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
                    <td className="px-1 py-1 text-center">{isPending && <span className="text-orange-400">âš </span>}</td>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1 flex items-center gap-1">
                      <EditableCell value={line.ocr_product_code} onChange={v => updateLine(idx, 'ocr_product_code', v)} placeholder="MÃ£ SP" />
                      {!systemLine && <button className="text-blue-400 hover:text-blue-600 shrink-0" onClick={() => setProductModalIdx(idx)}><SearchOutlined /></button>}
                    </td>
                    <td className="px-2 py-1"><EditableCell value={line.product_name_original} onChange={v => updateLine(idx, 'product_name_original', v)} placeholder="TÃªn SP" /></td>
                    <td className="px-2 py-1"><EditableCell value={line.uom_original} onChange={v => updateLine(idx, 'uom_original', v)} placeholder="ÄVT" /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.quantity} type="number" onChange={v => updateLine(idx, 'quantity', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.unit_price} type="number" onChange={v => updateLine(idx, 'unit_price', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.line_total} type="number" onChange={v => updateLine(idx, 'line_total', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.tax_rate} type="number" onChange={v => updateLine(idx, 'tax_rate', v)} /></td>
                    <td className="px-2 py-1 text-right font-medium">{totalLine ? totalLine.toLocaleString('vi-VN') : '0'}</td>
                    <td className="px-2 py-1 text-center">
                      <button className="text-red-500 hover:text-red-700 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50" onClick={() => deleteLine(idx)} title="XÃ³a dÃ²ng"><DeleteOutlined /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                <td colSpan={7} className="px-2 py-2 text-right">Tá»•ng cá»™ng</td>
                <td className="px-2 py-2 text-right">{total.toLocaleString('vi-VN')}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setProductModalIdx(-1)}>Chá»n hÃ ng hÃ³a</Button>
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: '', product_name_original: '', quantity: 1, unit_price: 0, line_total: 0, uom_original: '', discount_rate: 0, discount_amount: 0, tax_rate: 0, mapping_status: 'pending' } as unknown as OrderLine])}>ThÃªm dÃ²ng</Button>
        </div>
      </div>

      {/* ThÃ´ng tin hÃ³a Ä‘Æ¡n */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2 mt-6">ThÃ´ng tin hÃ³a Ä‘Æ¡n</h2>
      <Form layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label="MÃ£ khÃ¡ch hÃ ng"><Input value={selectedCustomerData.code || ''} onChange={e => setCustField('code', e.target.value)} /></Form.Item>
          <Form.Item label="Loáº¡i khÃ¡ch hÃ ng"><Input value={selectedCustomerData.type || ''} onChange={e => setCustField('type', e.target.value)} /></Form.Item>
          <Form.Item label="TÃªn khÃ¡ch hÃ ng (HÄ)"><Input value={selectedCustomerData.name || ''} onChange={e => { setCustField('name', e.target.value); setSelectedCustomer(e.target.value) }} /></Form.Item>
          <Form.Item label="MÃ£ sá»‘ thuáº¿"><Input value={selectedCustomerData.tax_code || ''} onChange={e => setCustField('tax_code', e.target.value)} /></Form.Item>
          <Form.Item label="NgÆ°á»i mua hÃ ng"><Input value={selectedCustomerData.owner || ''} onChange={e => setCustField('owner', e.target.value)} /></Form.Item>
          <Form.Item label="Äiá»‡n thoáº¡i"><Input value={selectedCustomerData.phone || ''} onChange={e => setCustField('phone', e.target.value)} /></Form.Item>
          <Form.Item label="Email"><Input value={selectedCustomerData.email || ''} onChange={e => setCustField('email', e.target.value)} /></Form.Item>
          <Form.Item label="LÄ©nh vá»±c"><Input value={selectedCustomerData.field || ''} onChange={e => setCustField('field', e.target.value)} /></Form.Item>
          <Form.Item label="Äá»‹a chá»‰ (HÄ)"><Input value={selectedCustomerData.invoice_address || ''} onChange={e => setCustField('invoice_address', e.target.value)} /></Form.Item>
          <Form.Item label="Tá»‰nh/TP (HÄ)"><Input value={selectedCustomerData.invoice_city || ''} onChange={e => setCustField('invoice_city', e.target.value)} /></Form.Item>
          <Form.Item label="Quáº­n/Huyá»‡n (HÄ)"><Input value={selectedCustomerData.invoice_district || ''} onChange={e => setCustField('invoice_district', e.target.value)} /></Form.Item>
          <Form.Item label="PhÆ°á»ng/XÃ£ (HÄ)"><Input value={selectedCustomerData.invoice_ward || ''} onChange={e => setCustField('invoice_ward', e.target.value)} /></Form.Item>
          <Form.Item label="MÃ´ táº£"><Input value={selectedCustomerData.description || ''} onChange={e => setCustField('description', e.target.value)} /></Form.Item>
        </div>
      </Form>

      {/* ThÃ´ng tin giao hÃ ng */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2 mt-4">ThÃ´ng tin giao hÃ ng</h2>
      <Form layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label="NgÆ°á»i nháº­n hÃ ng"><Input value={selectedCustomerData.delivery_receiver || selectedCustomerData.owner || ''} onChange={e => setCustField('delivery_receiver', e.target.value)} /></Form.Item>
          <Form.Item label="Äiá»‡n thoáº¡i"><Input value={selectedCustomerData.delivery_phone || selectedCustomerData.phone || ''} onChange={e => setCustField('delivery_phone', e.target.value)} /></Form.Item>
          <Form.Item label="Äá»‹a chá»‰ (GH)"><Input value={selectedCustomerData.delivery_address || selectedCustomerData.invoice_address || ''} onChange={e => setCustField('delivery_address', e.target.value)} /></Form.Item>
          <Form.Item label="Tá»‰nh/TP (GH)"><Input value={selectedCustomerData.delivery_city || selectedCustomerData.invoice_city || ''} onChange={e => setCustField('delivery_city', e.target.value)} /></Form.Item>
          <Form.Item label="Quáº­n/Huyá»‡n (GH)"><Input value={selectedCustomerData.delivery_district || ''} onChange={e => setCustField('delivery_district', e.target.value)} /></Form.Item>
          <Form.Item label="PhÆ°á»ng/XÃ£ (GH)"><Input value={selectedCustomerData.delivery_ward || ''} onChange={e => setCustField('delivery_ward', e.target.value)} /></Form.Item>
        </div>
      </Form>

      {/* Save button */}
      <div className="flex justify-end mt-4 pt-3 border-t border-gray-200">
        <Button type="primary" onClick={handleSave}>LÆ°u thay Ä‘á»•i</Button>
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

    </div>
  )
}

