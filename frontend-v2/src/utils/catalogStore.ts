/**
 * Central store for product and customer catalog data.
 * Fetches once from backend API and caches in memory.
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
  owner: string
  invoice_address: string
  invoice_city: string
  invoice_district: string
  invoice_ward: string
  delivery_address: string
}

let _products: Product[] = []
let _customers: Customer[] = []
let _productsLoaded = false
let _customersLoaded = false
let _productsPromise: Promise<Product[]> | null = null
let _customersPromise: Promise<Customer[]> | null = null

export async function loadProducts(): Promise<Product[]> {
  if (_productsLoaded) return _products
  if (_productsPromise) return _productsPromise
  _productsPromise = client.get('/products/catalog').then(r => {
    _products = r.data
    _productsLoaded = true
    _productsPromise = null
    return _products
  })
  return _productsPromise
}

export async function loadCustomers(): Promise<Customer[]> {
  if (_customersLoaded) return _customers
  if (_customersPromise) return _customersPromise
  _customersPromise = client.get('/partners/catalog').then(r => {
    _customers = r.data
    _customersLoaded = true
    _customersPromise = null
    return _customers
  })
  return _customersPromise
}

/** Sync access — returns empty array if not loaded yet */
export function getProducts(): Product[] { return _products }
export function getCustomers(): Customer[] { return _customers }

/** Preload both catalogs */
export async function preloadCatalogs(): Promise<void> {
  await Promise.all([loadProducts(), loadCustomers()])
}
