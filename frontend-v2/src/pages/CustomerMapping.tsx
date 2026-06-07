import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Input, Modal, Form, message, Spin, Tooltip, Tag, Tabs } from 'antd'
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined,
  TeamOutlined, SafetyCertificateOutlined, HomeOutlined, ApartmentOutlined,
} from '@ant-design/icons'
import client from '@/api/client'

interface MstRow {
  tax_code: string
  customer_code: string
  customer_name: string
  customer_phone: string
  notes: string
}

interface CompanyAliasRow {
  id: string
  external_key: string
  external_normalized: string
  customer_code: string
  customer_name: string
  alias_type: string
  source: string
  updated_at: string
}

const PAGE = 50

function useTableData<T>(
  activeKey: string,
  tabKey: string,
  fetcher: (q: string, p: number) => Promise<{ items: T[]; total: number }>
) {
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher  // always latest, no re-render trigger

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try { const r = await fetcherRef.current(q, p); setData(r.items); setTotal(r.total) }
    catch { message.error('Tải thất bại') }
    setLoading(false)
  }, [])  // stable — no deps, uses ref

  useEffect(() => {
    if (activeKey !== tabKey) return
    const t = setTimeout(() => load(search, page), 300)
    return () => clearTimeout(t)
  }, [search, page, activeKey, tabKey, load])

  return { data, total, search, setSearch, page, setPage, loading, reload: () => load(search, page) }
}

export default function CustomerMappingPage() {
  const [activeTab, setActiveTab] = useState('mst')

  // ── MST ─────────────────────────────────────────────────────────────────
  const mst = useTableData<MstRow>('mst', 'mst', async (q, p) => {
    const { data } = await client.get('/company-aliases/mst', { params: { search: q, skip: (p - 1) * PAGE, limit: PAGE } })
    return data
  })

  const [mstModal, setMstModal] = useState(false)
  const [mstEdit, setMstEdit] = useState<MstRow | null>(null)
  const [mstForm] = Form.useForm()

  const commitSaveMst = async (v: any) => {
    try {
      await client.post('/company-aliases/mst', v)
      message.success('Đã lưu'); setMstModal(false); mstForm.resetFields(); mst.reload()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Lỗi') }
  }

  // Yêu cầu xem lại trước khi lưu — gán nhầm MST sẽ khiến đơn của KH này bị
  // ghép vào đúng KH khác ngay lập tức ở những lần OCR sau.
  const saveMst = async () => {
    const v = await mstForm.validateFields()
    Modal.confirm({
      title: 'Xác nhận mapping MST',
      content: (
        <div className="text-sm space-y-1">
          <div>MST <strong className="font-mono">{v.tax_code}</strong> sẽ được gán cho khách hàng:</div>
          <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-1">
            <span className="font-mono font-bold text-blue-700">{v.customer_code}</span>
            {v.customer_name ? <span className="text-slate-600 ml-2">— {v.customer_name}</span> : null}
          </div>
          <div className="text-xs text-slate-500 mt-1">Các đơn hàng có MST này sẽ tự động được nhận diện là khách hàng trên — kiểm tra kỹ trước khi xác nhận.</div>
        </div>
      ),
      okText: 'Xác nhận lưu', cancelText: 'Xem lại', width: 480,
      onOk: () => commitSaveMst(v),
    })
  }

  const deleteMst = (tax_code: string) => {
    Modal.confirm({
      title: 'Xóa MST mapping?',
      content: `MST "${tax_code}" sẽ bị xóa khỏi bảng nhận diện khách hàng.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        await client.delete(`/company-aliases/mst/${encodeURIComponent(tax_code)}`)
        message.success('Đã xóa'); mst.reload()
      },
    })
  }

  // ── Company name alias ───────────────────────────────────────────────────
  const names = useTableData<CompanyAliasRow>('name', 'name', async (q, p) => {
    const { data } = await client.get('/company-aliases', { params: { search: q, skip: (p - 1) * PAGE, limit: PAGE, alias_type: 'name' } })
    return { items: data.items.filter((r: CompanyAliasRow) => r.alias_type === 'name'), total: data.total }
  })

  const addrs = useTableData<CompanyAliasRow>('address', 'address', async (q, p) => {
    const { data } = await client.get('/company-aliases', { params: { search: q, skip: (p - 1) * PAGE, limit: PAGE } })
    return { items: data.items.filter((r: CompanyAliasRow) => r.alias_type === 'address'), total: data.total }
  })

  const [aliasModal, setAliasModal] = useState<'name' | 'address' | null>(null)
  const [aliasEdit, setAliasEdit] = useState<CompanyAliasRow | null>(null)
  const [aliasForm] = Form.useForm()

  const commitSaveAlias = async (v: any) => {
    try {
      await client.post('/company-aliases', { ...v, alias_type: aliasModal, source: aliasEdit?.source || 'manual' })
      message.success('Đã lưu'); setAliasModal(null); aliasForm.resetFields(); setAliasEdit(null)
      if (aliasModal === 'name') names.reload(); else addrs.reload()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Lỗi') }
  }

  // Yêu cầu xem lại trước khi lưu — alias tên/địa chỉ sai sẽ khiến OCR ghép
  // nhầm KH ngay từ lần xử lý chứng từ tiếp theo, không có cảnh báo nào khác.
  const saveAlias = async () => {
    const v = await aliasForm.validateFields()
    const typeLabel = aliasModal === 'name' ? 'tên công ty' : 'địa chỉ'
    Modal.confirm({
      title: `Xác nhận mapping ${typeLabel}`,
      content: (
        <div className="text-sm space-y-1">
          <div>Khi OCR gặp {typeLabel} <strong>"{v.external_key}"</strong>, hệ thống sẽ tự động gán thành khách hàng:</div>
          <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-1">
            <span className="font-mono font-bold text-blue-700">{v.customer_code}</span>
            {v.customer_name ? <span className="text-slate-600 ml-2">— {v.customer_name}</span> : null}
          </div>
          <div className="text-xs text-slate-500 mt-1">Kiểm tra kỹ trước khi xác nhận — mapping sai sẽ ảnh hưởng đến việc nhận diện khách hàng của các đơn sau này.</div>
        </div>
      ),
      okText: 'Xác nhận lưu', cancelText: 'Xem lại', width: 480,
      onOk: () => commitSaveAlias(v),
    })
  }

  const deleteAlias = (id: string, type: 'name' | 'address', label: string) => {
    Modal.confirm({
      title: `Xóa alias ${type === 'name' ? 'tên công ty' : 'địa chỉ'}?`,
      content: `"${label}" sẽ bị xóa. Hệ thống sẽ không còn nhận diện được KH từ tên/địa chỉ này.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        await client.delete(`/company-aliases/${id}`)
        message.success('Đã xóa')
        if (type === 'name') names.reload(); else addrs.reload()
      },
    })
  }

  const openAliasEdit = (row: CompanyAliasRow, type: 'name' | 'address') => {
    setAliasEdit(row); setAliasModal(type)
    aliasForm.setFieldsValue({ external_key: row.external_key, customer_code: row.customer_code, customer_name: row.customer_name })
  }

  // ── Shared table render ───────────────────────────────────────────────────
  const renderAliasTable = (hook: typeof names, type: 'name' | 'address') => (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <Input prefix={<SearchOutlined className="text-slate-400" />}
          placeholder={type === 'name' ? 'Tìm tên công ty OCR...' : 'Tìm địa chỉ OCR...'}
          value={hook.search} onChange={e => { hook.setSearch(e.target.value); hook.setPage(1) }}
          allowClear className="w-80" size="small" />
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-400">{hook.total} entries</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={hook.reload} />
          <Button size="small" type="primary" icon={<PlusOutlined />}
            onClick={() => { setAliasEdit(null); setAliasModal(type); aliasForm.resetFields() }}>
            Thêm
          </Button>
        </div>
      </div>
      <Spin spinning={hook.loading}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-3 py-2.5 text-left">{type === 'name' ? 'Tên công ty OCR' : 'Địa chỉ OCR'}</th>
                <th className="px-3 py-2.5 text-left w-28">Mã KH</th>
                <th className="px-3 py-2.5 text-left">Tên khách hàng</th>
                <th className="px-2 py-2.5 text-center w-20">Nguồn</th>
                <th className="px-2 py-2.5 text-center w-32">Cập nhật</th>
                <th className="px-2 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {hook.data.map(row => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                  <td className="px-3 py-2">
                    <div className="text-slate-800 font-medium">{row.external_key}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{row.external_normalized}</div>
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-blue-700">{row.customer_code}</td>
                  <td className="px-3 py-2 text-slate-700">{row.customer_name}</td>
                  <td className="px-2 py-2 text-center">
                    <Tag color={row.source === 'auto_learn' ? 'green' : 'blue'} className="text-[10px]">
                      {row.source === 'auto_learn' ? 'Tự học' : 'Thủ công'}
                    </Tag>
                  </td>
                  <td className="px-2 py-2 text-center text-[10px] text-slate-400">
                    {new Date(row.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100">
                      <button className="text-[10px] text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
                        onClick={() => openAliasEdit(row, type)}>Sửa</button>
                      <Tooltip title="Xóa"><button className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50"
                        onClick={() => deleteAlias(row.id, type, row.external_key)}><DeleteOutlined /></button></Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {!hook.loading && hook.data.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">
                  {type === 'name'
                    ? 'Chưa có. Tự học khi kế toán chọn KH trong đơn hàng.'
                    : 'Chưa có alias địa chỉ.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Spin>
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>{hook.total} entries · trang {hook.page}/{Math.ceil(hook.total / PAGE) || 1}</span>
        <div className="flex gap-1">
          <Button size="small" disabled={hook.page <= 1} onClick={() => hook.setPage(p => p - 1)}>← Trước</Button>
          <Button size="small" disabled={hook.page * PAGE >= hook.total} onClick={() => hook.setPage(p => p + 1)}>Tiếp →</Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold text-gray-800 flex items-center gap-2"><TeamOutlined />Mapping Khách hàng</h1>
      </div>

      {/* Compact info strip */}
      <div className="flex gap-2 mb-4">
        {[
          { icon: <SafetyCertificateOutlined className="text-emerald-500" />, label: 'MST', desc: 'Chính xác nhất', color: 'border-emerald-200 bg-emerald-50' },
          { icon: <ApartmentOutlined className="text-blue-500" />, label: 'Tên công ty', desc: 'Tự học', color: 'border-blue-200 bg-blue-50' },
          { icon: <HomeOutlined className="text-amber-500" />, label: 'Địa chỉ', desc: 'Phụ trợ', color: 'border-amber-200 bg-amber-50' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 border rounded px-3 py-1.5 text-xs ${s.color}`}>
            {s.icon}<span className="font-semibold text-slate-700">{s.label}</span><span className="text-slate-400">— {s.desc}</span>
          </div>
        ))}
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'mst',
          label: <span><SafetyCertificateOutlined className="mr-1 text-emerald-500" />MST ({mst.total})</span>,
          children: (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Tìm MST, mã KH, tên KH..."
                  value={mst.search} onChange={e => { mst.setSearch(e.target.value); mst.setPage(1) }}
                  allowClear className="w-80" size="small" />
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-slate-400">{mst.total} entries</span>
                  <Button size="small" icon={<ReloadOutlined />} onClick={mst.reload} />
                  <Button size="small" type="primary" icon={<PlusOutlined />}
                    onClick={() => { setMstEdit(null); mstForm.resetFields(); setMstModal(true) }}>
                    Thêm MST
                  </Button>
                </div>
              </div>
              <Spin spinning={mst.loading}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="px-3 py-2.5 text-left w-36">Mã số thuế (MST)</th>
                        <th className="px-3 py-2.5 text-left w-28">Mã KH</th>
                        <th className="px-3 py-2.5 text-left">Tên khách hàng</th>
                        <th className="px-3 py-2.5 text-left w-32">Điện thoại</th>
                        <th className="px-3 py-2.5 text-left">Ghi chú</th>
                        <th className="px-2 py-2.5 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {mst.data.map(row => (
                        <tr key={row.tax_code} className="border-b border-slate-100 hover:bg-slate-50 group">
                          <td className="px-3 py-2 font-mono font-bold text-emerald-700">{row.tax_code}</td>
                          <td className="px-3 py-2 font-mono font-semibold text-blue-700">{row.customer_code}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">{row.customer_name}</td>
                          <td className="px-3 py-2 text-slate-500">{row.customer_phone || '—'}</td>
                          <td className="px-3 py-2 text-slate-400 italic">{row.notes || '—'}</td>
                          <td className="px-2 py-2">
                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100">
                              <button className="text-[10px] text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
                                onClick={() => { setMstEdit(row); mstForm.setFieldsValue(row); setMstModal(true) }}>Sửa</button>
                              <Tooltip title="Xóa MST mapping">
                                <button className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50"
                                  onClick={() => deleteMst(row.tax_code)}><DeleteOutlined /></button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!mst.loading && mst.data.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-10 text-slate-400">
                          Chưa có MST mapping. Được tạo tự động khi seed data hoặc thêm thủ công.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Spin>
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{mst.total} entries · trang {mst.page}/{Math.ceil(mst.total / PAGE) || 1}</span>
                <div className="flex gap-1">
                  <Button size="small" disabled={mst.page <= 1} onClick={() => mst.setPage(p => p - 1)}>← Trước</Button>
                  <Button size="small" disabled={mst.page * PAGE >= mst.total} onClick={() => mst.setPage(p => p + 1)}>Tiếp →</Button>
                </div>
              </div>
            </div>
          ),
        },
        {
          key: 'name',
          label: <span><ApartmentOutlined className="mr-1 text-blue-500" />Tên công ty ({names.total})</span>,
          children: renderAliasTable(names, 'name'),
        },
        {
          key: 'address',
          label: <span><HomeOutlined className="mr-1 text-amber-500" />Địa chỉ ({addrs.total})</span>,
          children: renderAliasTable(addrs, 'address'),
        },
      ]} />

      {/* MST Modal */}
      <Modal open={mstModal} title={mstEdit ? 'Sửa MST Mapping' : 'Thêm MST Mapping'}
        onCancel={() => { setMstModal(false); mstForm.resetFields(); setMstEdit(null) }}
        onOk={saveMst} okText={mstEdit ? 'Cập nhật' : 'Thêm'} width={480} centered>
        <Form form={mstForm} layout="vertical" className="mt-3">
          <Form.Item label="Mã số thuế (MST)" name="tax_code" rules={[{ required: true, message: 'Nhập MST' }]}>
            <Input placeholder="0123456789" disabled={!!mstEdit} />
          </Form.Item>
          <Form.Item label="Mã khách hàng" name="customer_code" rules={[{ required: true, message: 'Nhập mã KH' }]} extra="Mã phải tồn tại trong danh sách khách hàng">
            <Input placeholder="KH70000401" />
          </Form.Item>
          <Form.Item label="Ghi chú" name="notes">
            <Input.TextArea rows={2} placeholder="Tuỳ chọn" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Company Alias Modal */}
      <Modal open={!!aliasModal}
        title={aliasModal === 'name' ? (aliasEdit ? 'Sửa alias tên công ty' : 'Thêm alias tên công ty') : (aliasEdit ? 'Sửa alias địa chỉ' : 'Thêm alias địa chỉ')}
        onCancel={() => { setAliasModal(null); aliasForm.resetFields(); setAliasEdit(null) }}
        onOk={saveAlias} okText={aliasEdit ? 'Cập nhật' : 'Thêm'} width={520} centered>
        <Form form={aliasForm} layout="vertical" className="mt-3">
          <Form.Item
            label={aliasModal === 'name' ? 'Tên công ty OCR (text gốc từ PDF)' : 'Địa chỉ OCR (text gốc từ PDF)'}
            name="external_key" rules={[{ required: true }]}>
            <Input placeholder={aliasModal === 'name' ? 'VD: CTY TNHH DV EB' : 'VD: 828A Xô Viết Nghệ Tĩnh...'} />
          </Form.Item>
          <Form.Item label="Mã khách hàng" name="customer_code" rules={[{ required: true }]} extra="Mã KH tương ứng">
            <Input placeholder="KH70000401" />
          </Form.Item>
          <Form.Item label="Tên khách hàng (tham khảo)" name="customer_name">
            <Input placeholder="Tuỳ chọn — chỉ để hiển thị" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
