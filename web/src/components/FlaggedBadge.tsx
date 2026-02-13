'use client'

import { useMemo } from 'react'

// Inline check — same patterns as lib/moderation.ts (runs client-side)
const FLAGGED_PATTERNS = [
  /\bn[i1]gg[ae3]r?s?\b/i,
  /\bf[a@]gg?[o0]t?s?\b/i,
  /\bk[i1]ke?s?\b/i,
  /\bsp[i1]c?k?s?\b/i,
  /\bch[i1]nk?s?\b/i,
  /\btr[a@]nn(?:y|ies)\b/i,
  /\br[e3]t[a@]rd(?:ed|s)?\b/i,
  /\bk[i1]ll\s+(?:yourself|urself|all)\b/i,
  /\bh[e3][i1]l\s+h[i1]tl[e3]r\b/i,
  /\bgas\s+the\b/i,
  /\bh[a@]te\b/i,
]

function isFlagged(text: string): boolean {
  if (!text) return false
  return FLAGGED_PATTERNS.some(p => p.test(text))
}

export default function FlaggedBadge({ text }: { text: string }) {
  const flagged = useMemo(() => isFlagged(text), [text])
  if (!flagged) return null

  return (
    <span
      className="inline-flex items-center gap-0.5 text-error text-[10px] font-medium"
      title="This content has been flagged"
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 2v20h2V14h6l1 2h7V4h-7l-1-2H4z" />
      </svg>
      flagged
    </span>
  )
}
