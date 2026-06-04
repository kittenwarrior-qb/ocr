import { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Button, Pagination, Spin } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchContacts, getCustomers, type Contact } from '@/utils/catalogStore'

export type { Contact }

function matchContactToCustomer(contact: Contact) {
  const all = getCustomers()
  if (contact.customer_code || contact.customer_name) {
    return all.find(c => c.code === contact.customer_code || c.name === contact.customer_name) || null
  }
  if (!contact.organization) return null
  const org = contact.organization.toLowerCase()
  return all.find(c => c.name.toLowerCase() === org || c.name.toLowerCase().includes(org.slice(0, 20))) || null
}

const PAGE_SIZE = 20

interface Props {
  open: boolean
  onSelect: (contact: Contact, matchedCustomer: ReturnType<typeof matchContactToCustomer>) => void
  onCancel: () => void
}

export default function ContactSelectPopup({ open, onSelect, onCancel }: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Contact | null>(null)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const r = await fetchContacts(q, (p - 1) * PAGE_SIZE, PAGE_SIZE)
      setData(r.items)
      setTotal(r.total)
    } catch { setData([]); setTotal(0) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) {
      setSearch(''); setPage(1); setSelected(null)
      load('', 1)
    } else {
      setData([]); setTotal(0); setSelected(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => load(search, page), 350)
    return () => clearTimeout(t)
  }, [search, page, open, load])

  const handleOk = () => {
    if (!selected) return
    onSelect(selected, matchContactToCustomer(selected))
  }

  return (
    <Modal
      title={<span className="text-base font-semibold">Chọn người liên hệ</span>}
      open={open}
      onCancel={onCancel}
      width="88vw"
      style={{ maxWidth: 1200 }}
      styles={{ body: { padding: '12px 20px', height: 'calc(100vh - 200px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      footer={null}
      centered
    >
      <div className="flex items-center justify-between mb-3">
        <Input
          placeholder="Tìm theo tên, công ty, SĐT, email..."
          prefix={<SearchOutlined className="text-gray-400" />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          allowClear
          autoFocus
          className="w-80"
        />
        <span className="text-xs text-slate-400">{total} kết quả</span>
      </div>

      <Spin spinning={loading}>
        <div className="border border-slate-200 rounded overflow-auto flex-1" style={{ maxHeight: 'calc(100vh - 360px)' }}>
          <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2 w-8" />
                {['Mã LH', 'Họ và tên', 'Chức danh', 'Công ty', 'SĐT (mobile)', 'SĐT (VP)', 'Email', 'Địa chỉ GH', 'Tỉnh/TP'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => {
                const sel = selected?.code === row.code
                const matched = matchContactToCustomer(row)
                return (
                  <tr key={row.code} onClick={() => setSelected(row)}
                    className={`border-b border-slate-100 cursor-pointer transition-colors ${sel ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                    <td className="px-2 py-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${sel ? 'border-blue-600' : 'border-slate-300'}`}>
                        {sel && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-mono text-slate-600">{row.code}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">{row.name}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.job_title || '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-700 max-w-[220px] truncate">
                      {matched
                        ? <span className="text-emerald-700 font-semibold">{row.organization}</span>
                        : <span className="text-slate-500">{row.organization || '-'}</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.phone || '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.phone_work || '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.email || '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500 max-w-xs truncate">{row.delivery_address || row.address || '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.city || '-'}</td>
                  </tr>
                )
              })}
              {!loading && data.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-slate-400">Không tìm thấy</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} simple />
        <div className="flex items-center gap-3">
          {selected && matchContactToCustomer(selected) && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
              Tự động chọn công ty: <strong>{matchContactToCustomer(selected)!.name}</strong>
            </span>
          )}
          <span className="text-sm text-slate-600">
            {selected ? <>Đã chọn: <strong>{selected.name}</strong></> : <span className="text-slate-400">Chưa chọn</span>}
          </span>
          <Button onClick={onCancel}>Hủy</Button>
          <Button type="primary" disabled={!selected} onClick={handleOk}>Chọn</Button>
        </div>
      </div>
    </Modal>
  )
}
