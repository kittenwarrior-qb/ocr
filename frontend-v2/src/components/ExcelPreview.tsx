import { useState, useEffect } from 'react'
import { Spin, Tag } from 'antd'
import * as XLSX from 'xlsx'

interface Props { url: string; fileName?: string }

interface ParsedOrder {
  isSatoriTemplate: boolean
  customerName: string
  taxCode: string
  contact: string
  phone: string
  address: string
  deliveryAddress: string
  items: Array<{
    stt: number
    name: string
    spec: string
    uom: string
    qty: number
    qtyPromo: number
    unitPrice: number
    lineTotal: number
    taxRate: number
    lineTotalWithTax: number
  }>
  grandTotal: number
  sheetName: string
}

function parseSatoriSheet(ws: XLSX.WorkSheet, sheetName: string): ParsedOrder {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null }) as any[][]

  const str = (v: any) => (v == null ? '' : String(v).trim())
  const num = (v: any) => parseFloat(str(v).replace(/,/g, '')) || 0

  const result: ParsedOrder = {
    isSatoriTemplate: true,
    customerName: '', taxCode: '', contact: '', phone: '',
    address: '', deliveryAddress: '',
    items: [], grandTotal: 0, sheetName,
  }

  // Parse header rows (R12-R15, 0-indexed = rows 11-14)
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]
    const flat = row.map(str).join(' ')
    const vals = row.map(str)

    if (/bên mua\s*:/i.test(flat)) {
      // Extract value after "Bên mua :"
      const joined = vals.join(' ')
      const m = joined.match(/bên mua\s*:\s*([^\t\n]+?)(?:\s*MST\s*:|$)/i)
      if (m) result.customerName = m[1].trim()
      const mst = joined.match(/MST\s*:\s*(\d{10,13})/i)
      if (mst) result.taxCode = mst[1]
    }
    if (/người liên hệ\s*:/i.test(flat)) {
      const m = flat.match(/người liên hệ\s*:\s*([^\t\n]*?)(?:\s*điện thoại|$)/i)
      if (m) result.contact = m[1].trim()
      const ph = flat.match(/điện thoại\s*:\s*([\d.\s\-]+)/i)
      if (ph) result.phone = ph[1].trim()
    }
    if (/địa chỉ giao hàng\s*:/i.test(flat)) {
      const m = flat.match(/địa chỉ giao hàng\s*:\s*(.+)/i)
      if (m) result.deliveryAddress = m[1].trim()
    } else if (!result.address && /địa chỉ giao dịch\s*:/i.test(flat)) {
      const m = flat.match(/địa chỉ giao dịch\s*:\s*(.+)/i)
      if (m) result.address = m[1].trim()
    }
  }

  // Find data rows: after STT/Tên hàng header
  let dataStart = -1
  for (let i = 0; i < rows.length; i++) {
    const flat = rows[i].map(str).join(' ').toLowerCase()
    if (flat.includes('stt') && flat.includes('tên hàng') && flat.includes('số lượng')) {
      dataStart = i + 2; break
    }
  }
  if (dataStart < 0) return result

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.some(v => v != null)) continue

    // Total row
    const flat = row.map(str).join(' ').toLowerCase()
    if (/tổng tiền đơn hàng/.test(flat)) {
      result.grandTotal = num(row[12])
      continue
    }

    // Valid item row: col 1 = sequential number
    const stt = parseInt(str(row[1]))
    if (isNaN(stt) || stt < 1 || stt > 100) continue

    const name = str(row[2])
    if (!name) continue

    const qty = num(row[5])
    const qtyPromo = num(row[6])
    const unitPrice = num(row[8])
    const lineTotal = num(row[9])
    const taxRateRaw = num(row[10])
    const lineTotalWithTax = num(row[12])
    const taxRate = taxRateRaw < 1 ? taxRateRaw * 100 : taxRateRaw

    result.items.push({
      stt, name, spec: str(row[3]), uom: str(row[4]),
      qty, qtyPromo, unitPrice, lineTotal, taxRate, lineTotalWithTax,
    })
  }

  return result
}

function isSatoriFile(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, range: 'A1:Z20' }) as any[][]
  const flat = rows.flat().map(v => String(v || '')).join(' ').toLowerCase()
  return flat.includes('satori') && flat.includes('đơn đặt hàng') && flat.includes('bên mua')
}

function fmt(n: number) {
  return n > 0 ? n.toLocaleString('vi-VN') : '—'
}

function SatoriPreview({ data }: { data: ParsedOrder }) {
  const filledItems = data.items.filter(i => i.qty > 0)
  const emptyItems = data.items.filter(i => i.qty === 0)

  return (
    <div className="p-4 space-y-4 text-xs font-[Calibri,Arial,sans-serif]">
      {/* Header */}
      <div className="border border-slate-200 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-slate-50">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-bold text-blue-800">CÔNG TY CỔ PHẦN THƯƠNG MẠI SATORI</div>
            <div className="text-slate-500 mt-0.5">MST: 0302056457 · ĐT: 0287 300 5797</div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-slate-700 uppercase tracking-wide">Đơn Đặt Hàng</div>
            <Tag color="blue" className="mt-1">{data.sheetName}</Tag>
          </div>
        </div>
      </div>

      {/* Customer info */}
      <div className="border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        <InfoRow label="Bên mua" value={data.customerName} bold />
        <InfoRow label="MST" value={data.taxCode} mono />
        <InfoRow label="Người liên hệ" value={data.contact} />
        <InfoRow label="Điện thoại" value={data.phone} />
        {data.address && <InfoRow label="Địa chỉ giao dịch" value={data.address} span />}
        {data.deliveryAddress && <InfoRow label="Địa chỉ giao hàng" value={data.deliveryAddress} span />}
      </div>

      {/* Items with quantity */}
      {filledItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-emerald-700">Hàng đặt ({filledItems.length} sản phẩm)</span>
            <span className="text-slate-400">—</span>
            <span className="font-bold text-slate-700">{fmt(data.grandTotal)} đ</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-emerald-600 text-white">
                <th className="px-2 py-1.5 text-center w-8">STT</th>
                <th className="px-2 py-1.5 text-left">Tên hàng hóa</th>
                <th className="px-2 py-1.5 text-center w-16">ĐVT</th>
                <th className="px-2 py-1.5 text-right w-16">SL đặt</th>
                <th className="px-2 py-1.5 text-right w-16">SL KM</th>
                <th className="px-2 py-1.5 text-right w-24">Đơn giá</th>
                <th className="px-2 py-1.5 text-right w-24">Thành tiền</th>
                <th className="px-2 py-1.5 text-center w-12">Thuế</th>
                <th className="px-2 py-1.5 text-right w-28">Tổng (+VAT)</th>
              </tr>
            </thead>
            <tbody>
              {filledItems.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className="px-2 py-1.5 text-center text-slate-400">{item.stt}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-800">
                    {item.name}
                    {item.spec && <span className="text-slate-400 font-normal ml-1">({item.spec})</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-600">{item.uom}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmt(item.qty)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{item.qtyPromo > 0 ? fmt(item.qtyPromo) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{fmt(item.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{fmt(item.lineTotal)}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{item.taxRate > 0 ? `${item.taxRate}%` : '—'}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-slate-800">{fmt(item.lineTotalWithTax)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 border-t-2 border-emerald-300 font-bold">
                <td colSpan={6} className="px-2 py-2 text-right text-slate-600">Tổng cộng</td>
                <td className="px-2 py-2 text-right text-emerald-800">
                  {fmt(filledItems.reduce((s, i) => s + i.lineTotal, 0))}
                </td>
                <td />
                <td className="px-2 py-2 text-right text-emerald-800 text-sm">{fmt(data.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Empty rows (not ordered) */}
      {emptyItems.length > 0 && (
        <details className="border border-slate-200 rounded-lg">
          <summary className="px-3 py-2 text-slate-400 cursor-pointer hover:text-slate-600 select-none">
            {emptyItems.length} sản phẩm chưa đặt (bấm để xem)
          </summary>
          <div className="px-3 pb-3">
            {emptyItems.map((item, i) => (
              <div key={i} className="py-0.5 text-slate-400">
                {item.stt}. {item.name} — {fmt(item.unitPrice)} đ/{item.uom}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function InfoRow({ label, value, bold, mono, span }: { label: string; value: string; bold?: boolean; mono?: boolean; span?: boolean }) {
  if (!value) return null
  return (
    <div className={span ? 'col-span-2' : ''}>
      <span className="text-slate-400 mr-1">{label}:</span>
      <span className={`${bold ? 'font-semibold text-slate-800' : 'text-slate-700'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ── Generic table preview (non-Satori) ──────────────────────────────────────

function GenericPreview({ wb }: { wb: XLSX.WorkBook }) {
  const [activeSheet, setActiveSheet] = useState(wb.SheetNames[0])

  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[activeSheet], {
    header: 1, defval: '',
  }) as string[][]

  return (
    <div className="flex flex-col h-full">
      {wb.SheetNames.length > 1 && (
        <div className="flex gap-1 px-3 py-1.5 border-b border-slate-200 bg-slate-50">
          {wb.SheetNames.map(n => (
            <button key={n} onClick={() => setActiveSheet(n)}
              className={`px-2 py-0.5 rounded text-xs font-medium ${n === activeSheet ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        <table className="border-collapse text-[11px]">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-semibold sticky top-0' : ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                <td className="px-1.5 text-slate-300 text-[10px] border border-slate-200 text-right select-none w-7">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-0.5 border border-slate-200 whitespace-nowrap max-w-[240px] truncate" title={String(cell)}>
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ExcelPreview({ url, fileName }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null)
  const [satoriData, setSatoriData] = useState<ParsedOrder | null>(null)

  useEffect(() => {
    if (!url) return
    setLoading(true)
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer() })
      .then(buf => {
        const workbook = XLSX.read(buf, { type: 'array' })
        setWb(workbook)
        if (isSatoriFile(workbook)) {
          const ws = workbook.Sheets[workbook.SheetNames[0]]
          setSatoriData(parseSatoriSheet(ws, workbook.SheetNames[0]))
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [url])

  if (loading) return <div className="flex items-center justify-center h-full bg-white"><Spin tip="Đang tải..." /></div>
  if (error) return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>
  if (!wb) return null

  return (
    <div className="flex flex-col h-full bg-white overflow-auto">
      {satoriData ? <SatoriPreview data={satoriData} /> : <GenericPreview wb={wb} />}
      <div className="px-3 py-1 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50 shrink-0">{fileName}</div>
    </div>
  )
}
