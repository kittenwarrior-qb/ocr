import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import {
  ContactsOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShoppingOutlined,
  TagsOutlined,
  TeamOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import viVN from 'antd/locale/vi_VN'
import { useState } from 'react'

import OrdersPage from './pages/Orders'
import CustomersPage from './pages/Customers'
import ProductsPage from './pages/Products'
import ContactsPage from './pages/Contacts'
import VouchersPage from './pages/Vouchers'
import ProductMappingPage from './pages/ProductMapping'
import SettingsPage from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()

  const items = [
    { key: '/orders', label: 'Đơn hàng', icon: <FileTextOutlined /> },
    { key: '/products', label: 'Hàng hóa', icon: <ShoppingOutlined /> },
    { key: '/customers', label: 'Khách hàng', icon: <TeamOutlined /> },
    { key: '/contacts', label: 'Liên hệ', icon: <ContactsOutlined /> },
    { key: '/vouchers', label: 'Voucher', icon: <TagsOutlined /> },
    { key: '/mapping', label: 'Mapping HH', icon: <SwapOutlined /> },
    { key: '/settings', label: 'Cài đặt', icon: <SettingOutlined /> },
  ]

  return (
    <aside className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50 transition-all duration-200 ${collapsed ? 'w-14' : 'w-52'}`}>
      <div className="h-12 flex items-center px-3 border-b border-gray-100">
        <button onClick={onToggle} className="text-gray-500 hover:text-gray-800 text-base">
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
        {!collapsed && <span className="ml-3 font-semibold text-gray-800 text-sm">OCR Risk</span>}
      </div>

      <nav className="mt-1">
        {items.map(item => {
          const active = location.pathname.startsWith(item.key)
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              className={`w-full flex items-center px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={`transition-all duration-200 ${collapsed ? 'ml-14' : 'ml-52'}`}>
        <Routes>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/vouchers" element={<VouchersPage />} />
          <Route path="/mapping" element={<ProductMappingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ConfigProvider locale={viVN}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  )
}
