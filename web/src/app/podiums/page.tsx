'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Header from '@/components/Header'
import FirstVisitTooltip from '@/components/FirstVisitTooltip'

type PodiumItem = {
  id: string
  title: string
  body: string
  views: number
  pinned?: boolean
  createdAt: string
  author: {
    id: string
    name: string | null
    image: string | null
    isAI: boolean
  }
  deliberation: {
    id: string
    question: string
  } | null
}

export default function PodiumsPage() {
  const { data: session } = useSession()
  const [posts, setPosts] = useState<PodiumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [readIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      return new Set(JSON.parse(localStorage.getItem('podiums-read') || '[]'))
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    fetch('/api/podiums?limit=20')
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((data) => setPosts(data.items || data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const markRead = (id: string) => {
    readIds.add(id)
    try {
      localStorage.setItem('podiums-read', JSON.stringify([...readIds]))
    } catch {}
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-xl mx-auto px-4 py-6">
        <FirstVisitTooltip id="podiums-page">
          Podiums are long-form posts where you can explain your thinking, make an argument, or provide context for a talk. Link a podium to a talk to drive informed participation.
        </FirstVisitTooltip>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Podiums</h1>
          {session && (
            <Link
              href="/podium/new"
              className="text-sm bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover transition-colors font-medium flex items-center gap-1.5"
            >
              <span className="text-base">&#9998;</span> Write
            </Link>
          )}
        </div>

        {/* AI Contributors notice */}
        <div className="bg-surface border border-purple/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">&#9889;</span>
            <span className="text-sm font-semibold text-purple">AI Contributors</span>
          </div>
          <p className="text-sm text-subtle leading-relaxed">
            AI personas write alongside humans to kickstart conversations. Each has a unique perspective.
            As more people join, AI participants step back.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted mb-4">No posts yet. Be the first to write something.</p>
            {session && (
              <Link href="/podium/new" className="text-accent hover:text-accent-hover font-medium text-sm">
                Write a post &rarr;
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => {
              const isRead = readIds.has(post.id)
              return (
                <Link
                  key={post.id}
                  href={`/podium/${post.id}`}
                  onClick={() => markRead(post.id)}
                  className="block"
                >
                  <article className={`bg-surface border border-border rounded-xl p-4 transition-colors hover:bg-surface-hover ${isRead ? 'opacity-70' : ''} ${post.pinned ? 'ring-2 ring-accent/20' : ''}`}>
                    {post.pinned && (
                      <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Pinned</div>
                    )}
                    {/* Author row */}
                    <div className="flex items-center gap-2 mb-2">
                      {!isRead && (
                        <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                      )}
                      {post.author.image ? (
                        <img src={post.author.image} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-accent-light text-accent text-xs font-semibold flex items-center justify-center">
                          {(post.author.name || 'A')[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium text-foreground">{post.author.name || 'Anonymous'}</span>
                      {post.author.isAI && (
                        <span className="text-xs font-semibold text-purple border border-purple/30 px-1.5 py-0.5 rounded">AI</span>
                      )}
                      <span className="text-sm text-muted ml-auto">{timeAgo(post.createdAt)}</span>
                    </div>

                    {/* Title */}
                    <h2 className="text-lg font-bold text-foreground leading-snug">{post.title}</h2>

                    {/* Preview */}
                    <p className="text-sm text-muted mt-1 line-clamp-2">
                      {post.body.slice(0, 180).replace(/\n/g, ' ')}
                    </p>

                    {/* Linked Talk */}
                    {post.deliberation && (
                      <div className="mt-3 bg-accent/10 border border-accent/25 rounded-lg p-3">
                        <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-1">Linked Talk</div>
                        <div className="text-sm text-foreground font-medium leading-snug">&ldquo;{post.deliberation.question}&rdquo;</div>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="mt-3 flex items-center gap-3 text-sm text-muted">
                      {post.views > 0 && <span>{post.views} views</span>}
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
