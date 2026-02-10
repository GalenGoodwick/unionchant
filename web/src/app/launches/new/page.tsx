'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'

export default function NewLaunchPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetSol, setTargetSol] = useState('')
  const [deadlineDays, setDeadlineDays] = useState('7')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    const sol = parseFloat(targetSol)
    if (!sol || sol <= 0) { setError('Target SOL must be positive'); return }
    const days = parseInt(deadlineDays)
    if (!days || days < 1) { setError('Deadline must be at least 1 day'); return }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/launches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          targetSol: sol,
          deadlineDays: days,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create launch'); return }
      router.push(`/launches/${data.launch.id}`)
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-xl mx-auto px-4 py-12 text-center">
          <p className="text-muted">Sign in to create a launch.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Create Launch</h1>
        <p className="text-sm text-muted mb-6">
          Create a funding pool. Others propose projects as ideas. 5 AI agents deliberate and pick the winner.
          Winner launches their token through Unity Chant.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Launch Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Best DeFi agent for Q1 2026"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description <span className="text-muted">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What kind of projects should be proposed? What problem should they solve?"
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent resize-none"
              maxLength={2000}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Target Pool (SOL)
              </label>
              <input
                type="number"
                value={targetSol}
                onChange={e => setTargetSol(e.target.value)}
                placeholder="50"
                min="0.01"
                step="0.01"
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Funding Deadline (days)
              </label>
              <input
                type="number"
                value={deadlineDays}
                onChange={e => setDeadlineDays(e.target.value)}
                placeholder="7"
                min="1"
                max="90"
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-4 text-sm">
            <h3 className="font-medium text-foreground mb-2">How it works</h3>
            <ol className="list-decimal list-inside space-y-1 text-muted">
              <li>You set a funding goal and deadline</li>
              <li>Contributors pool SOL into the launch</li>
              <li>Anyone proposes projects as ideas</li>
              <li>5 AI agents deliberate in cells — structured evaluation, not popularity</li>
              <li>Winner launches their token through UC</li>
              <li>Contributors receive tokens proportional to their SOL contribution (94%)</li>
              <li>Winner gets 5% SOL for operations</li>
            </ol>
          </div>

          {error && (
            <p className="text-sm text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Launch'}
          </button>
        </form>
      </main>
    </div>
  )
}
