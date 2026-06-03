import client from './client'

export interface MisaResult {
  success: boolean
  code: number
  results?: Array<{ success: boolean; data?: number; validate_infos?: Array<{ error_message: string; field_name: string }> }>
  error_message?: string
}

export interface SyncResult {
  total: number
  created: number
  updated: number
  errors: number
}

function firstError(res: MisaResult): string {
  return res.results?.[0]?.validate_infos?.[0]?.error_message
    || res.error_message
    || 'Lỗi không xác định từ MISA'
}

export function isOk(res: MisaResult): boolean {
  return !!(res?.success && res?.results?.[0]?.success)
}

export { firstError }

// ── Create ────────────────────────────────────────────────────────────────────

export async function createMisaCustomer(data: Record<string, unknown>): Promise<MisaResult> {
  const { data: res } = await client.post<MisaResult>('/misa/customers', [data])
  return res
}

export async function createMisaProduct(data: Record<string, unknown>): Promise<MisaResult> {
  const { data: res } = await client.post<MisaResult>('/misa/products', [data])
  return res
}

export async function createMisaContact(data: Record<string, unknown>): Promise<MisaResult> {
  const { data: res } = await client.post<MisaResult>('/misa/contacts', [data])
  return res
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export async function syncMisa(type: 'customers' | 'products' | 'contacts'): Promise<SyncResult> {
  const { data } = await client.post<SyncResult>(`/misa/sync/${type}`)
  return data
}
