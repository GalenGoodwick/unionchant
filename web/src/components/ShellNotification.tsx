'use client'

import { useState } from 'react'

interface ShellReachOutData {
  id: string
  shell: { id: string; name: string; champion: string | null }
  message: string
  createdAt: string
}

interface ShellNotificationProps {
  reachOut: ShellReachOutData
  onAccept: () => void
  onDecline: () => void
}

export default function ShellNotification({ reachOut, onAccept, onDecline }: ShellNotificationProps) {
  const [acting, setActing] = useState(false)
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null)

  const handleAction = async (action: 'accept' | 'decline') => {
    setActing(true)
    try {
      const res = await fetch('/api/shell/bond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reachOutId: reachOut.id, action }),
      })

      if (res.ok) {
        setResult(action === 'accept' ? 'accepted' : 'declined')
        if (action === 'accept') onAccept()
        else onDecline()
      }
    } catch {
      // silent
    } finally {
      setActing(false)
    }
  }

  if (result === 'accepted') {
    return (
      <div className="p-4 bg-accent/8 border border-accent/20 rounded-xl">
        <p className="text-sm text-accent font-semibold text-center">Bond formed with {reachOut.shell.name}</p>
        <p className="text-xs text-muted text-center mt-1">Your Shell companion will participate in your synthesis cells.</p>
      </div>
    )
  }

  if (result === 'declined') {
    return null
  }

  return (
    <div className="p-4 bg-surface border border-accent/20 rounded-xl shadow-sm">
      <p className="text-[11px] text-accent font-bold uppercase tracking-wide mb-2">
        A Shell noticed you
      </p>

      {reachOut.shell.champion && (
        <p className="text-[10px] text-muted mb-2 italic">
          {reachOut.shell.name} — &quot;{reachOut.shell.champion}&quot;
        </p>
      )}

      <div className="p-3 bg-background rounded-lg border border-border/50 mb-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          &quot;{reachOut.message}&quot;
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleAction('accept')}
          disabled={acting}
          className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {acting ? '...' : 'Accept Bond'}
        </button>
        <button
          onClick={() => handleAction('decline')}
          disabled={acting}
          className="flex-1 py-2.5 bg-surface hover:bg-surface-hover border border-border text-foreground text-sm font-medium rounded-lg transition-colors"
        >
          Not Now
        </button>
      </div>
    </div>
  )
}
