export interface OrderLine {
  id: string
  product_name_original: string
  product_code?: string | null
  quantity: number | null
  unit_price: number | null
  line_total: number | null
  uom_original: string | null
  tax_rate: number | null
  discount_rate: number | null
  discount_amount: number | null
  temp_code: string
  product_id: string | null
  mapping_status: 'pending' | 'mapped' | 'overridden'
  ocr_product_code: string | null
}

export interface Order {
  id: string
  raw_document_id: string
  partner_id: string | null
  delivery_address_id: string | null
  order_number: string | null
  po_number: string | null
  order_date: string | null
  delivery_date: string | null
  currency: string | null
  payment_method: string | null
  recipient_name: string | null
  description: string | null
  total_amount: number | null
  discount_amount: number | null
  tax_amount: number | null
  extra_data: Record<string, string | number | null> | null
  missing_fields: string[]
  status: string
  processed_at: string
  file_name: string | null
  lines: OrderLine[]
  pending_count: number
  mapped_count: number
}

export interface RawDocument {
  id: string
  file_name: string
  document_type: string | null
  ocr_status: 'pending' | 'processing' | 'done' | 'failed'
  ocr_error: string | null
  upload_date: string
  extracted_data: Record<string, unknown> | null
}

export interface OrderUpdatePayload {
  order_date?: string | null
  delivery_date?: string | null
  total_amount?: number | null
  order_number?: string | null
  po_number?: string | null
  partner_id?: string | null
  delivery_address_id?: string | null
  currency?: string | null
  payment_method?: string | null
  recipient_name?: string | null
  description?: string | null
  discount_amount?: number | null
  extra_data?: Record<string, string | number | null>
  lines?: OrderLine[]
}

export interface UploadResult {
  raw_document_id: string
  file_name: string
  ocr_status: string
  is_duplicate?: boolean
}

export interface UploadBatchResponse {
  uploaded: number
  queue_pending: number
  duplicates: string[]
  files: UploadResult[]
}
