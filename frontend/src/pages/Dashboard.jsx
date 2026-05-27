import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard, getOrders, getBills } from '../api'

function StatCard({ label, value, sub, to, accent }) {
  const accentMap = {
    amber:  { bar: '#F59E0B' },
    blue:   { bar: '#60A5FA' },
    violet: { bar: '#A78BFA' },
    slate:  { bar: '#94A3B8' },
  }
  const { bar } = accentMap[accent] || accentMap.slate

  const inner = (
    <div className="relative card p-5 transition-all hover:border-gray-300 hover:shadow-sm">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: `linear-gradient(90deg, ${bar}, transparent)` }} />
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">{label}</p>
      <p className="font-display font-bold text-gray-900 text-3xl leading-none mb-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  )

  return to ? <Link to={to}>{inner}</Link> : inner
}

const STATUS_COLOR = {
  draft: 'text-gray-400', processing: 'text-amber-600',
  completed: 'text-emerald-600', exported: 'text-violet-600', rejected: 'text-rose-500',
}
const STATUS_LABEL = {
  draft: 'Nháp', processing: 'Đang xử lý',
  completed: 'Hoàn thành', exported: 'Đã xuất', rejected: 'Lỗi',
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [recentBills, setRecentBills] = useState([])

  useEffect(() => {
    getDashboard().then(setStats).catch(() => {})
    getOrders().then(d => setRecentOrders(d.slice(0, 5))).catch(() => {})
    getBills().then(d => setRecentBills(d.slice(0, 5))).catch(() => {})
  }, [])

  return (
    <div>
      <div className="mb-7">
        <h2 className="page-title">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Tổng quan hệ thống xử lý chứng từ</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Chờ gán sản phẩm" value={stats?.pending_temp_codes} sub="temp_code chưa mapping" to="/mappings" accent="amber" />
        <StatCard label="Đơn hàng xử lý" value={stats?.processing_orders} sub="có dòng pending" to="/orders?status=processing" accent="blue" />
        <StatCard label="Hóa đơn xử lý" value={stats?.processing_bills} sub="có dòng pending" to="/bills?status=processing" accent="violet" />
        <StatCard label="Tổng đang xử lý" value={stats?.total_processing} accent="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecentList title="Đơn đặt hàng gần đây" items={recentOrders} type="orders" />
        <RecentList title="Hóa đơn GTGT gần đây" items={recentBills} type="bills" />
      </div>
    </div>
  )
}

function RecentList({ title, items, type }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="section-title text-sm">{title}</h3>
        <Link to={`/${type}`} className="text-xs text-amber-500 hover:text-amber-600 transition-colors">Xem tất cả →</Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Chưa có dữ liệu</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(item => (
            <li key={item.id}>
              <Link to={`/${type}/${item.id}`} className="flex justify-between items-center py-3 px-5 text-sm hover:bg-gray-50 transition-colors">
                <span className="text-gray-700 truncate max-w-xs">
                  {item.order_number || item.invoice_number || <span className="text-gray-300 italic">Không có số</span>}
                </span>
                <span className={`font-medium text-xs ${STATUS_COLOR[item.status] || 'text-gray-400'}`}>
                  {STATUS_LABEL[item.status] || item.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
