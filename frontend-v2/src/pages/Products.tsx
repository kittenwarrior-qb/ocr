import { useState, useMemo, useEffect } from 'react'
import { Input, Table, Tag } from 'antd'
import { ReloadOutlined, SettingOutlined, FilterOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { loadProducts, type Product } from '@/utils/catalogStore'

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(100)
  const [productsData, setProductsData] = useState<Product[]>([])

  useEffect(() => { loadProducts().then(setProductsData) }, [])

  const data = useMemo(() => {
    if (!search.trim()) return productsData
    const q = search.toLowerCase()
    return productsData.filter(p =>
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.uom.toLowerCase().includes(q) ||
      (p.property || '').toLowerCase().includes(q)
    )
  }, [search, productsData])

  const columns: ColumnsType<Product> = [
    {
      title: 'Mã hàng hóa',
      dataIndex: 'code',
      width: 130,
      render: (val: string) => <span className="text-blue-600 font-medium">{val}</span>,
    },
    {
      title: 'Tên hàng hóa',
      dataIndex: 'name',
      ellipsis: true,
      render: (val: string) => <span className="text-gray-800">{val}</span>,
    },
    {
      title: 'ĐVT',
      dataIndex: 'uom',
      width: 80,
    },
    {
      title: 'Đơn giá',
      dataIndex: 'price',
      width: 120,
      align: 'right',
      render: (val: number) => val ? val.toLocaleString('vi-VN') + ' đ' : '—',
    },
    {
      title: 'Thuế',
      dataIndex: 'tax_rate',
      width: 70,
      render: (val: string) => val ? <Tag>{val}</Tag> : '—',
    },
    {
      title: 'Tính chất',
      dataIndex: 'property',
      width: 120,
      render: (val: string) => val || '—',
    },
  ]

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Input.Search
            placeholder="Tìm mã, tên hàng hóa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64"
            allowClear
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><ReloadOutlined /></button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><SettingOutlined /></button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><FilterOutlined /></button>
        </div>
      </div>

      {/* Table */}
      <Table<Product>
        columns={columns}
        dataSource={data}
        rowKey="code"
        size="small"
        pagination={{
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['50', '100', '200'],
          onShowSizeChange: (_, size) => setPageSize(size),
          showTotal: (total) => `Tổng số ${total.toLocaleString('vi-VN')}`,
          size: 'small',
        }}
        scroll={{ y: 'calc(100vh - 200px)' }}
        className="border border-gray-200 rounded-lg"
      />
    </div>
  )
}
