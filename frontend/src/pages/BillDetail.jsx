import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getBill, completeBill, exportBill } from '../api'
import StatusBadge from '../components/StatusBadge'

export default function BillDetail() {
  const { id } = useParams()
  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const load = () => getBill(id).then(setBill).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [id])

  const handleComplete = async () => {
    await completeBill(id)
    load()
  }

  const handleExport = async (fmt) => {
    setExporting(true)
    await exportBill(id, fmt).catch(e => alert(e.message))
    await load()
    setExporting(false)
  }

  if (loading) return <p className="text-center py-20 text-gray-500 text-sm">Đang tải…</p>
  if (!bill) return <p className="text-center py-20 text-gray-500 text-sm">Không tìm thấy hóa đơn</p>

  const pending = (bill.lines || []).filter(l => l.mapping_status === 'pending')

  return (
    <div>
      <div className="flex items-center gap-3 mb-7">
        <Link to="/bills" className="text-gray-500 hover:text-gray-700 text-sm transition-colors">← Hóa đơn GTGT</Link>
        <span className="text-gray-300">/</span>
        <h2 className="font-display font-bold text-gray-900">{bill.invoice_number || 'Hóa đơn'}</h2>
        <StatusBadge status={bill.status} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Ngày hóa đơn</p>
          <p className="text-sm font-display font-semibold text-gray-800">{bill.invoice_date || '—'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Tổng tiền</p>
          <p className="text-sm font-display font-semibold text-gray-800 font-mono">
            {bill.total_amount ? Number(bill.total_amount).toLocaleString('vi-VN') + ' đ' : '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Tiền thuế</p>
          <p className="text-sm font-display font-semibold text-gray-800 font-mono">
            {bill.tax_amount ? Number(bill.tax_amount).toLocaleString('vi-VN') + ' đ' : '—'}
          </p>
        </div>
        <div className={`card p-4 ${pending.length > 0 ? 'border-amber-300' : ''}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Dòng pending</p>
          <p className={`text-sm font-display font-semibold ${pending.length > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
            {pending.length} / {bill.lines?.length}
          </p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm text-amber-800">
            Còn <strong>{pending.length}</strong> dòng chưa gán sản phẩm.{' '}
            <Link to="/mappings" className="underline font-semibold text-amber-600 hover:text-amber-700">Vào Mapping →</Link>
          </p>
        </div>
      )}

      <div className="card overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Tên gốc từ OCR', 'Temp code', 'SL', 'Đơn giá', 'Thuế suất', 'Thành tiền', 'Trạng thái'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(bill.lines || []).map((line) => (
              <tr key={line.id}
                className={`transition-colors ${line.mapping_status === 'pending' ? 'bg-amber-50/60' : 'hover:bg-gray-50'}`}
              >
                <td className="td text-gray-800 max-w-xs truncate">{line.product_name_original}</td>
                <td className="td font-mono text-xs text-gray-500">{line.temp_code}</td>
                <td className="td text-gray-600 font-mono text-xs">{line.quantity} {line.uom_original}</td>
                <td className="td text-gray-600 font-mono text-xs">{line.unit_price ? Number(line.unit_price).toLocaleString('vi-VN') : '—'}</td>
                <td className="td text-gray-600 font-mono text-xs">{line.tax_rate != null ? `${line.tax_rate}%` : '—'}</td>
                <td className="td text-gray-800 font-mono text-xs">{line.line_total ? Number(line.line_total).toLocaleString('vi-VN') : '—'}</td>
                <td className="td"><StatusBadge status={line.mapping_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2.5">
        {bill.status === 'processing' && (
          <button onClick={handleComplete} className="btn-primary">✓ Đánh dấu hoàn thành</button>
        )}
        {['completed', 'processing'].includes(bill.status) && (
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
