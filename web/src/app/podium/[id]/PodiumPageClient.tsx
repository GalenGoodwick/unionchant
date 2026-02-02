'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'

type PodiumPost = {
  id: string
  title: string
  body: string
  views: number
  createdAt: string
  updatedAt: string
  author: {
    id: string
    name: string | null
    image: string | null
    bio: string | null
  }
  deliberation: {
    id: string
    question: string
    description: string | null
    phase: string
    _count: { members: number; ideas: number }
  } | null
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function estimateReadTime(text: string) {
  const words = text.split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 230))
  return `${mins} min read`
}

function phaseLabel(phase: string) {
  switch (phase) {
    case 'SUBMISSION': return 'Open for ideas'
    case 'VOTING': return 'Voting'
    case 'COMPLETED': return 'Completed'
    case 'ACCUMULATING': return 'Accepting new ideas'
    default: return phase
  }
}

export default function PodiumPageClient() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { showToast } = useToast()
  const [podium, setPodium] = useState<PodiumPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const fetchPodium = async () => {
      try {
        const res = await fetch(`/api/podiums/${params.id}`)
        if (res.ok) {
          const data = await res.json()
          setPodium(data)
        }
      } catch (err) {
        console.error('Failed to fetch podium:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPodium()
  }, [params.id])

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/podiums/${params.id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Post deleted', 'success')
        router.push('/feed')
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to delete', 'error')
      }
    } catch {
      showToast('Failed to delete', 'error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (!podium) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="text-2xl font-bold">Post not found</div>
        <Link href="/feed" className="text-accent hover:text-accent-hover">
          Back to feed
        </Link>
      </div>
    )
  }

  const isAuthor = session?.user?.email && podium.author.id === (session.user as { id?: string }).id

  // Render body text: split by double newlines for paragraphs
  const paragraphs = podium.body.split(/\n\n+/)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back nav */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-muted hover:text-foreground transition-colors text-sm"
          >
            &larr; Back
          </button>
        </div>

        {/* Author */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-sm font-semibold text-muted">
            {podium.author.image ? (
              <img src={podium.author.image} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              podium.author.name?.[0]?.toUpperCase() || '?'
            )}
          </div>
          <div>
            <Link
              href={`/user/${podium.author.id}`}
              className="text-foreground font-semibold hover:text-accent transition-colors"
            >
              {podium.author.name || 'Anonymous'}
            </Link>
            <div className="text-xs text-muted">
              {formatDate(podium.createdAt)} &middot; {estimateReadTime(podium.body)}
              {podium.views > 0 && <> &middot; {podium.views} views</>}
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground leading-tight mb-6">
          {podium.title}
        </h1>

        {/* Linked deliberation */}
        {podium.deliberation && (
          <Link
            href={`/deliberations/${podium.deliberation.id}`}
            className="block bg-accent/10 border border-accent/25 rounded-xl p-4 mb-8 hover:bg-accent/15 transition-colors"
          >
            <div className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">
              Linked Deliberation
            </div>
            <div className="text-foreground font-medium">
              &ldquo;{podium.deliberation.question}&rdquo;
            </div>
            <div className="text-xs text-muted mt-1">
              {podium.deliberation._count.members} participants &middot;{' '}
              {podium.deliberation._count.ideas} ideas &middot;{' '}
              {phaseLabel(podium.deliberation.phase)}
            </div>
          </Link>
        )}

        {/* Body */}
        <article className="mb-8">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-muted leading-relaxed mb-4 text-base">
              {para}
            </p>
          ))}
        </article>

        {/* Join deliberation CTA */}
        {podium.deliberation && (
          <div className="mb-8">
            <Link
              href={`/deliberations/${podium.deliberation.id}`}
              className="block w-full text-center bg-accent text-white font-semibold py-3 rounded-xl hover:bg-accent-hover transition-colors"
            >
              Join the Deliberation &rarr;
            </Link>
          </div>
        )}

        {/* Footer actions */}
        <div className="border-t border-border pt-4 flex justify-between items-center text-sm text-muted">
          <div className="flex gap-4">
            <button className="hover:text-foreground transition-colors">Share</button>
          </div>
          {isAuthor && (
            <div className="flex gap-4">
              <Link
                href={`/podium/${podium.id}/edit`}
                className="hover:text-foreground transition-colors"
              >
                Edit
              </Link>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              ) : (
                <span className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    className="text-red-400 font-semibold"
                  >
                    Confirm delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="hover:text-foreground"
                  >
                    Cancel
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
