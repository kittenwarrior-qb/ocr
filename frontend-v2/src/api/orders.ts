import client from './client'
import type { Order, RawDocument, OrderUpdatePayload, UploadBatchResponse } from '@/types/order'

export async function getOrders(status?: string): Promise<Order[]> {
  const params = status ? { status } : {}
  const { data } = await client.get('/documents/orders', { params })
  return data
}

export async function getOrder(id: string): Promise<Order> {
  const { data } = await client.get(`/documents/orders/${id}`)
  return data
}

export async function updateOrder(id: string, payload: OrderUpdatePayload): Promise<Order> {
  const { data } = await client.patch(`/documents/orders/${id}`, payload)
  return data
}

export async function completeOrder(id: string): Promise<{ status: string }> {
  const { data } = await client.post(`/documents/orders/${id}/complete`)
  return data
}

export async function getRawDocument(id: string): Promise<RawDocument> {
  const { data } = await client.get(`/documents/raw/${id}`)
  return data
}

export async function uploadBatch(files: File[], useAI = true): Promise<UploadBatchResponse & { session_id: string }> {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  form.append('use_ai', useAI ? 'true' : 'false')
  const { data } = await client.post('/documents/upload-batch', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getQueueStatus(): Promise<{ queue_pending: number; workers: number }> {
  const { data } = await client.get('/documents/queue-status')
  return data
}

export interface ExcelImportResult {
  file_name: string
  raw_document_id: string
  total_orders: number
  total_products: number
  total_unmapped: number
  order_ids: string[]
}

export async function uploadExcel(file: File): Promise<ExcelImportResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post('/documents/upload-excel', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/**
 * Check OCR status for a list of filenames.
 * Returns a map of filename → "pending" | "processing" | "done" | "failed" | null
 * null means the file has never been submitted to OCR.
 */
export async function checkFilenames(
  filenames: string[]
): Promise<Record<string, 'pending' | 'processing' | 'done' | 'failed' | null>> {
  const { data } = await client.post('/documents/check-filenames', { filenames })
  return data
}

export function getImageUrl(rawDocId: string, annotated = false): string {
  const suffix = annotated ? '/annotated-image' : '/image'
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
  return `${base}/documents/raw/${rawDocId}${suffix}`
}

export function getRawFileUrl(rawDocId: string): string {
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
  return `${base}/documents/raw/${rawDocId}/file`
}

export function getOrderFileUrl(orderId: string): string {
  const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
  return `${base}/documents/orders/${orderId}/file`
}

// Sessions (batches)
export interface SessionSummary {
  id: string
  name: string
  status: string
  created_at: string
  closed_at: string | null
  doc_count: number
  done_count: number
  order_count: number
}

export interface SessionLine {
  id: string
  product_name_original: string
  temp_code: string
  product_id: string | null
  ocr_product_code: string | null
  product_code_mapped: string | null
  product_name_mapped: string | null
  quantity: number | null
  unit_price: number | null
  line_total: number | null
  uom_original: string | null
  uom_mapped: string | null
  tax_rate: number | null
  mapping_status: 'pending' | 'mapped' | 'overridden'
}

export interface SessionOrder {
  id: string
  raw_document_id: string
  file_name: string | null
  order_number: string | null
  po_number: string | null
  order_date: string | null
  delivery_date: string | null
  total_amount: number | null
  tax_amount: number | null
  recipient_name: string | null
  partner_name: string | null
  delivery_address: string | null
  description: string | null
  partner_id: string | null
  extra_data: Record<string, string> | null
  ocr_company_name?: string | null
  ocr_company_address?: string | null
  ocr_delivery_address?: string | null
  ocr_recipient_name?: string | null
  ocr_total_amount?: number | null
  ocr_tax_amount?: number | null
  status: string
  pending_count: number
  mapped_count: number
  lines: SessionLine[]
}

export interface SessionDetails {
  id: string
  name: string
  status: string
  created_at: string
  doc_count: number
  processing_count: number
  done_count: number
  failed_count: number
  total_products: number
  total_unmapped: number
  orders: SessionOrder[]
}

export async function getSessions(): Promise<SessionSummary[]> {
  const { data } = await client.get('/sessions')
  return data
}

export async function getSessionDetails(id: string): Promise<SessionDetails> {
  const { data } = await client.get(`/sessions/${id}/details`)
  return data
}
