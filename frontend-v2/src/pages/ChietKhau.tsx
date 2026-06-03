import { useEffect, useState, useRef } from 'react'
import { Input, Table, Tag, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '@/api/client'

interface PriceBook {
  id: number
  code: string
  name: string
  target: string
  customer_type: string
  discount_type: string
  discount_value: string
  from_date: string
  to_date: string
  is_active: boolean
  owner: string
}

export default function ChietKhauPage() {
  const [all, setAll] = useState<PriceBook[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const cacheRef = useRef<PriceBook[] | null>(null)

  const load = async (force = false) => {
    if (cacheRef.current && !force) { setAll(cacheRef.current); return }
    setLoading(true)
    try {
      const res = await client.get('/misa/price-books')
      const items: PriceBook[] = (res.data || []).map((p: any) => ({
        id: p.ID,
        code: p.PriceBookCode || '',
        name: p.PriceBookName || '',
        target: p.ObjectIDText || '',
        customer_type: p.AccountTypeIDText || '—',
        discount_type: p.DiscountType || '',
        discount_value: p.DiscountValue ? `${p.DiscountValue}%` : '',
        from_date: p.FromDate ? p.FromDate.slice(0, 10) : '—',
        to_date: p.ToDate ? p.ToDate.slice(0, 10) : '—',
        is_active: !p.Inactive,
        owner: p.OwnerIDText || '',
      }))
      cacheRef.current = items
      setAll(items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = (() => {
    const s = search.trim().toLowerCase()
    if (!s) return all
    return all.filter(p =>
      p.code.toLowerCase().includes(s) ||
      p.name.toLowerCase().includes(s) ||
      p.target.toLowerCase().includes(s) ||
      p.customer_type.toLowerCase().includes(s)
    )
  })()

  const columns: ColumnsType<PriceBook> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Mã CSG', dataIndex: 'code', width: 130, render: v => <span className="text-blue-600 font-medium">{v || '—'}</span> },
    { title: 'Tên chính sách giá', dataIndex: 'name', ellipsis: true, render: v => v || '—' },
    { title: 'Loại CK', dataIndex: 'discount_type', width: 100 },
    { title: 'CK%', dataIndex: 'discount_value', width: 80, align: 'center', render: v => v ? <Tag color="orange">{v}</Tag> : '—' },
    { title: 'Đối tượng', dataIndex: 'target', width: 180, ellipsis: true },
    { title: 'Loại KH', dataIndex: 'customer_type', width: 150, ellipsis: true },
    { title: 'Từ ngày', dataIndex: 'from_date', width: 100 },
    { title: 'Đến ngày', dataIndex: 'to_date', width: 100 },
    { title: 'Trạng thái', dataIndex: 'is_active', width: 110, render: v => v ? <Tag color="green">Kích hoạt</Tag> : <Tag>Dừng</Tag> },
    { title: 'Chủ sở hữu', dataIndex: 'owner', width: 180, ellipsis: true, render: v => v || '—' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm mã, tên, loại KH..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-72"
          allowClear
        />
        <div className="flex-1" />
        <Tooltip title="Tải lại">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={() => { cacheRef.current = null; load(true) }}>
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>
      <Table<PriceBook>
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="small"
        loading={loading}
        scroll={{ x: 1200, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{ current: page, pageSize, total: filtered.length, onChange: p => setPage(p), showTotal: t => `${t} bảng giá`, size: 'small' }}
      />
    </div>
  )
}
