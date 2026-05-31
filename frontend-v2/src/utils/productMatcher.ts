import { getProducts, type Product } from './catalogStore'

export type { Product }

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

export function matchProduct(ocrName: string, topN = 5): MatchResult[] {
  if (!ocrName?.trim()) return []
  const products = getProducts()
  const results: MatchResult[] = products.map(p => {
    const sub = substringScore(ocrName, p.name)
    const overlap = wordOverlapScore(ocrName, p.name)
    const codeMatch = normalize(ocrName).includes(normalize(p.code)) ? 0.5 : 0
    const score = Math.max(sub, overlap * 0.9, codeMatch)
    return { product: p, score }
  })
  return results.filter(r => r.score > 0.2).sort((a, b) => b.score - a.score).slice(0, topN)
}

export function getBestMatch(ocrName: string, threshold = 0.5): Product | null {
  const results = matchProduct(ocrName, 1)
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
