import { useState, useEffect } from 'react'
import { Input, Table, Button, Modal, Form, Row, Col, message, Tooltip } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchCustomers, invalidateMisaCache, type Customer } from '@/utils/catalogStore'
import { createMisaCustomer, isOk, firstError } from '@/api/misa'

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Customer[]>([])
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
      const r = await fetchCustomers(debouncedSearch, (page - 1) * pageSize, pageSize)
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
      const res = await createMisaCustomer(values)
      if (isOk(res)) {
        message.success('Tạo khách hàng thành công!')
        form.resetFields()
        setModalOpen(false)
        invalidateMisaCache('customers')
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

  const columns: ColumnsType<Customer> = [
    { title: 'Mã KH', dataIndex: 'code', width: 120, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Tên khách hàng', dataIndex: 'name', ellipsis: true },
    { title: 'MST', dataIndex: 'tax_code', width: 130 },
    { title: 'Địa chỉ (HĐ)', dataIndex: 'invoice_address', ellipsis: true, width: 300 },
    { title: 'Tỉnh/TP', dataIndex: 'invoice_city', width: 120 },
    { title: 'Địa chỉ (GH)', dataIndex: 'delivery_address', ellipsis: true, width: 250 },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm mã, tên, MST..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-72"
          allowClear
        />
        <div className="flex-1" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Thêm mới
        </Button>
        <Tooltip title="Tải lại từ MISA">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" onClick={() => { invalidateMisaCache('customers'); load() }}>
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>

      <Table<Customer>
        columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} khách hàng`, size: 'small' }}
        scroll={{ y: 'calc(100vh - 210px)' }} className="border border-gray-200 rounded-lg"
      />

      <Modal
        title="Thêm khách hàng mới (MISA)"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={submitting}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="account_name" label="Tên khách hàng" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
            <Input placeholder="Công ty cổ phần ABC" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="account_number" label="Mã KH">
                <Input placeholder="Tự động nếu để trống" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tax_code" label="Mã số thuế">
                <Input placeholder="0100000000" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="office_tel" label="Điện thoại">
                <Input placeholder="024 1234 5678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="office_email" label="Email">
                <Input placeholder="contact@company.vn" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="billing_province" label="Tỉnh/TP (HĐ)">
                <Input placeholder="Hà Nội" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="billing_district" label="Quận/Huyện">
                <Input placeholder="Đống Đa" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="billing_ward" label="Phường/Xã">
                <Input placeholder="Phương Mai" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="billing_street" label="Số nhà, đường phố (HĐ)">
            <Input placeholder="Số 1, Đường Láng" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
