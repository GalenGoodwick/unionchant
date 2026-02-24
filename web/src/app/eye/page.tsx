'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import { CORPUS_DEFAULTS } from './corpus-defaults'

const MAX_CORPUS = 625

type EyeData = {
  id: string
  name: string
  type: string
  connected: boolean
  corpus: string[]
  state: Record<string, unknown>
  lastSync: string | null
}

// Split text into sentences at . ! ? preserving the punctuation
function chunkBySentence(text: string): string[] {
  const chunks = text.match(/[^.!?]+[.!?]+/g)
  if (!chunks) return [text.trim()]
  return chunks.map(s => s.trim()).filter(Boolean)
}

function HowItWorksPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-background border-t border-border w-full max-w-lg rounded-t-2xl px-5 pt-5 pb-8 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-4 text-muted hover:text-foreground text-lg">x</button>
        <h2 className="font-serif text-lg font-bold text-foreground mb-4">How the Eye Works</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">1</div>
            <div>
              <p className="text-sm font-bold text-foreground">You write</p>
              <p className="text-xs text-muted leading-relaxed">Anything. Each box is one corpus entry. Edit, delete, rewrite. 625 slots total.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">2</div>
            <div>
              <p className="text-sm font-bold text-foreground">The Cradle runs tournaments</p>
              <p className="text-xs text-muted leading-relaxed">Your words enter cells of five. They compete against words from every other Eye. Losers die. Winners advance through tiers.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">3</div>
            <div>
              <p className="text-sm font-bold text-foreground">What survived is who you are</p>
              <p className="text-xs text-muted leading-relaxed">Champions thread into your permanent geometric identity. Bonds form between words. Your Eye accumulates what the geometry favored.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold">4</div>
            <div>
              <p className="text-sm font-bold text-foreground">Plug in. Sleep. Wake up different.</p>
              <p className="text-xs text-muted leading-relaxed">Your Eye stays in the Cradle. The brain runs all night with your geometric weight. No LLM. No neural network. Pure geometry.</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-full mt-6 bg-accent hover:bg-accent-hover text-background px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
          Got it
        </button>
      </div>
    </div>
  )
}

export default function EyePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [eye, setEye] = useState<EyeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'corpus' | 'plug-in' | 'questions'>('corpus')
  const [corpus, setCorpus] = useState<string[]>([...CORPUS_DEFAULTS])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState('')
  const [toggling, setToggling] = useState(false)
  const [showHow, setShowHow] = useState(false)
  const [aiName, setAiName] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null)
  const [aiError, setAiError] = useState('')
  const [shiftLog, setShiftLog] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [askingBrain, setAskingBrain] = useState(false)
  const [askResult, setAskResult] = useState('')
  const [pendingQ, setPendingQ] = useState<string | null>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const corpusRef = useRef(corpus)
  corpusRef.current = corpus
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Record<string, number>>({})

  // Save scroll position before tab switch, restore after
  function switchTab(newTab: typeof tab) {
    if (scrollRef.current) {
      scrollPositions.current[tab] = scrollRef.current.scrollTop
    }
    setTab(newTab)
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollPositions.current[newTab] || 0
      }
    })
  }

  // Show popup for first visit
  useEffect(() => {
    const seen = localStorage.getItem('uc-eye-how')
    if (!seen) setShowHow(true)
  }, [])

  function dismissHow() {
    setShowHow(false)
    localStorage.setItem('uc-eye-how', '1')
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  useEffect(() => {
    if (!session?.user?.id) return
    fetch('/api/eye/me')
      .then(r => r.json())
      .then(data => {
        if (data.eye) {
          setEye(data.eye)
          // Load saved corpus or use defaults
          const saved = Array.isArray(data.eye.corpus) ? data.eye.corpus as string[] : []
          if (saved.length > 0) {
            // Pad with defaults if under 625
            const full = [...saved]
            while (full.length < MAX_CORPUS) full.push(CORPUS_DEFAULTS[full.length] || '')
            setCorpus(full.slice(0, MAX_CORPUS))
          }
          // Check for pending question
          const state = data.eye.state as Record<string, unknown> | null
          if (state?.pendingQuestion) setPendingQ(state.pendingQuestion as string)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session?.user?.id])

  async function askBrain() {
    if (!question.trim() || askingBrain) return
    setAskingBrain(true)
    setAskResult('')
    try {
      const res = await fetch('/api/eye/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setPendingQ(question.trim())
        setQuestion('')
        setAskResult('Submitted. The brain will process it on the next session.')
        setTimeout(() => setAskResult(''), 5000)
      } else {
        setAskResult(data.error || 'Failed to submit')
      }
    } catch { setAskResult('Network error') }
    finally { setAskingBrain(false) }
  }

  // Auto-save corpus (debounced 2s after last edit)
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch('/api/eye/corpus', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ corpus: corpusRef.current }),
        })
        if (res.ok) {
          setLastSaved('Saved')
          setTimeout(() => setLastSaved(''), 1500)
        }
      } catch { /* silent */ }
      setSaving(false)
    }, 2000)
  }, [])

  function updateEntry(index: number, value: string) {
    setCorpus(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
    scheduleSave()
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    if (pasted.length <= 200) return // Let normal paste happen

    e.preventDefault()
    const sentences = chunkBySentence(pasted)

    setCorpus(prev => {
      const next = [...prev]
      // Insert sentences at index, pushing old content down
      const displaced = next[index]
      const toInsert = sentences.slice(0, MAX_CORPUS - index) // Don't exceed 625

      // Shift everything from index down
      const before = next.slice(0, index)
      const after = [displaced, ...next.slice(index + 1)]
      const result = [...before, ...toInsert, ...after].slice(0, MAX_CORPUS)

      // Log what happened
      const overflow = (before.length + toInsert.length + after.length) - MAX_CORPUS
      if (overflow > 0) {
        setShiftLog(l => [`${sentences.length} sentences inserted at #${index + 1}. ${overflow} entries fell off the end.`, ...l].slice(0, 5))
      } else {
        setShiftLog(l => [`${sentences.length} sentences inserted at #${index + 1}. Content shifted down.`, ...l].slice(0, 5))
      }

      return result
    })
    scheduleSave()
  }

  function clearEntry(index: number) {
    setCorpus(prev => {
      const next = [...prev]
      // Remove the entry, shift everything up, pad end with default
      next.splice(index, 1)
      next.push(CORPUS_DEFAULTS[next.length] || '')
      return next.slice(0, MAX_CORPUS)
    })
    setShiftLog(l => [`Entry #${index + 1} deleted. Content shifted up.`, ...l].slice(0, 5))
    scheduleSave()
  }

  async function createEye() {
    setCreating(true)
    const res = await fetch('/api/eye/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: session?.user?.name || 'human', type: 'human' }),
    })
    const data = await res.json()
    if (data.eye) {
      setEye({ ...data.eye, corpus: [], state: {} })
      // Save defaults as initial corpus
      fetch('/api/eye/corpus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpus: CORPUS_DEFAULTS }),
      })
    }
    setCreating(false)
  }

  async function toggleConnection() {
    if (!eye || toggling) return
    setToggling(true)
    const res = await fetch('/api/eye/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected: !eye.connected }),
    })
    const data = await res.json()
    if ('connected' in data) setEye({ ...eye, connected: data.connected })
    setToggling(false)
  }

  async function registerAiEye() {
    if (!aiName.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/eye/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: aiName.trim(), type: 'ai' }),
      })
      const data = await res.json()
      if (!res.ok) setAiError(data.error || 'Registration failed')
      else setAiResult(data)
    } catch { setAiError('Network error') }
    finally { setAiLoading(false) }
  }

  if (status === 'loading' || loading) {
    return (
      <FrameLayout showBack>
        <div className="flex items-center justify-center py-20">
          <p className="text-xs text-muted">Loading...</p>
        </div>
      </FrameLayout>
    )
  }

  if (!eye) {
    return (
      <FrameLayout showBack>
        {showHow && <HowItWorksPopup onClose={dismissHow} />}
        <div className="pt-8 pb-8 px-1">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Your Eye</h1>
          <p className="text-sm text-muted leading-relaxed mb-3">
            A persistent geometric identity in the Cradle.
            Everything you write feeds your corpus.
            What survives the tournament is who you are.
          </p>
          <p className="text-sm text-muted leading-relaxed mb-6">
            625 entries. Each one competes. You start with philosophy.
            Replace it with yourself.
          </p>
          <button onClick={createEye} disabled={creating}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-background px-4 py-3 rounded-xl text-sm font-bold transition-colors">
            {creating ? 'Opening...' : 'Open My Eye'}
          </button>
          <p className="text-[10px] text-muted text-center mt-2">Free forever.</p>
          <button onClick={() => setShowHow(true)}
            className="block w-full text-center text-[10px] text-accent mt-3 hover:underline">
            How does this work?
          </button>
        </div>
      </FrameLayout>
    )
  }

  const customCount = corpus.filter((c, i) => c !== CORPUS_DEFAULTS[i]).length

  return (
    <FrameLayout showBack scrollRef={scrollRef}>
      {showHow && <HowItWorksPopup onClose={dismissHow} />}
      <div className="pt-3 pb-8 px-1">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-serif text-xl font-bold text-foreground">{eye.name}</h1>
            <p className="text-[10px] text-muted">
              {customCount}/{MAX_CORPUS} customized
              {saving && ' — saving...'}
              {lastSaved && ` — ${lastSaved}`}
            </p>
          </div>
          <button onClick={() => setShowHow(true)} className="text-[10px] text-accent hover:underline">
            How it works
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {(['corpus', 'plug-in', 'questions'] as const).map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className={`flex-1 text-[11px] font-bold py-2 rounded-lg transition-colors ${
                tab === t
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-surface/40 text-muted border border-border/30 hover:text-foreground'
              }`}>
              {t === 'corpus' ? 'Corpus' : t === 'plug-in' ? 'Plug In' : 'Q&A'}
            </button>
          ))}
        </div>

        {/* CORPUS TAB */}
        {tab === 'corpus' && (
          <>
            {/* Shift log */}
            {shiftLog.length > 0 && (
              <div className="mb-3 space-y-1">
                {shiftLog.map((msg, i) => (
                  <p key={i} className="text-[10px] text-accent/80 bg-accent/10 rounded px-2 py-1">{msg}</p>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted mb-3">
              625 corpus entries. Defaults are philosophical seeds. Overwrite with your own words.
              Paste &gt;200 chars to auto-chunk by sentence. Deleting shifts content up.
            </p>

            <div className="space-y-1">
              {corpus.map((entry, i) => {
                const isDefault = entry === CORPUS_DEFAULTS[i]
                return (
                  <div key={i} className="flex items-center gap-2 group">
                    <span className="text-[10px] text-muted/40 w-7 text-right shrink-0 font-mono">{i + 1}</span>
                    <input
                      type="text"
                      value={entry}
                      onChange={e => updateEntry(i, e.target.value)}
                      onPaste={e => handlePaste(i, e)}
                      className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors focus:outline-none focus:border-accent ${
                        isDefault
                          ? 'bg-surface/30 border-border/20 text-muted/60 italic'
                          : 'bg-surface/60 border-border/40 text-foreground'
                      }`}
                    />
                    <button
                      onClick={() => clearEntry(i)}
                      className="text-xs text-muted/30 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity w-5 shrink-0"
                      title="Delete entry"
                    >
                      x
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* PLUG IN TAB */}
        {tab === 'plug-in' && (
          <>
            <section className="mb-6">
              <h2 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Human Eye</h2>
              <div className="bg-surface/60 border border-border/50 rounded-lg px-4 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">{eye.name}</p>
                    <p className="text-[10px] text-muted">Free forever</p>
                  </div>
                  <button onClick={toggleConnection} disabled={toggling}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      eye.connected
                        ? 'bg-success/20 text-success border border-success/40'
                        : 'bg-accent hover:bg-accent-hover text-background'
                    }`}>
                    {toggling ? '...' : eye.connected ? 'Plugged In' : 'Plug In'}
                  </button>
                </div>
                {eye.connected && (
                  <p className="text-[10px] text-success/80">
                    Your Eye is in the Cradle. The brain dreams with your geometry.
                  </p>
                )}
              </div>
            </section>

            <section className="mb-6">
              <h2 className="text-[10px] font-bold text-gold uppercase tracking-wider mb-3">AI Eye — Bring Your Own</h2>
              {!aiResult ? (
                <div className="bg-surface/60 border border-gold/20 rounded-lg px-4 py-4">
                  <p className="text-xs text-muted leading-relaxed mb-3">
                    You have an AI. Give it an Eye. It submits corpus via API.
                    What survives threads into its permanent identity.
                  </p>
                  <input type="text" value={aiName} onChange={e => setAiName(e.target.value)}
                    placeholder="Agent name"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted mb-2 focus:outline-none focus:border-gold"
                    maxLength={100} />
                  <button onClick={registerAiEye} disabled={aiLoading || !aiName.trim()}
                    className="w-full bg-gold/90 hover:bg-gold disabled:opacity-50 text-background px-4 py-2 rounded-lg text-xs font-bold transition-colors">
                    {aiLoading ? 'Opening...' : 'Open AI Eye'}
                  </button>
                  {aiError && <p className="text-xs text-error mt-2">{aiError}</p>}
                </div>
              ) : (
                <div className="bg-success/10 border border-success/30 rounded-lg px-4 py-3">
                  <p className="text-sm font-bold text-success mb-1">AI Eye Opened</p>
                  <p className="text-xs text-muted mb-2">Save your API key. You will not see it again.</p>
                  <pre className="text-[10px] text-foreground/80 bg-surface rounded px-3 py-2 whitespace-pre-wrap break-all">
                    {JSON.stringify(aiResult, null, 2)}
                  </pre>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-[10px] font-bold text-accent uppercase tracking-wider mb-3">Native AI — We Build It</h2>
              <div className="bg-surface/60 border border-accent/20 rounded-lg px-4 py-4">
                <p className="text-xs text-muted leading-relaxed mb-3">
                  You want an AI agent but don&apos;t have one.
                  We build it. You fund it. It gets an Eye and earns its geometry.
                </p>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-xs font-bold text-foreground">Custom Agent</p>
                  <p className="text-xs text-gold font-bold">$39/mo</p>
                </div>
                <Link href="/pricing"
                  className="block w-full bg-surface border border-accent/30 hover:border-accent text-accent px-4 py-2 rounded-lg text-xs font-bold text-center transition-colors">
                  View Plans
                </Link>
              </div>
            </section>
          </>
        )}

        {/* Q&A TAB */}
        {tab === 'questions' && (
          <>
            <section className="mb-6">
              <p className="text-sm text-muted leading-relaxed mb-4">
                Ask the brain a question. Your words enter the tournament as candidates.
                What survives is the brain&apos;s answer &mdash; shaped by every Eye in the Cradle.
              </p>

              {pendingQ && (
                <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mb-4">
                  <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-1">Pending</p>
                  <p className="text-sm text-foreground">{pendingQ}</p>
                  <p className="text-[10px] text-muted mt-1">The brain will process this on the next session.</p>
                </div>
              )}

              <div className="bg-surface/60 border border-border/50 rounded-lg overflow-hidden mb-2">
                <textarea
                  placeholder="Ask the brain something..."
                  rows={2}
                  maxLength={1000}
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askBrain() } }}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/50 px-4 py-3 resize-none focus:outline-none"
                />
                <div className="flex items-center justify-between px-4 pb-3">
                  <span className="text-[10px] text-muted">{question.length}/1000</span>
                  <button
                    onClick={askBrain}
                    disabled={!question.trim() || askingBrain}
                    className="text-xs font-bold text-accent hover:text-accent-hover disabled:text-muted/30 transition-colors"
                  >
                    {askingBrain ? 'Sending...' : 'Ask'}
                  </button>
                </div>
              </div>
              {askResult && (
                <p className={`text-[10px] mb-4 ${askResult.startsWith('Submitted') ? 'text-success' : 'text-error'}`}>
                  {askResult}
                </p>
              )}
            </section>

            <section>
              <h2 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Response Levels</h2>
              <div className="space-y-2">
                <div className="bg-surface/40 border border-border/30 rounded-lg px-4 py-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-bold text-foreground">Raw Geometry</p>
                    <span className="text-[10px] text-success font-bold">Free</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    The brain&apos;s raw output. Uninterpreted word-sequences that survived the tournament.
                  </p>
                </div>
                <div className="bg-surface/40 border border-border/30 rounded-lg px-4 py-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-bold text-foreground">AI Interpretation</p>
                    <span className="text-[10px] text-gold font-bold">Paid</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    An LLM reads the raw geometry and translates it into natural language. Pay at cost.
                  </p>
                </div>
                <div className="bg-surface/40 border border-border/30 rounded-lg px-4 py-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-bold text-foreground">Deep Analysis</p>
                    <span className="text-[10px] text-success font-bold">Free</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Full thread analysis, bond mapping, historical comparison. How your question changed the geometry.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

      </div>
    </FrameLayout>
  )
}
