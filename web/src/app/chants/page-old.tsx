/**
 * Chants Page - Full-view carousel interface
 * Each card shows the complete chant UI (Submit/Vote/etc.) in a swipeable carousel
 */
'use client'

import { useSession } from 'next-auth/react'
import { Suspense, useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import AnonymousBanner from '@/components/AnonymousBanner'
import ShareMenu from '@/components/ShareMenu'
import VotingCell from '@/components/deliberation/VotingCell'
import type { Cell } from '@/components/deliberation/types'
import { useToast } from '@/components/Toast'

type ActionTab = 'list' | 'submit' | 'vote' | 'created'

type Chant = {
  id: string
  question: string
  description: string | null
  phase: string
  isPublic: boolean
  isPinned?: boolean
  upvoteCount?: number
  userHasUpvoted?: boolean
  continuousFlow: boolean
  allowAI: boolean
  tags: string[]
  voteCount?: number
  currentTier: number
  viewerCount?: number
  createdAt: string
  creatorId?: string
  creator?: { name: string | null }
  champion?: { text: string } | null
  _count: { members: number; ideas: number }
  userStatus?: {
    isMember: boolean
    hasSubmittedIdea: boolean
    hasVotedInCurrentTier: boolean
    isInActiveCell: boolean
  }
}

export default function ChantsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="text-muted text-sm animate-pulse">Loading...</div></div>}>
      <ChantsPage />
    </Suspense>
  )
}

function ChantsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [chants, setChants] = useState<Chant[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActionTab>('list')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [userFetchError, setUserFetchError] = useState<string | null>(null)
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    if (typeof window !== 'undefined') return !localStorage.getItem('hasSeenSwipeHint')
    return true
  })
  const [showSubmitHelpGlobal, setShowSubmitHelpGlobal] = useState(() => {
    if (typeof window !== 'undefined') return !localStorage.getItem('hasSeenSubmitHelp')
    return false
  })
  const handleDismissSubmitHelpGlobal = () => {
    localStorage.setItem('hasSeenSubmitHelp', 'true')
    setShowSubmitHelpGlobal(false)
  }

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)

  // Fetch current user ID
  useEffect(() => {
    if (session?.user?.email) {
      setUserFetchError(null)
      fetch('/api/user/me')
        .then(res => {
          if (!res.ok) {
            return res.text().then(text => {
              throw new Error(`HTTP ${res.status}: ${text}`)
            })
          }
          return res.json()
        })
        .then(data => {
          console.log('Fetched user:', data)
          if (data.user?.id) {
            setUserId(data.user.id)
          } else {
            setUserFetchError('User data missing ID')
          }
        })
        .catch(err => {
          console.error('Failed to fetch userId:', err)
          setUserFetchError(err.message)
        })
    } else {
      setUserId(null)
      setUserFetchError(null)
    }
  }, [session])

  const fetchChants = useCallback(async () => {
    try {
      const res = await fetch('/api/deliberations')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const seen = new Set<string>()
          setChants(data.filter((c: Chant) => seen.has(c.id) ? false : (seen.add(c.id), true)))
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChants()
    const interval = setInterval(fetchChants, 15000)
    return () => clearInterval(interval)
  }, [fetchChants])

  // Add tag handler
  const handleAddTag = async (chantId: string) => {
    const tagValue = tagInputs[chantId]?.trim()
    if (!tagValue) return

    try {
      const res = await fetch(`/api/deliberations/${chantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: { add: tagValue }
        })
      })

      if (res.ok) {
        // Clear input
        setTagInputs(prev => ({ ...prev, [chantId]: '' }))
        // Refresh chants
        fetchChants()
      }
    } catch (err) {
      console.error('Failed to add tag:', err)
    }
  }

  // Create form handlers
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || question.trim().length < 2) {
      setCreateError('Question must be at least 2 characters')
      return
    }
    setShowConfirmation(true)
  }

  const handleConfirmedCreate = async () => {
    setShowConfirmation(false)
    setCreating(true)
    setCreateError('')

    try {
      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          description: createDescription.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create chant')
      }

      const data = await res.json()

      // Reset form and close
      setQuestion('')
      setCreateDescription('')
      setShowCreate(false)

      // Navigate to new chant
      router.push(`/chants/${data.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  // Categorize chants by action needed
  const categorizedChants = {
    list: [...chants].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    submit: chants.filter(c =>
      c.phase === 'SUBMISSION' &&
      (!c.userStatus?.hasSubmittedIdea || !c.userStatus?.isMember)
    ),
    vote: chants.filter(c =>
      c.phase === 'VOTING' &&
      c.userStatus?.isInActiveCell &&
      !c.userStatus?.hasVotedInCurrentTier
    ),
    created: userId ? chants.filter(c => c.creatorId && c.creatorId === userId).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ) : [], // Chants created by user, newest first
  }

  // Always start on All tab — no auto-selection

  const currentChants = categorizedChants[activeTab]

  const scrollTo = (index: number) => {
    if (!carouselRef.current) return
    const card = carouselRef.current.children[index] as HTMLElement
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
      setCurrentIndex(index)
    }
  }

  return (
    <>
      <FrameLayout
        active="chants"
        scrollRef={!showCreate ? scrollRef : undefined}
        contentClassName="h-full"
        onBack={showCreate ? () => { setShowCreate(false); setQuestion(''); setCreateDescription(''); setCreateError(''); setShowConfirmation(false) } : undefined}
        header={!showCreate ? (
          <>
            {status !== 'loading' && !session && <AnonymousBanner />}
            <div className="space-y-2 pb-3">
              {/* Action tabs */}
              <div className="flex gap-1.5 overflow-x-auto">
                {(['list', 'submit', 'vote', 'created'] as const).map(tab => {
                  const count = categorizedChants[tab].length
                  const label = tab === 'list' ? 'All' : tab === 'submit' ? 'Submit and Chat' : tab === 'vote' ? 'Vote and Discuss' : tab
                  return (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab)
                        setCurrentIndex(0)
                      }}
                      className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                        activeTab === tab
                          ? 'bg-accent/15 text-accent font-medium'
                          : 'text-muted hover:text-foreground hover:bg-surface/80'
                      }`}
                    >
                      <span className="capitalize">{label}</span>
                      {count > 0 && (
                        <span className="ml-1 text-muted/50 text-[10px]">{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Carousel navigation dots */}
              {currentChants.length > 1 && (
                <div className="flex items-center justify-center gap-1.5">
                  {currentChants.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => scrollTo(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentIndex
                          ? 'w-6 bg-accent'
                          : 'w-1.5 bg-muted/30 hover:bg-muted/50'
                      }`}
                      aria-label={`Go to chant ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : undefined}
        footerRight={session ? (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3 h-9 sm:h-10 rounded-full bg-accent hover:bg-accent-hover text-white shadow-sm transition-all shrink-0"
          >
            <span className="text-sm font-semibold">Begin</span>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        ) : (
          <a
            href="/auth/signin?callbackUrl=/chants"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-accent hover:bg-accent-hover text-white shadow-sm flex items-center justify-center transition-all shrink-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </a>
        )}
      >
        {showCreate ? (
          /* Create chant form */
          <div className="h-full overflow-y-auto px-4 pb-4">
            <form onSubmit={handleCreate} className="max-w-2xl mx-auto pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Question
                </label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What question should we deliberate?"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                  disabled={creating}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Provide context or background information..."
                  rows={4}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
                  disabled={creating}
                />
              </div>

              {createError && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
                  <p className="text-sm text-error">{createError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={creating || !question.trim()}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                {creating ? 'Creating...' : 'Create Chant'}
              </button>
            </form>

            {/* Confirmation Dialog */}
            {showConfirmation && typeof window !== 'undefined' && createPortal(
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowConfirmation(false)}>
                <div className="bg-surface border border-border rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-foreground mb-4">Confirm Chant Creation</h3>

                  <div className="space-y-3 mb-6">
                    <div>
                      <p className="text-xs font-semibold text-muted mb-1">Question:</p>
                      <p className="text-sm text-foreground">{question}</p>
                    </div>

                    {createDescription.trim() && (
                      <div>
                        <p className="text-xs font-semibold text-muted mb-1">Description:</p>
                        <p className="text-sm text-foreground">{createDescription}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted mb-4">
                    Please review your question and description. Make sure the wording is clear and there are no spelling errors.
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirmation(false)}
                      className="flex-1 px-4 py-2 bg-surface border border-border hover:bg-background text-foreground text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmedCreate}
                      disabled={creating}
                      className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {creating ? 'Creating...' : 'Confirm'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted text-sm animate-pulse">Loading chants...</div>
          </div>
        ) : currentChants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div className={`w-16 h-16 mb-4 rounded-full flex items-center justify-center ${
              activeTab === 'submit' ? 'bg-accent/10 text-accent' :
              activeTab === 'vote' ? 'bg-warning/10 text-warning' :
              activeTab === 'created' ? 'bg-success/10 text-success' :
              'bg-blue/10 text-blue'
            }`}>
              {activeTab === 'submit' && (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              )}
              {activeTab === 'vote' && (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {activeTab === 'created' && (
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
            </div>
            <p className="text-foreground font-medium mb-2 text-center">
              {activeTab === 'submit' && 'No chants accepting ideas'}
              {activeTab === 'vote' && 'No pending votes'}
              {activeTab === 'created' && 'No chants created yet'}
            </p>
            <p className="text-muted text-sm text-center">
              {activeTab === 'list' && 'No chants yet.'}
              {activeTab === 'submit' && 'Create your own chant or check back later'}
              {activeTab === 'vote' && 'Submit ideas and wait for voting to begin'}
              {activeTab === 'created' && 'Create your first chant to get started'}
            </p>
            {session && (activeTab === 'list' || activeTab === 'submit' || activeTab === 'created') && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create a Chant
              </button>
            )}
          </div>
        ) : activeTab === 'list' || activeTab === 'created' ? (
          /* List view */
          <div className="h-full overflow-y-auto px-4 pb-4">
            <div className="space-y-2.5">
              {currentChants.map((chant) => (
                <Link
                  key={chant.id}
                  href={`/chants/${chant.id}`}
                  className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {chant.isPinned && (
                      <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">Pinned</span>
                    )}
                    <ChantTypeBadge chant={chant} />
                    <ParticipantBadge chant={chant} />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground leading-tight flex-1">{chant.question}</h3>
                    <PhaseBadge phase={chant.phase} />
                  </div>
                  {chant.description && (
                    <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">{chant.description}</p>
                  )}
                  {chant.champion && chant.phase === 'COMPLETED' && (
                    <div className="mt-2 p-2 bg-success/8 border border-success/15 rounded-md">
                      <p className="text-xs text-foreground/80 truncate">&ldquo;{chant.champion.text}&rdquo;</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                    <span>{chant._count.ideas} ideas</span>
                    <span className="text-border-strong">&middot;</span>
                    <span>{chant._count.members} members</span>
                    {chant.voteCount != null && chant.voteCount > 0 && (
                      <>
                        <span className="text-border-strong">&middot;</span>
                        <span>{chant.voteCount} votes</span>
                      </>
                    )}
                    {chant.phase === 'VOTING' && (
                      <>
                        <span className="text-border-strong">&middot;</span>
                        <span className="font-bold text-warning">T{chant.currentTier}</span>
                      </>
                    )}
                    {chant.creator?.name && (
                      <>
                        <span className="text-border-strong">&middot;</span>
                        <span>by {chant.creator.name}</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full">
            {/* Swipe hint — one-time dismissable */}
            {showSwipeHint && currentChants.length > 1 && (
              <div className="mx-4 mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-accent/10 border border-accent/20 rounded-lg">
                <p className="text-xs text-accent">Swipe left or right to see more chants</p>
                <button
                  onClick={() => {
                    localStorage.setItem('hasSeenSwipeHint', 'true')
                    setShowSwipeHint(false)
                  }}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-accent/20 text-accent transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Full-page carousel */}
            <div
              ref={carouselRef}
              className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch'
              }}
              onScroll={(e) => {
                const container = e.currentTarget
                const scrollLeft = container.scrollLeft
                const cardWidth = container.offsetWidth
                const newIndex = Math.round(scrollLeft / cardWidth)
                if (newIndex !== currentIndex) {
                  setCurrentIndex(newIndex)
                }
              }}
            >
              {currentChants.map((chant) => (
                <div
                  key={chant.id}
                  className="w-full h-full flex-shrink-0 snap-start snap-always px-4"
                >
                  <div className="h-full bg-surface rounded-lg p-4 overflow-y-auto">
                    {/* Card header with share link and tag input */}
                    <div className="mb-4 pb-4 border-b border-border">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-foreground mb-1">{chant.question}</h3>
                          {chant.description && (
                            <p className="text-xs text-muted leading-relaxed line-clamp-2">{chant.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 items-center shrink-0">
                          <div className="flex items-center gap-0.5">
                            <input
                              type="text"
                              placeholder="Add tag..."
                              value={tagInputs[chant.id] ?? ''}
                              onChange={(e) => setTagInputs(prev => ({ ...prev, [chant.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAddTag(chant.id)
                                }
                              }}
                              className="w-20 px-2 py-1 bg-background border border-border rounded-l text-[11px] text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddTag(chant.id)}
                              className="px-1.5 py-1 bg-accent/10 hover:bg-accent/20 border border-l-0 border-border text-accent rounded-r transition-colors"
                              title="Add tag"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                              </svg>
                            </button>
                          </div>
                          <ShareMenu
                            url={`/chants/${chant.id}`}
                            text={chant.question}
                            variant="icon"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex gap-2 text-xs text-muted">
                          <span>{chant._count.members} {chant._count.members === 1 ? 'member' : 'members'}</span>
                          <span>•</span>
                          <span>{chant._count.ideas} {chant._count.ideas === 1 ? 'idea' : 'ideas'}</span>
                        </div>

                        {/* Display existing tags */}
                        {chant.tags && chant.tags.length > 0 && (
                          <>
                            <span className="text-xs text-muted">•</span>
                            <div className="flex flex-wrap gap-1.5">
                              {chant.tags.map((tag: string) => (
                                <span key={tag} className="px-2 py-0.5 bg-accent/10 text-accent text-[10px] rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Tab content */}
                    {activeTab === 'submit' && <SubmitTabContent chantId={chant.id} chant={chant} />}
                    {activeTab === 'vote' && <VoteTabContent chantId={chant.id} chant={chant} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop arrow navigation */}
            {currentChants.length > 1 && (
              <>
                {currentIndex > 0 && (
                  <button
                    onClick={() => scrollTo(currentIndex - 1)}
                    className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center bg-surface/90 hover:bg-surface border border-border rounded-full shadow-lg transition-opacity z-10"
                    aria-label="Previous chant"
                  >
                    <svg className="w-6 h-6 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {currentIndex < currentChants.length - 1 && (
                  <button
                    onClick={() => scrollTo(currentIndex + 1)}
                    className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center bg-surface/90 hover:bg-surface border border-border rounded-full shadow-lg transition-opacity z-10"
                    aria-label="Next chant"
                  >
                    <svg className="w-6 h-6 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </FrameLayout>

      {/* Global submit help modal - shown once across all cards */}
      {showSubmitHelpGlobal && activeTab === 'submit' && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[10000]" onClick={handleDismissSubmitHelpGlobal}>
          <div className="max-w-[360px] w-full bg-surface border border-border rounded-xl p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground mb-3">Submit & Chat</h2>
            <p className="text-sm text-muted mb-4">Here&apos;s how this tab works:</p>
            <ol className="space-y-3 mb-5">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Write your idea</p>
                  <p className="text-xs text-muted">Enter your response to the question in your own words.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-purple/15 text-purple flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Chat with others</p>
                  <p className="text-xs text-muted">Discuss ideas and coordinate strategy in the chat below.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-success/15 text-success flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Track progress</p>
                  <p className="text-xs text-muted">See member and idea counts at the top of the card.</p>
                </div>
              </li>
            </ol>
            <button
              onClick={handleDismissSubmitHelpGlobal}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// Tab content components
function SubmitTabContent({ chantId, chant }: { chantId: string; chant: Chant }) {
  const { data: session } = useSession()
  const [ideaText, setIdeaText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [userIdeas, setUserIdeas] = useState<any[]>([])
  const [chantData, setChantData] = useState<any>(null)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [pendingIdea, setPendingIdea] = useState('')
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false)
  // Chat state
  const [chatMessages, setChatMessages] = useState<{ id: string; text: string; createdAt: string; user: { id: string; name: string | null; image: string | null } }[]>([])
  const [chatText, setChatText] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [chatError, setChatError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Fetch chant status and user's ideas
    const fetchData = async () => {
      try {
        const [statusRes, ideasRes] = await Promise.all([
          fetch(`/api/deliberations/${chantId}/status`),
          session ? fetch(`/api/deliberations/${chantId}/ideas?mine=true`) : Promise.resolve(null)
        ])

        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setChantData(statusData)
        }

        if (ideasRes?.ok) {
          const ideasData = await ideasRes.json()
          setUserIdeas(ideasData || [])
        }
      } catch (err) {
        console.error('Failed to fetch chant data:', err)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [chantId, session])

  // Chat: fetch messages + poll
  const fetchChatMessages = useCallback(async () => {
    if (!session) return
    try {
      const res = await fetch(`/api/deliberations/${chantId}/chat`)
      if (res.ok) {
        const data = await res.json()
        setChatMessages(prev => {
          const newMsgs = data.messages || []
          // Only update if message count changed (avoid unnecessary rerenders)
          if (prev.length !== newMsgs.length || (newMsgs.length > 0 && prev[prev.length - 1]?.id !== newMsgs[newMsgs.length - 1]?.id)) {
            return newMsgs
          }
          return prev
        })
      }
    } catch { /* silent */ }
  }, [chantId, session])

  useEffect(() => {
    fetchChatMessages()
    const interval = setInterval(fetchChatMessages, 5000)
    return () => clearInterval(interval)
  }, [fetchChatMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chatEndRef.current && chatContainerRef.current) {
      const container = chatContainerRef.current
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
      if (isNearBottom) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [chatMessages.length])

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatText.trim() || sendingChat) return
    const text = chatText.trim()

    // Optimistic: show message immediately
    const optimisticMsg = {
      id: `optimistic-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      user: { id: '', name: session?.user?.name || 'You', image: session?.user?.image || null },
    }
    setChatMessages(prev => [...prev, optimisticMsg])
    setChatText('')
    setChatError('')

    try {
      const res = await fetch(`/api/deliberations/${chantId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        // Replace optimistic message on next poll
        fetchChatMessages()
      } else {
        // Remove optimistic message on error
        setChatMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        const data = await res.json()
        if (data.error === 'MUTED') {
          setChatError(`Muted until ${new Date(data.mutedUntil).toLocaleTimeString()}`)
        } else if (data.error === 'RATE_LIMITED') {
          setChatError('Too many messages. Slow down.')
        } else {
          setChatError(data.error || 'Failed to send')
        }
        setTimeout(() => setChatError(''), 5000)
      }
    } catch {
      setChatMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      setChatError('Failed to send')
      setTimeout(() => setChatError(''), 5000)
    }
  }

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ideaText.trim()) return

    // Check if user is a member
    if (!chantData?.isMember) {
      setPendingIdea(ideaText.trim())
      setShowJoinDialog(true)
      return
    }

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess(false)

    try {
      const res = await fetch(`/api/deliberations/${chantId}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ideaText.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit')
      }

      setIdeaText('')
      setSubmitSuccess(true)
      setShowSubmitModal(false)
      setShowConfirmSubmit(false)
      setUserIdeas(prev => [data, ...prev])

      setTimeout(() => setSubmitSuccess(false), 3000)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmJoinAndSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')

    try {
      // First, join the chant
      const joinRes = await fetch(`/api/deliberations/${chantId}/join`, {
        method: 'POST',
      })

      if (!joinRes.ok) {
        const joinData = await joinRes.json()
        throw new Error(joinData.error || 'Failed to join chant')
      }

      // Then submit the idea
      const ideaRes = await fetch(`/api/deliberations/${chantId}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pendingIdea }),
      })

      const ideaData = await ideaRes.json()
      if (!ideaRes.ok) {
        throw new Error(ideaData.error || 'Failed to submit idea')
      }

      // Success!
      setIdeaText('')
      setPendingIdea('')
      setShowJoinDialog(false)
      setSubmitSuccess(true)
      setUserIdeas(prev => [ideaData, ...prev])

      // Update chantData to reflect membership
      setChantData((prev: any) => ({ ...prev, isMember: true }))

      setTimeout(() => setSubmitSuccess(false), 3000)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!chantData) {
    return <div className="text-xs text-muted animate-pulse">Loading...</div>
  }

  const submissionsClosed = chantData.phase !== 'SUBMISSION'
  const multipleIdeasAllowed = chantData.continuousFlow

  return (
    <div className="space-y-3">
      <div className={`p-3 rounded-lg border text-xs ${
        submissionsClosed
          ? 'bg-surface/90 backdrop-blur-sm border-border text-muted'
          : multipleIdeasAllowed
          ? 'bg-accent/8 border-accent/20 text-accent'
          : 'bg-surface/90 backdrop-blur-sm border-border text-muted'
      }`}>
        {submissionsClosed
          ? 'Submissions are closed. Voting is in progress.'
          : multipleIdeasAllowed
          ? 'Multiple ideas allowed — submit as many as you like.'
          : userIdeas.length > 0
          ? 'You\'ve submitted your idea. One per person.'
          : 'One idea per person. Make it count.'}
      </div>

      {!submissionsClosed && (multipleIdeasAllowed || userIdeas.length === 0) && (
        !session ? (
          <Link
            href={`/auth/signin?callbackUrl=/chants`}
            className="block text-center p-4 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Sign in to submit an idea
          </Link>
        ) : (
          <button
            onClick={() => { setSubmitError(''); setShowSubmitModal(true) }}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            Submit an Idea
          </button>
        )
      )}

      {submitSuccess && (
        <p className="text-success text-xs text-center">Idea submitted!</p>
      )}

      {/* Submit idea modal */}
      {showSubmitModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[10000]" onClick={() => { setShowSubmitModal(false); setShowConfirmSubmit(false) }}>
          <div className="max-w-md w-full bg-surface border border-border rounded-xl p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            {!showConfirmSubmit ? (
              <>
                <h2 className="text-base font-bold text-foreground mb-1">Submit Your Idea</h2>
                <p className="text-xs text-muted mb-4">Answer the question with your best idea.</p>
                <textarea
                  placeholder="Your idea..."
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  maxLength={500}
                  rows={4}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
                />
                <div className="flex items-center justify-between mt-1 mb-3">
                  <span className="text-[10px] text-muted">{ideaText.length}/500</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="flex-1 py-2.5 bg-surface border border-border text-foreground text-sm font-medium rounded-lg hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!ideaText.trim()}
                    onClick={() => setShowConfirmSubmit(true)}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Review
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-foreground mb-1">Check Your Spelling</h2>
                <p className="text-xs text-muted mb-3">Review your idea before submitting. This cannot be edited later.</p>
                <div className="p-4 bg-background border border-border rounded-lg mb-4">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ideaText.trim()}</p>
                </div>
                {submitError && <p className="text-error text-xs mb-3">{submitError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmSubmit(false)}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-surface border border-border text-foreground text-sm font-medium rounded-lg hover:bg-background transition-colors disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={(e) => handleSubmitIdea(e as any)}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {submitting ? 'Submitting...' : 'Confirm & Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {userIdeas.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted mb-2">
            Your idea{userIdeas.length > 1 ? 's' : ''}
          </h3>
          <div className="space-y-1.5">
            {userIdeas.map(idea => (
              <div key={idea.id} className="bg-surface/90 backdrop-blur-sm rounded-lg border border-border p-2.5">
                <p className="text-sm text-foreground">{idea.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted text-center">
        {chantData.ideaCount} idea{chantData.ideaCount !== 1 ? 's' : ''} submitted so far
      </p>

      {/* Chat UI */}
      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">Chat</h3>
        <div className="bg-surface/90 backdrop-blur-sm rounded-lg border border-border overflow-hidden flex flex-col" style={{ minHeight: 200 }}>
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 300 }}>
            {chatMessages.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">
                {session ? 'No messages yet — start the conversation' : 'Sign in to chat'}
              </p>
            ) : (
              chatMessages.map(msg => (
                <div key={msg.id} className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold shrink-0">
                    {(msg.user.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium text-foreground">{msg.user.name || 'Anonymous'}</span>
                      <span className="text-[10px] text-muted">{new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-snug">{msg.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {session ? (
            <div className="p-3 border-t border-border">
              {chatError && <p className="text-[11px] text-error mb-1.5">{chatError}</p>}
              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  disabled={sendingChat}
                  maxLength={2000}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sendingChat || !chatText.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  {sendingChat ? '...' : 'Send'}
                </button>
              </form>
            </div>
          ) : (
            <div className="p-3 border-t border-border">
              <Link
                href="/auth/signin?callbackUrl=/chants"
                className="block text-center text-sm text-accent hover:text-accent-hover font-medium"
              >
                Sign in to chat
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Join confirmation dialog */}
      {showJoinDialog && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowJoinDialog(false)}>
          <div className="bg-surface border border-border rounded-lg p-5 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground mb-3">Confirm & Subscribe</h3>

            <div className="mb-4 p-3 bg-background rounded-lg border border-border">
              <p className="text-xs font-semibold text-muted mb-1">Your idea:</p>
              <p className="text-sm text-foreground leading-relaxed">{pendingIdea}</p>
            </div>

            <p className="text-xs text-muted mb-4">
              Confirming will subscribe you to this chant. You'll receive updates and can participate in voting.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowJoinDialog(false)
                  setPendingIdea('')
                }}
                disabled={submitting}
                className="flex-1 py-2 px-4 bg-surface border border-border text-foreground rounded-lg hover:bg-background transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmJoinAndSubmit}
                disabled={submitting}
                className="flex-1 py-2 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Confirm & Subscribe'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}

function VoteTabContent({ chantId, chant }: { chantId: string; chant: Chant }) {
  const { data: session } = useSession()
  const router = useRouter()
  const { showToast } = useToast()
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState<string | null>(null)
  const [showVoteConfirm, setShowVoteConfirm] = useState(false)
  const [pendingVote, setPendingVote] = useState<{ cellId: string; allocations: { ideaId: string; points: number }[] } | null>(null)
  const [enterError, setEnterError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userFetchError, setUserFetchError] = useState<string | null>(null)

  // Fetch current user ID
  useEffect(() => {
    if (session?.user?.email) {
      setUserFetchError(null)
      fetch('/api/user/me')
        .then(res => {
          if (!res.ok) {
            return res.text().then(text => {
              throw new Error(`HTTP ${res.status}: ${text}`)
            })
          }
          return res.json()
        })
        .then(data => {
          console.log('Fetched user:', data)
          if (data.user?.id) {
            setUserId(data.user.id)
          } else {
            setUserFetchError('User data missing ID')
          }
        })
        .catch(err => {
          console.error('Failed to fetch userId:', err)
          setUserFetchError(err.message)
        })
    } else {
      setUserId(null)
      setUserFetchError(null)
    }
  }, [session])

  const fetchCells = useCallback(async () => {
    try {
      const res = await fetch(`/api/deliberations/${chantId}/cells`)
      if (res.ok) {
        const data = await res.json()
        setCells(data || [])
        setDebugInfo(prev => ({ ...prev, cellsCount: data.length, step: 'cells-fetched' }))
      } else {
        const errorText = await res.text()
        console.error('Failed to fetch cells:', errorText)
        setDebugInfo(prev => ({ ...prev, cellsError: errorText, step: 'cells-failed' }))
      }
    } catch (err) {
      console.error('Failed to fetch cells:', err)
      setDebugInfo(prev => ({ ...prev, cellsError: String(err), step: 'cells-error' }))
    } finally {
      setLoading(false)
    }
  }, [chantId])

  // Auto-enter voting when user views the tab, then fetch cells
  useEffect(() => {
    const autoEnter = async () => {
      setEnterError(null)
      setDebugInfo(null)

      if (chant.phase === 'VOTING' && userId) {
        try {
          const res = await fetch(`/api/deliberations/${chantId}/enter`, { method: 'POST' })
          const data = await res.json()

          if (res.ok) {
            console.log('Auto-entered voting successfully:', data)
            setDebugInfo({ enter: data, step: 'entered' })
            // Wait a moment for DB to update, then fetch cells
            await new Promise(resolve => setTimeout(resolve, 500))
          } else {
            console.error('Auto-enter failed:', data)
            setDebugInfo({ enter: data, step: 'enter-failed', status: res.status })
            // Don't show "already in cell" as an error
            if (!data.alreadyInCell) {
              if (data.error) {
                setEnterError(data.error)
              } else if (data.roundFull) {
                setEnterError('All cells are full - waiting for next round')
              } else {
                setEnterError(`Failed to join (HTTP ${res.status})`)
              }
            }
          }
        } catch (err) {
          console.error('Auto-enter error:', err)
          setDebugInfo({ error: String(err), step: 'enter-error' })
          setEnterError('Failed to join voting cell')
        }
        // Always fetch cells after attempting to enter
        await fetchCells()
      } else {
        setDebugInfo({ phase: chant.phase, userId, step: 'skip-enter' })
        // If not in voting phase or no userId, just fetch cells
        await fetchCells()
      }
    }
    autoEnter()

    const interval = setInterval(fetchCells, 15000)
    return () => clearInterval(interval)
  }, [chantId, chant.phase, userId, fetchCells])

  const handleVote = async (cellId: string, allocations: { ideaId: string; points: number }[]) => {
    // If not a member, show confirmation
    if (!chant.userStatus?.isMember) {
      setPendingVote({ cellId, allocations })
      setShowVoteConfirm(true)
      return
    }

    // Otherwise submit directly
    await submitVote(cellId, allocations)
  }

  const submitVote = async (cellId: string, allocations: { ideaId: string; points: number }[]) => {
    setVoting(cellId)
    try {
      const res = await fetch(`/api/deliberations/${chantId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellId, allocations }),
      })

      if (res.ok) {
        showToast('Vote submitted successfully!', 'success')
        fetchCells()
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to submit vote', 'error')
      }
    } catch (err) {
      console.error('Vote error:', err)
      showToast('Failed to submit vote', 'error')
    } finally {
      setVoting(null)
    }
  }

  const handleConfirmVote = async () => {
    if (!pendingVote) return

    setShowVoteConfirm(false)
    await submitVote(pendingVote.cellId, pendingVote.allocations)
    setPendingVote(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted text-sm animate-pulse">Loading voting cells...</div>
      </div>
    )
  }

  const activeCells = cells.filter(c => c.status === 'VOTING')
  const userCells = userId ? activeCells.filter(c =>
    c.participants.some(p => p.userId === userId)
  ) : []
  const userActiveCells = userCells.filter(c => c.votes.length === 0)
  const userVotedCells = userCells.filter(c => c.votes.length > 0)

  const voteDebug = {
    phase: chant.phase,
    userId: userId || 'NULL',
    totalCells: cells.length,
    activeCells: activeCells.length,
    userCells: userCells.length,
    userActiveCells: userActiveCells.length,
    userVotedCells: userVotedCells.length,
    cellParticipants: activeCells.map(c => ({
      cellId: c.id.slice(0, 8),
      status: c.status,
      participantIds: c.participants.map(p => p.userId?.slice(0, 8) || p.user?.id?.slice(0, 8) || 'unknown')
    }))
  }
  console.log('Vote tab debug:', voteDebug)

  return (
    <div className="space-y-4">
      {/* Active voting cells */}
      {userActiveCells.length > 0 && userActiveCells.map(cell => (
        <VotingCell
          key={cell.id}
          cell={cell}
          onVote={handleVote}
          voting={voting}
          onRefresh={fetchCells}
          currentTier={chant.currentTier}
        />
      ))}

      {/* Already voted cells */}
      {userVotedCells.length > 0 && userVotedCells.map(cell => (
        <VotingCell
          key={cell.id}
          cell={cell}
          onVote={handleVote}
          voting={voting}
          onRefresh={fetchCells}
          currentTier={chant.currentTier}
        />
      ))}

      {/* No cells yet */}
      {userActiveCells.length === 0 && userVotedCells.length === 0 && chant.phase === 'VOTING' && (
        <div className={`rounded-lg border p-4 ${
          enterError ? 'bg-warning-bg border-warning' : !userId ? 'bg-accent-light border-accent' : 'bg-surface/90 border-border'
        }`}>
          <p className={`text-sm mb-2 ${enterError ? 'text-foreground' : !userId ? 'text-accent' : 'text-muted'}`}>
            {enterError || (!userId && !session ? 'Sign in to participate in voting' : !userId && session ? 'Loading your profile...' : (cells.length === 0 ? 'No voting cells available yet' : 'Placing you in a voting cell...'))}
          </p>
          {!enterError && userId && (
            <p className="text-xs text-muted mb-3">
              {cells.length === 0 ? 'Voting may not have started yet' : 'This usually takes a moment'}
            </p>
          )}
          {!userId && !session && (
            <button
              onClick={() => router.push('/auth/signin')}
              className="mt-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              Sign In
            </button>
          )}

          {/* Debug info */}
          <details className="text-left mt-3">
            <summary className="text-xs text-muted cursor-pointer hover:text-foreground">Debug Info</summary>
            <div className="mt-2 p-2 bg-background rounded text-xs font-mono space-y-1">
              <div><strong>Session Info:</strong></div>
              <pre className="text-[10px] overflow-auto">{JSON.stringify({
                hasSession: !!session,
                email: session?.user?.email || 'none',
                userFetchError: userFetchError || 'none'
              }, null, 2)}</pre>
              <div className="mt-2"><strong>Enter Response:</strong></div>
              <pre className="text-[10px] overflow-auto">{JSON.stringify(debugInfo, null, 2)}</pre>
              <div className="mt-2"><strong>Vote Tab State:</strong></div>
              <pre className="text-[10px] overflow-auto">{JSON.stringify(voteDebug, null, 2)}</pre>
            </div>
          </details>
        </div>
      )}

      {/* Not in voting phase */}
      {chant.phase !== 'VOTING' && (
        <div className="bg-surface/90 backdrop-blur-sm rounded-lg border border-border p-4 text-center">
          <p className="text-sm text-muted">
            {chant.phase === 'SUBMISSION' && 'Submit ideas and wait for voting to begin'}
            {chant.phase === 'ACCUMULATING' && 'Submit challenger ideas to enter Round 2'}
            {chant.phase === 'COMPLETED' && 'Voting has concluded'}
          </p>
        </div>
      )}

      {/* Vote confirmation dialog */}
      {showVoteConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-background border border-border rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">Confirm Your Vote</h3>
            <p className="text-sm text-muted mb-4">
              Submitting your vote will subscribe you to this chant. You'll receive updates and can participate in future rounds.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowVoteConfirm(false)
                  setPendingVote(null)
                }}
                disabled={!!voting}
                className="flex-1 py-2 px-4 bg-surface border border-border text-foreground rounded-lg hover:bg-background transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVote}
                disabled={!!voting}
                className="flex-1 py-2 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                {voting ? 'Submitting...' : 'Confirm & Vote'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}


function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { label: string; color: string }> = {
    SUBMISSION: { label: 'Ideas', color: 'bg-accent/15 text-accent' },
    VOTING: { label: 'Voting', color: 'bg-warning/15 text-warning' },
    PAUSED: { label: 'Paused', color: 'bg-error/15 text-error' },
    COMPLETED: { label: 'Done', color: 'bg-success/15 text-success' },
  }
  const { label, color } = config[phase] || { label: phase, color: 'bg-muted/15 text-muted' }
  return <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium shrink-0 ${color}`}>{label}</span>
}

function ChantTypeBadge({ chant }: { chant: Chant }) {
  const isAskAI = chant.tags?.includes('ask-ai')
  if (isAskAI) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">Ask AI</span>
  if (chant.continuousFlow) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/10 text-purple font-medium">Endless</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue/10 text-blue font-medium">Human Managed</span>
}

function ParticipantBadge({ chant }: { chant: Chant }) {
  const isAskAI = chant.tags?.includes('ask-ai')
  if (isAskAI) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted">AI</span>
  if (!chant.allowAI) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted">Human</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted">AI + Human</span>
}
