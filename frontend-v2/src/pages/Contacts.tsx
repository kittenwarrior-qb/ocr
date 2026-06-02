import { useEffect, useState } from 'react'
import { Input, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchContacts, type Contact } from '@/utils/catalogStore'

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Contact[]>([])
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
    try {
      const r = await fetchContacts(debouncedSearch, (page - 1) * pageSize, pageSize)
      setData(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [debouncedSearch, page, pageSize])

  const columns: ColumnsType<Contact> = [
    { title: 'Mã LH', dataIndex: 'code', width: 110, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Họ và tên', dataIndex: 'name', width: 180, ellipsis: true },
    { title: 'Công ty', dataIndex: 'organization', width: 240, ellipsis: true },
    { title: 'Chức danh', dataIndex: 'job_title', width: 150, ellipsis: true },
    { title: 'SĐT', dataIndex: 'phone', width: 130, render: (_: string, r) => r.phone || r.phone_work || '—' },
    { title: 'Email', dataIndex: 'email', width: 220, ellipsis: true, render: (_: string, r) => r.email || r.email_personal || '—' },
    { title: 'Địa chỉ giao hàng', dataIndex: 'delivery_address', width: 300, ellipsis: true, render: (_: string, r) => r.delivery_address || r.address || '—' },
    { title: 'Tỉnh/TP', dataIndex: 'city', width: 130 },
    { title: 'Chủ sở hữu', dataIndex: 'owner', width: 160, ellipsis: true },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Input.Search placeholder="Tìm tên, công ty, SĐT..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="w-72" allowClear />
        <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={load}><ReloadOutlined /></button>
      </div>
      <Table<Contact> columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} liên hệ`, size: 'small' }}
        scroll={{ x: 1450, y: 'calc(100vh - 200px)' }} className="border border-gray-200 rounded-lg" />
    </div>
  )
}
