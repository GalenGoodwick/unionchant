'use client'

import { useCellComments } from '@/hooks/useCellComments'

export default function ChatInputBar({
  cellId,
  onCommentPosted,
  ideas,
}: {
  cellId: string
  onCommentPosted?: () => void
  ideas?: { id: string; text: string }[]
}) {
  const {
    newComment,
    setNewComment,
    selectedIdeaId,
    setSelectedIdeaId,
    submitting,
    handleSubmit,
  } = useCellComments(cellId)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSubmit(e)
    if (onCommentPosted) onCommentPosted()
  }

  return (
    <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 z-20">
      {/* Idea reply pills */}
      {ideas && ideas.length > 0 && selectedIdeaId && (
        <div className="mb-2">
          <p className="text-xs text-warning mb-1">Replying to idea (top comments follow winning ideas)</p>
        </div>
      )}
      {ideas && ideas.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ideas.map(idea => (
            <button
              key={idea.id}
              type="button"
              onClick={() => setSelectedIdeaId(selectedIdeaId === idea.id ? null : idea.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[120px] ${
                selectedIdeaId === idea.id
                  ? 'bg-warning-bg border-warning text-warning'
                  : 'bg-background border-border text-muted hover:border-warning hover:text-warning'
              }`}
              title={idea.text}
            >
              {idea.text.slice(0, 20)}{idea.text.length > 20 ? '...' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Input + Send */}
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Message your cell..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          maxLength={2000}
          className="flex-1 bg-surface border border-border rounded-[18px] px-4 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={submitting || !newComment.trim()}
          className="w-9 h-9 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white flex items-center justify-center shrink-0 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  )
}
