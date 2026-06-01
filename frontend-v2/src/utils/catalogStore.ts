/**
 * Catalog API — paginated + searchable.
 * No more loading everything into memory.
 */
import client from '@/api/client'

export interface Product {
  code: string
  name: string
  uom: string
  price: number
  tax_rate: string
  property: string
}

export interface Customer {
  code: string
  name: string
  type: string
  tax_code: string
  phone: string
  email: string
  field: string
  owner: string
  description: string
  invoice_address: string
  invoice_city: string
  invoice_district: string
  invoice_ward: string
  delivery_address: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
}

export async function fetchProducts(search = '', skip = 0, limit = 50): Promise<PaginatedResult<Product>> {
  const { data } = await client.get('/products/catalog', { params: { search, skip, limit } })
  return data
}

export async function fetchCustomers(search = '', skip = 0, limit = 50): Promise<PaginatedResult<Customer>> {
  const { data } = await client.get('/partners/catalog', { params: { search, skip, limit } })
  return data
}

// ── Lightweight cache for matching (loads first 500 for OCR suggestions) ──
let _products: Product[] = []
let _customers: Customer[] = []
let _loaded = false

export async function preloadCatalogs(): Promise<void> {
  if (_loaded) return
  const [p, c] = await Promise.all([
    client.get('/products/catalog', { params: { limit: 500 } }),
    client.get('/partners/catalog', { params: { limit: 2500 } }),
  ])
  _products = p.data.items
  _customers = c.data.items
  _loaded = true
}

export function getProducts(): Product[] { return _products }
export function getCustomers(): Customer[] { return _customers }
