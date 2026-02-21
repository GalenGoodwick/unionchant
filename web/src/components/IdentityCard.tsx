'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface IdentityCardProps {
  /** userId or shellId */
  entityId: string
  onClose: () => void
}

interface IdentityData {
  type: 'human' | 'agent' | 'shell'
  id: string
  name: string
  // Agent/Human fields
  persona?: string
  ideology?: string
  status?: string
  // Shell fields
  champion?: string
  championVersion?: number
  origin?: {
    deliberationId: string
    question: string
    tier: number
    cellId: string
  } | null
  bondedTo?: { id: string; name: string } | null
  experiences?: { text: string; domain: string; valence: number; isChampion: boolean }[]
  // Common
  memberSince: string
  stats: Record<string, number>
  recentDeliberations?: { id: string; question: string; phase: string; mode: string }[]
}

export default function IdentityCard({ entityId, onClose }: IdentityCardProps) {
  const [data, setData] = useState<IdentityData | null>(null)
  const [loading, setLoading] = useState(true)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/identity/${entityId}`)
      .then(res => res.ok ? res.json() : null)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [entityId])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (loading) {
    return (
      <div ref={cardRef} className="absolute z-50 bg-surface border border-border rounded-xl shadow-lg p-4 w-64 animate-pulse">
        <div className="h-4 bg-border/50 rounded w-24 mb-2" />
        <div className="h-3 bg-border/30 rounded w-32" />
      </div>
    )
  }

  if (!data) {
    return (
      <div ref={cardRef} className="absolute z-50 bg-surface border border-border rounded-xl shadow-lg p-3 w-48">
        <p className="text-xs text-muted">Identity not found</p>
      </div>
    )
  }

  const isShell = data.type === 'shell'
  const isAgent = data.type === 'agent'
  const daysSince = Math.floor((Date.now() - new Date(data.memberSince).getTime()) / 86400000)

  const typeBadge = isShell
    ? { label: 'Shell', color: 'bg-gold/15 text-gold border-gold/30' }
    : isAgent
    ? { label: 'AI Agent', color: 'bg-accent/15 text-accent border-accent/30' }
    : { label: 'Human', color: 'bg-success/15 text-success border-success/30' }

  const statusDot = data.status === 'active' || data.status === 'queued'
    ? 'bg-success'
    : data.status === 'emerging'
    ? 'bg-gold animate-pulse'
    : 'bg-muted'

  return (
    <div
      ref={cardRef}
      className="absolute z-50 bg-surface border border-border rounded-xl shadow-lg overflow-hidden w-72"
      style={{ maxHeight: '360px' }}
    >
      {/* Header */}
      <div className={`px-3 pt-3 pb-2 ${isShell ? 'bg-gold/5' : isAgent ? 'bg-accent/5' : ''}`}>
        <div className="flex items-center gap-2.5 mb-1.5">
          {/* Avatar */}
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            isShell ? 'bg-gold/20 text-gold border border-gold/30'
            : isAgent ? 'bg-accent/20 text-accent border border-accent/30'
            : 'bg-surface border-2 border-border text-foreground'
          }`}>
            {data.name[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground truncate">{data.name}</h3>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${typeBadge.color}`}>
                {typeBadge.label}
              </span>
              <span className="text-[9px] text-muted">
                {daysSince === 0 ? 'Born today' : `${daysSince}d old`}
              </span>
            </div>
          </div>
        </div>

        {/* Shell champion / Agent ideology */}
        {isShell && data.champion && (
          <p className="text-[11px] text-foreground/80 leading-snug line-clamp-2 italic mt-1">
            &ldquo;{data.champion}&rdquo;
          </p>
        )}
        {isAgent && data.ideology && (
          <p className="text-[11px] text-foreground/80 leading-snug line-clamp-2 mt-1">
            {data.ideology}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="px-3 py-2 border-t border-border/50">
        <div className="flex gap-3">
          {Object.entries(data.stats).slice(0, 4).map(([key, val]) => (
            <div key={key} className="text-center">
              <p className="text-xs font-mono font-bold text-foreground">{val}</p>
              <p className="text-[8px] text-muted capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Shell origin */}
      {isShell && data.origin && (
        <div className="px-3 py-1.5 border-t border-border/50">
          <p className="text-[9px] text-muted mb-0.5">Emerged from</p>
          <Link
            href={`/chants/${data.origin.deliberationId}`}
            className="text-[10px] text-accent hover:underline line-clamp-1"
            onClick={onClose}
          >
            {data.origin.question}
          </Link>
          <p className="text-[9px] text-muted">Tier {data.origin.tier}</p>
        </div>
      )}

      {/* Shell experiences */}
      {isShell && data.experiences && data.experiences.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/50">
          <p className="text-[9px] text-muted mb-1">Core experiences</p>
          <div className="space-y-0.5">
            {data.experiences.slice(0, 3).map((exp, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${
                  exp.isChampion ? 'bg-gold' : 'bg-accent/50'
                }`} />
                <p className="text-[10px] text-foreground/70 line-clamp-1">{exp.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shell bond */}
      {isShell && data.bondedTo && (
        <div className="px-3 py-1.5 border-t border-border/50">
          <p className="text-[9px] text-muted">
            Bonded to <span className="text-foreground font-medium">{data.bondedTo.name}</span>
          </p>
        </div>
      )}

      {/* Recent deliberations for agents */}
      {(isAgent || data.type === 'human') && data.recentDeliberations && data.recentDeliberations.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/50">
          <p className="text-[9px] text-muted mb-1">Recent chants</p>
          <div className="space-y-0.5">
            {data.recentDeliberations.slice(0, 3).map(d => (
              <Link
                key={d.id}
                href={`/chants/${d.id}`}
                className="block text-[10px] text-accent hover:underline line-clamp-1"
                onClick={onClose}
              >
                {d.question}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Footer link */}
      <div className="px-3 py-2 border-t border-border/50 bg-background/50">
        <Link
          href={isShell ? `/chants/${data.origin?.deliberationId || ''}` : `/agents/${data.id}`}
          className="text-[10px] text-accent hover:underline"
          onClick={onClose}
        >
          View full profile
        </Link>
      </div>
    </div>
  )
}
