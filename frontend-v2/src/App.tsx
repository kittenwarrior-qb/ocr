import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import {
  ContactsOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  OrderedListOutlined,
  PercentageOutlined,
  SettingOutlined,
  ShoppingOutlined,
  TagsOutlined,
  TeamOutlined,
  SwapOutlined,
  UploadOutlined,
  UserSwitchOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import viVN from 'antd/locale/vi_VN'
import { useState } from 'react'

import OrdersPage from './pages/Orders'
import SaleOrdersPage from './pages/SaleOrders'
import CustomersPage from './pages/Customers'
import ProductsPage from './pages/Products'
import ContactsPage from './pages/Contacts'
import VouchersPage from './pages/Vouchers'
import ChietKhauPage from './pages/ChietKhau'
import ProductMappingPage from './pages/ProductMapping'
import CustomerMappingPage from './pages/CustomerMapping'
import ContactMappingPage from './pages/ContactMapping'
import SettingsPage from './pages/Settings'
import POHistoryPage from './pages/POHistory'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()

  const items = [
    { key: '/orders', label: 'Tải File', icon: <UploadOutlined /> },
    { key: '/products', label: 'Hàng hóa', icon: <ShoppingOutlined /> },
    { key: '/sale-orders', label: 'Đơn hàng', icon: <OrderedListOutlined /> },
    { key: '/customers', label: 'Khách hàng', icon: <TeamOutlined /> },
    { key: '/contacts', label: 'Liên hệ', icon: <ContactsOutlined /> },
    { key: '/vouchers', label: 'Voucher', icon: <TagsOutlined /> },
    { key: '/chiet-khau', label: 'Chính sách giá', icon: <PercentageOutlined /> },
    { key: '/mapping', label: 'Mapping HH', icon: <SwapOutlined /> },
    { key: '/mapping-customer', label: 'Mapping KH', icon: <UserSwitchOutlined /> },
    { key: '/mapping-contact', label: 'Mapping LH', icon: <ContactsOutlined /> },
    { key: '/po-history', label: 'PO History', icon: <HistoryOutlined /> },
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
          const active = location.pathname === item.key || location.pathname.startsWith(item.key + '/')
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
          <Route path="/sale-orders" element={<SaleOrdersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/vouchers" element={<VouchersPage />} />
          <Route path="/chiet-khau" element={<ChietKhauPage />} />
          <Route path="/mapping" element={<ProductMappingPage />} />
          <Route path="/mapping-customer" element={<CustomerMappingPage />} />
          <Route path="/mapping-contact" element={<ContactMappingPage />} />
          <Route path="/po-history" element={<POHistoryPage />} />
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
