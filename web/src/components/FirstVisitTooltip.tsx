'use client'

import { useFirstVisit } from '@/hooks/useFirstVisit'

export default function FirstVisitTooltip({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const [show, dismiss] = useFirstVisit(id)

  if (!show) return null

  return (
    <div className="bg-header text-white rounded-lg px-3 py-2.5 mb-3 shadow-sm">
      <div className="text-xs leading-relaxed">{children}</div>
      <button
        onClick={dismiss}
        className="mt-2 flex items-center gap-1.5 text-[10px] text-white/70 hover:text-white transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Don&apos;t show again
      </button>
    </div>
  )
}
