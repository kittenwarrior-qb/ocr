import { useState, useEffect } from 'react'
import { Input, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchCustomers, type Customer } from '@/utils/catalogStore'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = async () => {
    setLoading(true)
    const r = await fetchCustomers(debouncedSearch, (page - 1) * pageSize, pageSize)
    setData(r.items)
    setTotal(r.total)
    setLoading(false)
  }

  useEffect(() => { load() }, [debouncedSearch, page, pageSize])

  const columns: ColumnsType<Customer> = [
    { title: 'Mã KH', dataIndex: 'code', width: 120, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Tên khách hàng', dataIndex: 'name', ellipsis: true },
    { title: 'MST', dataIndex: 'tax_code', width: 130 },
    { title: 'Địa chỉ (HĐ)', dataIndex: 'invoice_address', ellipsis: true, width: 300 },
    { title: 'Tỉnh/TP', dataIndex: 'invoice_city', width: 120 },
    { title: 'Địa chỉ (GH)', dataIndex: 'delivery_address', ellipsis: true, width: 250 },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Input.Search placeholder="Tìm mã, tên, MST..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="w-64" allowClear />
        <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={load}><ReloadOutlined /></button>
      </div>
      <Table<Customer> columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} khách hàng`, size: 'small' }}
        scroll={{ y: 'calc(100vh - 200px)' }} className="border border-gray-200 rounded-lg" />
    </div>
  )
}
