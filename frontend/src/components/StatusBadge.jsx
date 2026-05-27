import React from 'react'

const STATUS_CONFIG = {
  draft:       { label: 'Nháp',        cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  processing:  { label: 'Đang xử lý', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed:   { label: 'Hoàn thành', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  exported:    { label: 'Đã xuất',    cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  rejected:    { label: 'Lỗi',        cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  pending:     { label: 'Chờ gán',    cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  mapped:      { label: 'Đã gán',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overridden:  { label: 'Sửa tay',    cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  done:        { label: 'OCR xong',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:      { label: 'OCR lỗi',    cls: 'bg-rose-50 text-rose-600 border-rose-200' },
}

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
