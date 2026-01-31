import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import ShareMenu from '@/components/ShareMenu'

type CardShellProps = {
  item: FeedItem
  borderColor?: string
  className?: string
  headerLabel: React.ReactNode
  headerLabelColor?: string
  headerRight?: React.ReactNode
  headerBgClass?: string
  onExplore?: () => void
  onDismiss?: () => void
  statsLeft?: React.ReactNode
  children: React.ReactNode
}

export default function CardShell({
  item,
  borderColor = 'border-accent',
  className = '',
  headerLabel,
  headerLabelColor = 'text-accent',
  headerRight,
  headerBgClass = '',
  onExplore,
  onDismiss,
  statsLeft,
  children,
}: CardShellProps) {
  return (
    <div className={`bg-surface border ${borderColor} rounded-xl overflow-hidden ${className}`}>
      {/* Creator / Community meta */}
      {(item.deliberation.creator || item.community) && (
        <div className="px-4 py-2 text-xs text-muted">
          {item.deliberation.creator && <>Created by <Link href={`/user/${item.deliberation.creator.id}`} className="text-accent hover:text-accent-hover">{item.deliberation.creator.name}</Link></>}
          {item.deliberation.creator && item.community && ' · '}
          {item.community && <Link href={`/communities/${item.community.slug}`} className="text-accent hover:text-accent-hover">{item.community.name}</Link>}
        </div>
      )}

      {/* Header */}
      <div className={`px-4 py-3 border-b border-border flex justify-between items-center ${headerBgClass}`}>
        <span className={`font-bold text-sm uppercase tracking-wide ${headerLabelColor}`}>
          {headerLabel}
        </span>
        {headerRight && (
          <span className="text-sm text-muted font-mono">
            {headerRight}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <Link
          href={`/deliberations/${item.deliberation.id}`}
          className="block text-lg font-semibold text-foreground hover:text-accent transition-colors"
        >
          &quot;{item.deliberation.question}&quot;
        </Link>
        {item.deliberation.description && (
          <p className="text-muted text-sm mt-1">{item.deliberation.description}</p>
        )}
        <div className="mb-4" />
        {children}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-muted">
          {onDismiss ? (
            <button onClick={onDismiss} className="text-muted hover:text-foreground transition-colors">
              Dismiss
            </button>
          ) : statsLeft ? (
            statsLeft
          ) : <span />}
          {item.deliberation.views > 0 && (
            <span className="flex items-center gap-1">
              <span>👁</span> {item.deliberation.views}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ShareMenu
            url={`/deliberations/${item.deliberation.id}`}
            text={item.deliberation.question}
            variant="icon"
            dropUp
          />
          {onExplore && (
            <button
              onClick={onExplore}
              className="text-muted hover:text-foreground transition-colors"
            >
              Discuss
            </button>
          )}
          <Link
            href={`/deliberations/${item.deliberation.id}`}
            className="text-accent hover:text-accent-hover transition-colors"
          >
            Full page →
          </Link>
        </div>
      </div>
    </div>
  )
}
