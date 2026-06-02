import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Tag, Button, message, Modal, Tooltip, Progress, Tabs } from 'antd'
import {
  InboxOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExportOutlined,
  EditOutlined,
  CheckOutlined,
  UserOutlined,
  LoadingOutlined,
  FilePdfOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  PlusOutlined,
  SearchOutlined,
  ArrowsAltOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import {
  getSessions,
  getSessionDetails,
  getOrderFileUrl,
  getRawFileUrl,
  uploadBatch,
  type SessionLine,
  type SessionOrder,
} from '@/api/orders'
import { matchProduct, searchProducts, type Product } from '@/utils/productMatcher'
import { matchCustomer, type Customer } from '@/utils/customerMatcher'
import { preloadCatalogs, fetchProducts } from '@/utils/catalogStore'
import SelectPopup from '@/components/SelectPopup'
import CustomerContactPopup, { type CustomerContactResult } from '@/components/CustomerContactPopup'
import OrderDetailForm from '@/components/OrderDetailForm'
import { fetchVouchersForCustomers, type Voucher } from '@/api/vouchers'
import client from '@/api/client'

type Confidence = 'high' | 'medium' | 'low' | 'none'
function getConfidence(line: SessionLine): { level: Confidence; suggestion: Product | null } {
  if (line.mapping_status === 'mapped') return { level: 'high', suggestion: null }
  const results = matchProduct(line.product_name_original, 3)
  if (!results.length) return { level: 'none', suggestion: null }
  if (results[0].score >= 0.85) return { level: 'high', suggestion: results[0].product }
  if (results[0].score >= 0.5) return { level: 'medium', suggestion: results[0].product }
  return { level: 'low', suggestion: results[0].product }
}
const DOT_COLORS = { high: 'bg-green-500', medium: 'bg-yellow-400', low: 'bg-red-400', none: 'bg-gray-300' }
const DOT_TIPS = { high: 'Đã map chính xác', medium: 'AI gợi ý - cần xác nhận', low: 'Không tìm thấy - chọn thủ công', none: 'Không có gợi ý' }

function isSystemLine(line: Partial<SessionLine>): boolean {
  return line.mapping_status === 'overridden'
}

function systemLineCode(line: Partial<SessionLine>): string {
  const name = String(line.product_name_original || '').toLowerCase()
  if (name.includes('chiết khấu') || name.includes('chiết')) return 'CKĐH'
  if (name.includes('khuyến mại') || name.includes('khuyến')) return 'KM'
  return line.ocr_product_code || line.temp_code || '✓'
}

type FileStatus = 'pending' | 'uploading' | 'processing' | 'done' | 'error'
interface UploadFileItem { name: string; size: number; status: FileStatus; file?: File }

function productTaxRate(product: Product): number {
  return parseFloat(String(product.tax_rate || '').replace('%', '')) || 0
}

function applyProductToSessionLine(line: SessionLine, product: Product): SessionLine {
  const quantity = Number(line.quantity) || 1
  const unitPrice = Number(product.price) || 0
  return {
    ...line,
    mapping_status: 'mapped',
    product_code_mapped: product.code,
    product_name_mapped: product.name,
    ocr_product_code: product.code,
    uom_original: product.uom,
    uom_mapped: product.uom,
    unit_price: unitPrice,
    tax_rate: productTaxRate(product),
    line_total: unitPrice && quantity ? unitPrice * quantity : line.line_total,
  }
}

function buildCustomerExtraData(customer: Customer, contactName = ''): Record<string, string> {
  const invoiceAddress = customer.invoice_address || ''
  const deliveryAddress = customer.delivery_address || invoiceAddress
  return {
    code: customer.code || '',
    type: customer.type || '',
    name: customer.name || '',
    tax_code: customer.tax_code || '',
    phone: customer.phone || '',
    email: customer.email || '',
    field: customer.field || '',
    owner: customer.owner || '',
    description: customer.description || '',
    invoice_address: invoiceAddress,
    invoice_city: customer.invoice_city || '',
    invoice_district: customer.invoice_district || '',
    invoice_ward: customer.invoice_ward || '',
    delivery_address: deliveryAddress,
    customer_code: customer.code || '',
    customer_name: customer.name || '',
    customer_tax_code: customer.tax_code || '',
    customer_phone: customer.phone || '',
    customer_owner: customer.owner || '',
    invoice_customer: customer.name || '',
    invoice_buyer: customer.owner || '',
    invoice_street: invoiceAddress,
    delivery_receiver: customer.owner || '',
    delivery_phone: customer.phone || '',
    delivery_city: customer.invoice_city || '',
    delivery_district: customer.invoice_district || '',
    delivery_ward: customer.invoice_ward || '',
    delivery_street: deliveryAddress,
    order_type: 'Kênh MT',
    ...(contactName ? { contact: contactName } : {}),
  }
}

export default function OrdersPage() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<UploadFileItem[]>([])
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [activeTab, setActiveTab] = useState('current')

  // Modals
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [selectedLine, setSelectedLine] = useState<SessionLine | null>(null)
  const [productTargetOrderId, setProductTargetOrderId] = useState<string | null>(null)
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<SessionOrder | null>(null)
  const [previewOrder, setPreviewOrder] = useState<SessionOrder | null>(null)
  const [previewPanelOrderId, setPreviewPanelOrderId] = useState<string | null>(null)

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [vouchersByCustomer, setVouchersByCustomer] = useState<Record<string, Voucher[]>>({})
  const [expandedVouchers, setExpandedVouchers] = useState<Record<string, boolean>>({})

  const { data: sessions = [], refetch: refetchSessions } = useQuery({ queryKey: ['sessions'], queryFn: getSessions, refetchInterval: uploading ? 3000 : false })
  const { data: sessionDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['session-detail', activeSessionId],
    queryFn: () => getSessionDetails(activeSessionId!),
    enabled: !!activeSessionId,
    refetchInterval: (query) => { const d = query.state.data; return d && d.processing_count > 0 ? 2000 : false },
  })

  useEffect(() => { if (sessionDetail && uploadFiles.length > 0) { const done = sessionDetail.orders.map(o => o.file_name); setUploadFiles(prev => prev.map(f => f.status === 'done' || f.status === 'error' ? f : done.includes(f.name) ? { ...f, status: 'done' } : sessionDetail.processing_count > 0 ? { ...f, status: 'processing' } : f)); if (sessionDetail.processing_count === 0 && sessionDetail.done_count > 0) setTimeout(() => setUploadFiles([]), 3000) } }, [sessionDetail])
  useEffect(() => { if (sessionDetail && sessionDetail.processing_count === 0 && sessionDetail.done_count > 0) refetchSessions() }, [sessionDetail?.processing_count, sessionDetail?.done_count])
  useEffect(() => { if (sessions.length > 0 && !activeSessionId) setActiveSessionId(sessions[0].id) }, [sessions, activeSessionId])
  const [catalogReady, setCatalogReady] = useState(false)
  useEffect(() => { preloadCatalogs().then(() => setCatalogReady(true)) }, [])

  // Fetch vouchers whenever session orders change
  useEffect(() => {
    if (!sessionDetail?.orders?.length) return
    const codes = [...new Set(
      sessionDetail.orders
        .map(o => String(o.extra_data?.customer_code || ''))
        .filter(Boolean)
    )]
    if (!codes.length) return
    fetchVouchersForCustomers(codes).then(setVouchersByCustomer).catch(() => {})
  }, [sessionDetail])

  const handleStageFiles = useCallback((files: File[]) => {
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { message.error('Chỉ hỗ trợ file PDF'); return }
    setStagedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name))
      const newFiles = pdfs.filter(f => !existingNames.has(f.name))
      if (newFiles.length < pdfs.length) message.warning(`${pdfs.length - newFiles.length} file trùng tên đã bỏ qua`)
      return [...prev, ...newFiles]
    })
  }, [])

  const handleRemoveStaged = useCallback((name: string) => {
    setStagedFiles(prev => prev.filter(f => f.name !== name))
  }, [])

  const handleSubmitUpload = useCallback(async () => {
    if (!stagedFiles.length) { message.warning('Chưa có file nào để xử lý'); return }
    setUploadFiles(stagedFiles.map(f => ({ name: f.name, size: f.size, status: 'uploading', file: f }))); setUploading(true); setActiveTab('current')
    try { const r = await uploadBatch(stagedFiles, true); setUploadFiles(prev => prev.map(f => ({ ...f, status: 'processing' }))); message.success(`Đã tải ${r.uploaded} file`); setActiveSessionId(r.session_id); setStagedFiles([]); refetchSessions() }
    catch (e: any) { setUploadFiles(prev => prev.map(f => ({ ...f, status: 'error' }))); message.error(e?.response?.data?.detail || 'Upload thất bại') }
    finally { setUploading(false) }
  }, [stagedFiles, refetchSessions])

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleStageFiles(Array.from(e.dataTransfer.files)) }, [handleStageFiles])

  const handleMapProduct = async (line: SessionLine, product: Product) => {
    try {
      await client.post(`/mappings/${line.temp_code}/map`, { product_code: product.code, new_product_name: product.name, new_product_uom: product.uom })
      // Optimistic update: mark line as mapped in local cache
      queryClient.setQueryData(['session-detail', activeSessionId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          total_unmapped: Math.max(0, (old.total_unmapped || 0) - 1),
          orders: old.orders.map((o: any) => ({
            ...o,
            pending_count: o.lines.filter((l: any) => l.id !== line.id && l.mapping_status === 'pending').length,
            lines: o.lines.map((l: any) => l.id === line.id ? applyProductToSessionLine(l, product) : l),
          })),
        }
      })
      message.success(`Đã map "${product.name}"`); setProductModalOpen(false); setSelectedLine(null)
    }
    catch (e: any) { message.error(e?.response?.data?.detail || 'Mapping thất bại') }
  }
  const handleSelectCustomer = async (orderId: string, customer: Customer, contactName = '') => {
    try {
      const extraData = buildCustomerExtraData(customer, contactName)
      await client.patch(`/documents/orders/${orderId}`, { recipient_name: customer.name, description: extraData.invoice_address, extra_data: extraData })
      queryClient.setQueryData(['session-detail', activeSessionId], (old: any) => {
        if (!old) return old
        return { ...old, orders: old.orders.map((o: any) => o.id === orderId ? { ...o, recipient_name: customer.name, description: extraData.invoice_address, delivery_address: extraData.delivery_address || extraData.invoice_address, extra_data: extraData } : o) }
      })
      const label = contactName ? `Liên hệ: ${contactName} — KH: ${customer.name}` : `KH: ${customer.name}`
      message.success(label); setCustomerModalOpen(false); setSelectedOrderId(null)
    } catch { message.error('Cập nhật thất bại') }
  }

  const handleCustomerContactSelect = async (orderId: string, result: CustomerContactResult) => {
    if (result.type === 'customer') {
      await handleSelectCustomer(orderId, result.customer)
    } else {
      if (result.customer) {
        await handleSelectCustomer(orderId, result.customer, result.contact.name)
      } else {
        // Contact có tổ chức nhưng không match được KH → chỉ lưu liên hệ, dùng org name làm recipient
        message.warning(`Không tìm thấy công ty "${result.contact.organization}" trong danh sách KH`)
        setCustomerModalOpen(false); setSelectedOrderId(null)
      }
    }
  }
  const handleExport = (sid: string) => {
    const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
    window.open(`${base}/sessions/${sid}/export`, '_blank')
  }

  const getPdfPreviewUrl = (order: SessionOrder) => (
    order.raw_document_id ? getRawFileUrl(order.raw_document_id) : getOrderFileUrl(order.id)
  )

  const toLinePayload = (line: Partial<SessionLine>) => ({
    id: line.id,
    temp_code: line.temp_code || line.ocr_product_code || `manual-${Date.now()}`,
    product_name_original: line.product_name_original || '',
    ocr_product_code: line.ocr_product_code || line.product_code_mapped || '',
    uom_original: line.uom_original || line.uom_mapped || '',
    quantity: line.quantity ?? 1,
    unit_price: line.unit_price ?? 0,
    line_total: line.line_total ?? 0,
    tax_rate: line.tax_rate ?? 0,
    mapping_status: line.mapping_status || 'pending',
  })

  const saveOrderLines = async (order: SessionOrder, nextLines: Partial<SessionLine>[]) => {
    const subtotal = nextLines.reduce((sum, line) => sum + (Number(line.line_total) || 0), 0)
    await client.patch(`/documents/orders/${order.id}`, { lines: nextLines.map(toLinePayload), total_amount: subtotal })
    queryClient.setQueryData(['session-detail', activeSessionId], (old: any) => {
      if (!old) return old
      return {
        ...old,
        orders: old.orders.map((o: any) => o.id === order.id ? {
          ...o,
          lines: nextLines,
          total_amount: subtotal,
          pending_count: nextLines.filter(l => l.mapping_status === 'pending').length,
          mapped_count: nextLines.filter(l => l.mapping_status !== 'pending').length,
        } : o),
      }
    })
    queryClient.invalidateQueries({ queryKey: ['session-detail', activeSessionId] })
  }

  const handleAddProductLine = async (order: SessionOrder, product: Product) => {
    const line: Partial<SessionLine> = {
      id: `new-${Date.now()}`,
      temp_code: product.code,
      product_name_original: product.name,
      ocr_product_code: product.code,
      product_code_mapped: product.code,
      product_name_mapped: product.name,
      quantity: 1,
      unit_price: Number(product.price) || 0,
      line_total: Number(product.price) || 0,
      uom_original: product.uom,
      uom_mapped: product.uom,
      tax_rate: productTaxRate(product),
      mapping_status: 'mapped',
    }
    await saveOrderLines(order, [...order.lines, line])
    message.success('Đã thêm hàng hóa')
  }

  const handleAddBlankLine = async (order: SessionOrder) => {
    const line: Partial<SessionLine> = {
      id: `new-${Date.now()}`,
      temp_code: `manual-${Date.now()}`,
      product_name_original: 'Dòng mới',
      quantity: 1,
      unit_price: 0,
      line_total: 0,
      uom_original: '',
      tax_rate: 0,
      mapping_status: 'pending',
    }
    await saveOrderLines(order, [...order.lines, line])
    message.success('Đã thêm dòng')
  }

  const handleDeleteLine = async (order: SessionOrder, line: SessionLine) => {
    await saveOrderLines(order, order.lines.filter(l => l.id !== line.id))
    message.success('Đã xóa dòng')
  }

  const doneCount = uploadFiles.filter(f => f.status === 'done').length
  const progressPercent = uploadFiles.length > 0 ? Math.round((doneCount / uploadFiles.length) * 100) : 0
  const previewPanelOrder = sessionDetail?.orders.find(o => o.id === previewPanelOrderId) || sessionDetail?.orders[0] || null

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <h1 className="text-lg font-semibold text-gray-800 mb-4">Đơn đặt hàng</h1>

      {/* Upload */}
      <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors mb-4 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
        <InboxOutlined className="text-2xl text-gray-400 mb-1 block" />
        <p className="text-sm text-gray-500">{uploading ? 'Đang tải lên...' : 'Kéo thả file PDF hoặc click để chọn'}</p>
        <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => { const f = Array.from(e.target.files || []); if (f.length) handleStageFiles(f); e.target.value = '' }} />
      </div>

      {/* Staged Files - chờ user bấm Xuất đơn */}
      {stagedFiles.length > 0 && !uploading && (<div className="bg-white border border-blue-200 rounded-lg mb-4">
        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{stagedFiles.length} file đã chọn</span>
          <div className="flex items-center gap-2">
            <Button size="small" onClick={() => setStagedFiles([])}>Xóa tất cả</Button>
            <Button type="primary" icon={<ExportOutlined />} onClick={handleSubmitUpload}>Xuất đơn</Button>
          </div>
        </div>
        {stagedFiles.map((f, i) => (<div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
          <FilePdfOutlined className="text-red-400" />
          <span className="flex-1 text-sm text-gray-700 truncate">{f.name}</span>
          <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
          <button className="text-xs text-red-400 hover:text-red-600" onClick={e => { e.stopPropagation(); handleRemoveStaged(f.name) }}><CloseCircleOutlined /></button>
        </div>))}
      </div>)}

      {/* File Progress */}
      {uploadFiles.length > 0 && (<div className="bg-white border border-gray-200 rounded-lg mb-4">
        {uploadFiles.map((f, i) => (<div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
          {f.status === 'done' ? <CheckCircleOutlined className="text-green-500" /> : f.status === 'error' ? <CloseCircleOutlined className="text-red-500" /> : <LoadingOutlined className="text-blue-500" spin />}
          <span className="flex-1 text-sm text-gray-700 truncate">{f.name}</span>
          <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
          <span className={`text-xs ${f.status === 'done' ? 'text-green-600' : f.status === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{f.status === 'done' ? 'Xong' : f.status === 'error' ? 'Lỗi' : 'OCR...'}</span>
        </div>))}
        <div className="px-4 py-2"><Progress percent={progressPercent} size="small" status={doneCount === uploadFiles.length ? 'success' : 'active'} /></div>
      </div>)}

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'current', label: <span><PlusOutlined className="mr-1" />Phiên hiện tại</span> },
        { key: 'history', label: <span><HistoryOutlined className="mr-1" />Lịch sử ({sessions.length})</span> },
      ]} className="mb-3" />

      {/* Current Tab */}
      {activeTab === 'current' && (<>
        {activeSessionId && sessionDetail ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px] gap-4 items-start">
          <div className="rounded-lg overflow-hidden border-2 border-slate-300 bg-slate-100 shadow">
            {/* Batch header */}
            <div className="px-4 py-3 bg-slate-200 border-b border-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">{sessionDetail.name}</span>
                <span className="text-xs text-slate-500">{sessionDetail.doc_count} file • {sessionDetail.total_products} SP</span>
                {sessionDetail.processing_count > 0 && <Tag color="processing"><LoadingOutlined spin className="mr-1" />OCR ({sessionDetail.done_count}/{sessionDetail.doc_count})</Tag>}
                {(sessionDetail as any).failed_count > 0 && <Tag color="error"><CloseCircleOutlined className="mr-1" />{(sessionDetail as any).failed_count} lỗi</Tag>}
                {sessionDetail.total_unmapped > 0 && sessionDetail.processing_count === 0 && <Tag color="warning"><WarningOutlined className="mr-1" />{sessionDetail.total_unmapped} cần xử lý</Tag>}
                {sessionDetail.total_unmapped === 0 && sessionDetail.total_products > 0 && sessionDetail.processing_count === 0 && <Tag color="success"><CheckCircleOutlined className="mr-1" />Sẵn sàng</Tag>}
              </div>
              {sessionDetail.processing_count === 0 && sessionDetail.done_count > 0 && (() => {
                const ok = sessionDetail.orders.every(o => !!o.partner_name || !!o.recipient_name) && sessionDetail.total_unmapped === 0 && sessionDetail.total_products > 0
                return ok ? <Button type="primary" icon={<ExportOutlined />} onClick={() => handleExport(activeSessionId)}>Xuất Excel</Button>
                  : <Tooltip title="Vui lòng hoàn tất mapping KH + SP"><Button type="primary" icon={<ExportOutlined />} disabled>Xuất Excel</Button></Tooltip>
              })()}
            </div>

            {/* Warning */}
            {sessionDetail.processing_count === 0 && sessionDetail.done_count > 0 && (() => {
              const mc = sessionDetail.orders.filter(o => !o.partner_name && !o.recipient_name)
              const um = sessionDetail.total_unmapped > 0
              if (!mc.length && !um) return null
              return <div className="px-4 py-2 bg-orange-50 border-b border-slate-300 text-xs"><WarningOutlined className="text-orange-500 mr-2" />{mc.length > 0 && <span>Chưa chọn KH: {mc.map(o => o.file_name).join(', ')}. </span>}{um && <span>{sessionDetail.total_unmapped} SP chưa map.</span>}</div>
            })()}

            {/* OCR Errors */}
            {(sessionDetail as any).failed_docs?.length > 0 && (
              <div className="px-4 py-2.5 bg-red-50 border-b border-slate-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2">
                    <CloseCircleOutlined className="text-red-500 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-semibold text-red-700">OCR thất bại: </span>
                      <span className="text-red-600">{(sessionDetail as any).failed_docs[0]?.error}</span>
                      <div className="text-red-500 mt-0.5">File: {(sessionDetail as any).failed_docs.map((d: any) => d.file_name).join(', ')}</div>
                    </div>
                  </div>
                  <Button size="small" danger onClick={async () => { await client.post(`/sessions/${activeSessionId}/retry`); message.success('Đang thử lại...'); queryClient.invalidateQueries({ queryKey: ['session-detail', activeSessionId] }) }}>Thử lại</Button>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="px-4 py-1.5 bg-slate-100 border-b border-slate-300 flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Đã map</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Cần xác nhận</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Chọn thủ công</span>
            </div>

            {/* Orders */}
            <div className="p-3 space-y-4">
              {sessionDetail.orders.map(order => (
                <div
                  key={order.id}
                  className={`border rounded-lg overflow-hidden shadow-sm bg-white cursor-pointer transition-colors ${previewPanelOrder?.id === order.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}
                  onClick={() => setPreviewPanelOrderId(order.id)}
                >
                  {/* Header — navy accent */}
                  <div className="px-4 py-2.5 bg-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FilePdfOutlined className="text-red-300 text-base" />
                      <span className="text-sm font-bold text-white">{order.file_name}</span>
                      <span className="text-xs text-slate-300 ml-2">{order.order_number || ''}</span>
                      {(() => { const ok = order.pending_count === 0 && (!!order.partner_name || !!order.recipient_name); if (ok) return <Tag color="success" className="text-xs ml-2"><CheckOutlined /> OK</Tag>; if (order.pending_count > 0) return <Tag color="warning" className="text-xs ml-2">{order.pending_count} chưa map</Tag>; return null })()}
                    </div>
                    <button className="text-xs text-slate-200 hover:text-white border border-slate-500 rounded-md px-2.5 py-1 font-medium hover:bg-slate-600 transition-colors" onClick={() => { setEditingOrder(order); setDetailModalOpen(true) }}><EditOutlined /> Chi tiết</button>
                  </div>

                  {/* PDF Data — light blue tint */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-sky-50/60">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Tên công ty:</span><span className="text-slate-800 font-semibold">{order.partner_name || <span className="text-red-500 italic font-normal">Chưa nhận diện</span>}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Ngày đặt:</span><span className="text-slate-800">{order.order_date || <span className="text-red-500 italic font-normal">Chưa có</span>}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Địa chỉ:</span><span className="text-slate-700">{order.delivery_address || '\u2014'}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Ngày giao:</span><span className="text-slate-700">{order.delivery_date || '\u2014'}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Người nhận:</span><span className="text-slate-700">{order.recipient_name || '—'}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Trước VAT:</span><span className="text-slate-700 font-semibold">{order.total_amount ? Number(order.total_amount).toLocaleString('vi-VN') + ' đ' : '—'}</span></div>
                      {order.tax_amount ? <><div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Tiền thuế:</span><span className="text-blue-600 font-semibold">{Number(order.tax_amount).toLocaleString('vi-VN') + ' đ'}</span></div><div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Sau VAT:</span><span className="text-emerald-700 font-bold">{(Number(order.total_amount || 0) + Number(order.tax_amount)).toLocaleString('vi-VN') + ' đ'}</span></div></> : null}
                    </div>
                  </div>

                  {/* Customer mapping — warm tint */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-amber-50/50">
                    <div className="text-xs text-slate-500 font-medium mb-1.5 uppercase tracking-wide">Khách hàng</div>
                    {(() => {
                      const alreadySelected = !!order.extra_data?.customer_code
                      if (alreadySelected) return (
                        <div className="flex items-center justify-between">
                          <table className="text-xs"><tbody>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Tên KH:</td><td className="text-emerald-700 font-semibold">{order.recipient_name} ✓</td></tr>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Mã / MST:</td><td className="text-slate-700">{order.extra_data?.customer_code}{order.extra_data?.customer_tax_code ? ` / ${order.extra_data.customer_tax_code}` : ''}</td></tr>
                            {order.description && <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Địa chỉ:</td><td className="text-slate-600">{order.description}</td></tr>}
                          </tbody></table>
                          <Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerModalOpen(true) }}>Đổi KH</Button>
                        </div>
                      )
                      const name = order.partner_name || order.recipient_name || ''
                      const sugg = name ? matchCustomer(name, order.delivery_address || '', 3) : []
                      const has = sugg.length > 0 && sugg[0].score >= 0.7
                      if (has) return (
                        <div className="flex items-center justify-between">
                          <table className="text-xs"><tbody>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Tên KH:</td><td className="text-slate-800 font-semibold">{sugg[0].customer.name}</td></tr>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Mã / MST:</td><td className="text-slate-700">{sugg[0].customer.code}{sugg[0].customer.tax_code ? ` / ${sugg[0].customer.tax_code}` : ''}</td></tr>
                            {sugg[0].customer.invoice_address && <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Địa chỉ:</td><td className="text-slate-600">{sugg[0].customer.invoice_address}</td></tr>}
                          </tbody></table>
                          <div className="flex gap-2 shrink-0"><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleSelectCustomer(order.id, sugg[0].customer)}>Xác nhận</Button><Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerModalOpen(true) }}>Chọn khác</Button></div>
                        </div>
                      )
                      return <div className="flex items-center gap-3"><span className="text-sm text-red-600 font-medium">Không tìm thấy KH phù hợp</span><Button size="small" type="primary" icon={<SearchOutlined />} onClick={() => { setSelectedOrderId(order.id); setCustomerModalOpen(true) }}>Tìm & chọn KH</Button></div>
                    })()}
                  </div>

                  {/* Vouchers — applicable promotions */}
                  {(() => {
                    const custCode = String(order.extra_data?.customer_code || '')
                    const vouchers = custCode ? (vouchersByCustomer[custCode] || []) : []
                    if (!vouchers.length) return null
                    const key = order.id
                    const expanded = expandedVouchers[key]
                    return (
                      <div className="px-4 py-2 border-b border-slate-100 bg-purple-50/40">
                        <button
                          className="flex items-center gap-2 w-full text-left"
                          onClick={e => { e.stopPropagation(); setExpandedVouchers(prev => ({ ...prev, [key]: !prev[key] })) }}
                        >
                          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Khuyến mại áp dụng</span>
                          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-purple-600 text-white text-[10px] font-bold w-4 h-4">{vouchers.length}</span>
                          <span className="ml-auto text-xs text-purple-400">{expanded ? '▲ Thu gọn' : '▼ Xem'}</span>
                        </button>
                        {expanded && (
                          <div className="mt-2 space-y-2">
                            {vouchers.map(v => (
                              <div key={v.code} className="border border-purple-200 rounded-lg bg-white overflow-hidden">
                                <div className="px-3 py-2 bg-purple-100 flex items-start justify-between gap-2">
                                  <div>
                                    <span className="text-xs font-bold text-purple-800 font-mono">{v.code}</span>
                                    <span className="mx-2 text-purple-400">·</span>
                                    <span className="text-xs font-semibold text-purple-900">{v.name}</span>
                                  </div>
                                  <span className="text-[10px] text-purple-600 whitespace-nowrap shrink-0">{v.from_date} → {v.to_date}</span>
                                </div>
                                <div className="px-3 py-1.5 border-b border-purple-100">
                                  <div className="flex gap-4 text-[11px] text-slate-600">
                                    <span><span className="font-medium text-slate-500">Loại:</span> {v.type}</span>
                                    <span><span className="font-medium text-slate-500">Mô tả:</span> {v.description}</span>
                                  </div>
                                </div>
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                                      <th className="px-3 py-1 text-left font-medium">Hàng hóa mua</th>
                                      <th className="px-2 py-1 text-center font-medium w-12">ĐVT</th>
                                      <th className="px-2 py-1 text-center font-medium w-10">SL</th>
                                      <th className="px-3 py-1 text-left font-medium">Tặng hàng hóa</th>
                                      <th className="px-2 py-1 text-center font-medium w-10">SL</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {v.items.map((item, i) => (
                                      <tr key={i} className="border-b border-slate-50 last:border-0">
                                        <td className="px-3 py-1 text-slate-700"><span className="font-mono text-purple-600">{item.product_code}</span> · {item.product_name}</td>
                                        <td className="px-2 py-1 text-center text-slate-500">{item.uom}</td>
                                        <td className="px-2 py-1 text-center font-semibold text-purple-700">{item.quantity}</td>
                                        <td className="px-3 py-1 text-slate-700"><span className="font-mono text-emerald-600">{item.gift_product_code}</span> · {item.gift_product_name}</td>
                                        <td className="px-2 py-1 text-center font-semibold text-emerald-700">{item.gift_quantity}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Product lines — clean table */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2 py-1.5 px-2 text-xs text-slate-500 font-semibold border-b-2 border-slate-200 mb-1 uppercase tracking-wide">
                      <span className="w-2.5" /><span className="flex-1">Sản phẩm</span><span className="w-28">Mã hàng</span><span className="w-14 text-right">SL</span><span className="w-20 text-right">Đơn giá</span><span className="w-20 text-right">Thành tiền</span><span className="w-20 text-right text-blue-600">Tiền thuế</span><span className="w-12 text-center">ĐVT</span><span className="w-10 text-center">VAT</span><span className="w-20" />
                    </div>
                    {order.lines.map(line => { const systemLine = isSystemLine(line); const conf = systemLine ? { level: 'high' as Confidence, suggestion: null } : getConfidence(line); const bg = systemLine ? 'bg-slate-50' : conf.level === 'low' || conf.level === 'none' ? 'bg-red-50/70' : conf.level === 'medium' ? 'bg-amber-50/70' : 'hover:bg-slate-50'; return (
                      <div key={line.id} className={`flex items-center gap-2 py-2 border-b border-slate-100 last:border-0 rounded px-2 ${bg}`}>
                        <Tooltip title={DOT_TIPS[conf.level]}><span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLORS[conf.level]}`} /></Tooltip>
                        <span className="text-xs text-slate-800 flex-1 truncate font-medium">{line.product_name_original}</span>
                        <span className="text-xs w-28 truncate">{systemLine ? <span className="text-slate-500 font-mono font-bold">{systemLineCode(line)}</span> : line.mapping_status === 'mapped' ? <span className="text-emerald-600 font-mono font-bold">{line.product_code_mapped || '✓'}</span> : conf.suggestion ? <span className="text-blue-600 font-medium">→ {conf.suggestion.code}</span> : <span className="text-red-400 font-medium">?</span>}</span>
                        <span className="text-xs text-slate-700 w-14 text-right font-semibold">{line.quantity ?? '\u2014'}</span>
                        <span className="text-xs text-slate-600 w-20 text-right">{line.unit_price ? Number(line.unit_price).toLocaleString('vi-VN') : '\u2014'}</span>
                        <span className="text-xs text-slate-800 w-20 text-right font-semibold">{line.line_total ? Number(line.line_total).toLocaleString('vi-VN') : '\u2014'}</span>
                        <span className="text-xs text-blue-500 w-20 text-right">{(line.line_total && line.tax_rate) ? Math.round(Number(line.line_total) * Number(line.tax_rate) / 100).toLocaleString('vi-VN') : ''}</span>
                        <span className="text-xs text-slate-500 w-12 text-center">{line.uom_mapped || line.uom_original || ''}</span>
                        <span className="text-xs text-slate-500 w-10 text-center">{line.tax_rate ? `${line.tax_rate}%` : ''}</span>
                        <div className="w-20 flex-shrink-0 flex justify-end gap-1">
                          {!systemLine && line.mapping_status !== 'mapped' && conf.level === 'high' && conf.suggestion && <button className="text-xs text-emerald-600 border border-emerald-300 rounded px-1.5 py-0.5 hover:bg-emerald-50 font-medium" onClick={() => handleMapProduct(line, conf.suggestion!)}>✓</button>}
                          {!systemLine && <button className="text-xs text-blue-600 border border-blue-300 rounded px-1.5 py-0.5 hover:bg-blue-50 font-medium" onClick={() => { setSelectedLine(line); setProductModalOpen(true) }}>{line.mapping_status === 'mapped' ? 'Đổi' : conf.level === 'medium' ? 'Xác nhận' : 'Chọn'}</button>}
                          <button className="text-xs text-red-500 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50 font-medium" onClick={(e) => { e.stopPropagation(); handleDeleteLine(order, line).catch(err => message.error(err?.response?.data?.detail || 'Xóa dòng thất bại')) }} title="Xóa dòng"><DeleteOutlined /></button>
                        </div>
                      </div>
                    ) })}
                    <div className="flex items-center gap-2 py-2 border-t border-slate-200 rounded px-2 bg-slate-50/80">
                      <span className="w-2.5" />
                      <span className="text-xs text-slate-500 flex-1 uppercase tracking-wide">Tổng chưa VAT</span>
                      <span className="w-20" />
                      <span className="text-xs text-slate-700 w-20 text-right font-semibold">{order.lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0).toLocaleString('vi-VN')}</span>
                      <span className="w-20" />
                      <span className="w-12" />
                      <span className="w-10" />
                      <span className="w-20" />
                    </div>
                    {order.tax_amount ? <>
                    <div className="flex items-center gap-2 py-1.5 rounded px-2 bg-blue-50/50">
                      <span className="w-2.5" />
                      <span className="text-xs text-blue-600 flex-1 uppercase tracking-wide">Tiền thuế VAT</span>
                      <span className="w-20" />
                      <span className="text-xs text-blue-600 w-20 text-right font-semibold">{Number(order.tax_amount).toLocaleString('vi-VN')}</span>
                      <span className="w-20" />
                      <span className="w-12" />
                      <span className="w-10" />
                      <span className="w-20" />
                    </div>
                    <div className="flex items-center gap-2 py-2 border-t-2 border-emerald-300 rounded px-2 bg-emerald-50/40">
                      <span className="w-2.5" />
                      <span className="text-xs text-emerald-700 flex-1 uppercase tracking-wide font-bold">Tổng sau VAT</span>
                      <span className="w-20" />
                      <span className="text-xs text-emerald-700 w-20 text-right font-bold">{(order.lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0) + Number(order.tax_amount)).toLocaleString('vi-VN')}</span>
                      <span className="w-20" />
                      <span className="w-12" />
                      <span className="w-10" />
                      <span className="w-20" />
                    </div>
                    </> : <div className="flex items-center gap-2 py-2 border-t border-slate-200 rounded px-2 bg-emerald-50/30">
                      <span className="w-2.5" />
                      <span className="text-xs text-emerald-700 flex-1 uppercase tracking-wide font-bold">Tổng tiền thanh toán</span>
                      <span className="w-20" />
                      <span className="text-xs text-emerald-700 w-20 text-right font-bold">{order.lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0).toLocaleString('vi-VN')}</span>
                      <span className="w-20" />
                      <span className="w-12" />
                      <span className="w-10" />
                      <span className="w-20" />
                    </div>}
                    <div className="flex flex-wrap items-center gap-2 pt-3 mt-2 border-t border-slate-100">
                      <Button size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); setSelectedLine(null); setProductTargetOrderId(order.id); setProductModalOpen(true) }}>Chọn hàng hóa</Button>
                      <Button size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); handleAddBlankLine(order).catch(err => message.error(err?.response?.data?.detail || 'Thêm dòng thất bại')) }}>Thêm dòng</Button>
                    </div>
                  </div>
                </div>
              ))}
              {sessionDetail.orders.length === 0 && sessionDetail.processing_count > 0 && <div className="py-10 text-center text-gray-400"><LoadingOutlined spin className="text-3xl mb-2 block" /><p className="text-sm">Đang xử lý OCR...</p></div>}
            </div>
          </div>
          <aside className="xl:sticky xl:top-4 rounded-lg border border-slate-300 bg-white shadow overflow-hidden">
            <div className="h-11 px-3 border-b border-slate-200 flex items-center justify-between bg-slate-700">
              <div className="min-w-0 flex items-center gap-2">
                <FilePdfOutlined className="text-red-300" />
                <span className="text-sm font-semibold text-white truncate">{previewPanelOrder?.file_name || 'PDF'}</span>
              </div>
              <Button size="small" icon={<ArrowsAltOutlined />} disabled={!previewPanelOrder} onClick={() => previewPanelOrder && setPreviewOrder(previewPanelOrder)}>Phóng to</Button>
            </div>
            {previewPanelOrder ? (
              <iframe
                title={previewPanelOrder.file_name || 'PDF preview'}
                src={`${getPdfPreviewUrl(previewPanelOrder)}#toolbar=0&navpanes=0`}
                className="block w-full h-[calc(100vh-180px)] min-h-[520px] bg-white"
              />
            ) : (
              <div className="h-[520px] flex items-center justify-center text-xs text-slate-400">Không có file PDF</div>
            )}
          </aside>
          </div>
        ) : sessions.length === 0 && uploadFiles.length === 0 ? <div className="text-center py-16 text-gray-400"><InboxOutlined className="text-5xl mb-3 block" /><p className="text-sm">Upload file PDF để bắt đầu</p></div> : null}
      </>)}

      {/* History Tab */}
      {activeTab === 'history' && (<div className="space-y-2">
        {sessions.map(s => (<div key={s.id} className={`bg-white rounded-lg border px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${s.id === activeSessionId ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`} onClick={() => { setActiveSessionId(s.id); setActiveTab('current') }}>
          <div className="flex items-center gap-3"><FilePdfOutlined className="text-red-400" /><span className="text-sm font-semibold text-slate-800">{s.name}</span><span className="text-xs text-slate-400">{s.doc_count} file</span>{s.done_count < s.doc_count ? <Tag color="processing" className="text-xs">OCR</Tag> : <Tag color="success" className="text-xs">Xong</Tag>}</div>
          <div className="flex items-center gap-3"><span className="text-xs text-slate-400">{new Date(s.created_at).toLocaleDateString('vi-VN')}</span>{s.done_count === s.doc_count && <Button size="small" icon={<ExportOutlined />} onClick={e => { e.stopPropagation(); handleExport(s.id) }}>Excel</Button>}</div>
        </div>))}
        {sessions.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">Chưa có lịch sử</div>}
      </div>)}

      {/* Product SelectPopup */}
      <SelectPopup open={productModalOpen} title={selectedLine ? `Chọn hàng hóa — "${selectedLine.product_name_original || ''}"` : 'Chọn hàng hóa'}
        columns={[{ title: 'Mã hàng hóa', dataIndex: 'code', width: 110, nowrap: true }, { title: 'Tên hàng hóa', dataIndex: 'name' }, { title: 'ĐVT', dataIndex: 'uom', width: 70, nowrap: true }]}
        fetchData={async (s, skip, limit) => { const r = await fetchProducts(s, skip, limit); return { items: r.items as unknown as Record<string, unknown>[], total: r.total } }}
        onSelect={r => {
          const product = r as unknown as Product
          if (selectedLine) {
            handleMapProduct(selectedLine, product)
            return
          }
          const order = sessionDetail?.orders.find(o => o.id === productTargetOrderId)
          if (order) {
            handleAddProductLine(order, product)
              .then(() => { setProductModalOpen(false); setProductTargetOrderId(null) })
              .catch(err => message.error(err?.response?.data?.detail || 'Thêm hàng hóa thất bại'))
          }
        }}
        onCancel={() => { setProductModalOpen(false); setSelectedLine(null); setProductTargetOrderId(null) }} rowKey="code"
        initialSearch={selectedLine ? (getConfidence(selectedLine).suggestion?.code || selectedLine.product_name_original) : ''} />

      {/* Customer + Contact Popup */}
      <CustomerContactPopup
        open={customerModalOpen}
        onSelect={result => { if (selectedOrderId) handleCustomerContactSelect(selectedOrderId, result) }}
        onCancel={() => { setCustomerModalOpen(false); setSelectedOrderId(null) }}
      />

      {/* Detail Modal */}
      {detailModalOpen && editingOrder && <Modal open onCancel={() => { setDetailModalOpen(false); setEditingOrder(null) }} width={1100} footer={null} centered title={editingOrder.file_name} styles={{ body: { height: 'calc(100vh - 200px)', overflowY: 'auto', padding: '16px 24px' } }}>
        <OrderDetailForm orderId={editingOrder.id} onSaved={() => { setDetailModalOpen(false); setEditingOrder(null); queryClient.invalidateQueries({ queryKey: ['session-detail', activeSessionId] }) }} />
      </Modal>}

      {previewOrder && (
        <Modal
          open
          onCancel={() => setPreviewOrder(null)}
          footer={null}
          width="96vw"
          centered
          title={previewOrder.file_name || 'PDF'}
          styles={{
            content: { padding: 0, overflow: 'hidden' },
            header: { margin: 0, padding: '10px 14px', borderBottom: '1px solid #e2e8f0' },
            body: { height: '90vh', padding: 0 },
          }}
        >
          <iframe
            title={previewOrder.file_name || 'PDF preview large'}
            src={`${getPdfPreviewUrl(previewOrder)}#toolbar=1&navpanes=0`}
            className="block w-full h-full bg-white"
          />
        </Modal>
      )}
    </div>
  )
}




