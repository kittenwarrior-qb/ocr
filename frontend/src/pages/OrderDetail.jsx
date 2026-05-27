import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getOrder, completeOrder, exportOrder } from '../api'
import StatusBadge from '../components/StatusBadge'

function InfoCard({ label, value, highlight }) {
  return (
    <div className={`card p-4 ${highlight ? 'border-amber-300' : ''}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-sm font-display font-semibold ${highlight ? 'text-amber-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [completing, setCompleting] = useState(false)

  const load = () => getOrder(id).then(setOrder).catch(() => {}).finally(() => setLoading(false))

  useEffect(() => { load() }, [id])

  const handleComplete = async () => {
    setCompleting(true)
    await completeOrder(id).catch(() => {})
    await load()
    setCompleting(false)
  }

  const handleExport = async (fmt) => {
    setExporting(true)
    await exportOrder(id, fmt).catch(e => alert(e.message))
    await load()
    setExporting(false)
  }

  if (loading) return <p className="text-center py-20 text-gray-500 text-sm">Đang tải…</p>
  if (!order) return <p className="text-center py-20 text-gray-500 text-sm">Không tìm thấy đơn hàng</p>

  const pending = (order.lines || []).filter(l => l.mapping_status === 'pending')

  return (
    <div>
      <div className="flex items-center gap-3 mb-7">
        <Link to="/orders" className="text-gray-500 hover:text-gray-700 text-sm transition-colors">← Đơn đặt hàng</Link>
        <span className="text-gray-300">/</span>
        <h2 className="font-display font-bold text-gray-900">{order.order_number || 'Đơn hàng'}</h2>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <InfoCard label="Đối tác" value={order.partner_id?.slice(0, 8) || '—'} />
        <InfoCard label="Ngày đặt hàng" value={order.order_date || '—'} />
        <InfoCard label="Tổng tiền" value={order.total_amount ? Number(order.total_amount).toLocaleString('vi-VN') + ' đ' : '—'} />
        <InfoCard label="Dòng pending" value={`${pending.length} / ${order.lines?.length || 0}`} highlight={pending.length > 0} />
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            Còn <strong>{pending.length}</strong> dòng chưa gán sản phẩm.{' '}
            <Link to="/mappings" className="underline font-semibold text-amber-600 hover:text-amber-700">Vào Mapping →</Link>
          </p>
        </div>
      )}

      <div className="card overflow-hidden mb-5">
        <div className="card-header">
          <h3 className="section-title text-sm">Danh sách sản phẩm</h3>
          <span className="text-xs text-gray-500 font-mono">{order.lines?.length || 0} dòng</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Tên gốc từ OCR', 'Temp code', 'SL', 'Đơn giá', 'Thành tiền', 'Trạng thái'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(order.lines || []).map((line) => (
              <tr key={line.id}
                className={`transition-colors ${line.mapping_status === 'pending' ? 'bg-amber-50/60' : 'hover:bg-gray-50'}`}
              >
                <td className="td text-gray-800 max-w-xs truncate">{line.product_name_original}</td>
                <td className="td font-mono text-xs text-gray-500">{line.temp_code}</td>
                <td className="td text-gray-600 font-mono text-xs">{line.quantity} {line.uom_original}</td>
                <td className="td text-gray-600 font-mono text-xs">{line.unit_price ? Number(line.unit_price).toLocaleString('vi-VN') : '—'}</td>
                <td className="td text-gray-800 font-mono text-xs">{line.line_total ? Number(line.line_total).toLocaleString('vi-VN') : '—'}</td>
                <td className="td"><StatusBadge status={line.mapping_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2.5">
        {order.status === 'processing' && (
          <button onClick={handleComplete} disabled={completing} className="btn-primary">
            {completing ? 'Đang xử lý…' : '✓ Đánh dấu hoàn thành'}
          </button>
        )}
        {(order.status === 'completed' || order.status === 'processing') && (
          <>
            <button onClick={() => handleExport('misa')} disabled={exporting} className="btn-secondary">
              {exporting ? '…' : '↓ Xuất Misa'}
            </button>
            <button onClick={() => handleExport('bravo')} disabled={exporting} className="btn-secondary">
              {exporting ? '…' : '↓ Xuất Bravo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
