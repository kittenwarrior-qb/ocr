export interface Partner {
  id: string
  code: string
  legal_name: string
  display_name: string | null
  tax_code: string | null
  partner_type: 'customer' | 'vendor'
  is_active: boolean
}

export interface PartnerAddress {
  id: string
  partner_id: string
  full_address: string
  label: string | null
}
