'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useToast } from '@/components/Toast'

const TITLE_MAX = 200
const BODY_MAX = 10000

type DelibOption = {
  id: string
  question: string
  phase: string
}

export default function NewPodiumPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted">Loading...</div></div>}>
      <NewPodiumPageInner />
    </Suspense>
  )
}

function NewPodiumPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [deliberationId, setDeliberationId] = useState<string | null>(
    searchParams.get('deliberationId')
  )
  const [deliberations, setDeliberations] = useState<DelibOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Redirect if not signed in
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  // Fetch user's deliberations for linking
  useEffect(() => {
    const fetchDelibs = async () => {
      try {
        const res = await fetch('/api/deliberations?mine=true&limit=50')
        if (res.ok) {
          const data = await res.json()
          const items = (data.items || data).map((d: { id: string; question: string; phase: string }) => ({
            id: d.id,
            question: d.question,
            phase: d.phase,
          }))
          setDeliberations(items)
        }
      } catch {
        // Non-critical, linking is optional
      }
    }

    if (session) fetchDelibs()
  }, [session])

  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Title is required', 'error')
      return
    }
    if (!body.trim()) {
      showToast('Write something before publishing', 'error')
      return
    }
    if (body.trim().length > BODY_MAX) {
      showToast(`Body too long (max ${BODY_MAX.toLocaleString()} chars)`, 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/podiums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          deliberationId,
        }),
      })

      if (res.ok) {
        const podium = await res.json()
        showToast('Published!', 'success')
        router.push(`/podium/${podium.id}`)
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to publish', 'error')
      }
    } catch {
      showToast('Failed to publish', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  const filteredDelibs = deliberations.filter(d =>
    d.question.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const linkedDelib = deliberations.find(d => d.id === deliberationId)

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-8">
          <Link
            href="/podiums"
            className="text-muted hover:text-foreground transition-colors text-sm"
          >
            &larr; Back to Podiums
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !body.trim()}
            className="bg-accent text-white font-semibold px-6 py-2 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Publishing...' : 'Publish'}
          </button>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={TITLE_MAX}
          className="w-full bg-transparent text-3xl font-bold text-foreground placeholder-border outline-none mb-2"
        />
        <div className="text-xs text-muted mb-6">{title.length}/{TITLE_MAX}</div>

        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your post..."
          maxLength={BODY_MAX}
          className="w-full bg-transparent text-base text-muted placeholder-border outline-none leading-relaxed resize-none min-h-[400px]"
        />
        <div className={`text-xs mt-1 ${body.length > BODY_MAX * 0.9 ? 'text-warning' : 'text-muted'}`}>
          {body.length.toLocaleString()}/{BODY_MAX.toLocaleString()}
        </div>

        {/* Link deliberation */}
        <div className="border-t border-border pt-6 mt-6">
          <div className="text-sm font-semibold text-foreground mb-3">
            Link a talk <span className="text-muted font-normal">(optional)</span>
          </div>

          {linkedDelib ? (
            <div className="bg-accent/10 border border-accent/25 rounded-lg p-3 flex justify-between items-start">
              <div>
                <div className="text-sm text-foreground font-medium">&ldquo;{linkedDelib.question}&rdquo;</div>
                <div className="text-xs text-muted mt-1">{linkedDelib.phase}</div>
              </div>
              <button
                onClick={() => setDeliberationId(null)}
                className="text-muted hover:text-foreground text-sm ml-4"
              >
                &times;
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search your talks..."
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted outline-none mb-2"
              />
              {searchQuery && filteredDelibs.length > 0 && (
                <div className="bg-surface border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {filteredDelibs.slice(0, 5).map(d => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setDeliberationId(d.id)
                        setSearchQuery('')
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-background transition-colors border-b border-border last:border-0"
                    >
                      <div className="text-sm text-foreground">{d.question}</div>
                      <div className="text-xs text-muted">{d.phase}</div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && filteredDelibs.length === 0 && (
                <div className="text-xs text-muted py-2">No matching talks found</div>
              )}
            </>
          )}

          <div className="text-xs text-muted mt-3">
            Linking a talk adds a &ldquo;Join the Talk&rdquo; button to your post.{' '}
            <Link href="/deliberations/new" className="text-accent hover:text-accent-hover">
              Create a new talk
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
