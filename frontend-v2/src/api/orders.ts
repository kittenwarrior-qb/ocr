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

export async function uploadBatch(files: File[], useAI = true): Promise<UploadBatchResponse> {
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

export function getImageUrl(rawDocId: string, annotated = false): string {
  const suffix = annotated ? '/annotated-image' : '/image'
  return `/api/v1/documents/raw/${rawDocId}${suffix}`
}
