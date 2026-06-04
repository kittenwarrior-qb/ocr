import { useState, useEffect } from 'react'
import { Spin, Select } from 'antd'
import * as XLSX from 'xlsx'
import client from '@/api/client'

interface Props {
  url: string
  fileName?: string
}

export default function ExcelPreview({ url, fileName }: Props) {
  const [sheets, setSheets] = useState<Record<string, string[][]>>({})
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!url) return
    setLoading(true)
    setError('')

    // Fetch the file as binary
    client.get(url, { responseType: 'arraybuffer' })
      .then(res => {
        const wb = XLSX.read(res.data, { type: 'array' })
        const result: Record<string, string[][]> = {}
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name]
          result[name] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
        }
        setSheets(result)
        setSheetNames(wb.SheetNames)
        setActiveSheet(wb.SheetNames[0] || '')
      })
      .catch(() => setError('Không thể tải file Excel'))
      .finally(() => setLoading(false))
  }, [url])

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-white">
      <Spin tip="Đang tải Excel..." />
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full bg-white text-red-500 text-sm">{error}</div>
  )

  const rows = sheets[activeSheet] || []
  if (!rows.length) return (
    <div className="flex items-center justify-center h-full bg-white text-slate-400 text-sm">Sheet trống</div>
  )

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sheet selector */}
      {sheetNames.length > 1 && (
        <div className="px-3 py-1.5 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <span className="text-xs text-slate-500">Sheet:</span>
          <Select
            size="small"
            value={activeSheet}
            onChange={setActiveSheet}
            options={sheetNames.map(n => ({ value: n, label: n }))}
            className="w-48"
          />
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-semibold sticky top-0 z-10' : ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                {/* Row number */}
                <td className="px-1.5 py-1 text-slate-300 text-[10px] border border-slate-200 text-right select-none w-8 sticky left-0 bg-slate-50">
                  {ri + 1}
                </td>
                {(row as string[]).map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-2 py-1 border border-slate-200 whitespace-nowrap max-w-[280px] truncate"
                    title={String(cell || '')}
                  >
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50">
        {fileName} · {rows.length} dòng · {rows[0]?.length || 0} cột
      </div>
    </div>
  )
}
