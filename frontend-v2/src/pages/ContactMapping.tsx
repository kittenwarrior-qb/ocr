import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Input, Modal, Form, Select, message, Spin, Tooltip, Tag } from 'antd'
import { SearchOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, ContactsOutlined } from '@ant-design/icons'
import client from '@/api/client'
import { fetchContacts } from '@/utils/catalogStore'

interface AliasRow {
  id: string
  external_key: string
  external_normalized: string
  contact_code: string
  contact_name: string
  alias_type: string
  source: string
  updated_at: string
}

const PAGE = 50

const TYPE_LABELS: Record<string, string> = {
  name: 'Tên liên hệ',
  phone: 'Số điện thoại',
  organization: 'Tên công ty',
}

export default function ContactMappingPage() {
  const [data, setData] = useState<AliasRow[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AliasRow | null>(null)
  const [form] = Form.useForm()
  const [contactOptions, setContactOptions] = useState<{ label: string; value: string }[]>([])
  const [contactSearch, setContactSearch] = useState('')

  const load = useCallback(async (q: string, p: number, t: string) => {
    setLoading(true)
    try {
      const { data: res } = await client.get('/contact-aliases', {
        params: { search: q, alias_type: t, skip: (p - 1) * PAGE, limit: PAGE },
      })
      setData(res.items); setTotal(res.total)
    } catch { message.error('Tải thất bại') }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search, page, typeFilter), 300)
    return () => clearTimeout(t)
  }, [search, page, typeFilter, load])

  // Load contact options for dropdown
  useEffect(() => {
    fetchContacts(contactSearch, 0, 50).then(r => {
      setContactOptions(r.items.map(c => ({
        value: c.code,
        label: `${c.name}${c.organization ? ` (${c.organization})` : ''} — ${c.code}`,
      })))
    }).catch(() => {})
  }, [contactSearch])

  const reload = () => load(search, page, typeFilter)

  const commitSave = async (v: any) => {
    try {
      await client.post('/contact-aliases', { ...v, source: editing?.source || 'manual' })
      message.success('Đã lưu')
      setModalOpen(false); form.resetFields(); setEditing(null); reload()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Lỗi') }
  }

  // Yêu cầu xem lại trước khi lưu — alias liên hệ sai sẽ khiến OCR ghép nhầm
  // người nhận hàng/địa chỉ giao cho các đơn sau này.
  const save = async () => {
    const v = await form.validateFields()
    const typeLabel = TYPE_LABELS[v.alias_type] || v.alias_type
    Modal.confirm({
      title: 'Xác nhận mapping liên hệ',
      content: (
        <div className="text-sm space-y-1">
          <div>Khi OCR gặp {typeLabel.toLowerCase()} <strong>"{v.external_key}"</strong>, hệ thống sẽ tự động gán thành liên hệ:</div>
          <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-1">
            <span className="font-mono font-bold text-blue-700">{v.contact_code}</span>
            {v.contact_name ? <span className="text-slate-600 ml-2">— {v.contact_name}</span> : null}
          </div>
          <div className="text-xs text-slate-500 mt-1">Kiểm tra kỹ trước khi xác nhận — mapping sai sẽ ảnh hưởng đến việc nhận diện người nhận hàng/địa chỉ giao của các đơn sau này.</div>
        </div>
      ),
      okText: 'Xác nhận lưu', cancelText: 'Xem lại', width: 480,
      onOk: () => commitSave(v),
    })
  }

  const del = (row: AliasRow) => {
    Modal.confirm({
      title: 'Xóa alias liên hệ?',
      content: `"${row.external_key}" → ${row.contact_name || row.contact_code} sẽ bị xóa.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        await client.delete(`/contact-aliases/${row.id}`)
        message.success('Đã xóa'); reload()
      },
    })
  }

  const openEdit = (row: AliasRow) => {
    setEditing(row)
    form.setFieldsValue({ external_key: row.external_key, contact_code: row.contact_code, contact_name: row.contact_name, alias_type: row.alias_type })
    setModalOpen(true)
  }

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <ContactsOutlined />Mapping Người liên hệ
        </h1>
      </div>

      <div className="flex gap-2 mb-4 text-xs">
        <div className="border border-violet-200 bg-violet-50 rounded px-3 py-1.5 text-slate-600">
          <span className="font-semibold text-violet-700">Tên</span> — map tên người liên hệ từ PDF → liên hệ trong hệ thống
        </div>
        <div className="border border-blue-200 bg-blue-50 rounded px-3 py-1.5 text-slate-600">
          <span className="font-semibold text-blue-700">SĐT</span> — map số điện thoại → liên hệ
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded px-3 py-1.5 text-slate-600">
          <span className="font-semibold text-amber-700">Công ty</span> — map tên tổ chức → liên hệ
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <Input
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Tìm tên OCR, mã LH, tên LH..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            allowClear className="w-72" size="small"
          />
          <Select
            value={typeFilter || undefined}
            placeholder="Loại alias"
            allowClear
            size="small"
            className="w-36"
            onChange={v => { setTypeFilter(v || ''); setPage(1) }}
            options={[
              { value: 'name', label: 'Tên liên hệ' },
              { value: 'phone', label: 'Số điện thoại' },
              { value: 'organization', label: 'Tên công ty' },
            ]}
          />
          <div className="flex gap-2 items-center ml-auto">
            <span className="text-xs text-slate-400">{total} entries</span>
            <Button size="small" icon={<ReloadOutlined />} onClick={reload} />
            <Button size="small" type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true) }}>
              Thêm
            </Button>
          </div>
        </div>

        <Spin spinning={loading}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="px-3 py-2.5 text-left">Text OCR / PDF</th>
                  <th className="px-3 py-2.5 text-left w-28">Mã LH</th>
                  <th className="px-3 py-2.5 text-left">Tên người liên hệ</th>
                  <th className="px-2 py-2.5 text-center w-24">Loại</th>
                  <th className="px-2 py-2.5 text-center w-20">Nguồn</th>
                  <th className="px-2 py-2.5 text-center w-32">Cập nhật</th>
                  <th className="px-2 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                    <td className="px-3 py-2">
                      <div className="text-slate-800 font-medium">{row.external_key}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{row.external_normalized}</div>
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-violet-700">{row.contact_code}</td>
                    <td className="px-3 py-2 text-slate-700">{row.contact_name || '—'}</td>
                    <td className="px-2 py-2 text-center">
                      <Tag color={row.alias_type === 'name' ? 'purple' : row.alias_type === 'phone' ? 'blue' : 'orange'} className="text-[10px]">
                        {TYPE_LABELS[row.alias_type] || row.alias_type}
                      </Tag>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Tag color={row.source === 'auto_learn' ? 'green' : 'default'} className="text-[10px]">
                        {row.source === 'auto_learn' ? 'Tự học' : 'Thủ công'}
                      </Tag>
                    </td>
                    <td className="px-2 py-2 text-center text-[10px] text-slate-400">
                      {row.updated_at ? new Date(row.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100">
                        <button className="text-[10px] text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50" onClick={() => openEdit(row)}>Sửa</button>
                        <Tooltip title="Xóa">
                          <button className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50" onClick={() => del(row)}>
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && data.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">
                    Chưa có alias liên hệ. Thêm thủ công hoặc tự học khi chọn liên hệ trong đơn hàng.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Spin>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{total} entries · trang {page}/{Math.ceil(total / PAGE) || 1}</span>
          <div className="flex gap-1">
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</Button>
            <Button size="small" disabled={page * PAGE >= total} onClick={() => setPage(p => p + 1)}>Tiếp →</Button>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Sửa alias liên hệ' : 'Thêm alias liên hệ'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditing(null) }}
        onOk={save}
        okText={editing ? 'Cập nhật' : 'Thêm'}
        width={520}
        centered
      >
        <Form form={form} layout="vertical" className="mt-3">
          <Form.Item
            label="Loại alias"
            name="alias_type"
            initialValue="name"
            rules={[{ required: true }]}
          >
            <Select options={[
              { value: 'name', label: 'Tên người liên hệ' },
              { value: 'phone', label: 'Số điện thoại' },
              { value: 'organization', label: 'Tên công ty / tổ chức' },
            ]} />
          </Form.Item>
          <Form.Item
            label="Text từ OCR/PDF"
            name="external_key"
            rules={[{ required: true, message: 'Nhập text từ PDF' }]}
            extra="Text gốc xuất hiện trong file PDF/Excel"
          >
            <Input placeholder="VD: Trần Văn A hoặc 0901234567" />
          </Form.Item>
          <Form.Item
            label="Người liên hệ trong hệ thống"
            name="contact_code"
            rules={[{ required: true, message: 'Chọn người liên hệ' }]}
          >
            <Select
              showSearch
              placeholder="Tìm người liên hệ..."
              filterOption={false}
              onSearch={setContactSearch}
              options={contactOptions}
              notFoundContent="Không tìm thấy"
            />
          </Form.Item>
          <Form.Item label="Tên liên hệ (hiển thị)" name="contact_name">
            <Input placeholder="Tuỳ chọn" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
