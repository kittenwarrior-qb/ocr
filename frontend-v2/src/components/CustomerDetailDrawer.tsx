import { useEffect, useState } from 'react'
import { Drawer, Descriptions, Spin, Empty, Table, Statistic, Row, Col, Tag, Card } from 'antd'
import { ShoppingOutlined } from '@ant-design/icons'
import { getMisaCustomerByCode } from '@/api/misa'

interface Props {
  open: boolean
  code: string | null
  onClose: () => void
}

function fmtMoney(v: any): string {
  const n = Number(v)
  if (!n || isNaN(n)) return '0'
  return n.toLocaleString('vi-VN')
}

function fmtDate(v: any): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('vi-VN')
}

function v(x: any): any {
  return x === null || x === undefined || x === '' ? '—' : x
}

interface PurchasedProduct {
  key: number
  code: string
  name: string
}

export default function CustomerDetailDrawer({ open, code, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [c, setC] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    if (!open || !code) return
    setLoading(true)
    setC(null)
    getMisaCustomerByCode(code)
      .then(setC)
      .finally(() => setLoading(false))
  }, [open, code])

  const products: PurchasedProduct[] = (() => {
    if (!c) return []
    const codes = String(c.list_product || '').split(',').map(s => s.trim()).filter(Boolean)
    const names = String(c.list_product_name || '').split(',').map(s => s.trim()).filter(Boolean)
    const n = Math.max(codes.length, names.length)
    return Array.from({ length: n }, (_, i) => ({
      key: i,
      code: codes[i] || '—',
      name: names[i] || '—',
    }))
  })()

  return (
    <Drawer
      title={c ? `${c.account_name || ''} — ${c.account_number || ''}` : 'Chi tiết khách hàng'}
      width={840}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {loading ? (
        <div className="flex justify-center py-20"><Spin /></div>
      ) : !c ? (
        <Empty description="Không lấy được dữ liệu từ MISA" />
      ) : (
        <div className="space-y-5">
          {/* ── Thống kê mua hàng ──────────────────────────────────────────── */}
          <Row gutter={12}>
            <Col span={6}><Card size="small"><Statistic title="Số đơn hàng" value={Number(c.number_orders) || 0} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Doanh số" value={fmtMoney(c.order_sales)} suffix="₫" /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="GT TB/đơn" value={fmtMoney(c.average_order_value)} suffix="₫" /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Công nợ" value={fmtMoney(c.debt)} suffix="₫" valueStyle={{ color: Number(c.debt) > 0 ? '#cf1322' : undefined }} /></Card></Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}><Card size="small"><Statistic title="Mua lần đầu" valueRender={() => <span className="text-base">{fmtDate(c.purchase_date_first)}</span>} value={0} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Mua gần nhất" valueRender={() => <span className="text-base">{fmtDate(c.purchase_date_recent)}</span>} value={0} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Số ngày chưa mua" value={c.number_days_without_purchase ?? '—'} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Hạn mức nợ" value={fmtMoney(c.debt_limit)} suffix="₫" /></Card></Col>
          </Row>

          {/* ── Hàng hóa đã mua ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2 font-semibold text-gray-700">
              <ShoppingOutlined /> Hàng hóa đã mua
              <Tag color="blue">{products.length}</Tag>
              {c.list_product_category ? <Tag>{c.list_product_category}</Tag> : null}
            </div>
            <Table<PurchasedProduct>
              size="small"
              dataSource={products}
              pagination={false}
              scroll={{ y: 220 }}
              locale={{ emptyText: 'Chưa có lịch sử mua hàng' }}
              columns={[
                { title: '#', width: 48, render: (_: unknown, __: unknown, i: number) => i + 1 },
                { title: 'Mã HH', dataIndex: 'code', width: 160, render: (x: string) => <span className="font-mono text-blue-600">{x}</span> },
                { title: 'Tên hàng hóa', dataIndex: 'name' },
              ]}
              className="border border-gray-200 rounded"
            />
          </div>

          {/* ── Thông tin chung ────────────────────────────────────────────── */}
          <Descriptions title="Thông tin chung" bordered size="small" column={2}
            labelStyle={{ width: 150, fontWeight: 500 }}>
            <Descriptions.Item label="Mã KH">{v(c.account_number)}</Descriptions.Item>
            <Descriptions.Item label="MST">{v(c.tax_code)}</Descriptions.Item>
            <Descriptions.Item label="Tên KH" span={2}>{v(c.account_name)}</Descriptions.Item>
            <Descriptions.Item label="Tên viết tắt">{v(c.account_short_name)}</Descriptions.Item>
            <Descriptions.Item label="Loại KH">{v(c.account_type)}</Descriptions.Item>
            <Descriptions.Item label="Điện thoại">{v(c.office_tel)}</Descriptions.Item>
            <Descriptions.Item label="Fax">{v(c.fax)}</Descriptions.Item>
            <Descriptions.Item label="Email">{v(c.office_email)}</Descriptions.Item>
            <Descriptions.Item label="Website">{v(c.website)}</Descriptions.Item>
            <Descriptions.Item label="Người phụ trách" span={2}>{v(c.owner_name)}</Descriptions.Item>
            <Descriptions.Item label="NV kinh doanh" span={2}>{v(c.custom_field4)}</Descriptions.Item>
          </Descriptions>

          {/* ── Phân loại ──────────────────────────────────────────────────── */}
          <Descriptions title="Phân loại" bordered size="small" column={2}
            labelStyle={{ width: 150, fontWeight: 500 }}>
            <Descriptions.Item label="Loại hình DN">{v(c.business_type)}</Descriptions.Item>
            <Descriptions.Item label="Lĩnh vực">{v(c.sector_name)}</Descriptions.Item>
            <Descriptions.Item label="Ngành nghề">{v(c.industry)}</Descriptions.Item>
            <Descriptions.Item label="Quy mô NV">{v(c.no_of_employee_name)}</Descriptions.Item>
            <Descriptions.Item label="Doanh thu năm">{v(c.annual_revenue)}</Descriptions.Item>
            <Descriptions.Item label="KH từ ngày">{fmtDate(c.customer_since_date)}</Descriptions.Item>
            <Descriptions.Item label="Sinh nhật">{fmtDate(c.celebrate_date)}</Descriptions.Item>
            <Descriptions.Item label="Cá nhân?">{c.is_personal ? 'Cá nhân' : 'Tổ chức'}</Descriptions.Item>
          </Descriptions>

          {/* ── Ngân hàng & Công nợ ────────────────────────────────────────── */}
          <Descriptions title="Ngân hàng & Công nợ" bordered size="small" column={2}
            labelStyle={{ width: 150, fontWeight: 500 }}>
            <Descriptions.Item label="Ngân hàng">{v(c.bank_name)}</Descriptions.Item>
            <Descriptions.Item label="Số tài khoản">{v(c.bank_account)}</Descriptions.Item>
            <Descriptions.Item label="Hạn mức nợ">{fmtMoney(c.debt_limit)} ₫</Descriptions.Item>
            <Descriptions.Item label="Loại hạn mức">{v(c.debt_limit_type)}</Descriptions.Item>
            <Descriptions.Item label="Số ngày được nợ">{v(c.number_of_days_owed)}</Descriptions.Item>
            <Descriptions.Item label="Điều khoản TT">{v(c.payment_term_type_id)}</Descriptions.Item>
          </Descriptions>

          {/* ── Địa chỉ ────────────────────────────────────────────────────── */}
          <Descriptions title="Địa chỉ hóa đơn" bordered size="small" column={2}
            labelStyle={{ width: 150, fontWeight: 500 }}>
            <Descriptions.Item label="Tỉnh/TP">{v(c.billing_province)}</Descriptions.Item>
            <Descriptions.Item label="Quận/Huyện">{v(c.billing_district)}</Descriptions.Item>
            <Descriptions.Item label="Phường/Xã">{v(c.billing_ward)}</Descriptions.Item>
            <Descriptions.Item label="Quốc gia">{v(c.billing_country)}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>{v(c.billing_address)}</Descriptions.Item>
          </Descriptions>
          <Descriptions title="Địa chỉ giao hàng" bordered size="small" column={2}
            labelStyle={{ width: 150, fontWeight: 500 }}>
            <Descriptions.Item label="Tỉnh/TP">{v(c.shipping_province)}</Descriptions.Item>
            <Descriptions.Item label="Quận/Huyện">{v(c.shipping_district)}</Descriptions.Item>
            <Descriptions.Item label="Phường/Xã">{v(c.shipping_ward)}</Descriptions.Item>
            <Descriptions.Item label="Quốc gia">{v(c.shipping_country)}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>{v(c.shipping_address)}</Descriptions.Item>
          </Descriptions>

          {c.description ? (
            <Descriptions title="Mô tả" bordered size="small" column={1}>
              <Descriptions.Item label="Ghi chú">{c.description}</Descriptions.Item>
            </Descriptions>
          ) : null}
        </div>
      )}
    </Drawer>
  )
}
