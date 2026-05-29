import { useState } from 'react'
import { Modal, Input, Table, Button } from 'antd'
import type { ColumnsType } from 'antd/es/table'

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
}

export default function SelectPopup({ open, title, columns, dataSource, onSelect, onCancel, rowKey = 'id' }: SelectPopupProps) {
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null)

  const filtered = dataSource.filter(row =>
    Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  )

  const handleOk = () => {
    if (selectedRow) {
      onSelect(selectedRow)
      setSelectedRow(null)
      setSearch('')
    }
  }

  const handleCancel = () => {
    setSelectedRow(null)
    setSearch('')
    onCancel()
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      width={700}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {selectedRow ? `Đã chọn: ${selectedRow[columns[1]?.dataIndex] || selectedRow[columns[0]?.dataIndex] || ''}` : 'Chưa chọn'}
          </span>
          <div className="flex gap-2">
            <Button onClick={handleCancel}>Hủy</Button>
            <Button type="primary" disabled={!selectedRow} onClick={handleOk}>Chọn</Button>
          </div>
        </div>
      }
    >
      <Input.Search
        placeholder="Tìm kiếm..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-3"
        allowClear
      />
      <Table
        size="small"
        pagination={{ pageSize: 8, size: 'small' }}
        dataSource={filtered}
        rowKey={rowKey}
        columns={columns as ColumnsType<Record<string, unknown>>}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRow ? [selectedRow[rowKey] as string] : [],
          onChange: (_, rows) => setSelectedRow(rows[0] || null),
        }}
        onRow={(record) => ({
          onClick: () => setSelectedRow(record),
          className: 'cursor-pointer',
        })}
        locale={{ emptyText: 'Chưa có dữ liệu. Sẽ lấy từ MISA API sau.' }}
      />
    </Modal>
  )
}
