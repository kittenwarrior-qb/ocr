import { useState, useMemo, useEffect } from 'react'
import { Input, Table, Tag } from 'antd'
import { PhoneOutlined, ReloadOutlined, SettingOutlined, FilterOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { loadCustomers, type Customer } from '@/utils/catalogStore'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(100)
  const [customersData, setCustomersData] = useState<Customer[]>([])

  useEffect(() => { loadCustomers().then(setCustomersData) }, [])

  const data = useMemo(() => {
    if (!search.trim()) return customersData
    const q = search.toLowerCase()
    return customersData.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.tax_code || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q)
    )
  }, [search, customersData])

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
      width: 120,
      fixed: 'left',
      render: (val: string) => <span className="text-blue-600 font-medium">{val}</span>,
    },
    {
      title: 'Loại khách hàng',
      dataIndex: 'type',
      width: 150,
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'name',
      width: 280,
      ellipsis: true,
      render: (val: string) => <span className="text-blue-600">{val}</span>,
    },
    {
      title: 'Mã số thuế',
      dataIndex: 'tax_code',
      width: 120,
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      width: 120,
      render: (val: string) => val ? (
        <span className="flex items-center gap-1">
          <PhoneOutlined className="text-green-500" />
          {val}
        </span>
      ) : '-',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Lĩnh vực',
      dataIndex: 'field',
      width: 100,
    },
    {
      title: 'Địa chỉ (Hóa đơn)',
      dataIndex: 'invoice_address',
      width: 250,
      ellipsis: true,
    },
    {
      title: 'Tỉnh/TP (HĐ)',
      dataIndex: 'invoice_city',
      width: 120,
    },
    {
      title: 'Quận/Huyện (HĐ)',
      dataIndex: 'invoice_district',
      width: 140,
    },
    {
      title: 'Phường/Xã (HĐ)',
      dataIndex: 'invoice_ward',
      width: 140,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Chủ sở hữu',
      dataIndex: 'owner',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Địa chỉ (Giao hàng)',
      dataIndex: 'delivery_address',
      width: 250,
      ellipsis: true,
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
        scroll={{ x: 2200, y: 'calc(100vh - 200px)' }}
        className="border border-gray-200 rounded-lg"
      />
    </div>
  )
}
