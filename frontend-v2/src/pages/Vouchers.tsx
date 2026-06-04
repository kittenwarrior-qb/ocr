import { useEffect, useState, useRef } from 'react'
import { Input, Table, Tag, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '@/api/client'

interface VoucherRow {
  code: string
  name: string
  type: string
  target: string
  customers: string[]
  description: string
  from_date: string
  to_date: string
  is_active: boolean
  item_count: number
  items: Array<{
    product_code: string
    product_name: string
    uom: string
    quantity: number
    gift_product_code: string
    gift_product_name: string
    gift_quantity: number
    gift_uom: string
    max_per_order: number
    max_per_customer: number
  }>
}

export default function VouchersPage() {
  const [all, setAll] = useState<VoucherRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string[]>([])
  const pageSize = 50
  const cacheRef = useRef<VoucherRow[] | null>(null)

  const load = async (force = false) => {
    if (cacheRef.current && !force) { setAll(cacheRef.current); return }
    setLoading(true)
    try {
      const res = await client.get('/vouchers', { params: { limit: 500 } })
      const items: VoucherRow[] = (res.data?.items || []).map((v: any) => ({
        ...v,
        item_count: (v.items || []).length,
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
    return all.filter(v =>
      v.code.toLowerCase().includes(s) ||
      v.name.toLowerCase().includes(s) ||
      v.type.toLowerCase().includes(s) ||
      v.description.toLowerCase().includes(s)
    )
  })()

  const columns: ColumnsType<VoucherRow> = [
    { title: 'Mã CTKM', dataIndex: 'code', width: 120, sorter: (a, b) => a.code.localeCompare(b.code), render: v => <span className="text-blue-600 font-medium font-mono">{v}</span> },
    { title: 'Tên chương trình', dataIndex: 'name', ellipsis: true, sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Loại', dataIndex: 'type', width: 240, ellipsis: true, sorter: (a, b) => (a.type||'').localeCompare(b.type||'') },
    { title: 'Đối tượng', dataIndex: 'target', width: 170, ellipsis: true },
    { title: 'KH áp dụng', dataIndex: 'customers', width: 120, sorter: (a, b) => (a.customers?.length||0) - (b.customers?.length||0), render: (v: string[]) => v?.length ? <span className="text-xs font-medium">{v.length} KH</span> : <span className="text-gray-400 text-xs">Tất cả</span> },
    { title: 'Hiệu lực', width: 190, sorter: (a, b) => (a.from_date||'').localeCompare(b.from_date||''), render: (_, r) => <span className="text-xs">{r.from_date || '—'} → {r.to_date || '—'}</span> },
    { title: 'Trạng thái', dataIndex: 'is_active', width: 110, render: v => v ? <Tag color="green">Kích hoạt</Tag> : <Tag>Dừng</Tag> },
    { title: 'Số SP', dataIndex: 'item_count', width: 70, align: 'center' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm mã, tên chương trình..."
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
      <Table<VoucherRow>
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
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Mã mua</th>
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Tên mua</th>
                  <th className="px-2 py-1 text-right font-semibold text-gray-600 w-16">SL mua</th>
                  <th className="px-2 py-1 text-center font-semibold text-gray-600 w-16">ĐVT</th>
                  <th className="px-2 py-1 text-left font-semibold text-emerald-700">Mã tặng</th>
                  <th className="px-2 py-1 text-left font-semibold text-emerald-700">Tên tặng</th>
                  <th className="px-2 py-1 text-right font-semibold text-emerald-700 w-16">SL tặng</th>
                  <th className="px-2 py-1 text-center font-semibold text-emerald-700 w-16">ĐVT tặng</th>
                  <th className="px-2 py-1 text-right font-semibold text-gray-500 w-20">Max/đơn</th>
                  <th className="px-2 py-1 text-right font-semibold text-gray-500 w-20">Max/KH</th>
                </tr>
              </thead>
              <tbody>
                {rec.items.map((item, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1 font-mono text-blue-600">{item.product_code}</td>
                    <td className="px-2 py-1 text-gray-700">{item.product_name}</td>
                    <td className="px-2 py-1 text-right font-semibold">{item.quantity}</td>
                    <td className="px-2 py-1 text-center text-gray-500">{item.uom || '—'}</td>
                    <td className="px-2 py-1 font-mono text-emerald-600">{item.gift_product_code}</td>
                    <td className="px-2 py-1 text-gray-700">{item.gift_product_name}</td>
                    <td className="px-2 py-1 text-right font-semibold text-emerald-700">{item.gift_quantity}</td>
                    <td className="px-2 py-1 text-center text-gray-500">{item.gift_uom || '—'}</td>
                    <td className="px-2 py-1 text-right text-gray-400">{item.max_per_order || '∞'}</td>
                    <td className="px-2 py-1 text-right text-gray-400">{item.max_per_customer || '∞'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        }}
        scroll={{ x: 1100, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{ current: page, pageSize, total: filtered.length, onChange: p => setPage(p), showTotal: t => `${t} chương trình`, size: 'small' }}
      />
    </div>
  )
}
