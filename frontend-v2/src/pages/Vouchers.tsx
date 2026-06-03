import { useEffect, useState, useRef } from 'react'
import { Input, Table, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '@/api/client'

interface PromoItem {
  id: number
  promo_id: number
  bought_code: string
  bought_name: string
  bought_qty: number
  bought_uom: string
  offer_code: string
  offer_name: string
  offer_qty: number
  offer_uom: string
}

function parseCode(text: string): [string, string] {
  // "TP-00051  - Nước tinh khiết..." → ["TP-00051", "Nước tinh khiết..."]
  const idx = text.indexOf(' - ')
  if (idx > 0) return [text.slice(0, idx).trim(), text.slice(idx + 3).trim()]
  return [text.trim(), '']
}

function flattenItems(allData: Record<string, any>): PromoItem[] {
  const result: PromoItem[] = []
  for (const [pid, entry] of Object.entries(allData)) {
    if (!entry?.Success) continue
    for (const item of entry?.Data || []) {
      const [bCode, bName] = parseCode(item.BoughtProductIDText || '')
      const offers: any[] = item.OfferProductIDDataSelected || []
      const offer = offers[0] || {}
      result.push({
        id: item.ID,
        promo_id: parseInt(pid),
        bought_code: bCode,
        bought_name: bName || item.BoughtProductIDText || '',
        bought_qty: item.Quantity ?? 0,
        bought_uom: item.ProductUnitIDText || '',
        offer_code: offer.ProductIDText || '',
        offer_name: offer.ProductName || '',
        offer_qty: offer.Amount ?? 0,
        offer_uom: offer.UnitIDText || '',
      })
    }
  }
  return result
}

export default function VouchersPage() {
  const [all, setAll] = useState<PromoItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 100
  const cacheRef = useRef<PromoItem[] | null>(null)

  const load = async (force = false) => {
    if (cacheRef.current && !force) { setAll(cacheRef.current); return }
    setLoading(true)
    try {
      const res = await client.get('/misa/promotions/all')
      const items = flattenItems(res.data || {})
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
    return all.filter(p =>
      p.bought_code.toLowerCase().includes(s) ||
      p.bought_name.toLowerCase().includes(s) ||
      p.offer_code.toLowerCase().includes(s) ||
      p.offer_name.toLowerCase().includes(s)
    )
  })()

  const columns: ColumnsType<PromoItem> = [
    { title: 'CTKM ID', dataIndex: 'promo_id', width: 90, render: v => <span className="text-gray-400 text-xs">#{v}</span> },
    { title: 'Mã hàng mua', dataIndex: 'bought_code', width: 130, render: v => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Tên hàng mua', dataIndex: 'bought_name', ellipsis: true },
    { title: 'SL mua', dataIndex: 'bought_qty', width: 80, align: 'right' },
    { title: 'ĐVT', dataIndex: 'bought_uom', width: 80 },
    { title: 'Mã hàng tặng', dataIndex: 'offer_code', width: 130, render: v => <span className="text-emerald-600 font-medium">{v}</span> },
    { title: 'Tên hàng tặng', dataIndex: 'offer_name', ellipsis: true },
    { title: 'SL tặng', dataIndex: 'offer_qty', width: 80, align: 'right' },
    { title: 'ĐVT tặng', dataIndex: 'offer_uom', width: 80 },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm mã hàng mua, hàng tặng..."
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
      <Table<PromoItem>
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="small"
        loading={loading}
        scroll={{ x: 900, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{ current: page, pageSize, total: filtered.length, onChange: p => setPage(p), showTotal: t => `${t} dòng khuyến mãi`, size: 'small' }}
      />
    </div>
  )
}
