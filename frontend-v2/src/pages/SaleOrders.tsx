import { useState, useEffect, useRef } from 'react'
import { Input, Table, Tag, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '@/api/client'

interface OrderLine {
  id: number
  product_code: string
  description: string
  amount: number
  unit: string
  usage_unit: string
  price: number
  to_currency: number
  discount: number
  discount_percent: number
  tax_percent: string
  tax: number
  total: number
  stock_name: string
  sort_order: number
  is_note_row: boolean
}

interface SaleOrder {
  id: number
  sale_order_no: string
  sale_order_date: string
  book_date: string
  deadline_date: string | null
  account_name: string
  account_code: string
  contact_name: string
  contact_code: string
  sale_order_name: string
  sale_order_type: string
  status: string
  revenue_status: string
  delivery_status: string | null
  pay_status: string
  sale_order_amount: number
  total_summary: number
  tax_summary: number
  discount_summary: number
  to_currency_summary: number
  owner_name: string
  organization_unit_name: string
  created_by: string
  created_date: string
  custom_field4: string | null
  sale_order_product_mappings: OrderLine[]
}

const fmt = (s: string | null) => (s ? s.slice(0, 10) : '—')
const fmtN = (v: number | null) =>
  v != null && v !== 0 ? v.toLocaleString('vi-VN') : '—'

const tagColor = (s: string | null) => {
  if (!s) return 'default'
  if (s.includes('Hoàn') || s.includes('Đã')) return 'success'
  if (s.includes('Đang') || s.includes('phần')) return 'processing'
  if (s.includes('Hủy')) return 'error'
  return 'default'
}

const lineColumns: ColumnsType<OrderLine> = [
  {
    title: 'Mã HH', dataIndex: 'product_code', width: 120,
    render: v => <span className="text-blue-600 font-medium">{v || '—'}</span>,
  },
  { title: 'Diễn giải', dataIndex: 'description', ellipsis: true },
  { title: 'Kho', dataIndex: 'stock_name', width: 80, render: v => v || '—' },
  { title: 'SL', dataIndex: 'amount', width: 65, align: 'right' },
  { title: 'ĐVT', dataIndex: 'unit', width: 60 },
  {
    title: 'Đơn giá', dataIndex: 'price', width: 110, align: 'right',
    render: v => fmtN(v),
  },
  {
    title: 'CK%', dataIndex: 'discount_percent', width: 65, align: 'right',
    render: v => (v ? `${v}%` : '—'),
  },
  { title: 'Thuế', dataIndex: 'tax_percent', width: 60, align: 'center' },
  {
    title: 'Thành tiền', dataIndex: 'to_currency', width: 120, align: 'right',
    render: v => <span className="font-medium">{fmtN(v)}</span>,
  },
  {
    title: 'Tổng (có thuế)', dataIndex: 'total', width: 130, align: 'right',
    render: v => <span className="font-semibold text-blue-700">{fmtN(v)}</span>,
  },
]

const strSort = (key: keyof SaleOrder) => (a: SaleOrder, b: SaleOrder) => String(a[key]||'').localeCompare(String(b[key]||''))
const numSort = (key: keyof SaleOrder) => (a: SaleOrder, b: SaleOrder) => (Number(a[key])||0) - (Number(b[key])||0)
const dateSort = (key: keyof SaleOrder) => (a: SaleOrder, b: SaleOrder) => String(a[key]||'').localeCompare(String(b[key]||''))

const columns: ColumnsType<SaleOrder> = [
  { title: 'Số ĐH', dataIndex: 'sale_order_no', width: 110, fixed: 'left', sorter: strSort('sale_order_no'), render: v => <span className="text-blue-600 font-medium font-mono">{v}</span> },
  { title: 'Ngày đặt', dataIndex: 'sale_order_date', width: 100, sorter: dateSort('sale_order_date'), render: fmt },
  { title: 'Ngày sổ', dataIndex: 'book_date', width: 100, sorter: dateSort('book_date'), render: fmt },
  { title: 'Hạn giao', dataIndex: 'deadline_date', width: 100, sorter: dateSort('deadline_date'), render: fmt },
  { title: 'Mã KH', dataIndex: 'account_code', width: 120, sorter: strSort('account_code'), render: v => v ? <span className="text-blue-600 font-mono text-xs">{v}</span> : '—' },
  { title: 'Khách hàng', dataIndex: 'account_name', width: 200, ellipsis: true, sorter: strSort('account_name') },
  { title: 'Mã LH', dataIndex: 'contact_code', width: 100, ellipsis: true, render: v => v || '—' },
  { title: 'Liên hệ', dataIndex: 'contact_name', width: 150, ellipsis: true, sorter: strSort('contact_name') },
  { title: 'Loại ĐH', dataIndex: 'sale_order_type', width: 100, ellipsis: true, sorter: strSort('sale_order_type') },
  { title: 'Diễn giải', dataIndex: 'sale_order_name', ellipsis: true, width: 200 },
  { title: 'TT đơn hàng', dataIndex: 'status', width: 140, sorter: strSort('status'), render: v => v ? <Tag color={tagColor(v)}>{v}</Tag> : '—' },
  { title: 'TT doanh thu', dataIndex: 'revenue_status', width: 140, sorter: strSort('revenue_status'), render: v => v ? <Tag color={tagColor(v)}>{v}</Tag> : '—' },
  { title: 'TT giao hàng', dataIndex: 'delivery_status', width: 140, sorter: strSort('delivery_status'), render: v => v ? <Tag color={tagColor(v)}>{v}</Tag> : <Tag>—</Tag> },
  { title: 'TT thanh toán', dataIndex: 'pay_status', width: 140, sorter: strSort('pay_status'), render: v => v ? <Tag color={tagColor(v)}>{v}</Tag> : '—' },
  { title: 'Giá trị', dataIndex: 'sale_order_amount', width: 130, align: 'right', sorter: numSort('sale_order_amount'), render: v => <span className="font-semibold">{fmtN(v)}</span> },
  { title: 'Trước thuế', dataIndex: 'to_currency_summary', width: 120, align: 'right', sorter: numSort('to_currency_summary'), render: fmtN },
  { title: 'Thuế', dataIndex: 'tax_summary', width: 100, align: 'right', sorter: numSort('tax_summary'), render: fmtN },
  { title: 'Nhân viên', dataIndex: 'owner_name', width: 160, ellipsis: true, sorter: strSort('owner_name') },
  { title: 'Đơn vị', dataIndex: 'organization_unit_name', width: 120, ellipsis: true },
  { title: 'Người tạo', dataIndex: 'created_by', width: 140, ellipsis: true, render: v => v || '—' },
  { title: 'Ngày tạo', dataIndex: 'created_date', width: 100, sorter: dateSort('created_date'), render: fmt },
]

export default function SaleOrdersPage() {
  const [all, setAll] = useState<SaleOrder[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const cacheRef = useRef<SaleOrder[] | null>(null)

  const load = async (force = false) => {
    if (cacheRef.current && !force) { setAll(cacheRef.current); return }
    setLoading(true)
    try {
      const { data } = await client.get('/misa/sale-orders/all')
      const items: SaleOrder[] = Array.isArray(data) ? data : []
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
    return all.filter(o =>
      (o.sale_order_no || '').toLowerCase().includes(s) ||
      (o.account_name || '').toLowerCase().includes(s) ||
      (o.account_code || '').toLowerCase().includes(s) ||
      (o.contact_name || '').toLowerCase().includes(s) ||
      (o.sale_order_name || '').toLowerCase().includes(s) ||
      (o.sale_order_type || '').toLowerCase().includes(s)
    )
  })()

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm số ĐH, khách hàng, diễn giải..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-80"
          allowClear
        />
        <div className="flex-1" />
        <Tooltip title="Tải lại từ MISA">
          <button
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            onClick={() => { cacheRef.current = null; load(true) }}
          >
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>

      <Table<SaleOrder>
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="small"
        loading={loading}
        scroll={{ x: 2600, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{
          current: page,
          pageSize,
          total: filtered.length,
          onChange: (p, s) => { setPage(p); setPageSize(s) },
          showTotal: t => `${t} đơn hàng`,
          size: 'small',
        }}
        expandable={{
          expandedRowRender: record => (
            <Table<OrderLine>
              columns={lineColumns}
              dataSource={(record.sale_order_product_mappings || [])
                .filter(l => !l.is_note_row)
                .sort((a, b) => a.sort_order - b.sort_order)}
              rowKey="id"
              pagination={false}
              size="small"
              className="bg-slate-50"
            />
          ),
          rowExpandable: r => (r.sale_order_product_mappings?.length || 0) > 0,
        }}
      />
    </div>
  )
}
