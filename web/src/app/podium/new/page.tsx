'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import MarkdownEditor from '@/components/MarkdownEditor'

const TITLE_MAX = 200
const DRAFT_KEY = 'podium-draft'

type DelibOption = {
  id: string
  question: string
  phase: string
}

type Draft = {
  title: string
  body: string
  deliberationId: string | null
  savedAt: number
}

export default function NewPodiumPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-background flex items-center justify-center"><div className="text-muted text-xs">Loading...</div></div>}>
      <NewPodiumPageInner />
    </Suspense>
  )
}

function NewPodiumPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  // Load draft from localStorage on mount
  const loadDraft = (): Draft | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return null
  }

  const savedDraft = loadDraft()

  const [title, setTitle] = useState(savedDraft?.title || '')
  const [body, setBody] = useState(savedDraft?.body || '')
  const [deliberationId, setDeliberationId] = useState<string | null>(
    searchParams.get('deliberationId') || savedDraft?.deliberationId || null
  )
  const [deliberations, setDeliberations] = useState<DelibOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [sendAsNews, setSendAsNews] = useState(false)
  const [lastSaved, setLastSaved] = useState<number | null>(savedDraft?.savedAt || null)

  // Save draft to localStorage
  const saveDraft = useCallback(() => {
    if (!title.trim() && !body.trim()) return
    const draft: Draft = { title, body, deliberationId, savedAt: Date.now() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    setLastSaved(draft.savedAt)
  }, [title, body, deliberationId])

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!title.trim() && !body.trim()) return
    const timer = setTimeout(saveDraft, 1500)
    return () => clearTimeout(timer)
  }, [title, body, deliberationId, saveDraft])

  // Save on page unload / tab switch
  useEffect(() => {
    const handleBeforeUnload = () => saveDraft()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveDraft()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [saveDraft])

  // Redirect if not signed in
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  // Fetch user's deliberations for linking + admin status
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [delibRes, meRes] = await Promise.all([
          fetch('/api/deliberations?mine=true&limit=50'),
          fetch('/api/user/me'),
        ])
        if (delibRes.ok) {
          const data = await delibRes.json()
          const items = (data.items || data).map((d: { id: string; question: string; phase: string }) => ({
            id: d.id,
            question: d.question,
            phase: d.phase,
          }))
          setDeliberations(items)
        }
        if (meRes.ok) {
          const meData = await meRes.json()
          setIsUserAdmin(meData.user?.isAdmin === true)
        }
      } catch {
        // Non-critical
      }
    }

    if (session) fetchData()
  }, [session])

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Title is required', 'error')
      return
    }
    if (!body.trim()) {
      showToast('Write something before publishing', 'error')
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
          ...(sendAsNews && { sendAsNews: true }),
        }),
      })

      if (res.ok) {
        const podium = await res.json()
        clearDraft()
        showToast('Published!', 'success')
        router.push(`/chants?dock=podium:${podium.id}`)
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

  const handleExit = () => {
    saveDraft()
    router.back()
  }

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-muted text-xs">Loading...</div>
      </div>
    )
  }

  const filteredDelibs = deliberations.filter(d =>
    d.question.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const linkedDelib = deliberations.find(d => d.id === deliberationId)

  return (
    <div className="fixed inset-0 bg-background flex flex-col z-[100]">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <button
          onClick={handleExit}
          className="flex items-center gap-1.5 text-muted hover:text-foreground transition-colors text-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-[10px] text-muted">
              Draft saved
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !body.trim()}
            className="bg-accent text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
          >
            {submitting ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={TITLE_MAX}
            autoFocus
            className="w-full bg-transparent text-lg font-bold text-foreground placeholder-border outline-none mb-1"
          />
          <div className="text-xs text-muted mb-6">{title.length}/{TITLE_MAX}</div>

          {/* Body — Markdown Editor */}
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="Write your post... Use the toolbar above for formatting."
            minHeight="400px"
          />

          {/* Admin: Send as news */}
          {isUserAdmin && (
            <div className="border-t border-border pt-4 mt-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendAsNews}
                  onChange={(e) => setSendAsNews(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-accent"
                />
                <div>
                  <div className="text-xs font-semibold text-foreground">Send as news email</div>
                  <div className="text-xs text-muted mt-0.5">
                    This will email all users who have news notifications enabled.
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Link deliberation */}
          <div className="border-t border-border pt-4 mt-6">
            <div className="text-xs font-semibold text-foreground mb-2">
              Link a chant <span className="text-muted font-normal">(optional)</span>
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
                  placeholder="Search your chants..."
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
                  <div className="text-xs text-muted py-2">No matching chants found</div>
                )}
              </>
            )}

            <div className="text-xs text-muted mt-3">
              Linking a chant adds a &ldquo;Join the Chant&rdquo; button to your post.{' '}
              <Link href="/chants" className="text-accent hover:text-accent-hover">
                Create a new chant
              </Link>
            </div>
          </div>

          {/* Discard draft */}
          {(savedDraft?.title || savedDraft?.body) && (
            <div className="border-t border-border pt-4 mt-6">
              <button
                onClick={() => {
                  clearDraft()
                  setTitle('')
                  setBody('')
                  setDeliberationId(searchParams.get('deliberationId') || null)
                  setLastSaved(null)
                  showToast('Draft discarded', 'success')
                }}
                className="text-xs text-error hover:text-error-hover transition-colors"
              >
                Discard draft
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
