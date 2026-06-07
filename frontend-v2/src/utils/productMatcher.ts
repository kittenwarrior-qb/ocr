import { getProducts, getAliases, type Product } from './catalogStore'

export type { Product }

/** Normalize: lowercase, remove accents, strip special chars */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bntk\b/g, 'nuoc tinh khiet')
    .replace(/\bth\s*(\d+)\b/g, 'thung $1')
    .replace(/\b1[\.,]5\s*l\b/g, '1500ml 1 5l')
    .replace(/\b1\s*500\s*ml\b/g, '1500ml 1 5l')
    .replace(/\b1\.500\s*ml\b/g, '1500ml 1 5l')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasToken(text: string, token: string): boolean {
  return normalize(text).split(' ').includes(token)
}

function productSpecificScore(query: string, target: string): number {
  const q = normalize(query)
  const t = normalize(target)
  let score = 0

  if (q.includes('nuoc tinh khiet') && t.includes('nuoc tinh khiet')) score += 0.35
  if (q.includes('satori') && t.includes('satori')) score += 0.25
  if (q.includes('1500ml') && t.includes('1500ml')) score += 0.35
  if ((hasToken(q, 'thung') || /^thung\s+\d+/.test(q)) && hasToken(t, 'thung')) score += 0.1

  if (q.includes('nuoc tinh khiet') && !t.includes('nuoc tinh khiet')) score -= 0.45
  if (q.includes('1500ml') && !t.includes('1500ml')) score -= 0.45
  if (!q.includes('decal') && t.includes('decal')) score -= 0.6
  if (!q.includes('vo binh') && t.includes('vo binh')) score -= 0.35

  return score
}

function wordOverlapScore(query: string, target: string): number {
  const qWords = normalize(query).split(' ').filter(w => w.length > 1)
  const tWords = normalize(target).split(' ').filter(w => w.length > 1)
  const tNorm = normalize(target)
  if (!qWords.length || !tWords.length) return 0
  const queryInTarget = qWords.filter(w => tNorm.includes(w)).length / qWords.length
  const qNorm = normalize(query)
  const targetInQuery = tWords.filter(w => qNorm.includes(w)).length / tWords.length
  return (queryInTarget + targetInQuery) / 2
}

function substringScore(query: string, target: string): number {
  const q = normalize(query)
  const t = normalize(target)
  if (!q || !t) return 0
  if (t.includes(q)) return 1
  if (q.includes(t) && t.length > q.length * 0.5) return 0.9
  return 0
}

export interface MatchResult {
  product: Product
  score: number
}

function parseTaxRate(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(String(value).replace('%', '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

function taxScoreAdjustment(product: Product, expectedTaxRate?: unknown): number {
  const expected = parseTaxRate(expectedTaxRate)
  const actual = parseTaxRate(product.tax_rate)
  if (expected == null || actual == null) return 0
  return Math.abs(expected - actual) < 0.01 ? 0.25 : -0.35
}

/**
 * Check alias cache with priority:
 *   1. (norm, customerCode)  — customer-specific
 *   2. (norm, "")            — generic fallback
 */
function checkAlias(ocrName: string, customerCode = ''): Product | null {
  const aliases = getAliases()
  if (!aliases.length) return null
  const norm = normalize(ocrName)
  const products = getProducts()

  // Priority 1: customer-specific
  if (customerCode) {
    const hit = aliases.find(a => a.external_normalized === norm && a.customer_code === customerCode)
    if (hit) return products.find(p => p.code === hit.product_code) || null
  }
  // Priority 2: generic
  const generic = aliases.find(a => a.external_normalized === norm && !a.customer_code)
  if (generic) return products.find(p => p.code === generic.product_code) || null
  return null
}

export function matchProduct(ocrName: string, topN = 5, customerCode = '', expectedTaxRate?: unknown): MatchResult[] {
  if (!ocrName?.trim()) return []

  // 1. Check alias dictionary (exact, customer-aware) — score 1.0
  const aliasHit = checkAlias(ocrName, customerCode)
  if (aliasHit) {
    const rest = matchProduct_fuzzy(ocrName, topN - 1, expectedTaxRate).filter(r => r.product.code !== aliasHit.code)
    return [{ product: aliasHit, score: 1.0 + taxScoreAdjustment(aliasHit, expectedTaxRate) }, ...rest]
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
  }

  return matchProduct_fuzzy(ocrName, topN, expectedTaxRate)
}

function matchProduct_fuzzy(ocrName: string, topN: number, expectedTaxRate?: unknown): MatchResult[] {
  const products = getProducts()
  const results: MatchResult[] = products.map(p => {
    const sub = substringScore(ocrName, p.name)
    const overlap = wordOverlapScore(ocrName, p.name)
    const codeMatch = normalize(ocrName).includes(normalize(p.code)) ? 0.5 : 0
    const score = Math.max(sub, overlap * 0.9, codeMatch)
      + productSpecificScore(ocrName, p.name)
      + taxScoreAdjustment(p, expectedTaxRate)
    return { product: p, score }
  })
  return results.filter(r => r.score > 0.2).sort((a, b) => b.score - a.score).slice(0, topN)
}

export function getBestMatch(ocrName: string, threshold = 0.5, customerCode = '', expectedTaxRate?: unknown): Product | null {
  const aliasHit = checkAlias(ocrName, customerCode)
  if (aliasHit && taxScoreAdjustment(aliasHit, expectedTaxRate) >= 0) return aliasHit
  const results = matchProduct_fuzzy(ocrName, 1, expectedTaxRate)
  if (!results.length || results[0].score < threshold) return null
  return results[0].product
}

export function searchProducts(query: string): Product[] {
  const products = getProducts()
  if (!query.trim()) return products
  const q = normalize(query)
  return products.filter(p => normalize(p.name).includes(q) || normalize(p.code).includes(q))
}

/** Direct access to products array */
export const products = { get value() { return getProducts() } }
