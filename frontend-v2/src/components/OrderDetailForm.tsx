import { useEffect, useState } from 'react'
import { Form, Input, DatePicker, InputNumber, Select, Button, message, Modal, Table as AntTable } from 'antd'
import { SearchOutlined, PlusOutlined, GiftOutlined, PercentageOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { getOrder, updateOrder } from '@/api/orders'
import SelectPopup from '@/components/SelectPopup'
import type { OrderLine } from '@/types/order'
import customersData from '@/data/customers.json'
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
    <Modal title="Chọn hàng hóa" open={open} onCancel={onCancel} width={800} footer={null} zIndex={1200}>
      <Input.Search placeholder="Tìm theo tên hoặc mã hàng hóa..." value={query} onChange={e => setQuery(e.target.value)} className="mb-3" allowClear autoFocus />
      {suggestName && !query && <div className="mb-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded">Gợi ý: <strong>{suggestName}</strong></div>}
      <AntTable size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={results} rowKey="code"
        onRow={record => ({ onClick: () => onSelect(record as Product), className: 'cursor-pointer hover:bg-blue-50' })}
        columns={[
          { title: 'Mã hàng hóa', dataIndex: 'code', width: 110 },
          { title: 'Tên hàng hóa', dataIndex: 'name', ellipsis: true },
          { title: 'ĐVT', dataIndex: 'uom', width: 70 },
          { title: 'Đơn giá', dataIndex: 'price', width: 100, render: (v: number) => v ? v.toLocaleString('vi-VN') : '\u2014' },
          { title: 'Thuế', dataIndex: 'tax_rate', width: 60 },
        ]}
        locale={{ emptyText: 'Không tìm thấy hàng hóa' }} />
    </Modal>
  )
}

const POPUP_CONFIGS = {
  customer: {
    title: 'Chọn khách hàng',
    columns: [
      { title: 'Mã KH', dataIndex: 'code', width: 120 },
      { title: 'Tên khách hàng', dataIndex: 'name', width: 280 },
      { title: 'Địa chỉ', dataIndex: 'invoice_address', width: 250 },
      { title: 'ĐT', dataIndex: 'phone', width: 120 },
    ],
  },
} as const

type PopupType = 'customer' | null

interface Props {
  orderId: string
  onSaved?: () => void
}

export default function OrderDetailForm({ orderId, onSaved }: Props) {
  const [form] = Form.useForm()
  const [lines, setLines] = useState<OrderLine[]>([])
  const [productModalIdx, setProductModalIdx] = useState<number | null>(null)
  const [activePopup, setActivePopup] = useState<PopupType>(null)
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedCustomerData, setSelectedCustomerData] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)

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
        payment_due: order.order_date ? dayjs(order.order_date).add(1, 'month') : null,
      })
      if (order.recipient_name) setSelectedCustomer(order.recipient_name)
      // Auto-map
      const mappedLines = (order.lines || []).map(line => {
        if (line.mapping_status === 'mapped') return line
        const match = getBestMatch(line.product_name_original || line.ocr_product_code || '')
        if (match) {
          return { ...line, ocr_product_code: line.ocr_product_code || match.code, uom_original: line.uom_original || match.uom, tax_rate: line.tax_rate ?? (parseFloat(match.tax_rate) || null), mapping_status: 'mapped' as const }
        }
        return line
      })
      setLines(mappedLines)
      setLoading(false)
    }).catch(() => { setLoading(false) })
  }, [orderId, form])

  const updateLine = (i: number, field: string, value: unknown) => {
    setLines(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: value }; return u })
  }

  const handleSave = async () => {
    const values = form.getFieldsValue()
    const meta: Record<string, string | number | null> = {}
    if (selectedCustomerData) {
      meta.customer_code = selectedCustomerData.code || ''
      meta.invoice_customer = selectedCustomerData.name || ''
      meta.invoice_buyer = selectedCustomerData.owner || ''
      meta.invoice_city = selectedCustomerData.invoice_city || ''
      meta.invoice_district = selectedCustomerData.invoice_district || ''
      meta.invoice_ward = selectedCustomerData.invoice_ward || ''
      meta.invoice_street = selectedCustomerData.invoice_address || ''
      meta.invoice_address = selectedCustomerData.invoice_address || ''
      meta.delivery_receiver = selectedCustomerData.owner || ''
      meta.delivery_phone = selectedCustomerData.phone || ''
      meta.delivery_city = selectedCustomerData.invoice_city || ''
      meta.delivery_district = selectedCustomerData.invoice_district || ''
      meta.delivery_ward = selectedCustomerData.invoice_ward || ''
      meta.delivery_street = selectedCustomerData.delivery_address || selectedCustomerData.invoice_address || ''
      meta.delivery_address = selectedCustomerData.delivery_address || selectedCustomerData.invoice_address || ''
    }
    try {
      await updateOrder(orderId, {
        ...values,
        order_date: values.order_date ? (values.order_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        delivery_date: values.delivery_date ? (values.delivery_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        recipient_name: selectedCustomer || null,
        description: selectedCustomerData?.invoice_address || null,
        extra_data: meta,
      })
      message.success('Đã lưu')
      onSaved?.()
    } catch (e: any) { message.error(e.message || 'Lưu thất bại') }
  }

  const handlePopupSelect = (record: Record<string, unknown>) => {
    setSelectedCustomer((record.name || record.code || '') as string)
    setSelectedCustomerData(record as unknown as Record<string, string>)
    form.setFieldValue('partner_id', record.code)
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
          <Form.Item label={<>Số đơn hàng <span className="text-red-500">*</span></>} name="order_number"><Input readOnly /></Form.Item>
          <Form.Item label={<>Ngày đặt hàng <span className="text-red-500">*</span></>} name="order_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label="Số PO" name="po_number"><Input /></Form.Item>
          <Form.Item label="Hạn giao hàng" name="delivery_date"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label="Khách hàng"><InputWithPopup value={selectedCustomer} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('customer')} /></Form.Item>
          <Form.Item label={<>Hạn thanh toán <span className="text-red-500">*</span></>} name="payment_due"><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
          <Form.Item label={<>Giá trị đơn hàng <span className="text-red-500">*</span></>} name="total_amount"><InputNumber className="w-full" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v!.replace(/,/g, '') as unknown as number} /></Form.Item>
          <Form.Item label={<>Loại đơn hàng <span className="text-red-500">*</span></>}><Select placeholder="- Chọn -" options={[{ value: 'mt', label: 'Kênh MT' }, { value: 'retail', label: 'Khách lẻ' }, { value: 'b2b', label: 'B2B' }, { value: 'gt', label: 'Kênh GT' }]} /></Form.Item>
          <Form.Item label={<>Tình trạng <span className="text-red-500">*</span></>}><Select defaultValue="not_done" options={[{ value: 'not_done', label: 'Chưa thực hiện' }, { value: 'in_progress', label: 'Đang thực hiện' }, { value: 'done', label: 'Hoàn thành' }]} /></Form.Item>
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
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const amt = Number(line.line_total) || 0
                const txRate = Number(line.tax_rate) || 0
                const txAmt = Math.round(amt * txRate / 100)
                const totalLine = amt + txAmt
                const isPending = line.mapping_status === 'pending'
                return (
                  <tr key={line.id || idx} className={`border-b border-gray-100 hover:bg-blue-50/30 ${isPending ? 'bg-orange-50/50' : ''}`}>
                    <td className="px-1 py-1 text-center">{isPending && <span className="text-orange-400">⚠</span>}</td>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1 flex items-center gap-1">
                      <EditableCell value={line.ocr_product_code} onChange={v => updateLine(idx, 'ocr_product_code', v)} placeholder="Mã SP" />
                      <button className="text-blue-400 hover:text-blue-600 shrink-0" onClick={() => setProductModalIdx(idx)}><SearchOutlined /></button>
                    </td>
                    <td className="px-2 py-1"><EditableCell value={line.product_name_original} onChange={v => updateLine(idx, 'product_name_original', v)} placeholder="Tên SP" /></td>
                    <td className="px-2 py-1"><EditableCell value={line.uom_original} onChange={v => updateLine(idx, 'uom_original', v)} placeholder="ĐVT" /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.quantity} type="number" onChange={v => updateLine(idx, 'quantity', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.unit_price} type="number" onChange={v => updateLine(idx, 'unit_price', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.line_total} type="number" onChange={v => updateLine(idx, 'line_total', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.tax_rate} type="number" onChange={v => updateLine(idx, 'tax_rate', v)} /></td>
                    <td className="px-2 py-1 text-right font-medium">{totalLine ? totalLine.toLocaleString('vi-VN') : '0'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                <td colSpan={7} className="px-2 py-2 text-right">Tổng cộng</td>
                <td className="px-2 py-2 text-right">{total.toLocaleString('vi-VN')}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setProductModalIdx(-1)}>Chọn hàng hóa</Button>
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: '', product_name_original: '', quantity: 1, unit_price: 0, line_total: 0, uom_original: '', discount_rate: 0, discount_amount: 0, tax_rate: 0, mapping_status: 'pending' } as unknown as OrderLine])}>Thêm dòng</Button>
          <Button size="small" icon={<GiftOutlined />}>Khuyến mại</Button>
          <Button size="small" icon={<PercentageOutlined />}>Chiết khấu</Button>
        </div>
      </div>

      {/* Thông tin hóa đơn */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2 mt-6">Thông tin hóa đơn</h2>
      <Form layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label="Khách hàng (HĐ)"><Input value={selectedCustomerData?.name || ''} readOnly /></Form.Item>
          <Form.Item label="Người mua hàng"><Input value={selectedCustomerData?.owner || ''} readOnly /></Form.Item>
          <Form.Item label="Tỉnh/TP (HĐ)"><Input value={selectedCustomerData?.invoice_city || ''} readOnly /></Form.Item>
          <Form.Item label="Quận/Huyện (HĐ)"><Input value={selectedCustomerData?.invoice_district || ''} readOnly /></Form.Item>
          <Form.Item label="Phường/Xã (HĐ)"><Input value={selectedCustomerData?.invoice_ward || ''} readOnly /></Form.Item>
          <Form.Item label="Địa chỉ (HĐ)"><Input value={selectedCustomerData?.invoice_address || ''} /></Form.Item>
        </div>
      </Form>

      {/* Thông tin giao hàng */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2 mt-4">Thông tin giao hàng</h2>
      <Form layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
        <div className="grid grid-cols-2 gap-x-6">
          <Form.Item label="Người nhận hàng"><Input value={selectedCustomerData?.owner || ''} /></Form.Item>
          <Form.Item label="Điện thoại"><Input value={selectedCustomerData?.phone || ''} /></Form.Item>
          <Form.Item label="Địa chỉ (GH)"><Input value={selectedCustomerData?.delivery_address || ''} /></Form.Item>
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
            updateLine(productModalIdx, 'ocr_product_code', p.code)
            updateLine(productModalIdx, 'product_name_original', p.name)
            updateLine(productModalIdx, 'uom_original', p.uom)
            updateLine(productModalIdx, 'tax_rate', parseFloat(p.tax_rate) || 0)
            updateLine(productModalIdx, 'unit_price', p.price || 0)
            updateLine(productModalIdx, 'mapping_status', 'mapped')
          } else {
            setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: p.code, product_name_original: p.name, quantity: 1, unit_price: p.price || 0, line_total: p.price || 0, uom_original: p.uom, tax_rate: parseFloat(p.tax_rate) || 0, mapping_status: 'mapped' } as unknown as OrderLine])
          }
          setProductModalIdx(null)
        }}
        onCancel={() => setProductModalIdx(null)}
      />

      {/* Customer popup */}
      {activePopup && (
        <SelectPopup
          open={true}
          title={POPUP_CONFIGS.customer.title}
          columns={[...POPUP_CONFIGS.customer.columns]}
          dataSource={customersData as Record<string, unknown>[]}
          onSelect={handlePopupSelect}
          onCancel={() => setActivePopup(null)}
          rowKey="code"
        />
      )}
    </div>
  )
}
