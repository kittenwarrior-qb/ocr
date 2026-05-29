import { useQuery } from '@tanstack/react-query'
import { Table, Tag, Button } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders } from '@/api/orders'
import type { Order } from '@/types/order'

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Nháp' },
  processing: { color: 'processing', label: 'Đang xử lý' },
  completed: { color: 'success', label: 'Hoàn thành' },
  exported: { color: 'purple', label: 'Đã xuất' },
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') || undefined

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', status],
    queryFn: () => getOrders(status),
  })

  const columns = [
    { title: 'File đã nhập', dataIndex: 'file_name', render: (v: string | null) => v || <span className="text-gray-300">—</span> },
    { title: 'Ngày đặt', dataIndex: 'order_date', width: 100 },
    { title: 'Ngày giao', dataIndex: 'delivery_date', width: 100 },
    { title: 'Tổng tiền', dataIndex: 'total_amount', width: 130, render: (v: number | null) => v != null ? Number(v).toLocaleString('vi-VN') + ' đ' : '—' },
    { title: 'SP', width: 50, render: (_: unknown, r: Order) => r.lines?.length || 0 },
    { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (v: string) => { const s = STATUS_MAP[v] || { color: 'default', label: v }; return <Tag color={s.color}>{s.label}</Tag> } },
    { title: '', width: 80, render: (_: unknown, r: Order) => <Button type="link" size="small" onClick={() => navigate(`/orders/${r.id}`)}>Mở</Button> },
  ]

  const filters = [
    { key: '', label: 'Tất cả' },
    { key: 'processing', label: 'Đang xử lý' },
    { key: 'completed', label: 'Hoàn thành' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-800">Đơn đặt hàng</h1>
        <Button type="primary" onClick={() => navigate('/orders/new')}>+ Tải đơn hàng</Button>
      </div>

      <div className="flex gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setSearchParams(f.key ? { status: f.key } : {})}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              (status || '') === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <Table
          dataSource={orders}
          columns={columns}
          rowKey="id"
          size="small"
          loading={isLoading}
          pagination={{ pageSize: 20, size: 'small' }}
        />
      </div>
    </div>
  )
}
