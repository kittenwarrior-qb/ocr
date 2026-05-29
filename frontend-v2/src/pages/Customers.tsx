import { useState, useMemo } from 'react'
import { Input, Table, Tag } from 'antd'
import { PhoneOutlined, ReloadOutlined, SettingOutlined, FilterOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import customersData from '@/data/customers.json'

interface Customer {
  tag: string
  code: string
  type: string
  name: string
  tax_code: string
  phone: string
  email: string
  field: string
  invoice_address: string
  invoice_city: string
  invoice_district: string
  invoice_ward: string
  description: string
  owner: string
  delivery_address: string
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(100)

  const data = useMemo(() => {
    if (!search.trim()) return customersData as Customer[]
    const q = search.toLowerCase()
    return (customersData as Customer[]).filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.tax_code.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q)
    )
  }, [search])

  const columns: ColumnsType<Customer> = [
    {
      title: 'Thẻ',
      dataIndex: 'tag',
      width: 50,
      render: (val: string) => val ? <Tag>{val}</Tag> : null,
    },
    {
      title: 'Mã khách hàng',
      dataIndex: 'code',
      width: 140,
      render: (val: string) => <a className="text-blue-600 font-medium">{val}</a>,
    },
    {
      title: 'Loại khách hàng',
      dataIndex: 'type',
      width: 160,
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'name',
      ellipsis: true,
      render: (val: string) => <a className="text-blue-600">{val}</a>,
    },
    {
      title: 'Mã số thuế',
      dataIndex: 'tax_code',
      width: 130,
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      width: 130,
      render: (val: string) => val ? (
        <span className="flex items-center gap-1">
          <PhoneOutlined className="text-green-500" />
          {val}
        </span>
      ) : '-',
    },
  ]

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Input.Search
            placeholder="Tìm kiếm thông minh"
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
      <Table<Customer>
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
