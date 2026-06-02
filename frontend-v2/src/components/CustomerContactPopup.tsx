import { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Button, Pagination, Spin, Tabs } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { fetchCustomers, fetchContacts, getCustomers, type Customer, type Contact } from '@/utils/catalogStore'

export type { Customer, Contact }

export interface CustomerSelection {
  type: 'customer'
  customer: Customer
}

export interface ContactSelection {
  type: 'contact'
  contact: Contact
  customer: Customer | null  // auto-matched company
}

export type CustomerContactResult = CustomerSelection | ContactSelection

interface Props {
  open: boolean
  onSelect: (result: CustomerContactResult) => void
  onCancel: () => void
  initialSearch?: string
  initialTab?: 'customer' | 'contact'
}

const PAGE_SIZE = 20

function useTableData<T>(
  open: boolean,
  fetcher: (search: string, skip: number, limit: number) => Promise<{ items: T[]; total: number }>,
  initialSearch = ''
) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const r = await fetcher(q, (p - 1) * PAGE_SIZE, PAGE_SIZE)
      setData(r.items)
      setTotal(r.total)
    } catch { setData([]); setTotal(0) }
    setLoading(false)
  }, [fetcher])

  useEffect(() => {
    if (open) { setSearch(initialSearch); setPage(1); load(initialSearch, 1) }
    else { setSearch(''); setPage(1); setData([]); setTotal(0) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => load(search, page), 350)
    return () => clearTimeout(t)
  }, [search, page, open, load])

  return { search, setSearch, page, setPage, data, total, loading }
}

function matchContactToCustomer(contact: Contact): Customer | null {
  const all = getCustomers()
  if (contact.customer_code || contact.customer_name) {
    const cached = all.find(c => c.code === contact.customer_code || c.name === contact.customer_name)
    if (cached) return cached
    return {
      code: contact.customer_code || '',
      name: contact.customer_name || contact.organization || contact.name,
      type: '',
      tax_code: contact.customer_tax_code || '',
      phone: contact.phone || contact.phone_work || '',
      email: contact.email || contact.email_personal || '',
      field: '',
      owner: contact.owner || '',
      description: '',
      invoice_address: '',
      invoice_city: '',
      invoice_district: '',
      invoice_ward: '',
      delivery_address: contact.delivery_address || contact.address || '',
    }
  }
  if (!contact.organization) return null
  const org = contact.organization.toLowerCase()
  return all.find(c => c.name.toLowerCase() === org || c.name.toLowerCase().includes(org.slice(0, 20))) || null
}

export default function CustomerContactPopup({ open, onSelect, onCancel, initialSearch = '', initialTab = 'customer' }: Props) {
  const [activeTab, setActiveTab] = useState<'customer' | 'contact'>(initialTab)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)

  const cust = useTableData<Customer>(open && activeTab === 'customer', fetchCustomers, initialSearch)
  const cont = useTableData<Contact>(open && activeTab === 'contact', fetchContacts, initialSearch)

  useEffect(() => {
    if (open) setActiveTab(initialTab)
    else { setSelectedCustomer(null); setSelectedContact(null); setActiveTab(initialTab) }
  }, [open, initialTab])

  const handleOk = () => {
    if (activeTab === 'customer' && selectedCustomer) {
      onSelect({ type: 'customer', customer: selectedCustomer })
    } else if (activeTab === 'contact' && selectedContact) {
      onSelect({ type: 'contact', contact: selectedContact, customer: matchContactToCustomer(selectedContact) })
    }
  }

  const selectedName = activeTab === 'customer'
    ? selectedCustomer?.name || ''
    : selectedContact ? `${selectedContact.name}${selectedContact.organization ? ` (${selectedContact.organization})` : ''}` : ''

  const renderCustomerTable = () => (
    <Spin spinning={cust.loading}>
      <div className="border border-slate-200 rounded overflow-auto flex-1" style={{ maxHeight: 'calc(100vh - 380px)' }}>
        <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-2 w-8" />
              {['Mã KH', 'Tên khách hàng', 'Loại khách hàng', 'MST', 'Địa chỉ (HĐ)', 'Tỉnh/TP', 'SĐT', 'Chủ sở hữu'].map(h => (
                <th key={h} className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cust.data.map(row => {
              const sel = selectedCustomer?.code === row.code
              return (
                <tr key={row.code} onClick={() => setSelectedCustomer(row)}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${sel ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                  <td className="px-2 py-1.5">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${sel ? 'border-blue-600' : 'border-slate-300'}`}>
                      {sel && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-slate-600">{row.code}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">{row.name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{row.type || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.tax_code || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-600 max-w-xs truncate">{row.invoice_address || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.invoice_city || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.phone || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.owner || '-'}</td>
                </tr>
              )
            })}
            {!cust.loading && cust.data.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-slate-400">Không tìm thấy</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Spin>
  )

  const renderContactTable = () => (
    <Spin spinning={cont.loading}>
      <div className="border border-slate-200 rounded overflow-auto flex-1" style={{ maxHeight: 'calc(100vh - 380px)' }}>
        <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-2 w-8" />
              {['Mã LH', 'Họ và tên', 'Công ty', 'SĐT', 'Email', 'Địa chỉ GH', 'Tỉnh/TP'].map(h => (
                <th key={h} className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cont.data.map(row => {
              const sel = selectedContact?.code === row.code
              const matched = matchContactToCustomer(row)
              return (
                <tr key={row.code} onClick={() => setSelectedContact(row)}
                  className={`border-b border-slate-100 cursor-pointer transition-colors ${sel ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                  <td className="px-2 py-1.5">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${sel ? 'border-blue-600' : 'border-slate-300'}`}>
                      {sel && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-slate-600">{row.code}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-800">{row.name}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-700 max-w-[240px] truncate">
                    {matched
                      ? <span className="text-emerald-700 font-semibold">{row.organization}</span>
                      : <span className="text-slate-500">{row.organization || '-'}</span>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.phone || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.email || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500 max-w-xs truncate">{row.delivery_address || row.address || '-'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{row.city || '-'}</td>
                </tr>
              )
            })}
            {!cont.loading && cont.data.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-slate-400">Không tìm thấy</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Spin>
  )

  const activeSearch = activeTab === 'customer' ? cust.search : cont.search
  const setActiveSearch = activeTab === 'customer' ? cust.setSearch : cont.setSearch
  const activeTotal = activeTab === 'customer' ? cust.total : cont.total
  const activePage = activeTab === 'customer' ? cust.page : cont.page
  const setActivePage = activeTab === 'customer' ? cust.setPage : cont.setPage
  const hasSelection = activeTab === 'customer' ? !!selectedCustomer : !!selectedContact

  return (
    <Modal
      title={<span className="text-base font-semibold">Chọn khách hàng / liên hệ</span>}
      open={open}
      onCancel={onCancel}
      width="92vw"
      style={{ maxWidth: 1300 }}
      styles={{ body: { padding: '12px 20px', height: 'calc(100vh - 180px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      footer={null}
      centered
    >
      <div className="flex items-center justify-between mb-2">
        <Input
          placeholder="Tìm kiếm..."
          prefix={<SearchOutlined className="text-gray-400" />}
          value={activeSearch}
          onChange={e => { setActiveSearch(e.target.value); setActivePage(1) }}
          allowClear
          className="w-72"
        />
        <span className="text-xs text-slate-400">{activeTotal} kết quả</span>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={k => { setActiveTab(k as 'customer' | 'contact'); setSelectedCustomer(null); setSelectedContact(null) }}
        size="small"
        className="flex-1 flex flex-col"
        style={{ display: 'flex', flexDirection: 'column' }}
        items={[
          {
            key: 'customer',
            label: `Khách hàng${activeTab === 'customer' && activeTotal ? ` (${activeTotal})` : ''}`,
            children: renderCustomerTable(),
          },
          {
            key: 'contact',
            label: `Liên hệ${activeTab === 'contact' && activeTotal ? ` (${activeTotal})` : ''}`,
            children: renderContactTable(),
          },
        ]}
      />

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <Pagination size="small" current={activePage} pageSize={PAGE_SIZE} total={activeTotal} onChange={setActivePage} showSizeChanger={false} simple />
        <div className="flex items-center gap-3">
          {selectedContact && activeTab === 'contact' && matchContactToCustomer(selectedContact) && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
              Tự động chọn công ty: <strong>{matchContactToCustomer(selectedContact)!.name}</strong>
            </span>
          )}
          <span className="text-sm text-slate-600">
            {hasSelection ? <>Đã chọn: <strong>{selectedName}</strong></> : <span className="text-slate-400">Chưa chọn</span>}
          </span>
          <Button onClick={onCancel}>Hủy</Button>
          <Button type="primary" disabled={!hasSelection} onClick={handleOk}>Chọn</Button>
        </div>
      </div>
    </Modal>
  )
}
