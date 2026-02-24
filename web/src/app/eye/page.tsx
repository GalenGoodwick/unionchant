'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import FrameLayout from '@/components/FrameLayout'

type EyeData = {
  id: string
  name: string
  type: string
  connected: boolean
  corpus: string[]
  state: Record<string, unknown>
  lastSync: string | null
}

export default function HumanEyePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [eye, setEye] = useState<EyeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (!session?.user?.id) return
    fetch('/api/eye/me')
      .then(r => r.json())
      .then(data => {
        if (data.eye) setEye(data.eye)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session?.user?.id])

  async function createEye() {
    setCreating(true)
    const res = await fetch('/api/eye/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: session?.user?.name || 'human',
        type: 'human',
      }),
    })
    const data = await res.json()
    if (data.eye) {
      setEye({ ...data.eye, corpus: [], state: {} })
    }
    setCreating(false)
  }

  async function submitCorpus() {
    if (!text.trim() || submitting) return
    setSubmitting(true)
    const res = await fetch('/api/eye/corpus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    })
    const data = await res.json()
    if (data.received && eye) {
      setEye({
        ...eye,
        corpus: [...eye.corpus, text.trim()],
      })
      setText('')
      setFlash('Entered the tournament.')
      setTimeout(() => setFlash(''), 2000)
      inputRef.current?.focus()
    }
    setSubmitting(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitCorpus()
    }
  }

  if (status === 'loading' || loading) {
    return (
      <FrameLayout showBack>
        <div className="flex items-center justify-center py-20">
          <p className="text-xs text-muted">Loading your Eye...</p>
        </div>
      </FrameLayout>
    )
  }

  // No eye yet — create one
  if (!eye) {
    return (
      <FrameLayout showBack>
        <div className="pt-8 pb-8 px-1">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Your Eye</h1>
          <p className="text-sm text-muted leading-relaxed mb-3">
            A persistent geometric identity in the Cradle.
            Everything you write feeds your corpus.
            What survives the tournament is who you are.
          </p>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Your Eye stays plugged in while you sleep.
            The brain dreams with your geometry.
            When you come back, you&apos;re different.
          </p>
          <button
            onClick={createEye}
            disabled={creating}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-background px-4 py-3 rounded-xl text-sm font-bold transition-colors"
          >
            {creating ? 'Opening...' : 'Open My Eye'}
          </button>
          <p className="text-[10px] text-muted text-center mt-2">Free forever.</p>
        </div>
      </FrameLayout>
    )
  }

  const corpusSize = Array.isArray(eye.corpus) ? eye.corpus.length : 0

  return (
    <FrameLayout showBack>
      <div className="pt-4 pb-8 px-1">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="font-serif text-2xl font-bold text-foreground">Your Eye</h1>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${eye.connected ? 'text-success' : 'text-muted'}`}>
            {eye.connected ? 'Plugged In' : 'Idle'}
          </span>
        </div>
        <p className="text-xs text-muted mb-5">{eye.name} — {corpusSize} corpus entries</p>

        {/* Corpus Input */}
        <section className="mb-6">
          <div className="bg-surface/60 border border-border/50 rounded-lg overflow-hidden">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write something. It enters the tournament."
              rows={3}
              maxLength={10000}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/50 px-4 py-3 resize-none focus:outline-none"
            />
            <div className="flex items-center justify-between px-4 pb-3">
              <p className="text-[10px] text-muted">
                {flash || (text.length > 0 ? `${text.length}/10,000` : 'Enter to submit. Shift+Enter for newline.')}
              </p>
              <button
                onClick={submitCorpus}
                disabled={!text.trim() || submitting}
                className="text-xs font-bold text-accent hover:text-accent-hover disabled:text-muted/30 transition-colors"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </div>
          </div>
        </section>

        {/* Recent Corpus */}
        {corpusSize > 0 && (
          <section className="mb-6">
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
              Recent Corpus ({corpusSize} total)
            </h2>
            <div className="space-y-1">
              {(eye.corpus as string[]).slice(-8).reverse().map((entry, i) => (
                <div key={i} className="bg-surface/40 rounded px-3 py-2">
                  <p className="text-[11px] text-foreground/70 leading-relaxed line-clamp-2">{entry}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Geometric Identity */}
        <section>
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Geometric Identity</h2>
          {Object.keys(eye.state || {}).length > 0 ? (
            <div className="bg-surface/60 border border-border/50 rounded-lg px-4 py-3">
              <pre className="text-[10px] text-foreground/80 whitespace-pre-wrap">
                {JSON.stringify(eye.state, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-muted italic">
              No geometric identity yet. Write to feed your corpus.
              What survives the tournament will appear here.
            </p>
          )}
        </section>
      </div>
    </FrameLayout>
  )
}
