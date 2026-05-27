import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { uploadBatch, getSessions, getQueueStatus } from '../api'

const STATUS_LABEL = { pending: 'Chờ OCR', processing: 'Đang OCR…', done: 'Hoàn thành', failed: 'Thất bại' }
const STATUS_CLS = {
  pending:    'bg-yellow-50 text-yellow-700 border-yellow-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  done:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed:     'bg-rose-50 text-rose-600 border-rose-200',
}

export default function Upload() {
  const [dragging, setDragging]         = useState(false)
  const [files, setFiles]               = useState([])
  const [uploading, setUploading]       = useState(false)
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [duplicates, setDuplicates]     = useState([])
  const [error, setError]               = useState(null)
  const [sessions, setSessions]         = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [queuePending, setQueuePending] = useState(0)
  const navigate  = useNavigate()
  const location  = useLocation()

  useEffect(() => {
    getSessions().then(list => {
      setSessions(list)
      if (location.state?.sessionId) {
        setSelectedSession(location.state.sessionId)
      } else {
        const active = list.find(s => s.status === 'active')
        if (active) setSelectedSession(active.id)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!uploadedDocs.length) return
    const allDone = uploadedDocs.every(d => d.ocr_status === 'done' || d.ocr_status === 'failed')
    if (allDone) return

    const interval = setInterval(async () => {
      const updated = await Promise.all(
        uploadedDocs.map(async d => {
          if (d.ocr_status === 'done' || d.ocr_status === 'failed') return d
          try {
            const fresh = await fetch(`/api/v1/documents/raw/${d.raw_document_id}`).then(r => r.json())
            return { ...d, ocr_status: fresh.ocr_status, ocr_error: fresh.ocr_error, extracted_data: fresh.extracted_data, document_type: fresh.document_type }
          } catch { return d }
        })
      )
      setUploadedDocs(updated)
      getQueueStatus().then(s => setQueuePending(s.queue_pending)).catch(() => {})
    }, 4000)

    return () => clearInterval(interval)
  }, [uploadedDocs])

  const addFiles = (newFiles) => {
    const list = Array.from(newFiles).filter(f => /\.(pdf|jpg|jpeg|png)$/i.test(f.name))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...list.filter(f => !existing.has(f.name + f.size))]
    })
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const handleSubmit = async () => {
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const res = await uploadBatch(files, selectedSession)
      setUploadedDocs(res.files)
      setQueuePending(res.queue_pending)
      setDuplicates(res.duplicates || [])
      setFiles([])
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const reset = () => { setFiles([]); setUploadedDocs([]); setDuplicates([]); setError(null) }

  const activeSessions = sessions.filter(s => s.status === 'active')
  const doneCount      = uploadedDocs.filter(d => d.ocr_status === 'done').length
  const failCount      = uploadedDocs.filter(d => d.ocr_status === 'failed').length
  const allFinished    = uploadedDocs.length > 0 && uploadedDocs.every(d => ['done','failed'].includes(d.ocr_status))

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-7">
        <h2 className="page-title">Upload chứng từ</h2>
        <p className="text-sm text-gray-500 mt-1">PDF, JPG, PNG — hỗ trợ upload nhiều file cùng lúc</p>
      </div>

      <div className="card p-4 mb-4">
        <label className="label">Thuộc phiên xử lý</label>
        {activeSessions.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            Chưa có phiên nào đang mở.{' '}
            <button onClick={() => navigate('/sessions')} className="underline font-semibold text-amber-600">Tạo phiên mới</button>
            {' '}để gom chứng từ và xuất Excel.
          </div>
        ) : (
          <select
            value={selectedSession || ''}
            onChange={e => setSelectedSession(e.target.value || null)}
            className="input"
          >
            <option value="">— Không gắn phiên —</option>
            {activeSessions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {!uploadedDocs.length ? (
        <div className="card p-5">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-amber-400 bg-amber-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl">📄</span>
            </div>
            <p className="text-gray-700 font-medium text-sm">Kéo thả nhiều file vào đây hoặc click để chọn</p>
            <p className="text-xs text-gray-400 mt-1.5">PDF, JPG, PNG — chọn nhiều file cùng lúc</p>
            <input id="file-input" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple
              onChange={e => addFiles(e.target.files)} />
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{files.length} file được chọn</p>
                <button onClick={() => setFiles([])} className="text-xs text-gray-400 hover:text-rose-500 transition-colors">Xoá tất cả</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{f.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{(f.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      className="ml-2 text-gray-400 hover:text-rose-500 text-sm shrink-0 transition-colors">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          <button onClick={handleSubmit} disabled={!files.length || uploading}
            className="mt-5 w-full btn-primary py-2.5 text-sm">
            {uploading ? `Đang upload ${files.length} file…` : `Upload & OCR (${files.length} file)`}
          </button>
        </div>
      ) : (
        <div className="card p-5">
          {duplicates.length > 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-amber-700 mb-1">
                {duplicates.length} file đã tồn tại trong phiên này
              </p>
              <ul className="text-xs text-amber-600 list-disc list-inside space-y-0.5">
                {duplicates.map(name => <li key={name}>{name}</li>)}
              </ul>
              <p className="text-xs text-amber-500 mt-1.5">
                Hệ thống vẫn upload và OCR lại. Khi xuất Excel sẽ tự động loại trùng (giữ bản mới nhất).
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-display font-semibold text-gray-800 text-sm">
                Đã upload {uploadedDocs.length} file
                {queuePending > 0 && (
                  <span className="ml-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    ⏳ {queuePending} đang chờ
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {doneCount} hoàn thành{failCount > 0 ? ` · ${failCount} thất bại` : ''}
              </p>
            </div>
            {allFinished && (
              <button onClick={reset} className="text-xs text-amber-500 hover:text-amber-600 transition-colors">Upload thêm</button>
            )}
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {uploadedDocs.map((d) => (
              <div key={d.raw_document_id}
                className={`border rounded-lg px-4 py-3 transition-colors ${
                  d.is_duplicate ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {d.is_duplicate && <span className="text-amber-500 shrink-0 text-xs">⚠</span>}
                    <p className="text-sm font-medium text-gray-800 truncate">{d.file_name}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-md font-medium border ${STATUS_CLS[d.ocr_status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {d.ocr_status === 'processing' && <span className="mr-1 inline-block animate-spin-slow">⏳</span>}
                    {STATUS_LABEL[d.ocr_status] || d.ocr_status}
                  </span>
                </div>
                {d.ocr_status === 'done' && d.extracted_data && (
                  <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                    <span>{d.document_type === 'purchase_order' ? 'Đơn đặt hàng' : 'Hóa đơn'}</span>
                    <span>{d.extracted_data.vendor_name || d.extracted_data.customer_name || ''}</span>
                    <span className="font-mono">{d.extracted_data.order_number || ''}</span>
                    <span>{(d.extracted_data.items || []).length} dòng</span>
                  </div>
                )}
                {d.ocr_status === 'failed' && (
                  <p className="mt-1 text-xs text-rose-500">{d.ocr_error}</p>
                )}
              </div>
            ))}
          </div>

          {allFinished && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => navigate('/orders')} className="flex-1 btn-primary py-2 text-xs">
                Xem đơn đặt hàng →
              </button>
              {selectedSession && (
                <button onClick={() => navigate('/sessions')} className="flex-1 btn-sm-success py-2 text-xs">
                  Xuất Excel phiên →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
