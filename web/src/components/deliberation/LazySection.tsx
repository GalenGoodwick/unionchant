'use client'

import { useState, useCallback } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LazySection({
  title,
  badge,
  fetchData,
  renderContent,
}: {
  title: string
  badge?: React.ReactNode
  fetchData: () => Promise<any>
  renderContent: (data: any) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handleToggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (data) return // already loaded
    setLoading(true)
    setError(false)
    try {
      const result = await fetchData()
      setData(result)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [open, data, fetchData])

  return (
    <div className="rounded-lg border border-border mb-4 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full px-4 py-3 flex justify-between items-center text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {!data && !loading && (
            <span className="text-xs text-muted">Click to load</span>
          )}
          <svg
            className={`w-5 h-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted text-sm">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          )}
          {error && (
            <div className="text-center py-6 text-error text-sm">
              Failed to load data.{' '}
              <button
                onClick={() => { setData(null); handleToggle() }}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}
          {data && renderContent(data)}
        </div>
      )}
    </div>
  )
}
