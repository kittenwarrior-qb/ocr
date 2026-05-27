import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getDashboard } from '../api'

const NAV = [
  { to: '/', label: 'Dashboard', icon: GridIcon },
  { to: '/sessions', label: 'Phiên xử lý', icon: FolderIcon },
  { to: '/upload', label: 'Upload chứng từ', icon: UploadIcon },
  { to: '/orders', label: 'Đơn đặt hàng', icon: ClipboardIcon },
  { to: '/bills', label: 'Hóa đơn GTGT', icon: ReceiptIcon },
  { to: '/mappings', label: 'Mapping sản phẩm', icon: LinkIcon, badge: true },
  { to: '/products', label: 'Danh mục sản phẩm', icon: BoxIcon },
  { to: '/templates', label: 'Template OCR', icon: LayersIcon },
  { to: '/settings', label: 'Cấu hình', icon: SettingsIcon },
]

export default function Layout({ children }) {
  const [pendingCount, setPendingCount] = useState(0)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const load = () => getDashboard().then(d => setPendingCount(d.pending_temp_codes)).catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-gray-950 transition-colors">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700/60 transition-colors">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
              <span className="text-white font-display font-bold text-xs">OR</span>
            </div>
            <div>
              <p className="font-display font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight tracking-tight">OCR Risk</p>
              <p className="text-gray-400 dark:text-gray-500 text-[10px] leading-tight mt-0.5">Chứng từ kế toán</p>
            </div>
          </div>
        </div>

        <div className="mx-4 border-t border-gray-100 dark:border-gray-700/60 mb-2" />

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto pb-2">
          {NAV.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60 border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={14} className={isActive ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'} />
                  <span className="flex-1 leading-none">{label}</span>
                  {badge && pendingCount > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {pendingCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer — theme toggle + version */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group"
          >
            <span className="flex items-center gap-2">
              <span>{isDark ? '☀️' : '🌙'}</span>
              <span>{isDark ? 'Giao diện sáng' : 'Giao diện tối'}</span>
            </span>
            {/* Toggle pill */}
            <span className={`relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors shrink-0 ${isDark ? 'bg-amber-500' : 'bg-gray-200'}`}
              style={{ height: '18px', width: '32px' }}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-1'}`} />
            </span>
          </button>
          <p className="text-gray-300 dark:text-gray-600 text-[10px] font-mono px-2">v1.0.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-slate-100 dark:bg-gray-950 transition-colors">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}

function GridIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8" />
    </svg>
  )
}
function FolderIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h3.086a1.5 1.5 0 0 1 1.06.44l.915.914A1.5 1.5 0 0 0 9.12 4.35H13A1.5 1.5 0 0 1 14.5 5.85v6.15A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4Z" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
function UploadIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
function ClipboardIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="3" y="2.5" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6 2.5a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
function ReceiptIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2.5 2L4 3.5 5.5 2 7 3.5 8.5 2 10 3.5 11.5 2 13 3.5V13l-1.5-1.5L10 13l-1.5-1.5L7 13l-1.5-1.5L4 13l-1.5-1.5V2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M5.5 6.5h5M5.5 9h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
function LinkIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M6.5 9.5a3.54 3.54 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5L7.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M9.5 6.5a3.54 3.54 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5l1-1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
function BoxIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M13.5 5.25 8 2.5 2.5 5.25v5.5L8 13.5l5.5-2.75v-5.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M8 2.5v11M2.5 5.25l5.5 2.75 5.5-2.75" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
function LayersIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 1.5 1.5 5 8 8.5 14.5 5 8 1.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M1.5 8.5 8 12l6.5-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M1.5 11.5 8 15l6.5-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
function SettingsIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.92.92M11.68 11.68l.92.92M12.6 3.4l-.92.92M4.32 11.68l-.92.92" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
