'use client'

interface BookmarkSidebarProps {
  bookmarks: string[]
  activeSubspaceId: string | null
  onNavigate: (ideaId: string) => void
  onRemove: (ideaId: string) => void
}

export default function BookmarkSidebar({
  bookmarks,
  activeSubspaceId,
  onNavigate,
  onRemove,
}: BookmarkSidebarProps) {
  if (bookmarks.length === 0) return null

  return (
    <div className="fixed left-0 top-16 z-[76] flex flex-col gap-1 py-2 px-1">
      <div className="text-[7px] font-mono text-muted-light/30 uppercase tracking-wider text-center mb-0.5" style={{ writingMode: 'vertical-lr' }}>
        Spaces
      </div>
      {bookmarks.map(ideaId => {
        const isActive = activeSubspaceId === ideaId
        return (
          <div key={ideaId} className="relative group">
            <button
              onClick={() => onNavigate(ideaId)}
              data-interactive
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'bg-accent/20 border-2 border-accent shadow-[0_0_8px_rgba(34,211,238,0.4)]'
                  : 'bg-transparent border-2 border-border/30 hover:border-accent/40 hover:bg-accent/5'
              }`}
              title={ideaId.slice(0, 8)}
            >
              <svg
                className={`w-3 h-3 transition-colors ${isActive ? 'fill-accent' : 'fill-muted-light/40 group-hover:fill-accent/60'}`}
                viewBox="0 0 24 24"
              >
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
              </svg>
            </button>
            {/* Remove button on hover */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(ideaId) }}
              data-interactive
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-header border border-border/50 items-center justify-center text-muted-light/40 hover:text-error hover:border-error/40 hidden group-hover:flex transition-colors"
            >
              <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
