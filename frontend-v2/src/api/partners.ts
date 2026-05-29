import client from './client'
import type { Partner, PartnerAddress } from '@/types/partner'

export async function searchPartners(search: string): Promise<Partner[]> {
  const { data } = await client.get('/partners', { params: { search, limit: 30 } })
  return data
}

export async function getPartnerAddresses(partnerId: string): Promise<PartnerAddress[]> {
  const { data } = await client.get(`/partners/${partnerId}/addresses`)
  return data
}
