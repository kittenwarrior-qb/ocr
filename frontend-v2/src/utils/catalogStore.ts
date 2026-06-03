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

// ── MISA helpers ──────────────────────────────────────────────────────────────

function misaItems(resp: any): any[] {
  const d = resp?.data
  if (Array.isArray(d)) return d
  if (d && Array.isArray(d.data)) return d.data
  if (d && Array.isArray(d.items)) return d.items
  return []
}

function mapCustomer(r: any): Customer {
  return {
    code: r.account_number || '',
    name: r.account_name || '',
    type: r.account_type || '',
    tax_code: r.tax_code || '',
    phone: r.office_tel || '',
    email: r.office_email || '',
    field: r.industry || '',
    owner: r.owner_name || '',
    description: r.description || '',
    invoice_address: r.billing_address || '',
    invoice_city: r.billing_province || '',
    invoice_district: r.billing_district || '',
    invoice_ward: r.billing_ward || '',
    delivery_address: r.shipping_address || '',
  }
}

function mapProduct(r: any): Product {
  return {
    code: r.product_code || '',
    name: r.product_name || '',
    uom: r.usage_unit || '',
    price: parseFloat(r.unit_price || '0') || 0,
    tax_rate: r.tax || '',
    property: r.product_properties || '',
  }
}

function mapContact(r: any): Contact {
  return {
    code: r.contact_code || '',
    title: r.salutation || '',
    name: r.contact_name || '',
    job_title: r.title || '',
    phone: r.mobile || '',
    phone_work: r.office_tel || '',
    email: r.office_email || '',
    email_personal: r.email || '',
    organization: r.account_name || '',
    delivery_address: r.shipping_address || '',
    address: r.mailing_address || '',
    city: r.mailing_province || '',
    district: r.mailing_district || '',
    ward: r.mailing_ward || '',
    owner: r.owner_name || '',
  }
}

// ── In-memory cache (load tất cả từ MISA, filter client-side) ─────────────────

interface MisaCache<T> {
  data: T[] | null
  promise: Promise<T[]> | null
}

const _cache = {
  customers: { data: null, promise: null } as MisaCache<Customer>,
  products:  { data: null, promise: null } as MisaCache<Product>,
  contacts:  { data: null, promise: null } as MisaCache<Contact>,
}

async function loadAll<T>(endpoint: string, mapper: (r: any) => T): Promise<T[]> {
  // Backend cache: 1 request duy nhất, backend tự loop MISA và cache 10 phút
  const { data } = await client.get(endpoint)
  const arr = Array.isArray(data) ? data : misaItems({ data })
  return arr.map(mapper)
}

async function ensure<T>(cache: MisaCache<T>, endpoint: string, mapper: (r: any) => T): Promise<T[]> {
  if (cache.data) return cache.data
  if (!cache.promise) {
    cache.promise = loadAll(endpoint, mapper).then(d => {
      cache.data = d
      return d
    })
  }
  return cache.promise
}

function filterAndPage<T>(all: T[], search: string, matchFn: (item: T, s: string) => boolean, skip: number, limit: number): PaginatedResult<T> {
  const s = search.trim().toLowerCase()
  const filtered = s ? all.filter(item => matchFn(item, s)) : all
  return { items: filtered.slice(skip, skip + limit), total: filtered.length }
}

/** Xoá cache để reload từ MISA lần kế tiếp */
export function invalidateMisaCache(type?: 'customers' | 'products' | 'contacts') {
  const reset = (c: MisaCache<any>) => { c.data = null; c.promise = null }
  if (!type || type === 'customers') reset(_cache.customers)
  if (!type || type === 'products')  reset(_cache.products)
  if (!type || type === 'contacts')  reset(_cache.contacts)
}

// ── Fetch functions (load 1 lần, search + phân trang client-side) ─────────────

export async function fetchCustomers(search = '', skip = 0, limit = 50): Promise<PaginatedResult<Customer>> {
  const all = await ensure(_cache.customers, '/misa/customers/all', mapCustomer)
  return filterAndPage(all, search, (c, s) =>
    c.name.toLowerCase().includes(s) ||
    c.code.toLowerCase().includes(s) ||
    (c.tax_code || '').toLowerCase().includes(s) ||
    (c.invoice_address || '').toLowerCase().includes(s),
    skip, limit
  )
}

export async function fetchProducts(search = '', skip = 0, limit = 50): Promise<PaginatedResult<Product>> {
  const all = await ensure(_cache.products, '/misa/products/all', mapProduct)
  return filterAndPage(all, search, (p, s) =>
    p.name.toLowerCase().includes(s) ||
    p.code.toLowerCase().includes(s) ||
    (p.uom || '').toLowerCase().includes(s),
    skip, limit
  )
}

export async function fetchContacts(search = '', skip = 0, limit = 50): Promise<PaginatedResult<Contact>> {
  const all = await ensure(_cache.contacts, '/misa/contacts/all', mapContact)
  return filterAndPage(all, search, (c, s) =>
    c.name.toLowerCase().includes(s) ||
    c.code.toLowerCase().includes(s) ||
    (c.organization || '').toLowerCase().includes(s) ||
    (c.phone || '').toLowerCase().includes(s),
    skip, limit
  )
}

// ── Lightweight cache for matching (loads first 500 for OCR suggestions) ──
let _products: Product[] = []
let _customers: Customer[] = []
let _contacts: Contact[] = []
let _loaded = false

export async function preloadCatalogs(): Promise<void> {
  if (_loaded) return
  const [p, c, ct, al, ca] = await Promise.all([
    client.get('/products/catalog', { params: { limit: 500 } }),
    client.get('/partners/catalog', { params: { limit: 2500 } }),
    client.get('/partners/contacts', { params: { limit: 2500 } }),
    client.get('/sku-aliases/preload').catch(() => ({ data: [] })),
    client.get('/company-aliases/preload').catch(() => ({ data: [] })),
  ])
  _products = p.data.items
  _customers = c.data.items
  _contacts = ct.data.items
  _aliases = al.data
  _companyAliases = ca.data
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

export interface CompanyAlias {
  external_normalized: string
  customer_code: string
  customer_name: string
  alias_type: string
}

export function getProducts(): Product[] { return _products }
export function getCustomers(): Customer[] { return _customers }
export function getContacts(): Contact[] { return _contacts }

let _companyAliases: CompanyAlias[] = []
export function getCompanyAliases(): CompanyAlias[] { return _companyAliases }

let _aliases: SkuAlias[] = []
export function getAliases(): SkuAlias[] { return _aliases }
export function setAliases(a: SkuAlias[]): void { _aliases = a }
