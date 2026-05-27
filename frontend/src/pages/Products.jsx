import React, { useEffect, useState } from 'react'
import { getProducts, createProduct } from '../api'

export default function Products() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ display_name: '', uom: '', account_code: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = (q = '') => {
    setLoading(true)
    getProducts(q).then(setProducts).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSearch = (e) => {
    setSearch(e.target.value)
    load(e.target.value)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.display_name || !form.uom) return
    setSaving(true); setError(null)
    try {
      await createProduct({ display_name: form.display_name, uom: form.uom, account_code: form.account_code || null })
      setForm({ display_name: '', uom: '', account_code: '' })
      setShowForm(false)
      load(search)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-7">
        <div>
          <h2 className="page-title">Danh mục sản phẩm</h2>
          <p className="text-sm text-gray-500 mt-1">{products.length} sản phẩm trong danh mục</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Huỷ' : '+ Thêm sản phẩm'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-5 border-amber-200">
          <h3 className="section-title text-sm mb-4">Thêm sản phẩm mới</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="label">Tên sản phẩm *</label>
              <input type="text" required value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Đơn vị tính *</label>
              <input type="text" required value={form.uom}
                onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Tài khoản kế toán</label>
              <input type="text" value={form.account_code}
                onChange={e => setForm(f => ({ ...f, account_code: e.target.value }))}
                placeholder="VD: 156" className="input" />
            </div>
          </div>
          {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Đang lưu…' : 'Lưu sản phẩm'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Huỷ</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <input type="text" placeholder="Tìm sản phẩm theo tên hoặc mã…"
            value={search} onChange={handleSearch} className="input max-w-sm" />
        </div>
        {loading ? (
          <p className="text-center py-12 text-gray-500 text-sm">Đang tải…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Mã sản phẩm', 'Tên sản phẩm', 'ĐVT', 'Tài khoản', 'Ngày tạo'].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="td font-mono text-xs text-amber-600 font-medium">{p.code}</td>
                  <td className="td text-gray-800">{p.display_name}</td>
                  <td className="td text-gray-500 text-xs">{p.uom}</td>
                  <td className="td text-gray-500 font-mono text-xs">{p.account_code || '—'}</td>
                  <td className="td text-gray-400 font-mono text-xs">
                    {new Date(p.created_at).toLocaleDateString('vi-VN')}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">Chưa có sản phẩm nào</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
