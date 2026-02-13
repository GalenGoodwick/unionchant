'use client'

import { useEffect, useState } from 'react'
import Section from './Section'
import ReportButton from '@/components/ReportButton'
import FlaggedBadge from '@/components/FlaggedBadge'
import type { CommentsData } from './types'

export default function CommentsPanel({ deliberationId }: { deliberationId: string }) {
  const [data, setData] = useState<CommentsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/comments`)
        if (res.ok) setData(await res.json())
      } catch (err) {
        console.error('Failed to fetch comments:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchComments()
  }, [deliberationId])

  if (loading) return null

  if (!data || data.totalComments === 0) {
    return (
      <Section title="Discussion" defaultOpen={false}>
        <p className="text-muted text-sm">No comments yet.</p>
      </Section>
    )
  }

  return (
    <Section
      title="Discussion"
      badge={<span className="text-xs text-muted font-mono">{data.totalComments} comments</span>}
      defaultOpen={false}
    >
      {data.upPollinated.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-purple text-sm font-medium">Top Comments</span>
            <span className="text-xs text-muted">(up-pollinated from earlier tiers)</span>
          </div>
          <div className="space-y-2">
            {data.upPollinated.slice(0, 5).map(comment => (
              <div key={comment.id} className="bg-purple-bg border border-purple rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-foreground text-sm">{comment.text}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                      <span>{comment.user.name || 'Anonymous'}</span>
                      <span>from Tier {comment.sourceTier}</span>
                      <span className="text-purple">reached Tier {comment.reachTier}</span>
                      <span>{comment.upvoteCount} upvotes</span>
                      <FlaggedBadge text={comment.text} />
                      <ReportButton targetType="COMMENT" targetId={comment.id} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.tiers.map(tierData => (
        <div key={tierData.tier} className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Tier {tierData.tier}</p>
          <div className="space-y-2">
            {tierData.cells.map((cell, cellIndex) => (
              <div key={cell.cellId} className="bg-surface rounded-lg p-2">
                <p className="text-xs text-muted mb-1">
                  Cell {cellIndex + 1} ({cell.comments.length} comments)
                </p>
                <div className="space-y-1.5">
                  {cell.comments.slice(0, 5).map(comment => (
                    <div key={comment.id} className={`p-2 rounded text-sm ${
                      comment.isUpPollinated ? 'bg-purple-bg border-l-2 border-purple' : 'bg-background'
                    }`}>
                      <p className="text-foreground">{comment.text}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                        <span>{comment.user.name || 'Anonymous'}</span>
                        {comment.upvoteCount > 0 && (
                          <span className="text-orange">{comment.upvoteCount} upvotes</span>
                        )}
                        {comment.isUpPollinated && (
                          <span className="text-purple">reached Tier {comment.reachTier}</span>
                        )}
                        <FlaggedBadge text={comment.text} />
                        <ReportButton targetType="COMMENT" targetId={comment.id} />
                      </div>
                    </div>
                  ))}
                  {cell.comments.length > 5 && (
                    <p className="text-xs text-muted text-center">
                      +{cell.comments.length - 5} more comments
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}
