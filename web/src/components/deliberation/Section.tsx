'use client'

import { useState } from 'react'

export default function Section({
  title,
  badge,
  children,
  defaultOpen = true,
  variant = 'default'
}: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  variant?: 'default' | 'warning' | 'success' | 'purple' | 'orange'
}) {
  const [open, setOpen] = useState(defaultOpen)

  const variantStyles = {
    default: 'border-border',
    warning: 'border-warning bg-warning-bg',
    success: 'border-success bg-success-bg',
    purple: 'border-purple bg-purple-bg',
    orange: 'border-orange bg-orange-bg',
  }

  return (
    <div className={`rounded-lg border ${variantStyles[variant]} mb-4 overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex justify-between items-center text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        <svg
          className={`w-5 h-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
