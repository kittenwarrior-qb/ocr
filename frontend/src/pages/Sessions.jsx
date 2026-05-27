import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessions, createSession, closeSession, reopenSession, exportSession } from '../api'

function SessionStatusBadge({ status }) {
  return status === 'active'
    ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Đang mở
      </span>
    : <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
        Đã đóng
      </span>
}

export default function Sessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', note: '' })
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(null)
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    getSessions().then(setSessions).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setCreating(true)
    try {
      await createSession({ name: form.name.trim(), note: form.note.trim() || null })
      setForm({ name: '', note: '' })
      setShowCreate(false)
      load()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleClose = async (id) => {
    if (!confirm('Đóng phiên này? Bạn vẫn có thể mở lại sau.')) return
    await closeSession(id).catch(e => alert(e.message))
    load()
  }

  const handleReopen = async (id) => {
    await reopenSession(id).catch(e => alert(e.message))
    load()
  }

  const handleExport = async (s) => {
    setExporting(s.id)
    try {
      await exportSession(s.id, s.name)
    } catch (e) {
      alert('Xuất Excel thất bại: ' + e.message)
    } finally {
      setExporting(null)
    }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h2 className="page-title">Phiên xử lý</h2>
          <p className="text-sm text-gray-500 mt-1">Gom nhiều chứng từ vào 1 phiên rồi xuất Excel Bravo</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + Tạo phiên mới
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 shadow-2xl">
            <div className="card-header">
              <h3 className="section-title">Tạo phiên mới</h3>
              <button onClick={() => { setShowCreate(false); setForm({ name: '', note: '' }) }}
                className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Tên phiên <span className="text-rose-500">*</span></label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="VD: Tháng 5/2026 — WinMart Bình Dương"
                  className="input"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <textarea
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Tuỳ chọn..."
                  rows={2}
                  className="input resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim() || creating}
                  className="flex-1 btn-primary"
                >
                  {creating ? 'Đang tạo…' : 'Tạo phiên'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setForm({ name: '', note: '' }) }}
                  className="flex-1 btn-secondary"
                >
                  Huỷ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Đang tải…</div>
      ) : sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">📂</span>
          </div>
          <p className="text-gray-400 text-sm">Chưa có phiên nào. Tạo phiên đầu tiên để bắt đầu.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="card p-4 flex items-center gap-4 hover:border-gray-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="font-display font-semibold text-gray-800 text-sm truncate">{s.name}</span>
                  <SessionStatusBadge status={s.status} />
                </div>
                {s.note && <p className="text-xs text-gray-500 mb-1.5">{s.note}</p>}
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>Tạo: {fmtDate(s.created_at)}</span>
                  {s.closed_at && <span>Đóng: {fmtDate(s.closed_at)}</span>}
                  <span className="text-amber-600 font-medium font-mono">{s.done_count}/{s.doc_count} chứng từ</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate('/upload', { state: { sessionId: s.id, sessionName: s.name } })}
                  disabled={s.status !== 'active'}
                  className="btn-sm-secondary"
                >
                  + Upload
                </button>
                <button
                  onClick={() => handleExport(s)}
                  disabled={exporting === s.id || s.done_count === 0}
                  className="btn-sm-success"
                >
                  {exporting === s.id ? '⏳' : '↓ Excel'}
                </button>
                {s.status === 'active' ? (
                  <button onClick={() => handleClose(s.id)} className="btn-sm-secondary">
                    Đóng phiên
                  </button>
                ) : (
                  <button onClick={() => handleReopen(s.id)} className="btn-sm-secondary">
                    Mở lại
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
