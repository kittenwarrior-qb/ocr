import { useEffect, useState } from 'react'
import { Input, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchVouchers, type Voucher, type VoucherItem } from '@/api/vouchers'

export default function VouchersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Voucher[]>([])
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
      const r = await fetchVouchers(debouncedSearch, '', (page - 1) * pageSize, pageSize)
      setData(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [debouncedSearch, page, pageSize])

  const columns: ColumnsType<Voucher> = [
    { title: 'Mã CTKM', dataIndex: 'code', width: 130, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Tên chương trình', dataIndex: 'name', ellipsis: true },
    { title: 'Loại', dataIndex: 'type', width: 140 },
    { title: 'Đối tượng', dataIndex: 'target', width: 130 },
    { title: 'Khách hàng', dataIndex: 'customers', width: 180, ellipsis: true, render: (v: string[]) => v?.length ? v.join(', ') : 'Tất cả' },
    { title: 'Từ ngày', dataIndex: 'from_date', width: 110 },
    { title: 'Đến ngày', dataIndex: 'to_date', width: 110 },
    { title: 'Trạng thái', dataIndex: 'is_active', width: 110, render: (v: boolean) => v ? <Tag color="green">Kích hoạt</Tag> : <Tag>Không hoạt động</Tag> },
    { title: 'Mô tả', dataIndex: 'description', width: 240, ellipsis: true },
  ]

  const itemColumns: ColumnsType<VoucherItem> = [
    { title: 'Mã hàng mua', dataIndex: 'product_code', width: 130 },
    { title: 'Tên hàng mua', dataIndex: 'product_name', ellipsis: true },
    { title: 'ĐVT', dataIndex: 'uom', width: 80 },
    { title: 'SL', dataIndex: 'quantity', width: 70, align: 'right' },
    { title: 'Mã hàng tặng', dataIndex: 'gift_product_code', width: 130 },
    { title: 'Tên hàng tặng', dataIndex: 'gift_product_name', ellipsis: true },
    { title: 'SL tặng', dataIndex: 'gift_quantity', width: 90, align: 'right' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Input.Search placeholder="Tìm mã, tên, mô tả..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="w-72" allowClear />
        <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={load}><ReloadOutlined /></button>
      </div>
      <Table<Voucher> columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        expandable={{
          expandedRowRender: record => (
            <Table<VoucherItem> columns={itemColumns} dataSource={record.items || []} rowKey={(_, i) => `${record.code}-${i}`} size="small" pagination={false} />
          ),
          rowExpandable: record => !!record.items?.length,
        }}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} voucher`, size: 'small' }}
        scroll={{ x: 1400, y: 'calc(100vh - 200px)' }} className="border border-gray-200 rounded-lg" />
    </div>
  )
}
