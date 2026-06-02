import { getCustomers, type Customer } from './catalogStore'

export type { Customer }

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripCompanyPrefix(name: string): string {
  return normalize(name)
    .replace(/^(cty|cong ty tnhh|cong ty co phan|cong ty|ho kinh doanh|doanh nghiep tu nhan|chi nhanh)\s+/i, '')
    .trim()
}

const GENERIC_CUSTOMER_WORDS = new Set([
  'cty', 'cong', 'ty', 'tnhh', 'tm', 'dv', 'dich', 'vu', 'thuong', 'mai',
  'co', 'phan', 'cp', 'mtv', 'hh', 'limited', 'company', 'viet', 'nam',
])

function distinctiveWords(text: string): string[] {
  return stripCompanyPrefix(text)
    .split(' ')
    .filter(w => w.length >= 3 && !GENERIC_CUSTOMER_WORDS.has(w))
}

function wordOverlapScore(query: string, target: string): number {
  const qWords = distinctiveWords(query)
  const tWords = new Set(distinctiveWords(target))
  if (!qWords.length) return 0
  const matches = qWords.filter(w => tWords.has(w))
  return matches.length / qWords.length
}

function substringScore(query: string, target: string): number {
  const qWords = distinctiveWords(query)
  const tWords = distinctiveWords(target)
  const q = qWords.join(' ')
  const t = tWords.join(' ')
  if (!q || !t) return 0
  if (t.includes(q)) return 1
  if (q.includes(t) && t.length > 5) return 0.85
  return 0
}

function addressScore(queryAddr: string, targetAddr: string): number {
  if (!queryAddr || !targetAddr) return 0
  const q = normalize(queryAddr)
  const t = normalize(targetAddr)
  const cities = ['ho chi minh', 'ha noi', 'da nang', 'can tho', 'dong nai', 'binh duong']
  for (const city of cities) {
    if (q.includes(city) && t.includes(city)) return 0.3
  }
  return 0
}

export interface CustomerMatchResult {
  customer: Customer
  score: number
}

export function matchCustomer(companyName: string, address?: string, topN = 5): CustomerMatchResult[] {
  if (!companyName?.trim()) return []
  if (!distinctiveWords(companyName).length) return []
  const customers = getCustomers()
  const results: CustomerMatchResult[] = customers.map(c => {
    const sub = substringScore(companyName, c.name)
    const overlap = wordOverlapScore(companyName, c.name)
    const addr = address ? addressScore(address, c.invoice_address) : 0
    const score = Math.max(sub, overlap * 0.9) + addr * 0.2
    return { customer: c, score }
  })
  return results.filter(r => r.score > 0.25).sort((a, b) => b.score - a.score).slice(0, topN)
}

export function getBestCustomerMatch(companyName: string, address?: string, threshold = 0.5): Customer | null {
  const results = matchCustomer(companyName, address, 1)
  if (!results.length || results[0].score < threshold) return null
  return results[0].customer
}

/** Direct access to customers array */
export const customers = { get value() { return getCustomers() } }
