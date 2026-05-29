import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Form, Input, DatePicker, InputNumber, Select, Button, Tag, message, Modal, Table as AntTable, Steps, Upload as AntUpload, Checkbox } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, SearchOutlined, UnorderedListOutlined, PlusOutlined, GiftOutlined, PercentageOutlined, FileExcelOutlined, ExclamationCircleOutlined, InboxOutlined } from '@ant-design/icons'
import { getOrder, getRawDocument, updateOrder, completeOrder, uploadBatch } from '@/api/orders'
import SelectPopup from '@/components/SelectPopup'
import type { OrderLine } from '@/types/order'
import dayjs from 'dayjs'

const { Dragger } = AntUpload

function EditableCell({ value, type = 'text', onChange, placeholder }: { value: string | number | null | undefined; type?: 'text' | 'number'; onChange: (val: unknown) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value)
  useEffect(() => { setLocalVal(value) }, [value])
  if (!editing) {
    return (<div className="cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 min-h-[22px] text-xs" onClick={() => setEditing(true)}>{type === 'number' && localVal != null ? Number(localVal).toLocaleString('vi-VN') : localVal || <span className="text-gray-300">{placeholder || '\u2014'}</span>}</div>)
  }
  return type === 'number' ? (<InputNumber size="small" autoFocus value={localVal as number} onChange={v => setLocalVal(v)} onBlur={() => { setEditing(false); onChange(localVal) }} onPressEnter={() => { setEditing(false); onChange(localVal) }} className="w-full" />) : (<Input size="small" autoFocus value={localVal as string} onChange={e => setLocalVal(e.target.value)} onBlur={() => { setEditing(false); onChange(localVal) }} onPressEnter={() => { setEditing(false); onChange(localVal) }} />)
}

// Popup configs
const POPUP_CONFIGS = {
  customer: {
    title: 'Chọn khách hàng',
    columns: [
      { title: 'Mã KH', dataIndex: 'code', width: 100 },
      { title: 'Loại KH', dataIndex: 'type', width: 80 },
      { title: 'Tên khách hàng', dataIndex: 'name' },
      { title: 'MST', dataIndex: 'tax_code', width: 120 },
    ],
  },
  contact: {
    title: 'Chọn liên hệ',
    columns: [
      { title: 'Mã LH', dataIndex: 'code', width: 80 },
      { title: 'Xưng', dataIndex: 'prefix', width: 60 },
      { title: 'Họ tên', dataIndex: 'name' },
      { title: 'Chức danh', dataIndex: 'title', width: 100 },
      { title: 'ĐT', dataIndex: 'phone', width: 110 },
    ],
  },
  quotation: {
    title: 'Chọn báo giá',
    columns: [
      { title: 'Số BG', dataIndex: 'code', width: 100 },
      { title: 'Ngày', dataIndex: 'date', width: 100 },
      { title: 'Hiệu lực', dataIndex: 'valid_until', width: 100 },
      { title: 'Khách hàng', dataIndex: 'customer' },
      { title: 'Liên hệ', dataIndex: 'contact', width: 100 },
    ],
  },
  parentOrder: {
    title: 'Chọn đơn hàng cha',
    columns: [
      { title: 'Số ĐH', dataIndex: 'code', width: 120 },
      { title: 'Ngày', dataIndex: 'date', width: 100 },
      { title: 'Khách hàng', dataIndex: 'customer' },
      { title: 'Giá trị', dataIndex: 'amount', width: 120 },
    ],
  },
  opportunity: {
    title: 'Chọn cơ hội',
    columns: [
      { title: 'Mã CH', dataIndex: 'code', width: 100 },
      { title: 'Tên cơ hội', dataIndex: 'name' },
      { title: 'Khách hàng', dataIndex: 'customer', width: 150 },
      { title: 'Giai đoạn', dataIndex: 'stage', width: 100 },
    ],
  },
  campaign: {
    title: 'Chọn chiến dịch',
    columns: [
      { title: 'Mã CD', dataIndex: 'code', width: 100 },
      { title: 'Tên chiến dịch', dataIndex: 'name' },
      { title: 'Trạng thái', dataIndex: 'status', width: 100 },
      { title: 'Ngày bắt đầu', dataIndex: 'start_date', width: 110 },
    ],
  },
} as const

type PopupType = keyof typeof POPUP_CONFIGS | null

function InputWithPopup({ value, placeholder, onPopupClick }: { value?: string; placeholder?: string; onPopupClick: () => void }) {
  return (
    <div className="flex items-center gap-0">
      <Input value={value} placeholder={placeholder || '- Không chọn -'} readOnly className="flex-1" />
      <Button
        icon={<UnorderedListOutlined />}
        onClick={onPopupClick}
        className="border-l-0 rounded-l-none"
        title="Chọn từ danh sách"
      />
    </div>
  )
}

export default function OrderReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [lines, setLines] = useState<OrderLine[]>([])
  const [productModalIdx, setProductModalIdx] = useState<number | null>(null)
  const [activePopup, setActivePopup] = useState<PopupType>(null)

  // Upload state (for new order)
  const isNewOrder = !id || id === 'new'
  const [uploading, setUploading] = useState(false)
  const [useAI, setUseAI] = useState(true)
  const [orderId, setOrderId] = useState<string | null>(isNewOrder ? null : id!)

  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [selectedContact, setSelectedContact] = useState<string>('')
  const [selectedQuotation, setSelectedQuotation] = useState<string>('')
  const [selectedParentOrder, setSelectedParentOrder] = useState<string>('')
  const [selectedOpportunity, setSelectedOpportunity] = useState<string>('')
  const [selectedCampaign, setSelectedCampaign] = useState<string>('')

  const effectiveId = orderId || id
  const { data: order, isLoading } = useQuery({ queryKey: ['order', effectiveId], queryFn: () => getOrder(effectiveId!), enabled: !!effectiveId && effectiveId !== 'new' })
  const { data: rawDoc } = useQuery({ queryKey: ['rawDoc', order?.raw_document_id], queryFn: () => getRawDocument(order!.raw_document_id), enabled: !!order?.raw_document_id })

  useEffect(() => {
    if (order) {
      form.setFieldsValue({
        order_date: order.order_date ? dayjs(order.order_date) : null,
        delivery_date: order.delivery_date ? dayjs(order.delivery_date) : null,
        total_amount: order.total_amount,
        po_number: order.po_number,
        currency: order.currency || 'VND',
        payment_method: order.payment_method,
        partner_id: order.partner_id,
        delivery_address_id: order.delivery_address_id,
      })
      setLines(order.lines || [])
    }
  }, [order, form])

  const confirmMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      await updateOrder(effectiveId!, {
        ...values,
        order_date: values.order_date ? (values.order_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        delivery_date: values.delivery_date ? (values.delivery_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      })
      await completeOrder(effectiveId!)
    },
    onSuccess: () => { message.success('Xác nhận thành công'); queryClient.invalidateQueries({ queryKey: ['orders'] }); navigate('/orders') },
    onError: (e: Error) => message.error(e.message),
  })

  // Validation helpers
  const unmappedLines = lines.filter(l => l.mapping_status === 'pending')
  const hasUnmappedItems = unmappedLines.length > 0

  const handleConfirm = () => {
    form.validateFields().then(v => {
      const warnings: string[] = []
      if (hasUnmappedItems) {
        warnings.push(`${unmappedLines.length} dòng hàng hóa chưa được map với danh mục MISA`)
      }
      if (!v.order_date) warnings.push('Chưa có ngày đặt hàng')
      if (!v.total_amount) warnings.push('Chưa có giá trị đơn hàng')

      if (warnings.length > 0) {
        Modal.confirm({
          title: 'Xác nhận đơn hàng',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p className="mb-2">Đơn hàng còn thiếu thông tin:</p>
              <ul className="list-disc pl-5 text-sm text-orange-600">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="mt-3 text-gray-500 text-sm">Bạn vẫn muốn xác nhận?</p>
            </div>
          ),
          okText: 'Vẫn xác nhận',
          cancelText: 'Quay lại',
          onOk: () => confirmMutation.mutate(v),
        })
      } else {
        confirmMutation.mutate(v)
      }
    })
  }

  const handleExportExcel = () => {
    window.open(`/api/v1/exports/orders/${effectiveId}?fmt=misa_template`, '_blank')
  }

  const updateLine = (i: number, field: string, value: unknown) => {
    setLines(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: value }; return u })
  }

  const handlePopupSelect = (record: Record<string, unknown>) => {
    const displayName = (record.name || record.code || '') as string
    switch (activePopup) {
      case 'customer':
        setSelectedCustomer(displayName)
        form.setFieldValue('partner_id', record.id)
        break
      case 'contact':
        setSelectedContact(displayName)
        break
      case 'quotation':
        setSelectedQuotation(displayName)
        break
      case 'parentOrder':
        setSelectedParentOrder(displayName)
        break
      case 'opportunity':
        setSelectedOpportunity(displayName)
        break
      case 'campaign':
        setSelectedCampaign(displayName)
        break
    }
    setActivePopup(null)
  }

  const handleUploadFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const res = await uploadBatch([file], useAI)
      const uploaded = res.files[0]
      if (uploaded) {
        message.success('Đang xử lý...')
        // Poll until done
        const poll = setInterval(async () => {
          try {
            const raw = await getRawDocument(uploaded.raw_document_id)
            if (raw.ocr_status === 'done' || raw.ocr_status === 'failed') {
              clearInterval(poll)
              if (raw.ocr_status === 'failed') {
                message.error('Xử lý thất bại')
                setUploading(false)
                return
              }
              // Find the order created from this raw doc
              const { getOrders } = await import('@/api/orders')
              const orders = await getOrders()
              const newOrder = orders.find(o => o.raw_document_id === uploaded.raw_document_id)
              if (newOrder) {
                setOrderId(newOrder.id)
                navigate(`/orders/${newOrder.id}`, { replace: true })
              }
              setUploading(false)
            }
          } catch {
            clearInterval(poll)
            setUploading(false)
          }
        }, 2000)
      }
    } catch (e: any) {
      message.error(e.message || 'Upload thất bại')
      setUploading(false)
    }
  }, [useAI, navigate])

  if (!isNewOrder && (isLoading || !order)) return <div className="p-6 text-center text-gray-400">Loading...</div>

  const total = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)

  // Determine current step
  const currentStep = isNewOrder ? 0 : order?.status === 'exported' ? 2 : order?.status === 'completed' ? 2 : 1

  return (
    <div className="p-4">
      {/* Header with back + title + actions */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="text-gray-400 hover:text-gray-700"><ArrowLeftOutlined /></button>
          <h1 className="text-base font-semibold text-gray-800">{isNewOrder ? 'Tải đơn hàng' : (order?.po_number || 'Đơn hàng')}</h1>
          {order && <Tag color={order.status === 'completed' ? 'success' : order.status === 'exported' ? 'default' : 'processing'}>{order.status}</Tag>}
        </div>
        {!isNewOrder && (
          <div className="flex items-center gap-2">
            <Button icon={<FileExcelOutlined />} onClick={handleExportExcel}>Xuất Excel</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={handleConfirm} loading={confirmMutation.isPending}>Xác nhận</Button>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-3 mb-4">
        <Steps
          size="small"
          current={currentStep}
          items={[
            { title: 'Tải file' },
            { title: 'Thiết lập tùy chọn' },
            { title: 'Đẩy lên MISA' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        {/* Form Panel */}
        <div className="lg:col-span-3 bg-white rounded-lg border border-gray-200 p-4 overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Thông tin chung</h2>
          <Form form={form} layout="horizontal" size="middle" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} labelAlign="left" requiredMark={false}>
            <div className="grid grid-cols-2 gap-x-6">
              <Form.Item label="Số đơn hàng">
                <Input disabled style={{ backgroundColor: '#f5f5f5' }} placeholder="Tự động tạo khi đồng bộ MISA" />
              </Form.Item>
              <Form.Item label={<>Ngày đặt hàng <span className="text-red-500">*</span></>} name="order_date">
                <DatePicker className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
              <Form.Item label="Số PO" name="po_number"><Input /></Form.Item>
              <Form.Item label={<>Nhân viên bán hàng <span className="text-red-500">*</span></>}>
                <Select placeholder="- Không chọn -" />
              </Form.Item>

              <Form.Item label="Khách hàng">
                <InputWithPopup value={selectedCustomer} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('customer')} />
              </Form.Item>
              <Form.Item label="Liên hệ">
                <InputWithPopup value={selectedContact} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('contact')} />
              </Form.Item>
              <Form.Item label="Đơn hàng cha">
                <InputWithPopup value={selectedParentOrder} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('parentOrder')} />
              </Form.Item>
              <Form.Item label="Báo giá">
                <InputWithPopup value={selectedQuotation} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('quotation')} />
              </Form.Item>
              <Form.Item label="Cơ hội">
                <InputWithPopup value={selectedOpportunity} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('opportunity')} />
              </Form.Item>
              <Form.Item label="Chiến dịch">
                <InputWithPopup value={selectedCampaign} placeholder="- Không chọn -" onPopupClick={() => setActivePopup('campaign')} />
              </Form.Item>

              <Form.Item label={<>Giá trị đơn hàng <span className="text-red-500">*</span></>} name="total_amount">
                <InputNumber className="w-full" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v!.replace(/,/g, '') as unknown as number} />
              </Form.Item>
              <Form.Item label="Giá trị thanh lý"><InputNumber className="w-full" defaultValue={0} /></Form.Item>
              <Form.Item label="Diễn giải"><Input /></Form.Item>
              <Form.Item label={<>Loại đơn hàng <span className="text-red-500">*</span></>}><Select placeholder="- Không chọn -" /></Form.Item>
              <Form.Item label="Số ngày được nợ"><InputNumber className="w-full" /></Form.Item>
              <Form.Item label="Hạn giao hàng" name="delivery_date"><DatePicker className="w-full" format="DD/MM/YYYY" placeholder="DD/MM/YYYY" /></Form.Item>
              <Form.Item label={<>Hạn thanh toán <span className="text-red-500">*</span></>}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
              <Form.Item label=""><Input className="invisible" /></Form.Item>
            </div>
          </Form>
        </div>

        {/* PDF / Upload Panel */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-3 overflow-hidden">
          {isNewOrder && !orderId ? (
            <>
              <div className="rounded overflow-hidden" style={{ minHeight: '520px' }}>
                <Dragger
                  multiple={false}
                  accept=".pdf"
                  beforeUpload={(file) => { handleUploadFile(file); return false }}
                  fileList={[]}
                  showUploadList={false}
                  disabled={uploading}
                  style={{ minHeight: '480px' }}
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="text-sm text-gray-600">{uploading ? 'Đang xử lý...' : 'Kéo thả file PDF hoặc click để chọn'}</p>
                  <p className="text-xs text-gray-400">Chỉ hỗ trợ file PDF</p>
                </Dragger>
              </div>
              <div className="mt-3">
                <Checkbox checked={useAI} onChange={e => setUseAI(e.target.checked)}>
                  Sử dụng AI
                </Checkbox>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 truncate">{rawDoc?.file_name}</span>
              </div>
              <div className="rounded overflow-hidden bg-gray-50" style={{ height: 'calc(100% - 32px)', minHeight: '520px' }}>
                {rawDoc ? (
                  <iframe src={'/api/v1/documents/raw/' + rawDoc.id + '/file'} className="w-full h-full border-0 block" title="PDF" />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">Không có file</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Thông tin hàng hóa</h2>
          <span className="text-xs text-gray-400">{lines.length} dòng</span>
        </div>

        {/* Warning if unmapped items */}
        {hasUnmappedItems && (
          <div className="mb-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-1.5">
            <ExclamationCircleOutlined />
            <span>{unmappedLines.length}/{lines.length} dòng chưa map với danh mục MISA</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-1 py-2 w-6"></th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-8">STT</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-28">Mã hàng hóa</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-16">Số lượng</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-[150px]">Diễn giải</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-16">Tồn kho</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-16">Đơn vị tính</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-22">Đơn giá</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-24">Thành tiền</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-14">Tỷ lệ CK</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-20">Tiền chiết khấu</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-14">Thuế suất</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-20">Tiền thuế</th>
                <th className="px-2 py-2 text-right font-medium text-gray-600 w-22">Tổng tiền</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-24">Đơn hàng cha</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-16">CTKM</th>
                <th className="px-2 py-2 text-left font-medium text-gray-600 w-20">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const amt = Number(line.line_total) || 0
                const dkRate = Number(line.discount_rate) || 0
                const dkAmt = Number(line.discount_amount) || Math.round(amt * dkRate / 100)
                const txRate = Number(line.tax_rate) || 0
                const txAmt = Math.round((amt - dkAmt) * txRate / 100)
                const totalLine = amt - dkAmt + txAmt
                const isPending = line.mapping_status === 'pending'
                return (
                  <tr key={line.id || idx} className={`border-b border-gray-100 hover:bg-blue-50/30 ${isPending ? 'bg-orange-50/50' : ''}`}>
                    <td className="px-1 py-1 text-center">
                      {isPending && <span className="text-orange-400 text-sm" title="Chưa map danh mục MISA">⚠</span>}
                    </td>
                    <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1 flex items-center gap-1">
                      <EditableCell value={line.ocr_product_code} onChange={v => updateLine(idx, 'ocr_product_code', v)} placeholder="Mã SP" />
                      <button className="text-blue-400 hover:text-blue-600 shrink-0" title="Chọn hàng hóa" onClick={() => setProductModalIdx(idx)}><SearchOutlined /></button>
                    </td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.quantity} type="number" onChange={v => updateLine(idx, 'quantity', v)} /></td>
                    <td className="px-2 py-1"><EditableCell value={line.product_name_original} onChange={v => updateLine(idx, 'product_name_original', v)} placeholder="Tên sản phẩm" /></td>
                    <td className="px-2 py-1 text-right text-gray-400">—</td>
                    <td className="px-2 py-1"><EditableCell value={line.uom_original} onChange={v => updateLine(idx, 'uom_original', v)} placeholder="ĐVT" /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.unit_price} type="number" onChange={v => updateLine(idx, 'unit_price', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.line_total} type="number" onChange={v => updateLine(idx, 'line_total', v)} /></td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.discount_rate} type="number" onChange={v => updateLine(idx, 'discount_rate', v)} /></td>
                    <td className="px-2 py-1 text-right text-gray-500">{dkAmt ? dkAmt.toLocaleString('vi-VN') : '0'}</td>
                    <td className="px-2 py-1 text-right"><EditableCell value={line.tax_rate} type="number" onChange={v => updateLine(idx, 'tax_rate', v)} /></td>
                    <td className="px-2 py-1 text-right text-gray-500">{txAmt ? txAmt.toLocaleString('vi-VN') : '0'}</td>
                    <td className="px-2 py-1 text-right font-medium">{totalLine ? totalLine.toLocaleString('vi-VN') : '0'}</td>
                    <td className="px-2 py-1 text-gray-400">—</td>
                    <td className="px-2 py-1 text-gray-400">—</td>
                    <td className="px-2 py-1"><EditableCell value={null} onChange={() => {}} placeholder="" /></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-700">
                <td colSpan={3} className="px-2 py-2">Tổng cộng</td>
                <td className="px-2 py-2 text-right">{lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)}</td>
                <td colSpan={4}></td>
                <td className="px-2 py-2 text-right">{total.toLocaleString('vi-VN')}</td>
                <td colSpan={8}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-6 mt-3 text-xs text-gray-600 border-t border-gray-100 pt-3">
          <span>Tổng số: <strong>{lines.length}</strong></span>
          <span>Đã map: <strong className="text-green-600">{lines.length - unmappedLines.length}</strong></span>
          <span>Chưa map: <strong className={hasUnmappedItems ? 'text-orange-500' : 'text-green-600'}>{unmappedLines.length}</strong></span>
          <span>Cộng đơn hàng: <strong>{total.toLocaleString('vi-VN')}</strong></span>
        </div>

        {/* Action buttons below table */}
        <div className="flex items-center gap-2 mt-3">
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setProductModalIdx(-1)}>
            Chọn hàng hóa
          </Button>
          <Button size="small" icon={<PlusOutlined />} className="text-blue-600 border-blue-300" onClick={() => setLines(prev => [...prev, { id: `new-${Date.now()}`, ocr_product_code: '', product_name_original: '', quantity: 1, unit_price: 0, line_total: 0, uom_original: '', discount_rate: 0, discount_amount: 0, tax_rate: 0 } as unknown as OrderLine])}>
            Thêm dòng
          </Button>
          <Button size="small" icon={<GiftOutlined />} className="text-gray-600">
            Áp dụng khuyến mại
          </Button>
          <Button size="small" icon={<PercentageOutlined />} className="text-gray-600">
            Chiết khấu đơn hàng
          </Button>
        </div>
      </div>

      {/* Product modal */}
      <Modal title="Chọn hàng hóa" open={productModalIdx !== null} onCancel={() => setProductModalIdx(null)} width={700} footer={null}>
        <Input.Search placeholder="Tìm kiếm hàng hóa" className="mb-3" />
        <AntTable size="small" pagination={{ pageSize: 10, size: 'small' }} dataSource={[]} rowKey="id"
          onRow={() => ({ onClick: () => { message.info('Tích hợp MISA API get_dictionary data_type=2 để lấy danh mục hàng hóa'); setProductModalIdx(null) } })}
          columns={[{ title: 'Mã hàng hóa', dataIndex: 'code' }, { title: 'Tên hàng hóa', dataIndex: 'name' }, { title: 'Loại', dataIndex: 'type' }, { title: 'ĐVT', dataIndex: 'unit' }, { title: 'Tồn kho', dataIndex: 'stock' }]}
          locale={{ emptyText: 'Chưa kết nối MISA API - Sẽ hiển thị danh mục hàng hóa từ MISA' }}
        />
      </Modal>

      {/* Generic select popup */}
      {activePopup && (
        <SelectPopup
          open={true}
          title={POPUP_CONFIGS[activePopup].title}
          columns={[...POPUP_CONFIGS[activePopup].columns]}
          dataSource={[]}
          onSelect={handlePopupSelect}
          onCancel={() => setActivePopup(null)}
        />
      )}
    </div>
  )
}
