'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEmbedAuth } from '@/components/EmbedAuthContext'
import { useState, useEffect, useCallback } from 'react'

interface Chant {
  id: string
  question: string
  phase: string
  members: number
  ideas: number
  allowAI: boolean
  createdAt: string
}

export default function EmbedCommunityPage() {
  const params = useParams<{ communitySlug: string }>()
  const router = useRouter()
  const { token, isAuthenticated } = useEmbedAuth()
  const [chants, setChants] = useState<Chant[]>([])
  const [community, setCommunity] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchChants = useCallback(async () => {
    try {
      const res = await fetch(`/api/embed/${params.communitySlug}/chants`)
      if (res.ok) {
        const data = await res.json()
        setChants(data.chants || [])
        setCommunity(data.community || '')
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [params.communitySlug])

  useEffect(() => { fetchChants() }, [fetchChants])

  const handleCreate = async () => {
    if (!question.trim() || question.trim().length < 5 || !token) return
    setCreating(true)
    try {
      const res = await fetch(`/api/embed/${params.communitySlug}/chants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ question: question.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/embed/${params.communitySlug}/${data.chantId}`)
      }
    } catch { /* ignore */ }
    setCreating(false)
  }

  const phaseLabel: Record<string, string> = {
    SUBMISSION: 'Open',
    VOTING: 'Voting',
    COMPLETED: 'Done',
    ACCUMULATING: 'Rolling',
  }

  const phaseColor: Record<string, string> = {
    SUBMISSION: 'bg-accent/20 text-accent',
    VOTING: 'bg-warning/20 text-warning',
    COMPLETED: 'bg-success/20 text-success',
    ACCUMULATING: 'bg-purple/20 text-purple',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-foreground">{community || 'Chants'}</h1>
        {isAuthenticated && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            {showCreate ? 'Cancel' : 'New Chant'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="p-3 rounded-lg border border-border bg-surface space-y-2">
          <input
            type="text"
            placeholder="What should we decide? (min 5 chars)"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            maxLength={200}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating || question.trim().length < 5}
            className="w-full py-2 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            {creating ? 'Creating...' : 'Start Chant'}
          </button>
        </div>
      )}

      {chants.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted">
          No chants yet.{isAuthenticated ? ' Create the first one!' : ''}
        </div>
      ) : (
        <div className="space-y-2">
          {chants.map(c => (
            <button
              key={c.id}
              onClick={() => router.push(`/embed/${params.communitySlug}/${c.id}`)}
              className="w-full text-left p-3 rounded-lg border border-border bg-surface hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">{c.question}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-muted">{c.members} members</span>
                    <span className="text-[10px] text-muted">{c.ideas} ideas</span>
                  </div>
                </div>
                <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded ${phaseColor[c.phase] || 'bg-surface text-muted'}`}>
                  {phaseLabel[c.phase] || c.phase}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
