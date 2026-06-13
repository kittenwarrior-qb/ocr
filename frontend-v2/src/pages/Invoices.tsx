import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Empty, Spin, Tag, message } from 'antd'
import { DownloadOutlined, FileTextOutlined, InboxOutlined, ReloadOutlined } from '@ant-design/icons'

import {
  getSessions,
  uploadBatch,
  getInvoiceDocs,
  getPurchaseOrderPayload,
  type InvoiceDoc,
  type PurchaseOrderPayload,
} from '@/api/orders'

// ── Helpers ─────────────────────────────────────────────────────────────────
function vnd(n: number | null | undefined): string {
  if (n == null) return '0'
  return Number(n).toLocaleString('vi-VN')
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── ĐMH preview panel (theo form "Đơn mua hàng" của MISA) ────────────────────
function PurchaseOrderPreview({ docId }: { docId: string }) {
  const [payload, setPayload] = useState<PurchaseOrderPayload | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setPayload(null)
    getPurchaseOrderPayload(docId)
      .then(p => { if (alive) setPayload(p) })
      .catch(() => { if (alive) message.error('Không dựng được dữ liệu Đơn mua hàng') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [docId])

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spin /></div>
  }
  if (!payload) {
    return <div className="flex h-full items-center justify-center text-gray-400 text-sm">Không có dữ liệu</div>
  }

  const handleDownload = () => {
    downloadJson(`${payload.no}.json`, payload)
    message.success(`Đã tải ${payload.no}.json`)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header band — teal, giống screenshot ĐMH */}
      <div className="rounded-t-lg bg-[#cfe9ec] px-4 py-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <FileTextOutlined className="text-teal-700" />
            <span className="text-base font-semibold text-gray-800">Đơn mua hàng {payload.no}</span>
            <Tag color={payload.status === 'Chưa thực hiện' ? 'default' : 'processing'} className="ml-1">
              {payload.status}
            </Tag>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-teal-800/70">Tổng tiền thanh toán</div>
            <div className="text-xl font-bold text-teal-900">{vnd(payload.total_payment)}</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-700">
          <Field label="Nhà cung cấp" value={payload.object_name || '— chưa map —'} />
          <Field label="Ngày đơn hàng" value={payload.date || '—'} />
          <Field label="Mã số thuế" value={payload.tax_code || '—'} />
          <Field label="Ngày giao hàng" value={payload.delivery_date || '—'} />
          <Field label="Địa chỉ" value={payload.object_address || '—'} />
          <Field label="Số PO / Tham chiếu" value={payload.ref_no || '—'} />
          <Field label="Người liên hệ" value={payload.contact_name || '—'} />
          <Field label="Điện thoại" value={payload.phone || '—'} />
        </div>
      </div>

      {/* Bảng Hàng tiền */}
      <div className="flex-1 overflow-auto border-x border-gray-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-200 text-gray-600">
              <th className="px-2 py-2 text-left w-8">#</th>
              <th className="px-2 py-2 text-left w-28">Mã hàng</th>
              <th className="px-2 py-2 text-left">Tên hàng</th>
              <th className="px-2 py-2 text-left w-16">ĐVT</th>
              <th className="px-2 py-2 text-right w-14">SL</th>
              <th className="px-2 py-2 text-right w-24">Đơn giá</th>
              <th className="px-2 py-2 text-right w-28">Thành tiền</th>
              <th className="px-2 py-2 text-center w-20">% Thuế GTGT</th>
              <th className="px-2 py-2 text-right w-28">Tiền thuế GTGT</th>
            </tr>
          </thead>
          <tbody>
            {payload.lines.map(l => (
              <tr key={l.line_no} className="border-b border-gray-100 hover:bg-blue-50/40">
                <td className="px-2 py-1.5 text-gray-400">{l.line_no}</td>
                <td className="px-2 py-1.5 font-mono text-[11px]">{l.item_code || '—'}</td>
                <td className="px-2 py-1.5">{l.item_name}</td>
                <td className="px-2 py-1.5">{l.unit || '—'}</td>
                <td className="px-2 py-1.5 text-right">{vnd(l.quantity)}</td>
                <td className="px-2 py-1.5 text-right">{vnd(l.unit_price)}</td>
                <td className="px-2 py-1.5 text-right">{vnd(l.amount)}</td>
                <td className="px-2 py-1.5 text-center">{l.vat_rate}</td>
                <td className="px-2 py-1.5 text-right">{vnd(l.vat_amount)}</td>
              </tr>
            ))}
            {payload.lines.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-gray-400">Không có dòng hàng</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sổ tổng — canh phải, giống panel tổng tiền của ĐMH */}
      <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white px-4 py-3">
        <div className="ml-auto w-72 space-y-1 text-sm">
          <TotalRow label="Tổng tiền hàng" value={vnd(payload.total_amount)} />
          <TotalRow label="Tiền chiết khấu" value={vnd(payload.discount_amount)} />
          <TotalRow label="Thuế GTGT" value={vnd(payload.vat_amount)} />
          <div className="my-1 border-t border-dashed border-gray-200" />
          <TotalRow label="Tổng tiền thanh toán" value={vnd(payload.total_payment)} strong />
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
            Tải JSON payload ĐMH
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className="shrink-0 text-gray-500">{label}:</span>
      <span className="truncate font-medium text-gray-800" title={value}>{value}</span>
    </div>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold text-gray-800' : 'text-gray-600'}>{label}</span>
      <span className={strong ? 'text-lg font-bold text-teal-700' : 'font-medium text-gray-800'}>{value}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['inv-sessions'],
    queryFn: getSessions,
    refetchInterval: uploading ? 2000 : false,
  })

  const { data: docsResp } = useQuery({
    queryKey: ['inv-docs', activeSessionId],
    queryFn: () => getInvoiceDocs(activeSessionId!),
    enabled: !!activeSessionId,
    retry: 3,
    retryDelay: 1500,
    refetchInterval: (query) => {
      const d = query.state.data
      // Poll khi còn OCR, hoặc đã done nhưng chưa có chứng từ nào (race tạo bill/order)
      if (!d) return 2000
      if (d.processing_count > 0) return 2000
      if (d.items.length === 0 && d.done_count > 0) return 2000
      return false
    },
  })

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) setActiveSessionId(sessions[0].id)
  }, [sessions, activeSessionId])

  const docs = docsResp?.items ?? []
  const processing = (docsResp?.processing_count ?? 0) > 0

  // Tự chọn chứng từ đầu tiên khi có
  useEffect(() => {
    if (!selectedDocId && docs.length > 0) setSelectedDocId(docs[0].id)
  }, [docs, selectedDocId])

  const selectedDoc = useMemo(
    () => docs.find(d => d.id === selectedDocId) ?? null,
    [docs, selectedDocId],
  )

  const handleFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => /\.pdf$/i.test(f.name))
    if (!pdfs.length) { message.error('Chỉ hỗ trợ file PDF'); return }
    setUploading(true)
    setSelectedDocId(null)
    try {
      const r = await uploadBatch(pdfs, true)
      message.success(`Đã tải ${r.uploaded} file — đang OCR`)
      setActiveSessionId(r.session_id)
      refetchSessions()
    } catch {
      message.error('Tải file thất bại')
    } finally {
      setUploading(false)
    }
  }, [refetchSessions])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }, [handleFiles])

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Export hóa đơn — Đơn mua hàng</h1>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchSessions()}>
          Làm mới
        </Button>
      </div>

      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition-colors ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-300'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={e => { const f = Array.from(e.target.files || []); if (f.length) handleFiles(f); e.target.value = '' }}
        />
        <InboxOutlined className="text-3xl text-gray-400" />
        <div className="mt-2 text-sm text-gray-600">Kéo thả file PDF hóa đơn hoặc bấm để chọn</div>
        {uploading && <div className="mt-1 text-xs text-blue-500">Đang tải lên…</div>}
      </div>

      {/* Split: list trái — preview phải */}
      <div className="grid grid-cols-[340px_1fr] gap-4" style={{ height: 'calc(100vh - 220px)' }}>
        {/* List */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-medium text-gray-700">Chứng từ đã OCR</span>
            {processing && <Tag color="processing">Đang xử lý…</Tag>}
          </div>
          <div className="flex-1 overflow-auto">
            {docs.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={processing ? 'Đang OCR…' : 'Chưa có chứng từ'} />
              </div>
            ) : (
              docs.map(d => <DocRow key={d.id} doc={d} active={d.id === selectedDocId} onClick={() => setSelectedDocId(d.id)} />)
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {selectedDoc ? (
            <PurchaseOrderPreview docId={selectedDoc.id} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Chọn một chứng từ để xem layout Đơn mua hàng
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DocRow({ doc, active, onClick }: { doc: InvoiceDoc; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full border-b border-gray-50 px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Tag color={doc.doc_type === 'bill' ? 'gold' : 'blue'} className="m-0 text-[10px] leading-4">
          {doc.doc_type === 'bill' ? 'Hóa đơn' : 'Đơn MH'}
        </Tag>
        <span className="truncate text-sm font-medium text-gray-800">
          {doc.partner_name || doc.file_name || 'Chứng từ không tên'}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
        <span className="truncate">{doc.ref_no || '—'}</span>
        <span className="shrink-0 font-medium text-teal-700">{vnd(doc.total_amount)}</span>
      </div>
    </button>
  )
}
