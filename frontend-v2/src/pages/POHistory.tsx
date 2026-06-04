import { useState, useEffect, useRef } from 'react'
import { Input, Table, Tag, Tooltip, Modal, message } from 'antd'
import { ReloadOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '@/api/client'

interface PORecord {
  id: string
  po_number: string
  order_id: string
  customer_code: string
  customer_name: string
  sale_order_no: string
  created_at: string
}

export default function POHistoryPage() {
  const [data, setData] = useState<PORecord[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 100

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = async () => {
    setLoading(true)
    try {
      const { data: res } = await client.get('/po-history', {
        params: { search: debouncedSearch, skip: (page - 1) * pageSize, limit: pageSize },
      })
      setData(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [debouncedSearch, page])

  const handleDelete = (rec: PORecord) => {
    Modal.confirm({
      title: 'Xóa bản ghi PO?',
      icon: <WarningOutlined className="text-orange-500" />,
      content: (
        <div className="text-sm">
          <p>Số PO: <strong>{rec.po_number}</strong></p>
          <p>KH: {rec.customer_name || rec.customer_code || '—'}</p>
          <p>Đơn MISA: {rec.sale_order_no || '—'}</p>
          <p className="text-orange-600 mt-2">Sau khi xóa có thể đẩy lại đơn với số PO này.</p>
        </div>
      ),
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        await client.delete(`/po-history/${rec.id}`)
        message.success('Đã xóa bản ghi PO')
        load()
      },
    })
  }

  const columns: ColumnsType<PORecord> = [
    {
      title: 'Số PO', dataIndex: 'po_number', width: 160,
      sorter: (a, b) => a.po_number.localeCompare(b.po_number),
      render: v => <span className="font-mono font-semibold text-blue-700">{v}</span>,
    },
    {
      title: 'Mã KH', dataIndex: 'customer_code', width: 130,
      sorter: (a, b) => (a.customer_code||'').localeCompare(b.customer_code||''),
      render: v => v ? <span className="font-mono text-slate-600">{v}</span> : <span className="text-gray-300">—</span>,
    },
    {
      title: 'Tên khách hàng', dataIndex: 'customer_name', ellipsis: true,
      sorter: (a, b) => (a.customer_name||'').localeCompare(b.customer_name||''),
      render: v => v || <span className="text-gray-300">—</span>,
    },
    {
      title: 'Số đơn MISA', dataIndex: 'sale_order_no', width: 140,
      sorter: (a, b) => (a.sale_order_no||'').localeCompare(b.sale_order_no||''),
      render: v => v ? <Tag color="green" className="font-mono">{v}</Tag> : <span className="text-gray-300">—</span>,
    },
    {
      title: 'Thời gian đẩy', dataIndex: 'created_at', width: 170,
      sorter: (a, b) => a.created_at.localeCompare(b.created_at),
      defaultSortOrder: 'descend',
      render: v => v ? new Date(v).toLocaleString('vi-VN') : '—',
    },
    {
      title: '', key: 'action', width: 60, align: 'center',
      render: (_, rec) => (
        <Tooltip title="Xóa để cho phép đẩy lại">
          <button
            className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50"
            onClick={() => handleDelete(rec)}
          >
            <DeleteOutlined />
          </button>
        </Tooltip>
      ),
    },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-700 mb-0.5">Lịch sử PO</h1>
          <p className="text-xs text-gray-400">Đơn có số PO trùng sẽ bị chặn khi đẩy lên MISA. Xóa bản ghi để cho phép đẩy lại.</p>
        </div>
        <div className="flex-1" />
        <Input.Search
          placeholder="Tìm số PO, mã KH, tên KH..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-72"
          allowClear
        />
        <Tooltip title="Tải lại">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={load}>
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>

      <Table<PORecord>
        columns={columns}
        dataSource={data}
        rowKey="id"
        size="small"
        loading={loading}
        scroll={{ x: 900, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{
          current: page, pageSize, total,
          onChange: p => setPage(p),
          showTotal: t => `${t} bản ghi`,
          size: 'small',
        }}
      />
    </div>
  )
}
