import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sessions from './pages/Sessions'
import Upload from './pages/Upload'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Bills from './pages/Bills'
import BillDetail from './pages/BillDetail'
import Mappings from './pages/Mappings'
import Products from './pages/Products'
import Settings from './pages/Settings'
import Templates from './pages/Templates'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/bills/:id" element={<BillDetail />} />
        <Route path="/mappings" element={<Mappings />} />
        <Route path="/products" element={<Products />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
