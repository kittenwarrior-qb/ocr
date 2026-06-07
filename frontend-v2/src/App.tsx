import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import {
  ContactsOutlined,
  MailOutlined,
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
import { useEffect, useState } from 'react'

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
import EmailOrdersPage from './pages/EmailOrders'
import client from './api/client'
import { FIXED_MISA_ACCOUNTS } from './config/misaAccounts'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

function initialsFromCode(code: string) {
  const cleaned = code.trim().replace(/[^a-zA-Z0-9]/g, '')
  return (cleaned.slice(0, 2) || '??').toUpperCase()
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()

  const items = [
    { key: '/orders', label: 'Tải File', icon: <UploadOutlined /> },
    { key: '/email-orders', label: 'Đơn qua Email', icon: <MailOutlined /> },
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

function AccountSwitcher() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [appId, setAppId] = useState('')
  const mappedAccount = FIXED_MISA_ACCOUNTS.find(account => account.code === appId)
  const selected = mappedAccount || {
    code: appId || 'MISA',
    initials: initialsFromCode(appId || 'MISA'),
    name: appId || 'MISA',
    email: '',
  }

  const loadCurrentAccount = () => {
    client.get('/settings/misa').then(r => {
      setAppId((r.data.app_id || '').trim())
    }).catch(() => {})
  }

  useEffect(() => {
    loadCurrentAccount()
    window.addEventListener('misa-settings-updated', loadCurrentAccount)
    return () => window.removeEventListener('misa-settings-updated', loadCurrentAccount)
  }, [])

  const goToSettings = () => {
    setOpen(false)
    navigate('/settings')
  }

  return (
    <div className="fixed top-3 right-4 z-[60]">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="h-10 w-10 rounded-full border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        title={selected.name}
      >
        {selected.initials}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Đóng chọn tài khoản"
            className="fixed inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-3 w-72 rounded-lg bg-white shadow-lg border border-gray-100">
            <div className="absolute -top-2 right-5 h-4 w-4 rotate-45 bg-white border-l border-t border-gray-100" />
            <div className="relative p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                  {selected.initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{selected.name}</div>
                  <div className="truncate text-xs text-gray-500">{selected.email || selected.code}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={goToSettings}
                className="mt-4 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <SettingOutlined />
                <span>Cài đặt</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <AccountSwitcher />
      <main className={`pr-16 transition-all duration-200 ${collapsed ? 'ml-14' : 'ml-52'}`}>
        <Routes>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/email-orders" element={<EmailOrdersPage />} />
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
