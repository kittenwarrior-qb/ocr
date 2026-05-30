import { useState, useMemo, useEffect } from 'react'
import { Modal, Input, Button, Pagination } from 'antd'
import { SearchOutlined, PlusOutlined } from '@ant-design/icons'

export interface SelectPopupColumn {
  title: string
  dataIndex: string
  width?: number | string
}

interface SelectPopupProps {
  open: boolean
  title: string
  columns: SelectPopupColumn[]
  dataSource: Record<string, unknown>[]
  onSelect: (record: Record<string, unknown>) => void
  onCancel: () => void
  rowKey?: string
  initialSearch?: string
}

export default function SelectPopup({ open, title, columns, dataSource, onSelect, onCancel, rowKey = 'id', initialSearch = '' }: SelectPopupProps) {
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  // When modal opens, pre-fill search with the suggested product code/name
  useEffect(() => {
    if (open && initialSearch) {
      setSearch(initialSearch)
      setPage(1)
    }
    if (!open) {
      setSearch('')
      setSelectedRow(null)
      setPage(1)
    }
  }, [open, initialSearch])

  const filtered = useMemo(() => {
    if (!search.trim()) return dataSource
    const q = search.toLowerCase()
    return dataSource.filter(row =>
      Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q))
    )
  }, [dataSource, search])

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  const handleOk = () => {
    if (selectedRow) {
      onSelect(selectedRow)
    }
  }

  const handleCancel = () => {
    onCancel()
  }

  const selectedName = selectedRow
    ? (selectedRow['name'] || selectedRow[columns[1]?.dataIndex] || selectedRow[columns[0]?.dataIndex] || '') as string
    : ''

  return (
    <Modal
      title={<span className="text-base font-semibold">{title}</span>}
      open={open}
      onCancel={handleCancel}
      width={960}
      styles={{ body: { padding: '16px 24px', maxHeight: 'calc(100vh - 120px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      footer={null}
      centered
    >
      {/* Search + Add button */}
      <div className="flex items-center justify-between mb-4">
        <Input
          placeholder="Tìm kiếm"
          prefix={<SearchOutlined className="text-gray-400" />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          allowClear
          className="w-56"
        />
        <Button icon={<PlusOutlined />} className="text-blue-600 hidden border-blue-300">
          Thêm Khách hàng
        </Button>
      </div>

      {/* Table with horizontal scroll */}
      <div className="border border-gray-200 rounded overflow-x-auto overflow-y-auto flex-1 min-h-0">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 w-10 text-left"></th>
              {columns.map(col => (
                <th
                  key={col.dataIndex}
                  className="px-3 py-2.5 text-left font-medium text-gray-600 whitespace-nowrap"
                  style={{ width: col.width || 'auto', minWidth: col.width || 120 }}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedData.map((row) => {
              const key = row[rowKey] as string
              const isSelected = selectedRow && (selectedRow[rowKey] === key)
              return (
                <tr
                  key={key}
                  onClick={() => setSelectedRow(row)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-2.5">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-600' : 'border-gray-300'}`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                    </div>
                  </td>
                  {columns.map(col => (
                    <td
                      key={col.dataIndex}
                      className="px-3 py-2.5 text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]"
                    >
                      {String(row[col.dataIndex] ?? '') || '-'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-end mt-3">
        <Pagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={filtered.length}
          onChange={setPage}
          showSizeChanger={false}
          simple
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <span className="text-sm text-gray-600">
          {selectedRow ? <>Khách hàng đã chọn : <strong>{selectedName}</strong></> : <span className="text-gray-400">Chưa chọn khách hàng</span>}
        </span>
        <div className="flex gap-2">
          <Button onClick={handleCancel}>Hủy</Button>
          <Button type="primary" disabled={!selectedRow} onClick={handleOk}>Chọn</Button>
        </div>
      </div>
    </Modal>
  )
}
