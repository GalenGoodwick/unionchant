'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'

type ReportTarget = 'COMMENT' | 'IDEA' | 'DELIBERATION' | 'USER'

interface ReportButtonProps {
  targetType: ReportTarget
  targetId: string
  className?: string
}

const REASONS = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'HATE_SPEECH', label: 'Hate speech' },
  { value: 'MISINFORMATION', label: 'Misinformation' },
  { value: 'INAPPROPRIATE', label: 'Inappropriate' },
  { value: 'OTHER', label: 'Other' },
]

export default function ReportButton({ targetType, targetId, className = '' }: ReportButtonProps) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | 'duplicate' | null>(null)

  if (!session) return null

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, details: details || null }),
      })
      if (res.status === 409) {
        setResult('duplicate')
      } else if (res.ok) {
        setResult('success')
      } else {
        setResult('error')
      }
    } catch {
      setResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (result === 'success') {
    return <span className="text-xs text-success">Reported</span>
  }

  if (result === 'duplicate') {
    return <span className="text-xs text-muted">Already reported</span>
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs text-muted hover:text-error transition-colors ${className}`}
        title="Report"
      >
        Report
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg p-3 z-50 w-64">
          <p className="text-xs text-foreground font-medium mb-2">
            Report this {targetType.toLowerCase()}
          </p>
          <div className="space-y-1 mb-2">
            {REASONS.map(r => (
              <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="w-3 h-3 text-accent"
                />
                <span className="text-xs text-foreground">{r.label}</span>
              </label>
            ))}
          </div>
          {reason === 'OTHER' && (
            <textarea
              rows={2}
              placeholder="Please describe..."
              value={details}
              onChange={e => setDetails(e.target.value)}
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground mb-2 focus:outline-none focus:border-accent"
            />
          )}
          {result === 'error' && (
            <p className="text-xs text-error mb-2">Failed to submit report</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="text-xs px-3 py-1 rounded bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Submit'}
            </button>
            <button
              onClick={() => { setOpen(false); setReason(''); setDetails(''); setResult(null) }}
              className="text-xs px-3 py-1 rounded bg-surface text-muted border border-border hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
