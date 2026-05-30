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
} from '@ant-design/icons'
import {
  getSessions,
  getSessionDetails,
  uploadBatch,
  type SessionLine,
  type SessionOrder,
} from '@/api/orders'
import { matchProduct, searchProducts, products, type Product } from '@/utils/productMatcher'
import { customers, matchCustomer, type Customer } from '@/utils/customerMatcher'
import SelectPopup from '@/components/SelectPopup'
import OrderDetailForm from '@/components/OrderDetailForm'
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

type FileStatus = 'pending' | 'uploading' | 'processing' | 'done' | 'error'
interface UploadFileItem { name: string; size: number; status: FileStatus; file?: File }

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
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<SessionOrder | null>(null)

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

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
        return { ...old, total_unmapped: Math.max(0, (old.total_unmapped || 0) - 1), orders: old.orders.map((o: any) => ({ ...o, pending_count: o.lines.filter((l: any) => l.id !== line.id && l.mapping_status === 'pending').length, lines: o.lines.map((l: any) => l.id === line.id ? { ...l, mapping_status: 'mapped', product_code_mapped: product.code, product_name_mapped: product.name, uom_mapped: product.uom } : l) })) }
      })
      message.success(`Đã map "${product.name}"`); setProductModalOpen(false); setSelectedLine(null)
    }
    catch (e: any) { message.error(e?.response?.data?.detail || 'Mapping thất bại') }
  }
  const handleSelectCustomer = async (orderId: string, customer: Customer) => {
    try {
      const extraData = { customer_code: customer.code, customer_name: customer.name, customer_tax_code: customer.tax_code || '', customer_phone: customer.phone || '', customer_owner: customer.owner || '', invoice_customer: customer.name, invoice_buyer: customer.owner || '', invoice_city: customer.invoice_city || '', invoice_district: customer.invoice_district || '', invoice_ward: customer.invoice_ward || '', invoice_street: customer.invoice_address || '', invoice_address: customer.invoice_address || '', delivery_receiver: customer.owner || '', delivery_phone: customer.phone || '', delivery_city: customer.invoice_city || '', delivery_district: customer.invoice_district || '', delivery_ward: customer.invoice_ward || '', delivery_street: customer.delivery_address || customer.invoice_address || '', delivery_address: customer.delivery_address || customer.invoice_address || '' }
      await client.patch(`/documents/orders/${orderId}`, { recipient_name: customer.name, description: customer.invoice_address, extra_data: extraData })
      // Optimistic update: patch the local cache immediately
      queryClient.setQueryData(['session-detail', activeSessionId], (old: any) => {
        if (!old) return old
        return { ...old, orders: old.orders.map((o: any) => o.id === orderId ? { ...o, recipient_name: customer.name, extra_data: extraData } : o) }
      })
      message.success(`KH: ${customer.name}`); setCustomerModalOpen(false); setSelectedOrderId(null)
    } catch { message.error('Cập nhật thất bại') }
  }
  const handleExport = (sid: string) => {
    const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
    window.open(`${base}/sessions/${sid}/export`, '_blank')
  }

  const doneCount = uploadFiles.filter(f => f.status === 'done').length
  const progressPercent = uploadFiles.length > 0 ? Math.round((doneCount / uploadFiles.length) * 100) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
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
          <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
            {/* Batch header */}
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">{sessionDetail.name}</span>
                <span className="text-xs text-gray-500">{sessionDetail.doc_count} file • {sessionDetail.total_products} SP</span>
                {sessionDetail.processing_count > 0 && <Tag color="processing"><LoadingOutlined spin className="mr-1" />OCR ({sessionDetail.done_count}/{sessionDetail.doc_count})</Tag>}
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
              return <div className="px-4 py-2 bg-orange-50 border-b border-orange-200 text-xs"><WarningOutlined className="text-orange-500 mr-2" />{mc.length > 0 && <span>Chưa chọn KH: {mc.map(o => o.file_name).join(', ')}. </span>}{um && <span>{sessionDetail.total_unmapped} SP chưa map.</span>}</div>
            })()}

            {/* Legend */}
            <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Chính xác</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Cần xác nhận</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Chọn thủ công</span>
            </div>

            {/* Orders */}
            <div className="p-3 space-y-4">
              {sessionDetail.orders.map(order => (
                <div key={order.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white">
                  {/* Header */}
                  <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <FilePdfOutlined className="text-red-500 text-base" />
                      <span className="text-sm font-bold text-gray-900">{order.file_name}</span>
                      {(() => { const ok = order.pending_count === 0 && (!!order.partner_name || !!order.recipient_name); if (ok) return <Tag color="success" className="text-xs"><CheckOutlined /> OK</Tag>; if (order.pending_count > 0) return <Tag color="warning" className="text-xs">{order.pending_count} chưa map</Tag>; return null })()}
                    </div>
                    <button className="text-xs text-gray-600 hover:text-blue-600 border border-gray-300 rounded-md px-2.5 py-1 font-medium hover:bg-gray-100 transition-colors" onClick={() => { setEditingOrder(order); setDetailModalOpen(true) }}><EditOutlined /> Chi tiết</button>
                  </div>

                  {/* PDF Data */}
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-white">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                      <div className="flex"><span className="text-gray-400 w-24 flex-shrink-0">Tên công ty:</span><span className="text-gray-700 font-medium">{order.partner_name || <span className="text-red-400 italic">Chưa nhận diện</span>}</span></div>
                      <div className="flex"><span className="text-gray-400 w-24 flex-shrink-0">Ngày đặt:</span><span className="text-gray-700">{order.order_date || <span className="text-red-400 italic">Chưa có</span>}</span></div>
                      <div className="flex"><span className="text-gray-400 w-24 flex-shrink-0">Địa chỉ:</span><span className="text-gray-700 truncate">{order.delivery_address || '\u2014'}</span></div>
                      <div className="flex"><span className="text-gray-400 w-24 flex-shrink-0">Ngày giao:</span><span className="text-gray-700">{order.delivery_date || '\u2014'}</span></div>
                      <div className="flex"><span className="text-gray-400 w-24 flex-shrink-0">Người nhận:</span><span className="text-gray-700">{order.recipient_name || '\u2014'}</span></div>
                      <div className="flex"><span className="text-gray-400 w-24 flex-shrink-0">Tổng tiền:</span><span className="text-gray-700 font-medium">{order.total_amount ? Number(order.total_amount).toLocaleString('vi-VN') + ' đ' : '\u2014'}</span></div>
                    </div>
                  </div>

                  {/* Customer mapping */}
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div className="text-xs text-gray-400 mb-1.5">Thông tin Khách hàng</div>
                    {(() => {
                      const alreadySelected = !!order.extra_data?.customer_code
                      if (alreadySelected) return <div className="flex items-center gap-3"><span className="text-sm font-medium text-green-700">{order.recipient_name} ✓</span><Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerModalOpen(true) }}>Đổi KH</Button></div>
                      const name = order.partner_name || order.recipient_name || ''
                      const sugg = name ? matchCustomer(name, order.delivery_address || '', 3) : []
                      const has = sugg.length > 0 && sugg[0].score >= 0.7
                      if (has) return <div className="flex items-center gap-3"><div className="flex-1"><div className="text-sm font-medium text-gray-800">{sugg[0].customer.name}</div><div className="text-xs text-gray-500">{sugg[0].customer.code} • {sugg[0].customer.invoice_address}</div></div><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleSelectCustomer(order.id, sugg[0].customer)}>Xác nhận</Button><Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerModalOpen(true) }}>Chọn khác</Button></div>
                      return <div className="flex items-center gap-3"><span className="text-sm text-red-500">Không tìm thấy KH phù hợp</span><Button size="small" type="primary" icon={<SearchOutlined />} onClick={() => { setSelectedOrderId(order.id); setCustomerModalOpen(true) }}>Tìm & chọn KH</Button></div>
                    })()}
                  </div>

                  {/* Product lines */}
                  <div className="px-3 py-1.5">
                    <div className="flex items-center gap-2 py-1 px-2 text-xs text-gray-400 font-medium border-b border-gray-200 mb-1">
                      <span className="w-2.5" /><span className="flex-1">Tên sản phẩm (OCR)</span><span className="w-28">Mã hàng hóa</span><span className="w-14 text-right">SL</span><span className="w-20 text-right">Đơn giá</span><span className="w-20 text-right">Thành tiền</span><span className="w-12 text-center">ĐVT</span><span className="w-10 text-center">Thuế</span><span className="w-20" />
                    </div>
                    {order.lines.map(line => { const conf = getConfidence(line); const bg = conf.level === 'low' || conf.level === 'none' ? 'bg-red-50' : conf.level === 'medium' ? 'bg-yellow-50' : ''; return (
                      <div key={line.id} className={`flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 rounded px-2 ${bg}`}>
                        <Tooltip title={DOT_TIPS[conf.level]}><span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLORS[conf.level]}`} /></Tooltip>
                        <span className="text-xs text-gray-700 flex-1 truncate">{line.product_name_original}</span>
                        <span className="text-xs w-28 truncate">{line.mapping_status === 'mapped' ? <span className="text-green-600 font-mono">{line.product_code_mapped || '✓'}</span> : conf.suggestion ? <span className="text-blue-600">→ {conf.suggestion.code}</span> : <span className="text-red-400">?</span>}</span>
                        <span className="text-xs text-gray-600 w-14 text-right font-medium">{line.quantity ?? '\u2014'}</span>
                        <span className="text-xs text-gray-600 w-20 text-right">{line.unit_price ? Number(line.unit_price).toLocaleString('vi-VN') : '\u2014'}</span>
                        <span className="text-xs text-gray-700 w-20 text-right font-medium">{line.line_total ? Number(line.line_total).toLocaleString('vi-VN') : '\u2014'}</span>
                        <span className="text-xs text-gray-400 w-12 text-center">{line.uom_mapped || line.uom_original || ''}</span>
                        <span className="text-xs text-gray-400 w-10 text-center">{line.tax_rate ? `${line.tax_rate}%` : ''}</span>
                        <div className="w-20 flex-shrink-0 flex justify-end gap-1">
                          {line.mapping_status !== 'mapped' && conf.level === 'high' && conf.suggestion && <button className="text-xs text-green-600 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-50" onClick={() => handleMapProduct(line, conf.suggestion!)}>✓</button>}
                          <button className="text-xs text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50" onClick={() => { setSelectedLine(line); setProductModalOpen(true) }}>{line.mapping_status === 'mapped' ? 'Đổi' : conf.level === 'medium' ? 'Xác nhận' : 'Chọn'}</button>
                        </div>
                      </div>
                    ) })}
                  </div>
                </div>
              ))}
              {sessionDetail.orders.length === 0 && sessionDetail.processing_count > 0 && <div className="py-10 text-center text-gray-400"><LoadingOutlined spin className="text-3xl mb-2 block" /><p className="text-sm">Đang xử lý OCR...</p></div>}
            </div>
          </div>
        ) : sessions.length === 0 && uploadFiles.length === 0 ? <div className="text-center py-16 text-gray-400"><InboxOutlined className="text-5xl mb-3 block" /><p className="text-sm">Upload file PDF để bắt đầu</p></div> : null}
      </>)}

      {/* History Tab */}
      {activeTab === 'history' && (<div className="space-y-2">
        {sessions.map(s => (<div key={s.id} className={`bg-white rounded-lg border px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${s.id === activeSessionId ? 'border-blue-300' : 'border-gray-200'}`} onClick={() => { setActiveSessionId(s.id); setActiveTab('current') }}>
          <div className="flex items-center gap-3"><FilePdfOutlined className="text-red-400" /><span className="text-sm font-medium text-gray-800">{s.name}</span><span className="text-xs text-gray-400">{s.doc_count} file</span>{s.done_count < s.doc_count ? <Tag color="processing" className="text-xs">OCR</Tag> : <Tag color="success" className="text-xs">Xong</Tag>}</div>
          <div className="flex items-center gap-3"><span className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('vi-VN')}</span>{s.done_count === s.doc_count && <Button size="small" icon={<ExportOutlined />} onClick={e => { e.stopPropagation(); handleExport(s.id) }}>Excel</Button>}</div>
        </div>))}
        {sessions.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Chưa có lịch sử</div>}
      </div>)}

      {/* Product SelectPopup */}
      <SelectPopup open={productModalOpen} title={`Chọn hàng hóa — "${selectedLine?.product_name_original || ''}"`}
        columns={[{ title: 'Mã hàng hóa', dataIndex: 'code', width: 110 }, { title: 'Tên hàng hóa', dataIndex: 'name', width: 280 }, { title: 'ĐVT', dataIndex: 'uom', width: 70 }, { title: 'Đơn giá', dataIndex: 'price', width: 100 }, { title: 'Thuế', dataIndex: 'tax_rate', width: 60 }, { title: 'Tính chất', dataIndex: 'property', width: 100 }]}
        dataSource={products as unknown as Record<string, unknown>[]}
        onSelect={r => { if (selectedLine) handleMapProduct(selectedLine, r as unknown as Product) }}
        onCancel={() => { setProductModalOpen(false); setSelectedLine(null) }} rowKey="code"
        initialSearch={selectedLine ? (getConfidence(selectedLine).suggestion?.code || selectedLine.product_name_original) : ''} />

      {/* Customer SelectPopup */}
      <SelectPopup open={customerModalOpen} title="Chọn khách hàng"
        columns={[{ title: 'Mã KH', dataIndex: 'code', width: 100 }, { title: 'Loại KH', dataIndex: 'type', width: 130 }, { title: 'Tên khách hàng', dataIndex: 'name', width: 250 }, { title: 'MST', dataIndex: 'tax_code', width: 110 }, { title: 'ĐT', dataIndex: 'phone', width: 110 }, { title: 'Địa chỉ (HĐ)', dataIndex: 'invoice_address', width: 250 }, { title: 'Tỉnh/TP', dataIndex: 'invoice_city', width: 100 }, { title: 'Chủ sở hữu', dataIndex: 'owner', width: 150 }, { title: 'Địa chỉ (GH)', dataIndex: 'delivery_address', width: 250 }]}
        dataSource={customers as unknown as Record<string, unknown>[]}
        onSelect={r => { if (selectedOrderId) handleSelectCustomer(selectedOrderId, r as unknown as Customer) }}
        onCancel={() => { setCustomerModalOpen(false); setSelectedOrderId(null) }} rowKey="code" />

      {/* Detail Modal */}
      {detailModalOpen && editingOrder && <Modal open onCancel={() => { setDetailModalOpen(false); setEditingOrder(null) }} width={1100} footer={null} centered title={editingOrder.file_name} styles={{ body: { height: 'calc(100vh - 200px)', overflowY: 'auto', padding: '16px 24px' } }}>
        <OrderDetailForm orderId={editingOrder.id} onSaved={() => { setDetailModalOpen(false); setEditingOrder(null); queryClient.invalidateQueries({ queryKey: ['session-detail', activeSessionId] }) }} />
      </Modal>}
    </div>
  )
}
