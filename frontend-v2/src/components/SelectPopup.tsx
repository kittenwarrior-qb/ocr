import { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Button, Pagination, Spin } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

export interface SelectPopupColumn {
  title: string
  dataIndex: string
  width?: number | string
  nowrap?: boolean
}

interface SelectPopupProps {
  open: boolean
  title: string
  columns: SelectPopupColumn[]
  fetchData: (search: string, skip: number, limit: number) => Promise<{ items: Record<string, unknown>[]; total: number }>
  onSelect: (record: Record<string, unknown>) => void
  onCancel: () => void
  rowKey?: string
  initialSearch?: string
}

export default function SelectPopup({ open, title, columns, fetchData, onSelect, onCancel, rowKey = 'id', initialSearch = '' }: SelectPopupProps) {
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const pageSize = 20

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const r = await fetchData(q, (p - 1) * pageSize, pageSize)
      setData(r.items)
      setTotal(r.total)
    } catch { setData([]); setTotal(0) }
    setLoading(false)
  }, [fetchData])

  useEffect(() => {
    if (open) {
      const q = initialSearch || ''
      setSearch(q)
      setPage(1)
      load(q, 1)
    } else {
      setSearch('')
      setSelectedRow(null)
      setPage(1)
      setData([])
    }
  }, [open, initialSearch])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => load(search, page), 400)
    return () => clearTimeout(timer)
  }, [search, page, open, load])

  const handleOk = () => { if (selectedRow) onSelect(selectedRow) }

  const selectedName = selectedRow
    ? (selectedRow['name'] || selectedRow[columns[1]?.dataIndex] || selectedRow[columns[0]?.dataIndex] || '') as string
    : ''

  return (
    <Modal title={<span className="text-base font-semibold">{title}</span>} open={open} onCancel={onCancel}
      width="90vw" style={{ maxWidth: 1200 }}
      styles={{ body: { padding: '16px 24px', height: 'calc(100vh - 200px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      footer={null} centered>

      <div className="flex items-center justify-between mb-3">
        <Input placeholder="Tìm kiếm..." prefix={<SearchOutlined className="text-gray-400" />}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} allowClear className="w-72" />
        <span className="text-xs text-slate-400">{total} kết quả</span>
      </div>

      <Spin spinning={loading}>
        <div className="border border-slate-200 rounded overflow-auto flex-1" style={{ maxHeight: 'calc(100vh - 340px)' }}>
          <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2 w-8"></th>
                {columns.map(col => (
                  <th key={col.dataIndex} className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap"
                    style={{ width: col.width || 'auto', minWidth: col.width || 80 }}>{col.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => {
                const key = row[rowKey] as string
                const isSelected = selectedRow && (selectedRow[rowKey] === key)
                return (
                  <tr key={key} onClick={() => setSelectedRow(row)}
                    className={`border-b border-slate-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                    <td className="px-2 py-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-600' : 'border-slate-300'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                      </div>
                    </td>
                    {columns.map(col => (
                      <td key={col.dataIndex}
                        className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                        {String(row[col.dataIndex] ?? '') || '-'}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {!loading && data.length === 0 && <tr><td colSpan={columns.length + 1} className="text-center py-8 text-slate-400">Không tìm thấy</td></tr>}
            </tbody>
          </table>
        </div>
      </Spin>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <Pagination size="small" current={page} pageSize={pageSize} total={total} onChange={setPage} showSizeChanger={false} simple />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {selectedRow ? <>Đã chọn: <strong>{selectedName}</strong></> : <span className="text-slate-400">Chưa chọn</span>}
          </span>
          <Button onClick={onCancel}>Hủy</Button>
          <Button type="primary" disabled={!selectedRow} onClick={handleOk}>Chọn</Button>
        </div>
      </div>
    </Modal>
  )
}
