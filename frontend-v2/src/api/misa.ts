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

/** Lenient check for update/delete: success at top level, no explicit per-row failure. */
export function isMisaOk(res: MisaResult): boolean {
  if (!res?.success) return false
  const r = res.results?.[0]
  return !(r && r.success === false)
}

export { firstError }

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pull the first record out of a MISA GET-by-code/id response. */
function misaFirst(res: any): any | null {
  const d = res?.data
  if (Array.isArray(d)) return d[0] ?? null
  if (d && Array.isArray(d.data)) return d.data[0] ?? null
  if (d && Array.isArray(d.items)) return d.items[0] ?? null
  return d ?? null
}

async function getMisaCustomerId(code: string): Promise<number | null> {
  const { data } = await client.get('/misa/customers/code', { params: { code } })
  return misaFirst(data)?.id ?? null
}

/** Lấy bản ghi KH đầy đủ (mọi field) từ MISA theo mã — dùng cho form Sửa + màn Chi tiết. */
export async function getMisaCustomerByCode(code: string): Promise<Record<string, any> | null> {
  const { data } = await client.get('/misa/customers/code', { params: { code } })
  return misaFirst(data)
}

async function getMisaContactId(code: string): Promise<number | null> {
  const { data } = await client.get('/misa/contacts/code', { params: { code } })
  return misaFirst(data)?.id ?? null
}

/** Lấy bản ghi LH đầy đủ từ MISA theo mã — dùng để prefill field không có trong danh sách (vd custom_field14). */
export async function getMisaContactByCode(code: string): Promise<Record<string, any> | null> {
  const { data } = await client.get('/misa/contacts/code', { params: { code } })
  return misaFirst(data)
}

// ── Create ────────────────────────────────────────────────────────────────────

// MISA bắt buộc field `form_layout` khi tạo bản ghi.
const DEFAULT_FORM_LAYOUT = 'Mẫu tiêu chuẩn'

export async function createMisaCustomer(data: Record<string, unknown>): Promise<MisaResult> {
  const payload = { form_layout: DEFAULT_FORM_LAYOUT, ...data }
  const { data: res } = await client.post<MisaResult>('/misa/customers', [payload])
  return res
}

export async function createMisaProduct(data: Record<string, unknown>): Promise<MisaResult> {
  const payload = { form_layout: DEFAULT_FORM_LAYOUT, ...data }
  const { data: res } = await client.post<MisaResult>('/misa/products', [payload])
  return res
}

export async function createMisaContact(data: Record<string, unknown>): Promise<MisaResult> {
  const payload = { form_layout: DEFAULT_FORM_LAYOUT, ...data }
  const { data: res } = await client.post<MisaResult>('/misa/contacts', [payload])
  return res
}

// ── Update (khớp theo mã: account_number / contact_code) ──────────────────────

export async function updateMisaCustomer(data: Record<string, unknown>): Promise<MisaResult> {
  const payload = { form_layout: DEFAULT_FORM_LAYOUT, ...data }
  const { data: res } = await client.put<MisaResult>('/misa/customers', [payload])
  return res
}

export async function updateMisaContact(data: Record<string, unknown>): Promise<MisaResult> {
  const payload = { form_layout: DEFAULT_FORM_LAYOUT, ...data }
  const { data: res } = await client.put<MisaResult>('/misa/contacts', [payload])
  return res
}

// ── Delete (MISA yêu cầu id số nguyên → resolve từ mã trước) ───────────────────

export async function deleteMisaCustomer(code: string): Promise<MisaResult> {
  const id = await getMisaCustomerId(code)
  if (!id) throw new Error('Không tìm thấy khách hàng trên MISA để xóa')
  const { data } = await client.delete<MisaResult>('/misa/customers', { data: [id] })
  return data
}

export async function deleteMisaContact(code: string): Promise<MisaResult> {
  const id = await getMisaContactId(code)
  if (!id) throw new Error('Không tìm thấy liên hệ trên MISA để xóa')
  const { data } = await client.delete<MisaResult>('/misa/contacts', { data: [id] })
  return data
}

// ── Danh mục (giá trị hợp lệ cho dropdown) ────────────────────────────────────

export interface MisaCategories {
  provinces: string[]
  districts: string[]
  wards: string[]
  countries: string[]
  account_types: string[]
  business_types: string[]
  sectors: string[]
  industries: string[]
  titles: string[]
  salutations: string[]
}

export async function getMisaCategories(): Promise<MisaCategories> {
  const { data } = await client.get<MisaCategories>('/misa/categories')
  return data
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export async function syncMisa(type: 'customers' | 'products' | 'contacts'): Promise<SyncResult> {
  const { data } = await client.post<SyncResult>(`/misa/sync/${type}`)
  return data
}
