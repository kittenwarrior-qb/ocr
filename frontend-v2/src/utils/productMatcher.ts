import productsData from '@/data/products.json'

export interface Product {
  code: string
  name: string
  type: string
  uom: string
  price: number
  tax_rate: string
  property: string
}

const products = productsData as Product[]

/** Normalize: lowercase, remove accents, strip special chars */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Count how many words from query appear in target, with bidirectional penalty */
function wordOverlapScore(query: string, target: string): number {
  const qWords = normalize(query).split(' ').filter(w => w.length > 1)
  const tWords = normalize(target).split(' ').filter(w => w.length > 1)
  const tNorm = normalize(target)
  if (!qWords.length || !tWords.length) return 0
  const queryInTarget = qWords.filter(w => tNorm.includes(w)).length / qWords.length
  const qNorm = normalize(query)
  const targetInQuery = tWords.filter(w => qNorm.includes(w)).length / tWords.length
  // Average of both directions — rewards mutual overlap
  return (queryInTarget + targetInQuery) / 2
}

/** Simple substring score */
function substringScore(query: string, target: string): number {
  const q = normalize(query)
  const t = normalize(target)
  if (!q || !t) return 0
  if (t.includes(q)) return 1
  // Only give high score if target is substantial (>50% of query length)
  if (q.includes(t) && t.length > q.length * 0.5) return 0.9
  return 0
}

export interface MatchResult {
  product: Product
  score: number
}

/**
 * Find best matching products for a given OCR product name.
 * Returns top N matches sorted by score descending.
 */
export function matchProduct(ocrName: string, topN = 5): MatchResult[] {
  if (!ocrName?.trim()) return []

  const results: MatchResult[] = products.map(p => {
    const sub = substringScore(ocrName, p.name)
    const overlap = wordOverlapScore(ocrName, p.name)
    // Also check against code
    const codeMatch = normalize(ocrName).includes(normalize(p.code)) ? 0.5 : 0
    const score = Math.max(sub, overlap * 0.9, codeMatch)
    return { product: p, score }
  })

  return results
    .filter(r => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

/**
 * Get the single best match (score > threshold).
 * Returns null if no confident match found.
 */
export function getBestMatch(ocrName: string, threshold = 0.5): Product | null {
  const results = matchProduct(ocrName, 1)
  if (!results.length || results[0].score < threshold) return null
  return results[0].product
}

/** Search products by name or code (for manual selection UI) */
export function searchProducts(query: string): Product[] {
  if (!query.trim()) return products
  const q = normalize(query)
  return products.filter(p =>
    normalize(p.name).includes(q) ||
    normalize(p.code).includes(q)
  )
}

export { products }
