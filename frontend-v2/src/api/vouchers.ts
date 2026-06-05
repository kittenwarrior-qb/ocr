import client from './client'

export interface VoucherItem {
  product_code: string
  product_name: string
  uom: string
  quantity: number
  gift_product_code: string
  gift_product_name: string
  gift_quantity: number
  gift_uom: string
  discount_amount?: number
  max_per_order: number
  max_per_customer: number
  max_total: number
}

export interface Voucher {
  code: string
  name: string
  type: string
  target: string
  customers: string[]
  description: string
  from_date: string
  to_date: string
  is_active: boolean
  apply_with_others: string
  multiplier: boolean
  accumulate: boolean
  base_on: string
  apply_once: boolean
  uom_type: string
  unit_price_type: string | null
  items: VoucherItem[]
}

export async function fetchVouchers(search = '', customerCode = '', skip = 0, limit = 50): Promise<{ items: Voucher[]; total: number }> {
  const { data } = await client.get('/vouchers', { params: { search, customer_code: customerCode, skip, limit } })
  return data
}

export async function fetchVouchersForCustomers(codes: string[]): Promise<Record<string, Voucher[]>> {
  if (!codes.length) return {}
  const { data } = await client.get('/vouchers/for-customers', { params: { codes: codes.join(',') } })
  return data
}

export async function upsertVoucher(voucher: Partial<Voucher>): Promise<Voucher> {
  const { data } = await client.post('/vouchers', voucher)
  return data
}

export async function deleteVoucher(code: string): Promise<void> {
  await client.delete(`/vouchers/${code}`)
}
