import { useState, useEffect } from 'react'
import { Input, Table, Button, Modal, Form, Row, Col, message, Tooltip, Tag, Space, Popconfirm, Select, DatePicker, InputNumber, Switch } from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { fetchCustomers, type Customer } from '@/utils/catalogStore'
import { createMisaCustomer, updateMisaCustomer, deleteMisaCustomer, getMisaCustomerByCode, getMisaCategories, type MisaCategories, syncMisa, isOk, isMisaOk, firstError } from '@/api/misa'
import Section from '@/components/FormSection'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer'
import { SALESPERSON_OPTIONS, NV_OPTIONS } from '@/config/salespersons'

// Các field gửi được lên MISA (loại trừ field thống kê/chỉ-đọc như debt, number_orders...)
const EDITABLE_FIELDS = [
  'account_number', 'tax_code', 'account_name', 'account_short_name', 'account_type',
  'office_tel', 'fax', 'office_email', 'website', 'owner_name', 'custom_field4', 'is_personal',
  'business_type', 'sector_name', 'industry', 'no_of_employee_name', 'annual_revenue',
  'customer_since_date', 'celebrate_date',
  'bank_name', 'bank_account', 'debt_limit', 'number_of_days_owed', 'payment_term_type_id', 'debt_limit_type',
  'billing_province', 'billing_district', 'billing_ward', 'billing_country', 'billing_street', 'billing_address',
  'shipping_province', 'shipping_district', 'shipping_ward', 'shipping_country', 'shipping_street', 'shipping_address',
  'description',
]
const DATE_FIELDS = ['celebrate_date', 'customer_since_date']

const toMisaDate = (d: any): string | undefined =>
  d && dayjs.isDayjs(d) ? d.format('YYYY-MM-DDT00:00:00.000') + '+07:00' : undefined

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  // ── Chi tiết KH (drawer) ──────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const openDetail = (code: string) => { setDetailCode(code); setDetailOpen(true) }

  // ── Options cho "Loại KH" — gom từ các loại đang có sẵn, cho phép gõ loại mới ──
  const [typeOptions, setTypeOptions] = useState<{ value: string; label: string }[]>([])
  const [typeSearch, setTypeSearch] = useState('')

  // ── Danh mục MISA (tỉnh/quận/phường/quốc gia) — bắt buộc khớp danh mục ────────
  const [cats, setCats] = useState<MisaCategories | null>(null)
  const opt = (arr?: string[]) => (arr || []).map(x => ({ value: x, label: x }))

  useEffect(() => { getMisaCategories().then(setCats).catch(() => {}) }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchCustomers('', 0, 2500)
        const types = Array.from(new Set(r.items.map(c => c.type).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b))
        setTypeOptions(types.map(t => ({ value: t, label: t })))
      } catch { /* ignore */ }
    })()
  }, [])

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

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = async (c: Customer) => {
    setEditing(c)
    form.resetFields()
    setModalOpen(true)
    setEditLoading(true)
    try {
      // Lấy bản ghi đầy đủ từ MISA để điền hết các field
      const detail = await getMisaCustomerByCode(c.code)
      if (detail) {
        const fv: Record<string, any> = {}
        for (const k of EDITABLE_FIELDS) {
          if (detail[k] === null || detail[k] === undefined) continue
          fv[k] = DATE_FIELDS.includes(k) ? dayjs(detail[k]) : detail[k]
        }
        form.setFieldsValue(fv)
      } else {
        // Fallback: dữ liệu tối thiểu từ danh sách
        form.setFieldsValue({
          account_name: c.name, account_number: c.code, tax_code: c.tax_code,
          account_type: c.type, office_tel: c.phone, office_email: c.email,
          billing_province: c.invoice_city, billing_street: c.invoice_address, description: c.description,
        })
      }
    } catch {
      message.error('Không tải được chi tiết khách hàng từ MISA')
    } finally {
      setEditLoading(false)
    }
  }

  const closeModal = () => { setModalOpen(false); setEditing(null); form.resetFields() }

  const buildPayload = (values: Record<string, any>): Record<string, any> => {
    const payload: Record<string, any> = {}
    for (const k of EDITABLE_FIELDS) {
      let val = values[k]
      if (DATE_FIELDS.includes(k)) val = toMisaDate(val)
      if (val !== undefined && val !== null && val !== '') payload[k] = val
    }
    return payload
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const payload = buildPayload(values)
      if (editing) {
        const res = await updateMisaCustomer({ ...payload, account_number: editing.code })
        if (isMisaOk(res)) {
          message.success('Cap nhat khach hang thanh cong, dang dong bo du lieu...')
          await syncMisa('customers')
          closeModal()
          load()
        } else {
          message.error(firstError(res))
        }
      } else {
        const res = await createMisaCustomer(payload)
        if (isOk(res)) {
          message.success('Tao khach hang thanh cong, dang dong bo du lieu...')
          await syncMisa('customers')
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

  const handleDelete = async (c: Customer) => {
    setDeleting(c.code)
    try {
      const res = await deleteMisaCustomer(c.code)
      if (isMisaOk(res)) {
        message.success('Xoa khach hang thanh cong, dang dong bo du lieu...')
        await syncMisa('customers')
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

  const columns: ColumnsType<Customer> = [
    {
      title: 'Mã KH', dataIndex: 'code', width: 120, fixed: 'left',
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (v: string) => (
        <a className="text-blue-600 font-medium font-mono whitespace-nowrap" onClick={() => openDetail(v)}>{v}</a>
      ),
    },
    {
      title: 'Tên khách hàng', dataIndex: 'name', width: 260,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v: string) => <span className="font-medium">{v}</span>,
    },
    {
      title: 'Loại KH', dataIndex: 'type', width: 160,
      sorter: (a, b) => (a.type||'').localeCompare(b.type||''),
      render: (v: string) => v ? <Tag color="blue" className="text-xs whitespace-nowrap">{v}</Tag> : <span className="text-gray-300">—</span>,
    },
    { title: 'MST', dataIndex: 'tax_code', width: 130, sorter: (a, b) => (a.tax_code||'').localeCompare(b.tax_code||''), render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Điện thoại', dataIndex: 'phone', width: 130, render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Email', dataIndex: 'email', width: 220, render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Lĩnh vực', dataIndex: 'field', width: 120, render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Người phụ trách', dataIndex: 'owner', width: 200, render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Địa chỉ HĐ', dataIndex: 'invoice_address', width: 280, render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Tỉnh/TP', dataIndex: 'invoice_city', width: 120, render: (v: string) => v || <span className="text-gray-300">—</span> },
    { title: 'Địa chỉ GH', dataIndex: 'delivery_address', width: 220, render: (v: string) => v || <span className="text-gray-300">—</span> },
    {
      title: 'Thao tác', key: 'actions', width: 130, fixed: 'right', align: 'center',
      render: (_: unknown, r) => (
        <Space size={2}>
          <Tooltip title="Chi tiết & HH đã mua">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.code)} />
          </Tooltip>
          <Tooltip title="Sửa">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title="Xóa khách hàng này?"
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
          placeholder="Tìm mã, tên, MST..."
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
            try { await syncMisa('customers') } catch {}
            load()
          }}>
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>

      <Table<Customer>
        columns={columns}
        dataSource={data}
        rowKey="code"
        size="small"
        loading={loading}
        scroll={{ x: 1930, y: 'calc(100vh - 210px)' }}
        className="border border-gray-200 rounded-lg"
        pagination={{
          current: page, pageSize, total,
          onChange: (p, s) => { setPage(p); setPageSize(s) },
          showTotal: t => `${t} khách hàng`,
          size: 'small',
        }}
      />

      <Modal
        title={editing ? `Sửa khách hàng — ${editing.code}` : 'Thêm khách hàng mới'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={editing ? 'Lưu' : 'Tạo'}
        cancelText="Hủy"
        confirmLoading={submitting}
        width={820}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 12 } }}
      >
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="horizontal"
          labelAlign="left"
          labelCol={{ flex: '110px' }}
          wrapperCol={{ flex: 'auto' }}
          colon={false}
          size="small"
          disabled={editLoading}
          className="mt-3 [&_.ant-form-item]:!mb-2.5 [&_.ant-form-item-label>label]:!text-gray-600"
        >
          <Section>Thông tin chung</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="account_number" label="Mã KH">
                <Input placeholder="Tự động nếu để trống" disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tax_code" label="MST">
                <Input placeholder="0100000000" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="account_name" label="Tên KH" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
            <Input placeholder="Công ty cổ phần ABC" />
          </Form.Item>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="account_short_name" label="Tên viết tắt">
                <Input placeholder="ABC Co." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="account_type" label="Loại KH">
                <Select
                  showSearch
                  allowClear
                  placeholder="Chọn hoặc nhập loại KH"
                  onSearch={setTypeSearch}
                  filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={
                    typeSearch && !typeOptions.some(o => o.value === typeSearch)
                      ? [{ value: typeSearch, label: `+ Thêm "${typeSearch}"` }, ...typeOptions]
                      : typeOptions
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="office_tel" label="Điện thoại">
                <Input placeholder="024 1234 5678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fax" label="Fax">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="office_email" label="Email">
                <Input placeholder="contact@company.vn" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="website" label="Website">
                <Input placeholder="company.vn" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="owner_name" label="Người p/trách">
                <Select showSearch allowClear placeholder="Chọn người thực hiện" options={SALESPERSON_OPTIONS} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="custom_field4" label="NV bán hàng">
                <Select showSearch allowClear placeholder="Chọn nhân viên bán hàng" options={NV_OPTIONS} optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_personal" label="KH cá nhân" valuePropName="checked">
            <Switch checkedChildren="Cá nhân" unCheckedChildren="Tổ chức" />
          </Form.Item>

          <Section>Phân loại</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="business_type" label="Loại hình DN">
                <Input placeholder="Doanh nghiệp" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sector_name" label="Lĩnh vực">
                <Input placeholder="Dịch vụ" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="industry" label="Ngành nghề">
                <Input placeholder="Cung ứng phần mềm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="no_of_employee_name" label="Quy mô NV">
                <Input placeholder="Trên 1000" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="annual_revenue" label="Doanh thu năm">
                <Input placeholder="Trên 100 tỷ đồng" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_since_date" label="KH từ ngày">
                <DatePicker format="DD/MM/YYYY" className="w-full" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="celebrate_date" label="Ngày sinh nhật">
            <DatePicker format="DD/MM/YYYY" className="w-full" />
          </Form.Item>

          <Section>Ngân hàng & Công nợ</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="bank_name" label="Ngân hàng">
                <Input placeholder="ACB" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bank_account" label="Số tài khoản">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="debt_limit" label="Hạn mức nợ">
                <InputNumber<number>
                  className="w-full"
                  min={0}
                  formatter={v => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={v => Number((v || '').replace(/,/g, '')) || 0}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="number_of_days_owed" label="Số ngày nợ">
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="debt_limit_type" label="Loại hạn mức">
                <Input placeholder="Không giới hạn" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payment_term_type_id" label="Điều khoản TT">
                <Input placeholder="Thanh toán ngay" />
              </Form.Item>
            </Col>
          </Row>

          <Section>Địa chỉ hóa đơn</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="billing_province" label="Tỉnh/TP">
                <Select showSearch allowClear placeholder="Chọn tỉnh/TP" options={opt(cats?.provinces)} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="billing_district" label="Quận/Huyện">
                <Select showSearch allowClear placeholder="Chọn quận/huyện" options={opt(cats?.districts)} optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="billing_ward" label="Phường/Xã">
                <Select showSearch allowClear placeholder="Chọn phường/xã" options={opt(cats?.wards)} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="billing_country" label="Quốc gia">
                <Select showSearch allowClear placeholder="Việt Nam" options={opt(cats?.countries)} optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="billing_street" label="Số nhà, đường">
            <Input placeholder="Số 1, Đường Láng" />
          </Form.Item>
          <Form.Item name="billing_address" label="Đ/chỉ đầy đủ">
            <Input.TextArea rows={2} placeholder="Địa chỉ hóa đơn đầy đủ" />
          </Form.Item>

          <Section>Địa chỉ giao hàng</Section>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="shipping_province" label="Tỉnh/TP">
                <Select showSearch allowClear placeholder="Chọn tỉnh/TP" options={opt(cats?.provinces)} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shipping_district" label="Quận/Huyện">
                <Select showSearch allowClear placeholder="Chọn quận/huyện" options={opt(cats?.districts)} optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="shipping_ward" label="Phường/Xã">
                <Select showSearch allowClear placeholder="Chọn phường/xã" options={opt(cats?.wards)} optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shipping_country" label="Quốc gia">
                <Select showSearch allowClear placeholder="Việt Nam" options={opt(cats?.countries)} optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="shipping_street" label="Số nhà, đường">
            <Input placeholder="Số 1, Đường Láng" />
          </Form.Item>
          <Form.Item name="shipping_address" label="Đ/chỉ đầy đủ">
            <Input.TextArea rows={2} placeholder="Địa chỉ giao hàng đầy đủ" />
          </Form.Item>

          <Section>Khác</Section>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <CustomerDetailDrawer open={detailOpen} code={detailCode} onClose={() => setDetailOpen(false)} />
    </div>
  )
}
