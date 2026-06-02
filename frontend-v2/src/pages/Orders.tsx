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
  TagsOutlined,
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
import CustomerContactPopup, { type CustomerContactResult, type Contact } from '@/components/CustomerContactPopup'
import OrderDetailForm from '@/components/OrderDetailForm'
import { fetchVouchersForCustomers, type Voucher } from '@/api/vouchers'
import client from '@/api/client'

type Confidence = 'confirmed' | 'suggest' | 'medium' | 'low' | 'none'
function getConfidence(line: SessionLine): { level: Confidence; suggestion: Product | null } {
  if (line.mapping_status === 'mapped') return { level: 'confirmed', suggestion: null }
  const results = matchProduct(line.product_name_original, 3)
  if (!results.length) return { level: 'none', suggestion: null }
  if (results[0].score >= 0.85) return { level: 'suggest', suggestion: results[0].product }
  if (results[0].score >= 0.5) return { level: 'medium', suggestion: results[0].product }
  return { level: 'low', suggestion: results[0].product }
}
const DOT_COLORS: Record<Confidence, string> = { confirmed: 'bg-emerald-500', suggest: 'bg-emerald-500', medium: 'bg-yellow-400', low: 'bg-red-400', none: 'bg-gray-300' }
const DOT_TIPS: Record<Confidence, string> = { confirmed: 'Đã xác nhận', suggest: 'Gợi ý tốt — bấm ✓ để xác nhận nhanh', medium: 'Gợi ý cần xem lại — bấm Xác nhận', low: 'Không tìm thấy — chọn thủ công', none: 'Không có gợi ý' }

function isSystemLine(line: Partial<SessionLine>): boolean {
  return line.mapping_status === 'overridden'
}

function systemLineCode(line: Partial<SessionLine>): string {
  const name = String(line.product_name_original || '').toLowerCase()
  if (name.includes('chiết khấu') || name.includes('chiết')) return 'CKĐH'
  if (name.includes('khuyến mại') || name.includes('khuyến')) return 'KM'
  return line.ocr_product_code || line.temp_code || '✓'
}

function getProductSearchHint(line: SessionLine): string {
  // 1. Confirmed product code
  if (line.product_code_mapped) return line.product_code_mapped
  // 2. Best match from catalog (low threshold so suggestion always found)
  const results = matchProduct(line.product_name_original, 1)
  if (results.length && results[0].score > 0.2) return results[0].product.code
  // 3. Fallback: product name (never barcode/ocr_product_code)
  const hint = line.product_name_original || ''
  console.debug('[SearchHint] no catalog match, using name:', hint, '| ocr_code:', line.ocr_product_code)
  return hint
}

type FileStatus = 'pending' | 'uploading' | 'processing' | 'done' | 'error'
interface UploadFileItem { name: string; size: number; status: FileStatus; file?: File }

function hasMappedCustomer(order: SessionOrder): boolean {
  return !!(order.extra_data?.customer_code || order.partner_id)
}

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
    tax_rate: line.tax_rate ?? productTaxRate(product),  // prefer OCR tax_rate, fallback to catalog
    line_total: unitPrice && quantity ? unitPrice * quantity : line.line_total,
  }
}

function orderLineSubtotal(order: SessionOrder): number {
  return order.lines.reduce((sum, line) => sum + (Number(line.line_total) || 0), 0)
}

function orderTaxAmount(order: SessionOrder, preferOcr = false): number {
  if (preferOcr) return Number(order.ocr_tax_amount ?? order.tax_amount) || 0
  return Number(order.tax_amount) || 0
}

function orderBeforeVat(order: SessionOrder, preferOcr = false): number {
  if (preferOcr) {
    const total = Number(order.ocr_total_amount ?? order.total_amount) || 0
    const tax = orderTaxAmount(order, true)
    return total && tax ? Math.max(0, total - tax) : total
  }
  const subtotal = orderLineSubtotal(order)
  if (subtotal) return subtotal
  const total = Number(order.total_amount) || 0
  const tax = orderTaxAmount(order)
  return total && tax ? Math.max(0, total - tax) : total
}

function orderAfterVat(order: SessionOrder, preferOcr = false): number {
  const total = Number((preferOcr ? order.ocr_total_amount : order.total_amount) ?? order.total_amount) || 0
  const subtotal = orderBeforeVat(order, preferOcr)
  const tax = orderTaxAmount(order, preferOcr)
  const calculated = subtotal + tax
  if (!tax) return total || subtotal
  if (total && Math.abs(total - calculated) <= 2) return total
  if (total && subtotal && total > subtotal) return total
  return calculated
}

function buildCustomerExtraData(customer: Customer, contact?: Contact | string): Record<string, string> {
  const contactName = typeof contact === 'string' ? contact : contact?.name || ''
  const contactPhone = typeof contact === 'string' ? '' : (contact?.phone || contact?.phone_work || '')
  const contactEmail = typeof contact === 'string' ? '' : (contact?.email || contact?.email_personal || '')
  const contactDeliveryAddress = typeof contact === 'string' ? '' : (contact?.delivery_address || contact?.address || '')
  const invoiceAddress = customer.invoice_address || ''
  const deliveryAddress = contactDeliveryAddress || customer.delivery_address || invoiceAddress
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
    delivery_receiver: contactName || customer.owner || '',
    delivery_phone: contactPhone || customer.phone || '',
    delivery_city: (typeof contact === 'string' ? '' : contact?.city) || customer.invoice_city || '',
    delivery_district: (typeof contact === 'string' ? '' : contact?.district) || customer.invoice_district || '',
    delivery_ward: (typeof contact === 'string' ? '' : contact?.ward) || customer.invoice_ward || '',
    delivery_street: deliveryAddress,
    order_type: 'Kênh MT',
    contact: contactName,
    contact_code: typeof contact === 'string' ? '' : contact?.code || '',
    contact_phone: contactPhone,
    contact_email: contactEmail,
    contact_organization: typeof contact === 'string' ? '' : contact?.organization || '',
    contact_address: contactDeliveryAddress,
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
  const [customerPopupInitialTab, setCustomerPopupInitialTab] = useState<'customer' | 'contact'>('customer')
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<SessionOrder | null>(null)
  const [previewOrder, setPreviewOrder] = useState<SessionOrder | null>(null)
  const [previewPanelOrderId, setPreviewPanelOrderId] = useState<string | null>(null)

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [vouchersByCustomer, setVouchersByCustomer] = useState<Record<string, Voucher[]>>({})
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)

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
          orders: old.orders.map((o: any) => {
            const newLines = o.lines.map((l: any) => l.id === line.id ? applyProductToSessionLine(l, product) : l)
            const totalWithTax = newLines.reduce((s: number, l: any) => {
              const lt = Number(l.line_total) || 0
              const tx = Math.round(lt * (Number(l.tax_rate) || 0) / 100)
              return s + lt + tx
            }, 0)
            return {
              ...o,
              pending_count: newLines.filter((l: any) => l.mapping_status === 'pending').length,
              total_amount: totalWithTax || o.total_amount,
              lines: newLines,
            }
          }),
        }
      })
      message.success(`Đã map "${product.name}"`); setProductModalOpen(false); setSelectedLine(null)
    }
    catch (e: any) { message.error(e?.response?.data?.detail || 'Mapping thất bại') }
  }
  const handleSelectCustomer = async (orderId: string, customer: Customer, contact?: Contact | string) => {
    try {
      const contactName = typeof contact === 'string' ? contact : contact?.name || ''
      const extraData = buildCustomerExtraData(customer, contact)
      await client.patch(`/documents/orders/${orderId}`, { extra_data: extraData })
      queryClient.setQueryData(['session-detail', activeSessionId], (old: any) => {
        if (!old) return old
        return { ...old, orders: old.orders.map((o: any) => o.id === orderId ? { ...o, extra_data: extraData } : o) }
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
        await handleSelectCustomer(orderId, result.customer, result.contact)
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
    const totalWithTax = nextLines.reduce((sum, line) => {
      const lt = Number(line.line_total) || 0
      const tx = Math.round(lt * (Number(line.tax_rate) || 0) / 100)
      return sum + lt + tx
    }, 0)
    await client.patch(`/documents/orders/${order.id}`, { lines: nextLines.map(toLinePayload), total_amount: totalWithTax })
    queryClient.setQueryData(['session-detail', activeSessionId], (old: any) => {
      if (!old) return old
      return {
        ...old,
        orders: old.orders.map((o: any) => o.id === order.id ? {
          ...o,
          lines: nextLines,
          total_amount: totalWithTax,
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
      tax_rate: 0,
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
                {sessionDetail.total_unmapped === 0 && sessionDetail.total_products > 0 && sessionDetail.processing_count === 0 && sessionDetail.orders.every(hasMappedCustomer) && <Tag color="success"><CheckCircleOutlined className="mr-1" />Sẵn sàng</Tag>}
              </div>
              {sessionDetail.processing_count === 0 && sessionDetail.done_count > 0 && (() => {
                const ok = sessionDetail.orders.every(hasMappedCustomer) && sessionDetail.total_unmapped === 0 && sessionDetail.total_products > 0
                return ok ? <Button type="primary" icon={<ExportOutlined />} onClick={() => handleExport(activeSessionId)}>Xuất Excel</Button>
                  : <Tooltip title="Vui lòng hoàn tất mapping KH + SP"><Button type="primary" icon={<ExportOutlined />} disabled>Xuất Excel</Button></Tooltip>
              })()}
            </div>

            {/* Warning */}
            {sessionDetail.processing_count === 0 && sessionDetail.done_count > 0 && (() => {
              const mc = sessionDetail.orders.filter(o => !hasMappedCustomer(o))
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
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Đã xác nhận / Gợi ý tốt</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Cần xem lại</span>
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
                      {(() => { const ok = order.pending_count === 0 && hasMappedCustomer(order); if (ok) return <Tag color="success" className="text-xs ml-2"><CheckOutlined /> OK</Tag>; if (order.pending_count > 0) return <Tag color="warning" className="text-xs ml-2">{order.pending_count} chưa map</Tag>; if (!hasMappedCustomer(order)) return <Tag color="warning" className="text-xs ml-2">Chưa chọn KH</Tag>; return null })()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="text-xs text-slate-200 hover:text-white border border-slate-500 rounded-md px-2.5 py-1 font-medium hover:bg-slate-600 transition-colors" onClick={() => { setEditingOrder(order); setDetailModalOpen(true) }}><EditOutlined /> Chi tiết</button>
                      <Tooltip title="Xóa đơn hàng này">
                        <button className="text-xs text-red-300 hover:text-red-100 border border-red-700/50 rounded-md px-2 py-1 hover:bg-red-900/30 transition-colors" onClick={(e) => { e.stopPropagation(); Modal.confirm({ title: 'Xóa đơn hàng?', content: `Đơn "${order.file_name}" sẽ bị xóa vĩnh viễn khỏi phiên này.`, okText: 'Xóa', okType: 'danger', cancelText: 'Hủy', onOk: async () => { try { await client.delete(`/documents/orders/${order.id}`); queryClient.invalidateQueries({ queryKey: ['session-detail', activeSessionId] }); message.success('Đã xóa') } catch { message.error('Xóa thất bại') } } }) }}><DeleteOutlined /></button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* PDF Data — light blue tint */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-sky-50/60">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Tên công ty:</span><span className="text-slate-800 font-semibold">{order.ocr_company_name || order.recipient_name || <span className="text-red-500 italic font-normal">Chưa nhận diện</span>}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Ngày đặt:</span><span className="text-slate-800">{order.order_date || <span className="text-red-500 italic font-normal">Chưa có</span>}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Địa chỉ:</span><span className="text-slate-700">{order.ocr_delivery_address || order.delivery_address || '\u2014'}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Ngày giao:</span><span className="text-slate-700">{order.delivery_date || '\u2014'}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Người nhận:</span><span className="text-slate-700">{order.ocr_recipient_name || order.recipient_name || '—'}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 flex-shrink-0 font-medium">Tổng tiền:</span><span className="text-emerald-700 font-bold">{orderAfterVat(order, true) ? orderAfterVat(order, true).toLocaleString('vi-VN') + ' đ' : '—'}</span></div>
                      {(() => {
                        const custCode = String(order.extra_data?.customer_code || '')
                        const vouchers = custCode ? (vouchersByCustomer[custCode] || []) : []
                        if (!vouchers.length) return null
                        return (
                          <div className="col-span-2 flex items-start gap-2 pt-1 min-w-0">
                            <span className="text-slate-500 w-24 flex-shrink-0 font-medium">Voucher:</span>
                            <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                              {vouchers.map((v, idx) => {
                                const cls = idx % 2 === 0
                                  ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700'
                                  : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                                return (
                                  <button
                                    key={v.code}
                                    className={`inline-flex max-w-[260px] items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold border transition-colors ${cls}`}
                                    onClick={e => { e.stopPropagation(); setSelectedVoucher(v) }}
                                    title={v.name}
                                  >
                                    <TagsOutlined className="shrink-0" />
                                    <span className="font-mono shrink-0">{v.code}</span>
                                    <span className="truncate">{v.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
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
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Tên KH:</td><td className="text-emerald-700 font-semibold">{order.extra_data?.customer_name || order.partner_name || 'Đã chọn KH'} ✓</td></tr>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Mã / MST:</td><td className="text-slate-700">{order.extra_data?.customer_code}{order.extra_data?.customer_tax_code ? ` / ${order.extra_data.customer_tax_code}` : ''}</td></tr>
                            {(order.extra_data?.invoice_address || order.extra_data?.invoice_street) && <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Địa chỉ:</td><td className="text-slate-600">{order.extra_data?.invoice_address || order.extra_data?.invoice_street}</td></tr>}
                            <tr>
                              <td className="text-slate-500 pr-3 py-0.5 font-medium">Liên hệ:</td>
                              <td className="text-slate-700">
                                {order.extra_data?.contact
                                  ? <span><span className="font-semibold">{order.extra_data.contact}</span>{order.extra_data?.contact_code ? ` (${order.extra_data.contact_code})` : ''}{order.extra_data?.contact_phone ? ` · ${order.extra_data.contact_phone}` : ''}{order.extra_data?.contact_email ? ` · ${order.extra_data.contact_email}` : ''}</span>
                                  : <span className="text-amber-600 font-medium">Chưa chọn liên hệ</span>}
                              </td>
                            </tr>
                          </tbody></table>
                          <div className="flex gap-2 shrink-0">
                            <Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerPopupInitialTab('customer'); setCustomerModalOpen(true) }}>Đổi KH</Button>
                            <Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerPopupInitialTab('contact'); setCustomerModalOpen(true) }}>{order.extra_data?.contact ? 'Đổi LH' : 'Chọn LH'}</Button>
                          </div>
                        </div>
                      )
                      const name = order.ocr_company_name || order.recipient_name || ''
                      const sugg = name ? matchCustomer(name, order.ocr_delivery_address || order.delivery_address || '', 3) : []
                      const has = sugg.length > 0 && sugg[0].score >= 0.7
                      if (has) return (
                        <div className="flex items-center justify-between">
                          <table className="text-xs"><tbody>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Tên KH:</td><td className="text-slate-800 font-semibold">{sugg[0].customer.name}</td></tr>
                            <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Mã / MST:</td><td className="text-slate-700">{sugg[0].customer.code}{sugg[0].customer.tax_code ? ` / ${sugg[0].customer.tax_code}` : ''}</td></tr>
                            {sugg[0].customer.invoice_address && <tr><td className="text-slate-500 pr-3 py-0.5 font-medium">Địa chỉ:</td><td className="text-slate-600">{sugg[0].customer.invoice_address}</td></tr>}
                          </tbody></table>
                          <div className="flex gap-2 shrink-0"><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleSelectCustomer(order.id, sugg[0].customer)}>Xác nhận</Button><Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerPopupInitialTab('customer'); setCustomerModalOpen(true) }}>Chọn khác</Button></div>
                        </div>
                      )
                      return <div className="flex items-center gap-3"><span className="text-sm text-red-600 font-medium">Không tìm thấy KH phù hợp</span><Button size="small" type="primary" icon={<SearchOutlined />} onClick={() => { setSelectedOrderId(order.id); setCustomerPopupInitialTab('customer'); setCustomerModalOpen(true) }}>Tìm & chọn KH</Button><Button size="small" onClick={() => { setSelectedOrderId(order.id); setCustomerPopupInitialTab('contact'); setCustomerModalOpen(true) }}>Chọn liên hệ</Button></div>
                    })()}
                  </div>

                  {/* Product lines — clean table */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2 py-1.5 px-2 text-xs text-slate-500 font-semibold border-b-2 border-slate-200 mb-1 uppercase tracking-wide">
                      <span className="w-2.5" /><span className="w-5 text-center">#</span><span className="flex-1">Sản phẩm</span><span className="w-32">Mã hàng</span><span className="w-10 text-right">SL</span><span className="w-8 text-center">ĐVT</span><span className="w-20 text-right">Đơn giá</span><span className="w-20 text-right">Thành tiền</span><span className="w-16 text-center">Thuế</span><span className="w-18 text-right">Tiền thuế</span><span className="w-20 text-right">Tổng tiền</span><span className="w-16" />
                    </div>
                    {order.lines.map((line, lineIdx) => { const systemLine = isSystemLine(line); const conf = systemLine ? { level: 'confirmed' as Confidence, suggestion: null } : getConfidence(line); const bg = systemLine ? 'bg-slate-50' : conf.level === 'none' ? 'bg-red-50/70' : conf.level === 'low' ? 'bg-orange-50/60' : conf.level === 'medium' ? 'bg-amber-50/70' : conf.level === 'suggest' ? 'bg-emerald-50/50' : 'hover:bg-slate-50'; return (
                      <div key={line.id} className={`flex items-start gap-2 py-2 border-b border-slate-100 last:border-0 rounded px-2 ${bg}`}>
                        <Tooltip title={DOT_TIPS[conf.level]}><span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLORS[conf.level]}`} /></Tooltip>
                        <span className="text-xs text-slate-400 w-5 text-center shrink-0 mt-0.5">{lineIdx + 1}</span>
                        <span className="text-xs text-slate-800 flex-1 font-medium break-words leading-snug">{line.product_name_original}</span>
                        <div className="w-32 shrink-0">
                          {systemLine
                            ? <span className="text-xs text-slate-500 font-mono font-bold">{systemLineCode(line)}</span>
                            : line.mapping_status === 'mapped'
                              ? <span className="text-xs text-slate-800 font-mono font-semibold">{line.product_code_mapped || '✓'}</span>
                              : <span className="text-xs text-slate-500 font-mono">{conf.suggestion ? conf.suggestion.code : '—'}</span>}
                        </div>
                        <span className="text-xs text-slate-700 w-10 text-right font-semibold">{line.quantity ?? '\u2014'}</span>
                        <span className="text-xs text-slate-500 w-8 text-center">{line.uom_mapped || line.uom_original || ''}</span>
                        <span className="text-xs text-slate-600 w-20 text-right">{line.unit_price ? Number(line.unit_price).toLocaleString('vi-VN') : '\u2014'}</span>
                        <span className="text-xs text-slate-800 w-20 text-right font-semibold">{line.line_total ? Number(line.line_total).toLocaleString('vi-VN') : '\u2014'}</span>
                        {(() => { const txRate = line.tax_rate ?? (conf.suggestion ? productTaxRate(conf.suggestion) : 0); const txAmt = txRate && line.line_total ? Math.round(Number(line.line_total) * txRate / 100) : 0; const tong = (Number(line.line_total) || 0) + txAmt; return (<>
                          <span className="text-xs text-slate-500 w-16 text-center">{txRate ? `${txRate}%` : ''}</span>
                          <span className="text-xs text-slate-600 w-[72px] text-right">{txAmt ? txAmt.toLocaleString('vi-VN') : ''}</span>
                          <span className="text-xs text-slate-800 w-20 text-right font-semibold">{tong ? tong.toLocaleString('vi-VN') : ''}</span>
                        </>)})()}
                        <div className="w-16 flex-shrink-0 flex items-center justify-end gap-1">
                          {!systemLine && line.mapping_status !== 'mapped' && conf.level === 'suggest' && conf.suggestion && (
                            <Tooltip title={`Xác nhận: ${conf.suggestion.code}`} placement="left">
                              <button className="w-6 h-6 flex items-center justify-center text-white bg-emerald-500 hover:bg-emerald-600 rounded text-sm font-bold" onClick={() => handleMapProduct(line, conf.suggestion!)}><CheckOutlined /></button>
                            </Tooltip>
                          )}
                          {!systemLine && (
                            <Tooltip title={line.mapping_status === 'mapped' ? 'Đổi hàng hóa' : 'Chọn hàng hóa'} placement="left">
                              <button className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-300" onClick={() => { setSelectedLine(line); setProductModalOpen(true) }}>
                                <SearchOutlined style={{fontSize: 11}} />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip title="Xóa dòng" placement="left">
                            <button className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 border border-red-200 rounded hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteLine(order, line).catch(err => message.error(err?.response?.data?.detail || 'Xóa dòng thất bại')) }}><DeleteOutlined style={{fontSize: 11}} /></button>
                          </Tooltip>
                        </div>
                      </div>
                    ) })}
                    <div className="flex items-center gap-2 py-2 border-t border-slate-200 rounded px-2 bg-slate-50/80">
                      <span className="w-2.5" />
                      <span className="w-5" />
                      <span className="text-xs text-emerald-700 flex-1 uppercase tracking-wide font-bold">Tổng tiền theo PDF</span>
                      <span className="w-10" /><span className="w-8" />
                      <span className="w-20" />
                      <span className="text-xs text-emerald-700 w-20 text-right font-bold">{order.lines.reduce((s,l)=>s+(Number(l.line_total)||0),0).toLocaleString('vi-VN')}</span>
                      <span className="w-16" />
                      <span className="text-xs text-slate-600 w-[72px] text-right">{order.lines.reduce((s,l)=>{const r=Number(l.tax_rate)||0;return s+Math.round((Number(l.line_total)||0)*r/100)},0).toLocaleString('vi-VN')}</span>
                      <span className="text-xs text-emerald-700 w-20 text-right font-bold">{order.lines.reduce((s,l)=>{const lt=Number(l.line_total)||0;const tx=Math.round(lt*(Number(l.tax_rate)||0)/100);return s+lt+tx},0).toLocaleString('vi-VN')}</span>
                      <span className="w-16" />
                    </div>
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
        columns={[{ title: 'Mã hàng hóa', dataIndex: 'code', width: 120, nowrap: true }, { title: 'Tên hàng hóa', dataIndex: 'name', width: 300 }, { title: 'ĐVT', dataIndex: 'uom', width: 70, nowrap: true }, { title: 'Đơn giá', dataIndex: 'price', width: 110, nowrap: true }, { title: 'Thuế', dataIndex: 'tax_rate', width: 70, nowrap: true }, { title: 'Tính chất', dataIndex: 'property', width: 120, nowrap: true }]}
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
        initialSearch={selectedLine ? getProductSearchHint(selectedLine) : ''} />

      {/* Customer + Contact Popup */}
      <CustomerContactPopup
        open={customerModalOpen}
        onSelect={result => { if (selectedOrderId) handleCustomerContactSelect(selectedOrderId, result) }}
        onCancel={() => { setCustomerModalOpen(false); setSelectedOrderId(null) }}
        initialTab={customerPopupInitialTab}
        initialSearch={(() => { const o = sessionDetail?.orders.find(x => x.id === selectedOrderId); return o?.partner_name || o?.recipient_name || '' })()}
      />

      {/* Detail Modal */}
      {detailModalOpen && editingOrder && <Modal open onCancel={() => { setDetailModalOpen(false); setEditingOrder(null) }} width={1100} footer={null} centered title={editingOrder.file_name} styles={{ body: { height: 'calc(100vh - 200px)', overflowY: 'auto', padding: '16px 24px' } }}>
        <OrderDetailForm orderId={editingOrder.id} onSaved={() => { setDetailModalOpen(false); setEditingOrder(null); queryClient.invalidateQueries({ queryKey: ['session-detail', activeSessionId] }) }} />
      </Modal>}

      {selectedVoucher && (
        <Modal
          open
          width={980}
          centered
          footer={null}
          title={<span className="text-slate-800"><TagsOutlined className="mr-2 text-slate-500" />{selectedVoucher.code} - {selectedVoucher.name}</span>}
          onCancel={() => setSelectedVoucher(null)}
          styles={{ body: { paddingTop: 12 } }}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs border border-slate-200 rounded px-3 py-2 bg-white">
              <div><span className="text-slate-500 font-medium">Loại:</span> <span className="text-slate-800">{selectedVoucher.type || '—'}</span></div>
              <div><span className="text-slate-500 font-medium">Đối tượng:</span> <span className="text-slate-800">{selectedVoucher.target || '—'}</span></div>
              <div><span className="text-slate-500 font-medium">Căn cứ:</span> <span className="text-slate-800">{selectedVoucher.base_on || '—'}</span></div>
              <div><span className="text-slate-500 font-medium">Hiệu lực:</span> <span className="text-slate-800 font-semibold">{selectedVoucher.from_date || '—'} → {selectedVoucher.to_date || '—'}</span></div>
              <div><span className="text-slate-500 font-medium">Khách hàng:</span> <span className="text-slate-800">{selectedVoucher.customers?.length ? selectedVoucher.customers.join(', ') : 'Tất cả'}</span></div>
              <div><span className="text-slate-500 font-medium">Trạng thái:</span> <span className={selectedVoucher.is_active ? 'text-slate-800 font-semibold' : 'text-slate-500'}>{selectedVoucher.is_active ? 'Kích hoạt' : 'Không hoạt động'}</span></div>
              {selectedVoucher.description && <div className="col-span-3"><span className="text-slate-500 font-medium">Mô tả:</span> <span className="text-slate-800">{selectedVoucher.description}</span></div>}
            </div>

            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="px-3 py-2 text-left font-semibold">Hàng hóa mua</th>
                    <th className="px-2 py-2 text-center font-semibold w-20">ĐVT</th>
                    <th className="px-2 py-2 text-right font-semibold w-20">SL mua</th>
                    <th className="px-3 py-2 text-left font-semibold">Hàng hóa tặng</th>
                    <th className="px-2 py-2 text-center font-semibold w-20">ĐVT tặng</th>
                    <th className="px-2 py-2 text-right font-semibold w-20">SL tặng</th>
                    <th className="px-2 py-2 text-right font-semibold w-24">Tối đa/đơn</th>
                    <th className="px-2 py-2 text-right font-semibold w-24">Tối đa/KH</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVoucher.items?.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700"><span className="font-mono text-slate-700 font-semibold">{item.product_code}</span> · {item.product_name}</td>
                      <td className="px-2 py-2 text-center text-slate-500">{item.uom || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-800">{item.quantity || '—'}</td>
                      <td className="px-3 py-2 text-slate-700"><span className="font-mono text-slate-700 font-semibold">{item.gift_product_code}</span> · {item.gift_product_name}</td>
                      <td className="px-2 py-2 text-center text-slate-500">{item.gift_uom || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-800">{item.gift_quantity || '—'}</td>
                      <td className="px-2 py-2 text-right text-slate-500">{item.max_per_order || '∞'}</td>
                      <td className="px-2 py-2 text-right text-slate-500">{item.max_per_customer || '∞'}</td>
                    </tr>
                  ))}
                  {!selectedVoucher.items?.length && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Không có sản phẩm trong voucher</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

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




