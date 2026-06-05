import { useState, useEffect } from 'react'
import { Spin, Select } from 'antd'
import * as XLSX from 'xlsx'

interface Props { url: string; fileName?: string }

export default function ExcelPreview({ url, fileName }: Props) {
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [htmlMap, setHtmlMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!url) return
    setLoading(true); setError('')
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer() })
      .then(buf => {
        const wb = XLSX.read(buf, { type: 'array' })
        const map: Record<string, string> = {}
        for (const name of wb.SheetNames) {
          map[name] = XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false })
        }
        setSheetNames(wb.SheetNames)
        setActiveSheet(wb.SheetNames[0] || '')
        setHtmlMap(map)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [url])

  if (loading) return <div className="flex items-center justify-center h-full bg-white"><Spin tip="Đang tải Excel..." /></div>
  if (error) return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>

  return (
    <div className="flex flex-col h-full bg-white">
      {sheetNames.length > 1 && (
        <div className="px-3 py-1.5 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <span className="text-xs text-slate-500 shrink-0">Sheet:</span>
          <Select size="small" value={activeSheet} onChange={setActiveSheet}
            options={sheetNames.map(n => ({ value: n, label: n }))} className="w-48" />
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <style>{`
          .xl-wrap table { border-collapse: collapse; font-size: 11px; font-family: Calibri,Arial,sans-serif; min-width: max-content; }
          .xl-wrap td, .xl-wrap th { border: 1px solid #bbb; padding: 2px 6px; white-space: nowrap; vertical-align: middle; }
          .xl-wrap td:empty, .xl-wrap th:empty { min-width: 20px; }
        `}</style>
        <div className="xl-wrap p-2"
          dangerouslySetInnerHTML={{ __html: htmlMap[activeSheet] || '' }} />
      </div>
      <div className="px-3 py-1 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50 shrink-0">{fileName}</div>
    </div>
  )
}
