import { useEffect, useState, useRef } from 'react'
import { Input, Table, Button, Modal, Form, Row, Col, Select, message, Tooltip, Space, Popconfirm } from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchContacts, fetchCustomers, type Contact } from '@/utils/catalogStore'
import { createMisaContact, updateMisaContact, deleteMisaContact, getMisaContactByCode, getMisaCategories, type MisaCategories, syncMisa, isOk, isMisaOk, firstError } from '@/api/misa'
import Section from '@/components/FormSection'
import { NV_OPTIONS } from '@/config/salespersons'

const SALUTATION_OPTIONS = [
  { label: 'Anh', value: 'Anh' },
  { label: 'Chị', value: 'Chị' },
  { label: 'Ông', value: 'Ông' },
  { label: 'Bà', value: 'Bà' },
]

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  // ── Select khách hàng (Tổ chức) — tìm kiếm server-side, có debounce ──────────
  const [custOptions, setCustOptions] = useState<{ value: string; label: string }[]>([])
  const [custFetching, setCustFetching] = useState(false)
  const custTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const loadCustomers = async (kw = '', seed?: { value: string; label: string }) => {
    setCustFetching(true)
    try {
      const r = await fetchCustomers(kw, 0, 30)
      const opts = r.items.map(c => ({ value: c.code, label: `${c.code} — ${c.name}` }))
      if (seed && seed.value && !opts.some(o => o.value === seed.value)) opts.unshift(seed)
      setCustOptions(opts)
    } finally {
      setCustFetching(false)
    }
  }

  const searchCustomers = (kw: string) => {
    clearTimeout(custTimer.current)
    custTimer.current = setTimeout(() => loadCustomers(kw), 350)
  }

  // ── Danh mục MISA (chức danh, tỉnh/TP) — bắt buộc khớp danh mục ───────────────
  const [cats, setCats] = useState<MisaCategories | null>(null)
  const opt = (arr?: string[]) => (arr || []).map(x => ({ value: x, label: x }))
  useEffect(() => { getMisaCategories().then(setCats).catch(() => {}) }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetchContacts(debouncedSearch, (page - 1) * pageSize, pageSize)
      setData(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [debouncedSearch, page, pageSize])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setCustOptions([])
    loadCustomers('')
    setModalOpen(true)
  }

  const openEdit = (c: Contact) => {
    setEditing(c)
    const orgValue = c.customer_code || c.organization || ''
    form.setFieldsValue({
      salutation: c.title,
      contact_name: c.name,
      contact_code: c.code,
      title: c.job_title,
      account_name: orgValue || undefined,
      mobile: c.phone || c.phone_work,
      office_email: c.email || c.email_personal,
      mailing_province: c.city,
      mailing_district: c.district,
      mailing_street: c.address,
    })
    setCustOptions([])
    loadCustomers('', orgValue ? { value: orgValue, label: c.customer_name ? `${c.customer_code} — ${c.customer_name}` : orgValue } : undefined)
    setModalOpen(true)
    // NVBH (custom_field14) không có trong danh sách → lấy từ chi tiết MISA
    getMisaContactByCode(c.code).then(d => {
      if (d) form.setFieldsValue({ custom_field14: d.custom_field14 || undefined })
    }).catch(() => {})
  }

  const closeModal = () => { setModalOpen(false); setEditing(null); form.resetFields() }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      if (editing) {
        const res = await updateMisaContact({ ...values, contact_code: editing.code })
        if (isMisaOk(res)) {
          message.success('Cap nhat lien he thanh cong, dang dong bo du lieu...')
          await syncMisa('contacts')
          closeModal()
          load()
        } else {
          message.error(firstError(res))
        }
      } else {
        const res = await createMisaContact(values)
        if (isOk(res)) {
          message.success('Tao lien he thanh cong, dang dong bo du lieu...')
          await syncMisa('contacts')
          closeModal()
          load()
        } else {
          message.error(firstError(res))
        }
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.message || 'Không thể kết nối MISA')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (c: Contact) => {
    setDeleting(c.code)
    try {
      const res = await deleteMisaContact(c.code)
      if (isMisaOk(res)) {
        message.success('Xoa lien he thanh cong, dang dong bo du lieu...')
        await syncMisa('contacts')
        load()
      } else {
        message.error(firstError(res))
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || e?.message || 'Không thể kết nối MISA')
    } finally {
      setDeleting(null)
    }
  }

  const columns: ColumnsType<Contact> = [
    { title: 'Mã LH', dataIndex: 'code', width: 110, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Họ và tên', dataIndex: 'name', width: 180, ellipsis: true },
    { title: 'Công ty', dataIndex: 'organization', width: 240, ellipsis: true },
    { title: 'Chức danh', dataIndex: 'job_title', width: 150, ellipsis: true },
    { title: 'SĐT', dataIndex: 'phone', width: 130, render: (_: string, r) => r.phone || r.phone_work || '—' },
    { title: 'Email', dataIndex: 'email', width: 220, ellipsis: true, render: (_: string, r) => r.email || r.email_personal || '—' },
    { title: 'Địa chỉ giao hàng', dataIndex: 'delivery_address', width: 300, ellipsis: true, render: (_: string, r) => r.delivery_address || r.address || '—' },
    { title: 'Tỉnh/TP', dataIndex: 'city', width: 130 },
    { title: 'Chủ sở hữu', dataIndex: 'owner', width: 160, ellipsis: true },
    {
      title: 'Thao tác', key: 'actions', width: 110, fixed: 'right', align: 'center',
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tooltip title="Sửa">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title="Xóa liên hệ này?"
            description={`${r.code} — ${r.name}`}
            okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r)}
          >
            <Tooltip title="Xóa">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={deleting === r.code} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm tên, công ty, SĐT..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-72"
          allowClear
        />
        <div className="flex-1" />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Thêm mới
        </Button>
        <Tooltip title="Đồng bộ & tải lại từ MISA">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={async () => {
            try { await syncMisa('contacts') } catch {}
            load()
          }}>
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>

      <Table<Contact>
        columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} liên hệ`, size: 'small' }}
        scroll={{ x: 1560, y: 'calc(100vh - 210px)' }} className="border border-gray-200 rounded-lg"
      />

      <Modal
        title={editing ? `Sửa liên hệ — ${editing.code}` : 'Thêm liên hệ mới'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={editing ? 'Lưu' : 'Tạo'}
        cancelText="Hủy"
        confirmLoading={submitting}
        width={720}
        destroyOnClose
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="horizontal"
          labelAlign="left"
          labelCol={{ flex: '96px' }}
          wrapperCol={{ flex: 'auto' }}
          colon={false}
          size="small"
          className="mt-3 [&_.ant-form-item]:!mb-2.5 [&_.ant-form-item-label>label]:!text-gray-600"
        >
          <Section>Thông tin chung</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="contact_code" label="Mã LH">
                <Input placeholder="Tự động nếu để trống" disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="salutation" label="Xưng hô">
                <Select options={SALUTATION_OPTIONS} placeholder="Anh/Chị" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="contact_name" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="title" label="Chức danh">
                <Select showSearch allowClear placeholder="Chọn chức danh" options={opt(cats?.titles)} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mobile" label="Di động">
                <Input placeholder="0901 234 567" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="account_name" label="Tổ chức">
                <Select
                  showSearch
                  allowClear
                  placeholder="Chọn khách hàng..."
                  options={custOptions}
                  filterOption={false}
                  onSearch={searchCustomers}
                  loading={custFetching}
                  notFoundContent={custFetching ? 'Đang tải...' : 'Không tìm thấy KH'}
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="office_email" label="Email">
                <Input placeholder="name@company.vn" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="custom_field14" label="NV bán hàng">
            <Select showSearch allowClear placeholder="Chọn nhân viên bán hàng" options={NV_OPTIONS} optionFilterProp="label" />
          </Form.Item>

          <Section>Địa chỉ</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="mailing_province" label="Tỉnh/TP">
                <Select showSearch allowClear placeholder="Chọn tỉnh/TP" options={opt(cats?.provinces)} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mailing_district" label="Quận/Huyện">
                <Input placeholder="Đống Đa" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="mailing_street" label="Đ/chỉ">
            <Input placeholder="Số 1 Đường Láng" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
