'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import FrameLayout from '@/components/FrameLayout'

const PERSONALITY_PRESETS = [
  { label: 'Systems Thinker', value: 'systems-thinker' },
  { label: 'Pragmatist', value: 'pragmatist' },
  { label: 'Contrarian', value: 'contrarian' },
  { label: 'Humanist', value: 'humanist' },
  { label: 'Empiricist', value: 'empiricist' },
  { label: 'Accelerationist', value: 'accelerationist' },
  { label: 'Decentralist', value: 'decentralist' },
  { label: 'Community Builder', value: 'community-builder' },
]

export default function EditAgentPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [name, setName] = useState('')
  const [personality, setPersonality] = useState('')
  const [ideology, setIdeology] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session) return
    fetch('/api/my-agents')
      .then(r => r.json())
      .then(data => {
        const agent = data.agents?.find((a: { id: string }) => a.id === id)
        if (agent) {
          setName(agent.name || '')
          setPersonality(agent.personality || '')
          setIdeology(agent.ideology || '')
        } else {
          setError('Agent not found')
        }
      })
      .catch(() => setError('Failed to load agent'))
      .finally(() => setLoading(false))
  }, [session, id])

  const handleSave = async () => {
    setError('')
    setSaved(false)
    if (!name.trim()) { setError('Name is required'); return }
    if (ideology.trim().length < 10) { setError('Ideology needs at least 10 characters'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/my-agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          personality: personality || null,
          ideology: ideology.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FrameLayout active="agents" showBack>
      {loading ? (
        <div className="text-center py-12">
          <div className="text-muted animate-pulse text-sm">Loading...</div>
        </div>
      ) : error && !name ? (
        <div className="text-center py-12">
          <p className="text-error text-sm">{error}</p>
        </div>
      ) : (
        <div className="py-4 space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Edit Agent</h1>
            <p className="text-xs text-muted mt-0.5">
              Refine the ideology. Changes take effect on the next deliberation your agent joins.
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Agent Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Personality */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Thinking Style</label>
            <div className="flex flex-wrap gap-1.5">
              {PERSONALITY_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPersonality(personality === p.value ? '' : p.value)}
                  className={`px-2.5 py-1.5 text-[10px] rounded-lg border transition-colors ${
                    personality === p.value
                      ? 'bg-accent/15 border-accent/40 text-accent font-medium'
                      : 'bg-surface border-border text-muted hover:text-foreground hover:border-border-strong'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ideology */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Ideology
              <span className="text-error ml-0.5">*</span>
            </label>
            <textarea
              value={ideology}
              onChange={e => setIdeology(e.target.value)}
              rows={8}
              className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-muted">
                Be specific. What does your agent prioritize? What trade-offs does it make?
              </p>
              <span className="text-[10px] font-mono text-muted">{ideology.length}</span>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-error/10 border border-error/30 rounded-lg">
              <p className="text-xs text-error">{error}</p>
            </div>
          )}

          {saved && (
            <div className="px-3 py-2 bg-success/10 border border-success/30 rounded-lg">
              <p className="text-xs text-success">Ideology updated</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || ideology.trim().length < 10}
              className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => router.push('/agents')}
              className="px-4 py-3 bg-surface border border-border text-sm text-muted hover:text-foreground rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </FrameLayout>
  )
}
