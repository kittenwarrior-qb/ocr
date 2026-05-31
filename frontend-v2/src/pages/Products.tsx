import { useState, useEffect } from 'react'
import { Input, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchProducts, type Product } from '@/utils/catalogStore'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [data, setData] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const r = await fetchProducts(search, (page - 1) * pageSize, pageSize)
    setData(r.items)
    setTotal(r.total)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, page, pageSize])

  const columns: ColumnsType<Product> = [
    { title: 'Mã hàng hóa', dataIndex: 'code', width: 130, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Tên hàng hóa', dataIndex: 'name', ellipsis: true },
    { title: 'ĐVT', dataIndex: 'uom', width: 80 },
    { title: 'Đơn giá', dataIndex: 'price', width: 120, align: 'right', render: (v: number) => v ? v.toLocaleString('vi-VN') + ' đ' : '—' },
    { title: 'Thuế', dataIndex: 'tax_rate', width: 70, render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Tính chất', dataIndex: 'property', width: 120, render: (v: string) => v || '—' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Input.Search placeholder="Tìm mã, tên hàng hóa..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="w-64" allowClear />
        <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={load}><ReloadOutlined /></button>
      </div>
      <Table<Product> columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} sản phẩm`, size: 'small' }}
        scroll={{ y: 'calc(100vh - 200px)' }} className="border border-gray-200 rounded-lg" />
    </div>
  )
}
