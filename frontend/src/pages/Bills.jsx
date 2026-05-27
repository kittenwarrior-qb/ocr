import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getBills } from '../api'
import StatusBadge from '../components/StatusBadge'

const STATUS_OPTS = [
  { value: '', label: 'Tất cả' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'exported', label: 'Đã xuất' },
  { value: 'rejected', label: 'Lỗi' },
]

export default function Bills() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') || ''
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getBills(status || undefined).then(setBills).finally(() => setLoading(false))
  }, [status])

  return (
    <div>
      <div className="flex justify-between items-center mb-7">
        <div>
          <h2 className="page-title">Hóa đơn GTGT</h2>
          <p className="text-sm text-gray-500 mt-1">Danh sách hóa đơn VAT trích xuất từ chứng từ</p>
        </div>
        <Link to="/upload" className="btn-primary">+ Upload mới</Link>
      </div>

      <div className="flex gap-1.5 mb-5">
        {STATUS_OPTS.map(o => (
          <button key={o.value}
            onClick={() => setSearchParams(o.value ? { status: o.value } : {})}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === o.value
                ? 'bg-amber-500 text-white font-semibold'
                : 'border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >{o.label}</button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="text-center py-12 text-gray-500 text-sm">Đang tải…</p>
        ) : bills.length === 0 ? (
          <p className="text-center py-12 text-gray-400 text-sm">Chưa có hóa đơn nào</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Số hóa đơn', 'Nhà cung cấp', 'Ngày', 'Tổng tiền', 'Trạng thái', 'Pending / Tổng', ''].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="td font-display font-semibold text-gray-800">
                    {b.invoice_number || <span className="text-gray-300 font-normal italic">—</span>}
                  </td>
                  <td className="td text-gray-500 font-mono text-xs">
                    {b.partner_id ? b.partner_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="td text-gray-500 font-mono text-xs">{b.invoice_date || '—'}</td>
                  <td className="td text-gray-700 font-mono text-xs">
                    {b.total_amount ? Number(b.total_amount).toLocaleString('vi-VN') : '—'}
                  </td>
                  <td className="td"><StatusBadge status={b.status} /></td>
                  <td className="td">
                    {b.pending_count > 0 ? (
                      <span className="text-amber-600 font-medium font-mono text-xs">{b.pending_count} pending</span>
                    ) : <span className="text-emerald-600 text-xs">✓</span>}
                    <span className="text-gray-400 text-xs"> / {(b.lines || []).length}</span>
                  </td>
                  <td className="td">
                    <Link to={`/bills/${b.id}`} className="text-amber-500 hover:text-amber-600 text-xs font-medium transition-colors">
                      Chi tiết →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
