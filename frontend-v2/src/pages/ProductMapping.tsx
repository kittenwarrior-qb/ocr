import { useState, useEffect, useCallback } from 'react'
import { Button, Input, Modal, Form, message, Spin, Upload, Tooltip, Tag } from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, UploadOutlined,
  DownloadOutlined, ReloadOutlined, RobotOutlined, ImportOutlined,
} from '@ant-design/icons'
import client from '@/api/client'
import { reloadAliases } from '@/utils/catalogStore'

interface SkuAlias {
  id: string
  external_key: string
  external_normalized: string
  customer_code: string
  product_code: string
  product_name: string
  contact_code: string
  source: string
  note: string
  created_at: string
  updated_at: string
}

const SOURCE_COLOR: Record<string, string> = {
  manual: 'blue',
  auto_learn: 'green',
  import: 'orange',
}
const SOURCE_LABEL: Record<string, string> = {
  manual: 'Thủ công',
  auto_learn: 'Tự học',
  import: 'Import',
}

const PAGE_SIZE = 50

export default function ProductMappingPage() {
  const [data, setData] = useState<SkuAlias[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<SkuAlias | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [importLoading, setImportLoading] = useState(false)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const { data: r } = await client.get('/sku-aliases', {
        params: { search: q, skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE },
      })
      setData(r.items)
      setTotal(r.total)
    } catch { message.error('Tải dữ liệu thất bại') }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search, page), 300)
    return () => clearTimeout(t)
  }, [search, page, load])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await client.post('/sku-aliases', { ...values, source: editItem ? (editItem.source || 'manual') : 'manual', customer_code: values.customer_code || null, contact_code: values.contact_code || null })
      message.success(editItem ? 'Đã cập nhật' : 'Đã thêm')
      setAddOpen(false)
      setEditItem(null)
      form.resetFields()
      load(search, page)
      reloadAliases()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Lưu thất bại') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await client.delete(`/sku-aliases/${id}`)
      message.success('Đã xóa')
      load(search, page)
      reloadAliases()
    } catch { message.error('Xóa thất bại') }
  }

  const handleImport = async (file: File) => {
    setImportLoading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const { data: r } = await client.post('/sku-aliases/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      message.success(`Đã import ${r.imported} alias`)
      load(search, 1)
      setPage(1)
      reloadAliases()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Import thất bại') }
    setImportLoading(false)
    return false
  }

  const handleExport = () => {
    const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
    window.open(`${base}/sku-aliases/export`, '_blank')
  }

  const openEdit = (item: SkuAlias) => {
    setEditItem(item)
    form.setFieldsValue({ external_key: item.external_key, customer_code: item.customer_code, product_code: item.product_code, product_name: item.product_name, contact_code: item.contact_code, note: item.note })
    setAddOpen(true)
  }

  const openAdd = () => {
    setEditItem(null)
    form.resetFields()
    setAddOpen(true)
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Mapping hàng hóa</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Dictionary chuyển đổi tên/SKU trên PDF → mã hàng hóa nội bộ.
            Hệ thống tự học khi kế toán xác nhận mapping trong đơn hàng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<ReloadOutlined />} onClick={() => load(search, page)} size="small">Làm mới</Button>
          <Upload accept=".csv,.json" showUploadList={false} beforeUpload={handleImport}>
            <Button icon={<UploadOutlined />} loading={importLoading} size="small">Import CSV/JSON</Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={handleExport} size="small">Export CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Thêm alias</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Tổng alias', value: total, color: 'text-blue-600' },
          { label: 'Tự học (auto)', value: data.filter(d => d.source === 'auto_learn').length, color: 'text-emerald-600', note: 'trong trang này' },
          { label: 'Thủ công + Import', value: data.filter(d => d.source !== 'auto_learn').length, color: 'text-orange-600', note: 'trong trang này' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}{s.note ? <span className="text-slate-400"> ({s.note})</span> : ''}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <Input
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Tìm theo tên OCR, mã hàng hóa..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            allowClear
            className="w-80"
            size="small"
          />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RobotOutlined className="text-emerald-500" />
            <span>Hệ thống tự động học từ lịch sử mapping kế toán</span>
            <span className="font-medium text-slate-600">{total} alias</span>
          </div>
        </div>

        <Spin spinning={loading}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="px-3 py-2.5 text-left">Tên/SKU trên PDF (external key)</th>
                  <th className="px-3 py-2.5 text-left w-28">Mã KH</th>
                  <th className="px-3 py-2.5 text-left w-32">Mã hàng hóa</th>
                  <th className="px-3 py-2.5 text-left">Tên hàng hóa</th>
                  <th className="px-2 py-2.5 text-center w-24">Nguồn</th>
                  <th className="px-2 py-2.5 text-center w-36">Cập nhật</th>
                  <th className="px-2 py-2.5 text-center w-20"></th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{row.external_key}</div>
                      <div className="text-slate-400 text-[10px] font-mono mt-0.5">{row.external_normalized}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{row.customer_code || <span className="text-slate-300 text-[10px]">tất cả</span>}</td>
                    <td className="px-3 py-2 font-mono font-bold text-blue-700">{row.product_code}</td>
                    <td className="px-3 py-2 text-slate-600">{row.product_name || '—'}</td>
                    <td className="px-2 py-2 text-center">
                      <Tag color={SOURCE_COLOR[row.source] || 'default'} className="text-[10px]">
                        {SOURCE_LABEL[row.source] || row.source}
                      </Tag>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-400">
                      {new Date(row.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 text-[10px]" onClick={() => openEdit(row)}>Sửa</button>
                        <Tooltip title="Xóa alias">
                          <button className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50" onClick={() => handleDelete(row.id)}>
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && data.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                    {search ? `Không tìm thấy "${search}"` : 'Chưa có alias nào. Thêm thủ công hoặc import CSV.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Spin>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{total} alias · trang {page}/{Math.ceil(total / PAGE_SIZE) || 1}</span>
          <div className="flex gap-1">
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</Button>
            <Button size="small" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Tiếp →</Button>
          </div>
        </div>
      </div>

      {/* Import hint */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
        <div className="font-semibold mb-1 flex items-center gap-1"><ImportOutlined /> Format file import (CSV hoặc JSON):</div>
        <div className="font-mono bg-white border border-blue-100 rounded px-3 py-2 text-slate-700">
          CSV: <span className="text-blue-600">external_key,product_code,product_name,note</span><br />
          JSON: <span className="text-blue-600">[{"{"}"external_key":"3447920-2 Nuoc t.khiet...","product_code":"TP-00003NC"{"}"}]</span>
        </div>
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={addOpen}
        title={editItem ? 'Sửa alias' : 'Thêm alias mới'}
        onCancel={() => { setAddOpen(false); setEditItem(null); form.resetFields() }}
        onOk={handleSave}
        okText={editItem ? 'Cập nhật' : 'Thêm'}
        confirmLoading={saving}
        width={560}
        centered
      >
        <Form form={form} layout="vertical" size="middle" className="mt-3">
          <Form.Item
            label="Tên/SKU trên PDF (external key)"
            name="external_key"
            rules={[{ required: true, message: 'Nhập tên OCR/SKU từ PDF' }]}
            extra="Ví dụ: 3447920-2 Nuoc t.khiet Satori 500ml"
          >
            <Input placeholder="Nhập đúng text xuất hiện trong PDF..." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item label="Mã khách hàng (tuỳ chọn)" name="customer_code" extra="Để trống = áp dụng tất cả KH">
              <Input placeholder="KH70000401" />
            </Form.Item>
            <Form.Item label="Mã liên hệ (tuỳ chọn)" name="contact_code">
              <Input placeholder="LH0000051" />
            </Form.Item>
          </div>
          <Form.Item
            label="Mã hàng hóa nội bộ"
            name="product_code"
            rules={[{ required: true, message: 'Nhập mã hàng hóa' }]}
            extra="Ví dụ: TP-00003NC"
          >
            <Input placeholder="TP-XXXXX" />
          </Form.Item>
          <Form.Item label="Tên hàng hóa (tham khảo)" name="product_name">
            <Input placeholder="Tự điền khi chọn từ danh sách (tuỳ chọn)" />
          </Form.Item>
          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea rows={2} placeholder="Ghi chú thêm (tuỳ chọn)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
