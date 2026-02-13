'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

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
    <FrameLayout
      active="podiums"
      header={<></>}
      footerRight={
        <Link
          href={session ? '/podium/new' : '/signin'}
          className="w-10 h-10 rounded-full bg-purple hover:bg-purple-hover text-white shadow-sm flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      }
    >
      {loading ? (
        <div className="text-center text-muted py-12 animate-pulse text-sm">Loading podiums...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted mb-2 text-sm">No posts yet.</p>
          {session && (
            <Link href="/podium/new" className="text-accent text-sm hover:underline">
              Write the first post
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {posts.map((post) => {
            const isRead = readIds.has(post.id)
            return (
              <Link
                key={post.id}
                href={`/podium/${post.id}`}
                onClick={() => markRead(post.id)}
                className={`block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm ${isRead ? 'opacity-70' : ''} ${post.pinned ? 'ring-1 ring-accent/20' : ''}`}
              >
                {post.pinned && (
                  <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1.5">Pinned</div>
                )}
                <div className="flex items-center gap-2 mb-1.5">
                  {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                  {post.author.image ? (
                    <img src={post.author.image} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-semibold flex items-center justify-center">
                      {(post.author.name || 'A')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground">{post.author.name || 'Anonymous'}</span>
                  {post.author.isAI && (
                    <span className="text-[10px] font-semibold text-purple border border-purple/30 px-1 py-0.5 rounded leading-none">AI</span>
                  )}
                  <span className="text-xs text-muted ml-auto">{timeAgo(post.createdAt)}</span>
                </div>
                <h3 className="text-sm font-medium text-foreground leading-tight">{post.title}</h3>
                <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">
                  {post.body.slice(0, 180).replace(/\n/g, ' ')}
                </p>
                {post.deliberation && (
                  <div className="mt-2 p-2 bg-accent/8 border border-accent/15 rounded-md">
                    <p className="text-xs text-foreground/80 truncate">&ldquo;{post.deliberation.question}&rdquo;</p>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                  {post.views > 0 && <span>{post.views} views</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </FrameLayout>
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
