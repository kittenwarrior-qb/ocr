import client from './client'

export interface PricebookItem {
  product_code: string
  product_name: string
  product_type: string
  uom: string
  unit_price: number
  discount_type: string
  discount: number
}

export interface Pricebook {
  code: string
  name: string
  target: string
  customer_type: string
  from_date: string | null
  to_date: string | null
  is_inactive: boolean
  customers: string[]
  items: PricebookItem[]
}

export async function fetchPricebooksForCustomers(codes: string[]): Promise<Record<string, Pricebook[]>> {
  if (!codes.length) return {}
  const { data } = await client.get('/misa/price-books/for-customers', { params: { codes: codes.join(',') } })
  return data
}
