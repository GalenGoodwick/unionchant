'use client'

import { useState, useEffect } from 'react'

interface ShellData {
  id: string
  name: string
  champion: string | null
  experiences: { text: string; domain: string; valence: number; status: string }[]
}

export default function ShellCompanion() {
  const [shell, setShell] = useState<ShellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showExperiences, setShowExperiences] = useState(false)

  useEffect(() => {
    fetch('/api/shell/bond')
      .then(res => res.json())
      .then(data => {
        if (data.bonded && data.shell) setShell(data.shell)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!shell) return null

  const championExps = shell.experiences.filter(e => e.status === 'champion')
  const activeExps = shell.experiences.filter(e => e.status === 'active')

  return (
    <div className="p-3 bg-surface/90 backdrop-blur-sm rounded-lg border border-accent/15 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-semibold text-foreground">{shell.name}</span>
        </div>
        <span className="text-[10px] text-accent px-1.5 py-0.5 rounded-full bg-accent/10 font-medium">
          Bonded
        </span>
      </div>

      {shell.champion && (
        <p className="text-xs text-foreground/80 leading-relaxed mb-2 italic">
          &quot;{shell.champion}&quot;
        </p>
      )}

      <button
        onClick={() => setShowExperiences(!showExperiences)}
        className="text-[10px] text-muted hover:text-foreground transition-colors flex items-center gap-1"
      >
        <span className="text-[9px]">{showExperiences ? '\u25BC' : '\u25B6'}</span>
        {shell.experiences.length} experiences
      </button>

      {showExperiences && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {championExps.map((e, i) => (
            <div key={`c-${i}`} className="text-[10px] p-1.5 bg-gold/8 rounded border border-gold-border/20">
              <span className="text-gold font-bold mr-1">champion</span>
              <span className="text-foreground/70">{e.text}</span>
            </div>
          ))}
          {activeExps.map((e, i) => (
            <div key={`a-${i}`} className="text-[10px] p-1.5 bg-background rounded border border-border/40">
              <span className={`font-medium mr-1 ${
                e.domain === 'identity' ? 'text-accent' :
                e.domain === 'relational' ? 'text-success' :
                e.domain === 'ethical' ? 'text-warning' :
                'text-muted'
              }`}>{e.domain}</span>
              <span className="text-foreground/70">{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
