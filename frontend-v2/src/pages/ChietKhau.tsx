import { useEffect, useState, useRef } from 'react'
import { Input, Table, Tag, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '@/api/client'

interface PriceBookItem {
  product_code: string
  product_name: string
  product_type: string
  uom: string
  unit_price: number
  discount_type: string
  discount: number
}

interface PriceBook {
  code: string
  name: string
  target: string
  customer_type: string
  from_date: string | null
  to_date: string | null
  is_inactive: boolean
  customers: string[]
  items: PriceBookItem[]
}

export default function ChietKhauPage() {
  const [all, setAll] = useState<PriceBook[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string[]>([])
  const pageSize = 50
  const cacheRef = useRef<PriceBook[] | null>(null)

  const load = async (force = false) => {
    if (cacheRef.current && !force) { setAll(cacheRef.current); return }
    setLoading(true)
    try {
      const res = await client.get('/misa/price-books/all')
      cacheRef.current = res.data || []
      setAll(res.data || [])
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
    { title: 'Mã CSG', dataIndex: 'code', width: 130, render: v => <span className="text-blue-600 font-medium font-mono">{v || '—'}</span> },
    { title: 'Tên chính sách giá', dataIndex: 'name', ellipsis: true },
    { title: 'Đối tượng', dataIndex: 'target', width: 180, ellipsis: true },
    { title: 'Loại KH', dataIndex: 'customer_type', width: 160, ellipsis: true, render: v => v || <span className="text-gray-400">—</span> },
    { title: 'Từ ngày', dataIndex: 'from_date', width: 100, render: v => v || '—' },
    { title: 'Đến ngày', dataIndex: 'to_date', width: 100, render: v => v || '—' },
    { title: 'Trạng thái', dataIndex: 'is_inactive', width: 110, render: v => !v ? <Tag color="green">Kích hoạt</Tag> : <Tag>Dừng</Tag> },
    { title: 'Số SP', key: 'items', width: 70, align: 'center', render: (_, r) => r.items?.length ?? 0 },
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
        rowKey="code"
        size="small"
        loading={loading}
        expandable={{
          expandedRowKeys: expanded,
          onExpand: (exp, rec) => setExpanded(prev => exp ? [...prev, rec.code] : prev.filter(k => k !== rec.code)),
          expandedRowRender: (rec) => (
            <table className="text-xs w-full border-collapse ml-6">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Mã hàng</th>
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Tên hàng hóa</th>
                  <th className="px-2 py-1 text-center font-semibold text-gray-600 w-16">ĐVT</th>
                  <th className="px-2 py-1 text-right font-semibold text-orange-700 w-28">Đơn giá (CK)</th>
                  <th className="px-2 py-1 text-center font-semibold text-gray-500 w-24">Loại CK</th>
                  <th className="px-2 py-1 text-right font-semibold text-gray-500 w-20">CK%</th>
                </tr>
              </thead>
              <tbody>
                {rec.items.map((item, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1 font-mono text-blue-600">{item.product_code}</td>
                    <td className="px-2 py-1 text-gray-700">{item.product_name}</td>
                    <td className="px-2 py-1 text-center text-gray-500">{item.uom || '—'}</td>
                    <td className="px-2 py-1 text-right font-semibold text-orange-700">{item.unit_price ? item.unit_price.toLocaleString('vi-VN') : '—'}</td>
                    <td className="px-2 py-1 text-center text-gray-500">{item.discount_type || '—'}</td>
                    <td className="px-2 py-1 text-right text-gray-400">{item.discount ? `${item.discount}%` : '—'}</td>
                  </tr>
                ))}
                {!rec.items.length && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">Không có sản phẩm</td></tr>
                )}
              </tbody>
            </table>
          ),
        }}
        scroll={{ x: 1000, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{ current: page, pageSize, total: filtered.length, onChange: p => setPage(p), showTotal: t => `${t} bảng giá`, size: 'small' }}
      />
    </div>
  )
}
