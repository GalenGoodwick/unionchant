'use client'

import { useEffect, useState } from 'react'
import type { DelibComment } from './types'

export default function UpPollinatedComments({ deliberationId }: { deliberationId: string }) {
  const [comments, setComments] = useState<DelibComment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/comments`)
        if (res.ok) {
          const data = await res.json()
          setComments(data.upPollinated || [])
        }
      } catch (err) {
        console.error('Failed to fetch comments:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchComments()
    const interval = setInterval(fetchComments, 15000)
    return () => clearInterval(interval)
  }, [deliberationId])

  if (loading) return null

  if (comments.length === 0) {
    return (
      <div className="rounded-lg border border-border border-dashed p-3 text-center">
        <p className="text-muted text-xs">No top comments yet</p>
      </div>
    )
  }

  return (
    <div className="bg-purple-bg/50 border border-purple/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-purple text-xs font-semibold uppercase tracking-wide">Top Comments</span>
        <span className="text-xs text-muted">from across cells</span>
      </div>
      <div className="space-y-2">
        {comments.slice(0, 3).map(comment => (
          <div key={comment.id} className="bg-purple-bg border-l-2 border-purple rounded p-2">
            <p className="text-foreground text-sm">{comment.text}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted">
              <span>{comment.user.name || 'Anonymous'}</span>
              <span className="text-purple">T{comment.sourceTier} → T{comment.reachTier}</span>
              <span className="font-mono">{comment.upvoteCount}↑</span>
            </div>
          </div>
        ))}
      </div>
      {comments.length > 3 && (
        <p className="text-xs text-purple mt-2 text-center">+{comments.length - 3} more top comments in details</p>
      )}
    </div>
  )
}
