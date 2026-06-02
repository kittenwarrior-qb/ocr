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

export interface Contact {
  code: string
  title: string
  name: string
  job_title: string
  phone: string
  phone_work: string
  email: string
  email_personal: string
  organization: string
  delivery_address: string
  address: string
  city: string
  district: string
  ward: string
  owner: string
  customer_code?: string
  customer_name?: string
  customer_tax_code?: string
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

export async function fetchContacts(search = '', skip = 0, limit = 50): Promise<PaginatedResult<Contact>> {
  const { data } = await client.get('/partners/contacts', { params: { search, skip, limit } })
  return data
}

// ── Lightweight cache for matching (loads first 500 for OCR suggestions) ──
let _products: Product[] = []
let _customers: Customer[] = []
let _contacts: Contact[] = []
let _loaded = false

export async function preloadCatalogs(): Promise<void> {
  if (_loaded) return
  const [p, c, ct, al] = await Promise.all([
    client.get('/products/catalog', { params: { limit: 500 } }),
    client.get('/partners/catalog', { params: { limit: 2500 } }),
    client.get('/partners/contacts', { params: { limit: 2500 } }),
    client.get('/sku-aliases/preload').catch(() => ({ data: [] })),
  ])
  _products = p.data.items
  _customers = c.data.items
  _contacts = ct.data.items
  _aliases = al.data
  _loaded = true
}

export async function reloadAliases(): Promise<void> {
  const r = await client.get('/sku-aliases/preload')
  _aliases = r.data
}

export interface SkuAlias {
  external_normalized: string
  customer_code: string   // "" means generic (applies to all)
  product_code: string
  product_name: string
  contact_code: string
  updated_at: string
}

export function getProducts(): Product[] { return _products }
export function getCustomers(): Customer[] { return _customers }
export function getContacts(): Contact[] { return _contacts }

let _aliases: SkuAlias[] = []
export function getAliases(): SkuAlias[] { return _aliases }
export function setAliases(a: SkuAlias[]): void { _aliases = a }
