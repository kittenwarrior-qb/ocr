import React, { useEffect, useState, useCallback } from 'react'
import { getPendingMappings, mapTempCode, getProducts, getSuggestions } from '../api'

export default function Mappings() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getPendingMappings().then(setItems).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="text-center py-20 text-gray-500 text-sm">Đang tải…</p>

  return (
    <div>
      <div className="flex justify-between items-center mb-7">
        <div>
          <h2 className="page-title">Mapping sản phẩm</h2>
          <p className="text-sm text-gray-500 mt-1">Gán tên hàng từ chứng từ vào sản phẩm chuẩn</p>
        </div>
        <div className="card px-4 py-2.5">
          <span className="font-display font-bold text-amber-600 text-xl leading-none">{items.length}</span>
          <span className="text-gray-500 text-xs ml-2">chờ gán</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-emerald-600 text-xl">✓</span>
          </div>
          <p className="text-gray-600 font-medium text-sm">Tất cả sản phẩm đã được gán!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <MappingRow key={item.temp_code} item={item} onMapped={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function MappingRow({ item, onMapped }) {
  const [mode, setMode] = useState('idle')
  const [products, setProducts] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [newName, setNewName] = useState(item.sample_name || '')
  const [newUom, setNewUom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const openSelect = async () => {
    setMode('select')
    const [prods, suggs] = await Promise.all([getProducts(), getSuggestions(item.temp_code)])
    setProducts(prods)
    setSuggestions(suggs)
  }

  const filtered = products.filter(p =>
    !search || p.display_name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleMap = async () => {
    if (!selectedProduct) return
    setSaving(true); setError(null)
    try {
      await mapTempCode(item.temp_code, { product_id: selectedProduct.id })
      onMapped()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleCreate = async () => {
    if (!newName || !newUom) return
    setSaving(true); setError(null)
    try {
      await mapTempCode(item.temp_code, { new_product_name: newName, new_product_uom: newUom })
      onMapped()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="card p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-gray-800 text-sm truncate">
            {item.sample_name || <span className="text-gray-300 italic font-normal">Không có tên</span>}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="font-mono text-xs bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {item.temp_code}
            </span>
            <span className="text-xs text-gray-400">{item.occurrence_count} lần xuất hiện</span>
            <span className="text-xs text-gray-400">
              Lần cuối: {new Date(item.last_used_at).toLocaleDateString('vi-VN')}
            </span>
          </div>
        </div>
        {mode === 'idle' && (
          <div className="flex gap-2 shrink-0">
            <button onClick={openSelect} className="btn-sm-primary">Chọn sản phẩm</button>
            <button onClick={() => setMode('create')} className="btn-sm-secondary">Tạo mới</button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}

      {mode === 'select' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          {suggestions.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Gợi ý tương tự</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      selectedProduct?.id === p.id
                        ? 'bg-amber-500 text-white border-amber-500 font-semibold'
                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {p.display_name} <span className="opacity-60">({p.uom})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <input
            type="text"
            placeholder="Tìm sản phẩm…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input mb-2"
          />
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
            {filtered.slice(0, 20).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className={`w-full text-left px-3 py-2.5 text-xs flex justify-between items-center hover:bg-gray-50 transition-colors ${
                  selectedProduct?.id === p.id ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span>{p.display_name}</span>
                <span className="text-gray-400 font-mono ml-2">{p.code} · {p.uom}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center py-4 text-xs text-gray-400">Không tìm thấy</p>}
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={handleMap} disabled={!selectedProduct || saving} className="btn-sm-primary">
              {saving ? 'Đang lưu…' : `Gán → ${selectedProduct?.display_name || '…'}`}
            </button>
            <button onClick={() => { setMode('idle'); setSelectedProduct(null); setSearch('') }} className="btn-sm-secondary">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Tạo sản phẩm mới</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Tên sản phẩm *</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="VD: Bột nhựa PP 50g" className="input" />
            </div>
            <div>
              <label className="label">Đơn vị tính *</label>
              <input type="text" value={newUom} onChange={e => setNewUom(e.target.value)}
                placeholder="VD: Thùng, Kg, Cái" className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newName || !newUom || saving} className="btn-sm-success">
              {saving ? 'Đang tạo…' : '+ Tạo và gán'}
            </button>
            <button onClick={() => setMode('idle')} className="btn-sm-secondary">Huỷ</button>
          </div>
        </div>
      )}
    </div>
  )
}
