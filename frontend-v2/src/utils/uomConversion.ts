import type { Product } from './catalogStore'

export interface UomConversionResult {
  fromUom: string
  toUom: string
  originalQty: number
  convertedQty: number
  unitsPerTarget: number
  productLabel: string
  reason: string
  formula: string
}

const SOURCE_UNIT_RE = /\b(chai|bottle|bottles|pc|pcs|piece|pieces|cai|lon|can|cans|binh)\b/i
const TARGET_PACK_UNIT_RE = /\b(thung|box|boxes|carton|cartons|ctn|case|cases|cs|loc)\b/i

function normalize(value: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function productText(product?: Partial<Product> | null, fallbackName = '') {
  return normalize(`${product?.code || ''} ${product?.name || ''} ${fallbackName}`)
}

function targetIsPack(uom?: string | null) {
  return TARGET_PACK_UNIT_RE.test(normalize(uom || ''))
}

function sourceIsEach(uom?: string | null) {
  return SOURCE_UNIT_RE.test(normalize(uom || ''))
}

export function unitsPerBox(product?: Partial<Product> | null, fallbackName = ''): number | null {
  const text = productText(product, fallbackName)
  const code = (product?.code || '').trim().toUpperCase()

  // Exact rules from price list 012/TBGT052026/SATORI.
  if (['TP-00001', 'TP-00001NC', 'TP-00003', 'TP-00003NC', 'TP-00081', 'TP-00081NC'].includes(code)) return 24
  if (['TP-00004', 'TP-00004NC'].includes(code)) return 12
  if (['TP-00051', 'TP-00051NC'].includes(code)) return 20
  if (['TP-00135', 'TP-00136'].includes(code)) return 4
  if (['TP-00137', 'TP-00140'].includes(code)) return 24
  if (code === 'TP-00139') return 12
  if (code === 'TP-00138') return 6
  if (['TP-00055', 'TP-00056', 'TP-00058'].includes(code)) return 24

  if (/\b(1500ml|1\.500ml|1\.5l|1 5l)\b/.test(text)) return 12
  if (/\b450ml\b/.test(text)) return 20
  if (/\b(5l|5000ml)\b/.test(text) && !text.includes('binh')) return 4
  if (/\b(250ml|350ml|500ml)\b/.test(text)) return 24
  if (text.includes('juice') || text.includes('24lon')) return 24

  return null
}

export function getUomConversion(
  params: {
    quantity: unknown
    sourceUom?: string | null
    targetUom?: string | null
    product?: Partial<Product> | null
    fallbackProductName?: string
  },
): UomConversionResult | null {
  const originalQty = Number(params.quantity)
  if (!Number.isFinite(originalQty) || originalQty <= 0) return null
  if (!sourceIsEach(params.sourceUom)) return null
  if (!targetIsPack(params.targetUom)) return null

  const units = unitsPerBox(params.product, params.fallbackProductName)
  if (!units) return null

  const convertedQty = originalQty / units
  const productLabel = params.product?.name || params.fallbackProductName || params.product?.code || 'Hàng hóa'
  const fromUom = params.sourceUom || 'chai'
  const toUom = params.targetUom || 'Thùng'

  return {
    fromUom,
    toUom,
    originalQty,
    convertedQty,
    unitsPerTarget: units,
    productLabel,
    reason: `${productLabel}: 1 ${toUom} = ${units} ${fromUom}`,
    formula: `${originalQty.toLocaleString('vi-VN')} ${fromUom} / ${units} = ${convertedQty.toLocaleString('vi-VN')} ${toUom}`,
  }
}
