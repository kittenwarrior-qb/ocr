import { useState, useEffect, useCallback } from 'react'
import { Button, Input, Modal, Form, message, Spin, Upload, Tooltip, Tag, Tabs, Popconfirm } from 'antd'
import {
  PlusOutlined, DeleteOutlined, SearchOutlined, UploadOutlined,
  DownloadOutlined, ReloadOutlined, RobotOutlined, ImportOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import client from '@/api/client'
import { reloadAliases } from '@/utils/catalogStore'

interface TempMapping {
  id: string
  temp_code: string
  ocr_name: string
  product_code: string
  product_name: string
  status: string
  usage_count: number
  last_used_at: string
}

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

const SOURCE_COLOR: Record<string, string> = { manual: 'blue', auto_learn: 'green', import: 'orange' }
const SOURCE_LABEL: Record<string, string> = { manual: 'Thủ công', auto_learn: 'Tự học', import: 'Import' }
const PAGE_SIZE = 50

export default function ProductMappingPage() {
  const [activeTab, setActiveTab] = useState<'history' | 'aliases'>('history')

  // ── Tab 1: TempCodeMapping (history) ──────────────────────────────────────
  const [tempData, setTempData] = useState<TempMapping[]>([])
  const [tempTotal, setTempTotal] = useState(0)
  const [tempSearch, setTempSearch] = useState('')
  const [tempPage, setTempPage] = useState(1)
  const [tempLoading, setTempLoading] = useState(false)

  const loadTemp = useCallback(async (q: string, p: number) => {
    setTempLoading(true)
    try {
      const { data } = await client.get('/sku-aliases/temp-mappings', {
        params: { search: q, skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE },
      })
      setTempData(data.items)
      setTempTotal(data.total)
    } catch { message.error('Tải thất bại') }
    setTempLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab !== 'history') return
    const t = setTimeout(() => loadTemp(tempSearch, tempPage), 300)
    return () => clearTimeout(t)
  }, [tempSearch, tempPage, activeTab, loadTemp])

  // ── Tab 2: SkuAlias (manual/learned) ──────────────────────────────────────
  const [aliasData, setAliasData] = useState<SkuAlias[]>([])
  const [aliasTotal, setAliasTotal] = useState(0)
  const [aliasSearch, setAliasSearch] = useState('')
  const [aliasPage, setAliasPage] = useState(1)
  const [aliasLoading, setAliasLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<SkuAlias | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [importLoading, setImportLoading] = useState(false)

  const loadAlias = useCallback(async (q: string, p: number) => {
    setAliasLoading(true)
    try {
      const { data } = await client.get('/sku-aliases', {
        params: { search: q, skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE },
      })
      setAliasData(data.items)
      setAliasTotal(data.total)
    } catch { message.error('Tải thất bại') }
    setAliasLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab !== 'aliases') return
    const t = setTimeout(() => loadAlias(aliasSearch, aliasPage), 300)
    return () => clearTimeout(t)
  }, [aliasSearch, aliasPage, activeTab, loadAlias])

  const handleSaveAlias = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await client.post('/sku-aliases', { ...values, source: editItem?.source || 'manual' })
      message.success(editItem ? 'Đã cập nhật' : 'Đã thêm')
      setAddOpen(false); setEditItem(null); form.resetFields()
      loadAlias(aliasSearch, aliasPage); reloadAliases()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Lưu thất bại') }
    setSaving(false)
  }

  const handleDeleteAlias = (id: string, label: string) => {
    Modal.confirm({
      title: 'Xóa SKU alias?',
      content: `"${label}" sẽ bị xóa. Lần sau OCR sẽ không tự nhận diện được sản phẩm này nữa.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await client.delete(`/sku-aliases/${id}`)
          message.success('Đã xóa'); loadAlias(aliasSearch, aliasPage); reloadAliases()
        } catch { message.error('Xóa thất bại') }
      },
    })
  }

  const handleImport = async (file: File) => {
    setImportLoading(true)
    const fd = new FormData(); fd.append('file', file)
    try {
      const { data } = await client.post('/sku-aliases/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      message.success(`Đã import ${data.imported} alias`)
      loadAlias(aliasSearch, 1); setAliasPage(1); reloadAliases()
    } catch (e: any) { message.error(e?.response?.data?.detail || 'Import thất bại') }
    setImportLoading(false); return false
  }

  const handleDeleteTemp = (id: string, label: string) => {
    Modal.confirm({
      title: 'Xóa khỏi lịch sử mapping?',
      content: `"${label}" sẽ bị xóa. Kết quả mapping này sẽ không còn được ghi nhớ.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await client.delete(`/sku-aliases/temp/${id}`)
          message.success('Đã xóa'); loadTemp(tempSearch, tempPage)
        } catch { message.error('Xóa thất bại') }
      },
    })
  }

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold text-gray-800 flex items-center gap-2"><SwapOutlined />Mapping hàng hóa</h1>
      </div>

      <Tabs activeKey={activeTab} onChange={k => setActiveTab(k as any)} items={[
        {
          key: 'history',
          label: `Lịch sử (${tempTotal})`,
          children: (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Tìm mã OCR, mã hàng..."
                  value={tempSearch} onChange={e => { setTempSearch(e.target.value); setTempPage(1) }}
                  allowClear className="w-72" size="small" />
                <Button size="small" icon={<ReloadOutlined />} onClick={() => loadTemp(tempSearch, tempPage)} />
                <span className="ml-auto text-xs text-slate-400">{tempTotal} entries</span>
              </div>
              <Spin spinning={tempLoading}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="px-3 py-2 text-left">Mã OCR</th>
                        <th className="px-3 py-2 text-left">Tên OCR</th>
                        <th className="px-3 py-2 text-left w-28">Mã hàng hóa</th>
                        <th className="px-3 py-2 text-left">Tên hàng hóa</th>
                        <th className="px-2 py-2 text-center w-20">Trạng thái</th>
                        <th className="px-2 py-2 text-center w-14">Dùng</th>
                        <th className="px-2 py-2 text-center w-28">Lần cuối</th>
                        <th className="px-2 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {tempData.map(row => (
                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                          <td className="px-3 py-1.5 font-mono text-slate-600 text-[11px]">{row.temp_code}</td>
                          <td className="px-3 py-1.5 text-slate-800 font-medium">{row.ocr_name || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{row.product_code || <span className="text-red-400 font-normal">Chưa map</span>}</td>
                          <td className="px-3 py-1.5 text-slate-600">{row.product_name || '—'}</td>
                          <td className="px-2 py-1.5 text-center">
                            <Tag color={row.status === 'mapped' ? 'green' : 'orange'} className="text-[10px] m-0">{row.status === 'mapped' ? 'Đã map' : 'Chờ'}</Tag>
                          </td>
                          <td className="px-2 py-1.5 text-center text-slate-500">{row.usage_count}</td>
                          <td className="px-2 py-1.5 text-center text-slate-400 text-[10px]">{new Date(row.last_used_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
                          <td className="px-2 py-1.5 text-center opacity-0 group-hover:opacity-100">
                            <Tooltip title="Xóa"><button className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1 py-0.5 hover:bg-red-50" onClick={() => handleDeleteTemp(row.id, row.ocr_name || row.temp_code)}><DeleteOutlined /></button></Tooltip>
                          </td>
                        </tr>
                      ))}
                      {!tempLoading && tempData.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">Chưa có dữ liệu</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Spin>
              <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{tempTotal} entries · trang {tempPage}/{Math.ceil(tempTotal / PAGE_SIZE) || 1}</span>
                <div className="flex gap-1">
                  <Button size="small" disabled={tempPage <= 1} onClick={() => setTempPage(p => p - 1)}>←</Button>
                  <Button size="small" disabled={tempPage * PAGE_SIZE >= tempTotal} onClick={() => setTempPage(p => p + 1)}>→</Button>
                </div>
              </div>
            </div>
          ),
        },
        {
          key: 'aliases',
          label: `SKU Alias (${aliasTotal})`,
          children: (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Tìm tên OCR, mã hàng..."
                  value={aliasSearch} onChange={e => { setAliasSearch(e.target.value); setAliasPage(1) }}
                  allowClear className="w-72" size="small" />
                <Upload accept=".csv,.json" showUploadList={false} beforeUpload={handleImport}>
                  <Button icon={<UploadOutlined />} loading={importLoading} size="small">Import</Button>
                </Upload>
                <Button icon={<DownloadOutlined />} size="small" onClick={() => { const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, ''); window.open(`${base}/sku-aliases/export`, '_blank') }}>Export</Button>
                <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => { setEditItem(null); form.resetFields(); setAddOpen(true) }}>Thêm</Button>
                <span className="ml-auto text-xs text-slate-400">{aliasTotal} entries</span>
              </div>
              <Spin spinning={aliasLoading}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="px-3 py-2 text-left">Tên/SKU trên PDF</th>
                        <th className="px-3 py-2 text-left w-24">Mã KH</th>
                        <th className="px-3 py-2 text-left w-28">Mã hàng hóa</th>
                        <th className="px-3 py-2 text-left">Tên hàng hóa</th>
                        <th className="px-2 py-2 text-center w-20">Nguồn</th>
                        <th className="px-2 py-2 text-center w-28">Cập nhật</th>
                        <th className="px-2 py-2 w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {aliasData.map(row => (
                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                          <td className="px-3 py-1.5">
                            <div className="font-medium text-slate-800">{row.external_key}</div>
                            <div className="text-[10px] font-mono text-slate-400">{row.external_normalized}</div>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{row.customer_code || <span className="text-slate-300 text-[10px]">tất cả</span>}</td>
                          <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{row.product_code}</td>
                          <td className="px-3 py-1.5 text-slate-600">{row.product_name || '—'}</td>
                          <td className="px-2 py-1.5 text-center"><Tag color={SOURCE_COLOR[row.source] || 'default'} className="text-[10px] m-0">{SOURCE_LABEL[row.source] || row.source}</Tag></td>
                          <td className="px-2 py-1.5 text-center text-[10px] text-slate-400">{new Date(row.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100">
                              <button className="text-[10px] text-blue-500 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50" onClick={() => { setEditItem(row); form.setFieldsValue({ external_key: row.external_key, customer_code: row.customer_code, product_code: row.product_code, product_name: row.product_name, note: row.note }); setAddOpen(true) }}>Sửa</button>
                              <Tooltip title="Xóa"><button className="text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50" onClick={() => handleDeleteAlias(row.id, row.external_key)}><DeleteOutlined /></button></Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!aliasLoading && aliasData.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">Chưa có alias. Tự học khi kế toán bấm ✓, hoặc thêm thủ công.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Spin>
              <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{aliasTotal} entries · trang {aliasPage}/{Math.ceil(aliasTotal / PAGE_SIZE) || 1}</span>
                <div className="flex gap-1">
                  <Button size="small" disabled={aliasPage <= 1} onClick={() => setAliasPage(p => p - 1)}>←</Button>
                  <Button size="small" disabled={aliasPage * PAGE_SIZE >= aliasTotal} onClick={() => setAliasPage(p => p + 1)}>→</Button>
                </div>
              </div>
            </div>
          ),
        },
      ]} />

      <Modal open={addOpen} title={editItem ? 'Sửa alias' : 'Thêm alias'} onCancel={() => { setAddOpen(false); setEditItem(null); form.resetFields() }}
        onOk={handleSaveAlias} okText={editItem ? 'Cập nhật' : 'Thêm'} confirmLoading={saving} width={480} centered>
        <Form form={form} layout="vertical" size="middle" className="mt-3">
          <Form.Item label="Tên/SKU trên PDF" name="external_key" rules={[{ required: true }]}>
            <Input placeholder="VD: 3447920-2 Nuoc t.khiet Satori 500ml" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item label="Mã khách hàng (tuỳ chọn)" name="customer_code">
              <Input placeholder="KH70000401 (để trống = tất cả)" />
            </Form.Item>
            <Form.Item label="Mã hàng hóa" name="product_code" rules={[{ required: true }]}>
              <Input placeholder="TP-00003NC" />
            </Form.Item>
          </div>
          <Form.Item label="Tên hàng hóa" name="product_name">
            <Input placeholder="Tuỳ chọn" />
          </Form.Item>
          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
