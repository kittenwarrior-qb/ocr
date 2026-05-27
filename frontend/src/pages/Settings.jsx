import React, { useEffect, useState } from 'react'
import { getConfigs, updatePrefixes, updateSMTP } from '../api'

export default function Settings() {
  const [configs, setConfigs] = useState([])
  const [prefixes, setPrefixes] = useState({})
  const [smtp, setSmtp] = useState({ smtp_host: '', smtp_port: 587, smtp_user: '', smtp_password: '', notification_email: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    getConfigs().then(cfgs => {
      setConfigs(cfgs)
      const p = {}
      const s = {}
      cfgs.forEach(c => {
        if (c.config_key.endsWith('_prefix')) p[c.config_key.replace('_prefix', '')] = { value: c.config_value, used: c.last_number > 0 }
        if (['smtp_host','smtp_port','smtp_user','smtp_password','notification_email'].includes(c.config_key))
          s[c.config_key] = c.config_value
      })
      setPrefixes(p)
      setSmtp(prev => ({ ...prev, ...s }))
    })
  }, [])

  const PREFIX_KEYS = [
    { key: 'partner_customer', label: 'Khách hàng (PO)' },
    { key: 'partner_vendor',   label: 'Nhà cung cấp (Bill)' },
    { key: 'product',          label: 'Sản phẩm' },
    { key: 'address',          label: 'Địa chỉ' },
    { key: 'template',         label: 'Template' },
  ]

  const handleSavePrefixes = async () => {
    setSaving(true)
    try {
      const body = {}
      PREFIX_KEYS.forEach(({ key }) => {
        if (prefixes[key]?.value) body[`${key}_prefix`] = prefixes[key].value
      })
      await updatePrefixes(body)
      setSaved('prefixes')
      setTimeout(() => setSaved(null), 2000)
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const handleSaveSMTP = async () => {
    setSaving(true)
    try {
      await updateSMTP({ ...smtp, smtp_port: Number(smtp.smtp_port) })
      setSaved('smtp')
      setTimeout(() => setSaved(null), 2000)
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="mb-7">
        <h2 className="page-title">Cấu hình hệ thống</h2>
        <p className="text-sm text-gray-500 mt-1">Tiền tố mã nghiệp vụ và cấu hình email thông báo</p>
      </div>

      <section className="card p-5">
        <div className="mb-4">
          <h3 className="section-title text-sm">Tiền tố mã nghiệp vụ</h3>
          <p className="text-xs text-gray-500 mt-1">Chỉ thay đổi được khi chưa có mã nào được cấp phát.</p>
        </div>
        <div className="space-y-3">
          {PREFIX_KEYS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-xs text-gray-600 w-44">{label}</label>
              <input
                type="text"
                value={prefixes[key]?.value || ''}
                onChange={e => setPrefixes(p => ({ ...p, [key]: { ...p[key], value: e.target.value } }))}
                disabled={prefixes[key]?.used}
                className="input font-mono w-32 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              {prefixes[key]?.used && (
                <span className="text-xs text-gray-400">Đã có mã → không đổi được</span>
              )}
            </div>
          ))}
        </div>
        <button onClick={handleSavePrefixes} disabled={saving} className="mt-5 btn-primary">
          {saved === 'prefixes' ? '✓ Đã lưu' : saving ? 'Đang lưu…' : 'Lưu prefix'}
        </button>
      </section>

      <section className="card p-5">
        <div className="mb-4">
          <h3 className="section-title text-sm">Email thông báo</h3>
          <p className="text-xs text-gray-500 mt-1">Gửi email tổng hợp 1 lần/ngày khi có pending.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'smtp_host', label: 'SMTP Host', ph: 'smtp.gmail.com' },
            { key: 'smtp_port', label: 'Port', ph: '587' },
            { key: 'smtp_user', label: 'Email gửi', ph: 'you@gmail.com' },
            { key: 'smtp_password', label: 'Mật khẩu / App password', ph: '••••••••', type: 'password' },
          ].map(({ key, label, ph, type }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input type={type || 'text'} value={smtp[key] || ''}
                onChange={e => setSmtp(s => ({ ...s, [key]: e.target.value }))}
                placeholder={ph} className="input" />
            </div>
          ))}
          <div className="col-span-2">
            <label className="label">Email nhận thông báo</label>
            <input type="email" value={smtp.notification_email || ''}
              onChange={e => setSmtp(s => ({ ...s, notification_email: e.target.value }))}
              placeholder="ketoan@cty.com" className="input" />
          </div>
        </div>
        <button onClick={handleSaveSMTP} disabled={saving} className="mt-5 btn-primary">
          {saved === 'smtp' ? '✓ Đã lưu' : saving ? 'Đang lưu…' : 'Lưu cấu hình email'}
        </button>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h3 className="section-title text-sm">Tất cả cấu hình hiện tại</h3>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Key', 'Giá trị', 'Số cuối'].map(h => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {configs.map((c) => (
              <tr key={c.config_key}>
                <td className="td font-mono text-xs text-gray-500">{c.config_key}</td>
                <td className="td text-gray-700 text-xs font-mono">
                  {c.config_key.includes('password') ? '••••••' : c.config_value}
                </td>
                <td className="td text-gray-500 text-xs font-mono">{c.last_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
