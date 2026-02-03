'use client'

import { useSession } from 'next-auth/react'
import { getDisplayName } from '@/lib/user'
import { useCellComments } from '@/hooks/useCellComments'
import type { CommentWithUpvote } from './types'

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function ChatBubble({
  comment,
  isOwn,
  isUpPollinated,
  onUpvote,
  upvoting,
}: {
  comment: CommentWithUpvote
  isOwn: boolean
  isUpPollinated: boolean
  onUpvote: (id: string) => void
  upvoting: string | null
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[80%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Name + time (not shown for own messages) */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-0.5 px-1">
            {isUpPollinated ? (
              <>
                <span className="w-4 h-4 rounded-full bg-purple/30 flex items-center justify-center text-[8px] text-purple">↑</span>
                <span className="text-xs font-medium text-purple">{getDisplayName(comment.user)}</span>
                <span className="text-[10px] text-purple/70">From another group</span>
              </>
            ) : (
              <>
                <span className="text-xs font-medium text-muted">{getDisplayName(comment.user)}</span>
                <span className="text-[10px] text-muted">{timeAgo(comment.createdAt)}</span>
              </>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-3 py-2 text-sm ${
            isUpPollinated
              ? 'bg-purple-bg text-foreground border border-purple/30'
              : isOwn
                ? 'bg-accent-light text-foreground'
                : 'bg-surface text-foreground'
          }`}
        >
          {comment.linkedIdea && (
            <p className="text-xs text-warning mb-1 truncate">
              Re: {comment.linkedIdea.text.slice(0, 50)}{comment.linkedIdea.text.length > 50 ? '...' : ''}
            </p>
          )}
          <p>{comment.text}</p>
        </div>

        {/* Upvote button */}
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${isOwn ? 'justify-end' : ''}`}>
          {isOwn && (
            <span className="text-[10px] text-muted">{timeAgo(comment.createdAt)}</span>
          )}
          <button
            onClick={() => onUpvote(comment.id)}
            disabled={upvoting === comment.id || comment.userHasUpvoted}
            className={`flex items-center gap-0.5 text-[10px] transition-colors ${
              comment.userHasUpvoted
                ? 'text-purple'
                : 'text-muted hover:text-purple'
            }`}
          >
            <svg className="w-3 h-3" fill={comment.userHasUpvoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            {(comment.upvoteCount || 0) > 0 && (
              <span className="font-mono">{comment.upvoteCount}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatDiscussion({
  cellId,
  ideas,
}: {
  cellId: string
  ideas?: { id: string; text: string }[]
}) {
  const { data: session } = useSession()
  const comments = useCellComments(cellId)
  const currentUserId = session?.user?.id

  if (comments.loading) {
    return <p className="text-muted text-sm py-2">Loading discussion...</p>
  }

  if (comments.allComments.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-muted text-sm">No messages yet</p>
        <p className="text-muted text-xs mt-1">Start the discussion with your cell</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 py-2">
      {/* Up-pollinated section */}
      {comments.upPollinatedComments.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-purple mb-2 font-medium">Insights from other cells</p>
          {comments.upPollinatedComments.slice(0, 3).map(c => (
            <ChatBubble
              key={c.id}
              comment={c}
              isOwn={false}
              isUpPollinated={true}
              onUpvote={comments.handleUpvote}
              upvoting={comments.upvoting}
            />
          ))}
        </div>
      )}

      {/* Local comments */}
      {comments.localComments.map(c => (
        <ChatBubble
          key={c.id}
          comment={c}
          isOwn={c.user.id === currentUserId}
          isUpPollinated={false}
          onUpvote={comments.handleUpvote}
          upvoting={comments.upvoting}
        />
      ))}
    </div>
  )
}

// Export the hook reference for ChatInputBar to share state
export { useCellComments }
