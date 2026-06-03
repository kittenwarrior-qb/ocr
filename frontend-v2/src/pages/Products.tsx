import { useState, useEffect } from 'react'
import { Input, Table, Tag, Button, Modal, Form, Row, Col, Select, message, Tooltip } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { fetchProducts, type Product } from '@/utils/catalogStore'
import { createMisaProduct, syncMisa, isOk, firstError } from '@/api/misa'

const TAX_OPTIONS = [
  { label: '10%', value: '10%' },
  { label: '8%', value: '8%' },
  { label: '5%', value: '5%' },
  { label: '0%', value: '0%' },
  { label: 'Không chịu thuế', value: 'KCT' },
]

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [data, setData] = useState<Product[]>([])
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
      const r = await fetchProducts(debouncedSearch, (page - 1) * pageSize, pageSize)
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
      const res = await createMisaProduct(values)
      if (isOk(res)) {
        message.success('Tạo hàng hóa thành công!')
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

  const columns: ColumnsType<Product> = [
    { title: 'Mã hàng hóa', dataIndex: 'code', width: 130, render: (v: string) => <span className="text-blue-600 font-medium">{v}</span> },
    { title: 'Tên hàng hóa', dataIndex: 'name', ellipsis: true },
    { title: 'ĐVT', dataIndex: 'uom', width: 80 },
    { title: 'Đơn giá', dataIndex: 'price', width: 120, align: 'right', render: (v: number) => v ? v.toLocaleString('vi-VN') + ' đ' : '—' },
    { title: 'Thuế', dataIndex: 'tax_rate', width: 70, render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Tính chất', dataIndex: 'property', width: 120, render: (v: string) => v || '—' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Input.Search
          placeholder="Tìm mã, tên hàng hóa..."
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
            try { await syncMisa('products') } catch {}
            load()
          }}>
            <ReloadOutlined />
          </button>
        </Tooltip>
      </div>

      <Table<Product>
        columns={columns} dataSource={data} rowKey="code" size="small" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p, s) => { setPage(p); setPageSize(s) }, showTotal: t => `${t} sản phẩm`, size: 'small' }}
        scroll={{ y: 'calc(100vh - 210px)' }} className="border border-gray-200 rounded-lg"
      />

      <Modal
        title="Thêm hàng hóa mới (MISA)"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={submitting}
        width={620}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="product_name" label="Tên hàng hóa" rules={[{ required: true, message: 'Nhập tên hàng hóa' }]}>
            <Input placeholder="Tên sản phẩm / dịch vụ" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_code" label="Mã hàng hóa">
                <Input placeholder="Tự động nếu để trống" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="usage_unit" label="Đơn vị tính" rules={[{ required: true, message: 'Nhập ĐVT' }]}>
                <Input placeholder="Cái, Bộ, Kg, m..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="unit_price" label="Đơn giá bán">
                <Input placeholder="0" suffix="đ" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="purchased_price" label="Đơn giá mua">
                <Input placeholder="0" suffix="đ" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="tax" label="Thuế GTGT">
                <Select options={TAX_OPTIONS} placeholder="Chọn thuế suất" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="product_category" label="Loại hàng hóa">
                <Input placeholder="Hàng hóa, Dịch vụ..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_properties" label="Tính chất">
                <Input placeholder="Hàng mua vào, Hàng bán ra..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sale_description" label="Diễn giải khi bán">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
