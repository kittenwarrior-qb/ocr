import { useEffect, useState } from 'react'
import { Input, Table, Button, Modal, Form, Row, Col, Select, message, Tooltip } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchContacts, type Contact } from '@/utils/catalogStore'
import { createMisaContact, syncMisa, isOk, firstError } from '@/api/misa'

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
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

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

  const handleCreate = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const res = await createMisaContact(values)
      if (isOk(res)) {
        message.success('Tao lien he thanh cong, dang dong bo du lieu...')
        await syncMisa('contacts')
        form.resetFields()
        setModalOpen(false)
        load()
      } else {
        message.error(firstError(res))
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Không thể kết nối MISA')
    } finally {
      setSubmitting(false)
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
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
        scroll={{ x: 1450, y: 'calc(100vh - 210px)' }} className="border border-gray-200 rounded-lg"
      />

      <Modal
        title="Thêm liên hệ mới (MISA)"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={submitting}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="salutation" label="Xưng hô">
                <Select options={SALUTATION_OPTIONS} placeholder="Anh/Chị" allowClear />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item name="contact_name" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
                <Input placeholder="Nguyễn Văn A" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact_code" label="Mã liên hệ">
                <Input placeholder="Tự động nếu để trống" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="title" label="Chức danh">
                <Input placeholder="Giám đốc, Kế toán..." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="account_name" label="Mã khách hàng (Tổ chức)">
            <Input placeholder="KH00001 hoặc tên công ty" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="mobile" label="ĐT di động">
                <Input placeholder="0901 234 567" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="office_email" label="Email cơ quan">
                <Input placeholder="name@company.vn" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="mailing_province" label="Tỉnh/TP">
                <Input placeholder="Hà Nội" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mailing_district" label="Quận/Huyện">
                <Input placeholder="Đống Đa" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="mailing_street" label="Số nhà, đường phố">
            <Input placeholder="Số 1 Đường Láng" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
