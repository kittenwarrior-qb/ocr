import type { ReactNode } from 'react'

/** Tiêu đề nhóm field kiểu form desktop (Bravo): chữ nhỏ, in hoa, gạch chân nhạt. */
export default function FormSection({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200 pb-1 mb-3 mt-1 first:mt-0">
      {children}
    </div>
  )
}
