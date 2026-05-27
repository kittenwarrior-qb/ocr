import React, { useState, useEffect, useRef } from 'react'
import {
  getTemplates, createTemplate, updateTemplate, deactivateTemplate,
  testTemplate, getPartnerSearch,
} from '../api'

const FIELD_OPTIONS = [
  { key: 'order_number',        label: 'Số chứng từ / PO Number' },
  { key: 'order_date',          label: 'Ngày chứng từ' },
  { key: 'payment_method',      label: 'Hình thức thanh toán' },
  { key: 'recipient_name',      label: 'Người nhận hàng' },
  { key: 'delivery_address',    label: 'Địa điểm giao hàng' },
  { key: 'customer_name',       label: 'Tên khách hàng' },
  { key: 'customer_tax_code',   label: 'MST khách hàng' },
  { key: 'vendor_name',         label: 'Tên nhà cung cấp' },
  { key: 'vendor_tax_code',     label: 'MST nhà cung cấp' },
  { key: 'total_amount',        label: 'Tổng tiền hàng' },
  { key: 'tax_amount',          label: 'Tiền thuế' },
  { key: 'description',         label: 'Nội dung / Ghi chú' },
  { key: 'items.product_code',  label: 'Mã hàng hóa' },
  { key: 'items.product_name',  label: 'Tên hàng hóa' },
  { key: 'items.quantity',      label: 'Số lượng' },
  { key: 'items.unit',          label: 'Đơn vị tính' },
  { key: 'items.unit_price',    label: 'Đơn giá' },
  { key: 'items.line_total',    label: 'Thành tiền' },
  { key: 'items.tax_rate',      label: 'Thuế suất VAT (%)' },
  { key: 'items.discount_rate', label: 'Tỷ lệ chiết khấu (%)' },
]

const BUILTIN_CODES = ['TPL_OSIFOOD', 'TPL_7ELEVEN', 'TPL_COOPFOOD']

function splitAliases(fieldAliases) {
  const aliases = {}
  let poPrefix = ''
  if (fieldAliases) {
    Object.entries(fieldAliases).forEach(([k, v]) => {
      if (k === '_po_prefix') poPrefix = v.join(', ')
      else aliases[k] = v
    })
  }
  return { aliases, poPrefix }
}

function Badge({ children, color = 'gray' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700 border-blue-300',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-300',
    purple: 'bg-purple-50 text-purple-700 border-purple-300',
    gray:   'bg-gray-100 text-gray-600 border-gray-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-300',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${colors[color]}`}>
      {children}
    </span>
  )
}

function PartnerSearch({ value, onChange }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!q) { setResults([]); return }
    const t = setTimeout(() => {
      getPartnerSearch(q).then(setResults).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        value={value?.legal_name || q}
        onChange={e => { setQ(e.target.value); onChange(null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Tìm theo tên hoặc MST (để trống = áp dụng mọi đối tác)"
        className="input"
      />
      {value && (
        <button onClick={() => { onChange(null); setQ('') }}
          className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 text-sm transition-colors">✕</button>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
          {results.map(p => (
            <button key={p.id} onClick={() => { onChange(p); setQ(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
              <span className="font-medium text-gray-800">{p.legal_name}</span>
              {p.tax_code && <span className="ml-2 text-gray-400 text-xs font-mono">{p.tax_code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AliasEditor({ aliases, onChange }) {
  const [entries, setEntries] = useState(() =>
    Object.entries(aliases || {}).map(([k, v]) => ({ key: k, raw: v.join(', ') }))
  )

  const prevRef = useRef(aliases)
  useEffect(() => {
    if (aliases !== prevRef.current) {
      prevRef.current = aliases
      setEntries(Object.entries(aliases || {}).map(([k, v]) => ({ key: k, raw: v.join(', ') })))
    }
  }, [aliases])

  const emit = (list) => {
    const obj = {}
    list.forEach(({ key, raw }) => {
      if (key && raw.trim()) obj[key] = raw.split(',').map(s => s.trim()).filter(Boolean)
    })
    prevRef.current = obj
    onChange(obj)
  }
  const update = (idx, patch) => {
    const next = entries.map((e, i) => i === idx ? { ...e, ...patch } : e)
    setEntries(next)
    emit(next)
  }
  const add = () => setEntries(e => [...e, { key: '', raw: '' }])
  const remove = (idx) => {
    const next = entries.filter((_, i) => i !== idx)
    setEntries(next)
    emit(next)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Mỗi dòng: chọn trường hệ thống → nhập tên label trên hóa đơn (cách nhau bởi dấu phẩy)</p>
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            value={entry.key}
            onChange={e => update(i, { key: e.target.value })}
            className="input w-52 py-1.5 text-xs"
          >
            <option value="">— Chọn trường —</option>
            {FIELD_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input
            value={entry.raw}
            onChange={e => update(i, { raw: e.target.value })}
            placeholder='VD: HTTT, "Hình thức TT", P.Thức TT'
            className="input flex-1 py-1.5 text-xs"
          />
          <button onClick={() => remove(i)} className="text-gray-400 hover:text-rose-500 text-sm shrink-0 transition-colors">✕</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors">+ Thêm alias</button>
    </div>
  )
}

function TestPanel({ templateId }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)

  const run = async () => {
    if (!file) return
    setLoading(true); setErr(null); setResult(null)
    try {
      const res = await testTemplate(templateId, file)
      setResult(res)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Thử template với file mẫu</p>
      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 text-center transition-colors">
          {file ? <span className="text-amber-600 font-medium">{file.name}</span> : 'Chọn file PDF/JPG để test'}
          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files[0])} />
        </label>
        <button onClick={run} disabled={!file || loading} className="btn-sm-primary px-4">
          {loading ? '⏳ Đang OCR…' : '▶ Chạy'}
        </button>
      </div>
      {err && <p className="text-xs text-rose-500">{err}</p>}
      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono overflow-auto max-h-64">
          <div className="flex justify-between mb-1">
            <span className="text-gray-500">Kết quả trích xuất:</span>
            <span className="text-emerald-600 font-medium">{(result.items || []).length} sản phẩm</span>
          </div>
          <pre className="whitespace-pre-wrap text-gray-700">
            {JSON.stringify({ ...result, items: result.items?.slice(0, 3) }, null, 2)}
            {result.items?.length > 3 && `\n…và ${result.items.length - 3} dòng nữa`}
          </pre>
        </div>
      )}
    </div>
  )
}

function TemplateModal({ initial, onClose, onSaved }) {
  const isEdit    = !!initial?.id
  const isBuiltin = BUILTIN_CODES.includes(initial?.code)

  const { aliases: initAliases, poPrefix: initPoPrefix } = splitAliases(initial?.field_aliases)

  const [name, setName]         = useState(initial?.name || '')
  const [docType, setDocType]   = useState(initial?.document_type || 'purchase_order')
  const [partner, setPartner]   = useState(null)
  const [aliases, setAliases]   = useState(initAliases)
  const [poPrefix, setPoPrefix] = useState(initPoPrefix)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState(null)

  const save = async () => {
    if (!name.trim()) { setErr('Cần nhập tên template'); return }
    setSaving(true); setErr(null)
    try {
      const aliasesWithPo = { ...aliases }
      const poPrefixList = poPrefix.split(',').map(s => s.trim()).filter(Boolean)
      if (poPrefixList.length) aliasesWithPo._po_prefix = poPrefixList

      const body = {
        name: name.trim(),
        document_type: docType,
        partner_id: partner?.id || null,
        field_aliases: aliasesWithPo,
        system_prompt: null,
        output_schema: {},
      }
      if (isEdit) {
        await updateTemplate(initial.id, body)
      } else {
        await createTemplate(body)
      }
      onSaved()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 py-8 overflow-y-auto backdrop-blur-sm">
      <div className="card w-full max-w-2xl mx-4 shadow-2xl">
        <div className="card-header">
          <h3 className="section-title">{isEdit ? 'Chỉnh sửa template' : 'Tạo template mới'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tên template *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="VD: WinMart — Format mới 2026"
                className="input" />
            </div>
            <div>
              <label className="label">Loại chứng từ</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} className="input">
                <option value="purchase_order">Đơn đặt hàng (PO)</option>
                <option value="vendor_bill">Hóa đơn GTGT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">
              Gắn với đối tác <span className="text-gray-400 font-normal normal-case">(tự động áp dụng khi nhận MST của đối tác này)</span>
            </label>
            <PartnerSearch value={partner} onChange={setPartner} />
          </div>

          <div>
            <label className="label">
              Tiền tố mã PO <span className="text-gray-400 font-normal normal-case">(tự động nhận diện theo mã chứng từ — cách nhau bởi dấu phẩy)</span>
            </label>
            <input
              value={poPrefix}
              onChange={e => setPoPrefix(e.target.value)}
              placeholder="VD: DH-SATORI, PO-, ĐH-"
              className="input"
            />
          </div>

          {!isBuiltin && (
            <div>
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                <strong>Alias mapping:</strong> chọn trường hệ thống bên trái → nhập tên label tương ứng trên hóa đơn bên phải.
                Hệ thống sẽ nhận diện những tên cột thay thế này khi OCR.
              </div>
              <AliasEditor aliases={aliases} onChange={setAliases} />
            </div>
          )}

          {isBuiltin && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Prompt built-in (chỉ xem)</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{initial?.system_prompt}</pre>
            </div>
          )}

          {err && <p className="text-xs text-rose-500">{err}</p>}
        </div>

        {isEdit && <div className="px-6 pb-4"><TestPanel templateId={initial.id} /></div>}

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Đóng</button>
          {!isBuiltin && (
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Đang lưu…' : isEdit ? 'Cập nhật' : 'Tạo template'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ t, onEdit, onDeactivate, testId, setTestId }) {
  const isBuiltin  = BUILTIN_CODES.includes(t.code)
  const aliases    = t.field_aliases ? Object.fromEntries(Object.entries(t.field_aliases).filter(([k]) => !k.startsWith('_'))) : {}
  const hasAliases = Object.keys(aliases).length > 0
  const poPrefixes = t.field_aliases?._po_prefix || []

  return (
    <div className="card p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-display font-semibold text-gray-800 text-sm">{t.name}</span>
            {isBuiltin && <Badge color="purple">Built-in</Badge>}
            {hasAliases && <Badge color="blue">Alias</Badge>}
            {!hasAliases && !isBuiltin && <Badge color="gray">Chưa có alias</Badge>}
          </div>
          <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
            <span className="font-mono">{t.code}</span>
            {t.partner_name && <span className="text-amber-600">{t.partner_name}</span>}
            {!t.partner_name && !isBuiltin && <span className="text-gray-300">Chưa gắn đối tác</span>}
          </div>

          {poPrefixes.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              <span className="text-gray-400">PO prefix:</span>
              {poPrefixes.map(p => (
                <span key={p} className="bg-blue-50 border border-blue-200 text-blue-600 rounded px-1.5 py-0.5 font-mono">{p}</span>
              ))}
            </div>
          )}

          {hasAliases && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(aliases).slice(0, 5).map(([field, vals]) => (
                <span key={field} className="text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                  {field}: {vals.join(', ')}
                </span>
              ))}
              {Object.keys(aliases).length > 5 && (
                <span className="text-xs text-gray-400">+{Object.keys(aliases).length - 5} nữa</span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button onClick={() => onEdit(t)} className="btn-sm-secondary">
            {isBuiltin ? 'Xem' : 'Sửa'}
          </button>
          {!isBuiltin && (
            <button onClick={() => onDeactivate(t.id)} className="btn-danger text-xs px-3 py-1.5">Xoá</button>
          )}
        </div>
      </div>

      {!isBuiltin && testId === t.id && <TestPanel templateId={t.id} />}
      {!isBuiltin && testId !== t.id && (
        <button onClick={() => setTestId(t.id)}
          className="mt-3 text-xs text-amber-500 hover:text-amber-600 transition-colors">
          ▶ Thử với file mẫu
        </button>
      )}
    </div>
  )
}

function TemplateSection({ title, color, templates, onEdit, onDeactivate, testId, setTestId }) {
  const isGreen = color === 'green'
  return (
    <div>
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl mb-3 ${
        isGreen
          ? 'bg-emerald-50 border border-emerald-200'
          : 'bg-amber-50 border border-amber-200'
      }`}>
        <h3 className={`font-display font-semibold text-xs uppercase tracking-wider ${isGreen ? 'text-emerald-700' : 'text-amber-700'}`}>
          {title}
        </h3>
        <span className={`ml-auto text-xs font-mono ${isGreen ? 'text-emerald-600' : 'text-amber-600'}`}>
          {templates.length}
        </span>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-400 text-sm mb-6">
          Chưa có template nào. Tạo mới để bắt đầu.
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {templates.map(t => (
            <TemplateCard key={t.id} t={t}
              onEdit={onEdit} onDeactivate={onDeactivate}
              testId={testId} setTestId={setTestId} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Templates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('all')
  const [modal, setModal]         = useState(null)
  const [testId, setTestId]       = useState(null)

  const load = () => {
    setLoading(true)
    getTemplates().then(setTemplates).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleDeactivate = async (id) => {
    if (!confirm('Vô hiệu hoá template này?')) return
    await deactivateTemplate(id).catch(e => alert(e.message))
    load()
  }

  const filtered = templates.filter(t => {
    if (filter === 'builtin') return BUILTIN_CODES.includes(t.code)
    if (filter === 'custom')  return !BUILTIN_CODES.includes(t.code)
    return true
  })

  const poTemplates   = filtered.filter(t => t.document_type === 'purchase_order')
  const billTemplates = filtered.filter(t => t.document_type === 'vendor_bill')

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h2 className="page-title">Template OCR</h2>
          <p className="text-sm text-gray-500 mt-1">Cấu hình cách trích xuất từng loại hóa đơn đặc biệt</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn-primary">
          + Tạo template mới
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5 text-sm">
        <p className="font-display font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wider">Cách hệ thống chọn template khi OCR</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-500 text-xs">
          <li><span className="text-gray-700"><strong>MST đối tác</strong> — nếu hóa đơn có MST và đối tác đó đã gắn template → dùng ngay</span></li>
          <li><span className="text-gray-700"><strong>Mã PO</strong> — nếu mã chứng từ khớp tiền tố đã cấu hình trong template → dùng template đó</span></li>
          <li><span className="text-gray-700"><strong>Format hint</strong> — AI pass 1 nhận diện loại (OsiFood, 7-Eleven, Co.opfood) → dùng built-in</span></li>
          <li><span className="text-gray-700"><strong>Generic</strong> — không match gì → dùng prompt chung với alias mặc định</span></li>
        </ol>
      </div>

      <div className="flex gap-1.5 mb-5">
        {[['all','Tất cả'], ['custom','Tùy chỉnh'], ['builtin','Built-in']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              filter === v
                ? 'bg-amber-500 text-white font-semibold'
                : 'border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Đang tải…</p>
      ) : (
        <>
          <TemplateSection
            title="Đơn đặt hàng — Purchase Order"
            color="green"
            templates={poTemplates}
            onEdit={t => setModal({ mode: 'edit', t })}
            onDeactivate={handleDeactivate}
            testId={testId}
            setTestId={setTestId}
          />
          <TemplateSection
            title="Hóa đơn GTGT — VAT Invoice"
            color="amber"
            templates={billTemplates}
            onEdit={t => setModal({ mode: 'edit', t })}
            onDeactivate={handleDeactivate}
            testId={testId}
            setTestId={setTestId}
          />
        </>
      )}

      {modal && (
        <TemplateModal
          initial={modal.t || null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
