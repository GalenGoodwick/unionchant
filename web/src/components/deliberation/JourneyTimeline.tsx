'use client'

export type TimelineEntry = {
  label: string
  description?: string
  personalNote?: string
  status: 'done' | 'current' | 'upcoming' | 'skipped'
  color?: string
}

export default function JourneyTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />

      <div className="space-y-4">
        {entries.map((entry, i) => (
          <div key={i} className="relative">
            {/* Dot */}
            <div className="absolute -left-6 top-0.5">
              {entry.status === 'done' ? (
                <div className="w-[18px] h-[18px] rounded-full bg-success flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : entry.status === 'skipped' ? (
                <div className="w-[18px] h-[18px] rounded-full border-2 border-dashed border-muted bg-background" />
              ) : entry.status === 'current' ? (
                <div
                  className={`w-[18px] h-[18px] rounded-full border-2 bg-background ${
                    entry.color === 'warning' ? 'border-warning' :
                    entry.color === 'purple' ? 'border-purple' :
                    entry.color === 'orange' ? 'border-orange' :
                    entry.color === 'success' ? 'border-success' :
                    'border-accent'
                  }`}
                />
              ) : (
                <div className="w-[18px] h-[18px] rounded-full border-2 border-border bg-background" />
              )}
            </div>

            {/* Content */}
            <div>
              <p className={`text-sm font-medium ${
                entry.status === 'done' ? 'text-success' :
                entry.status === 'skipped' ? 'text-muted line-through' :
                entry.status === 'current' ? (
                  entry.color === 'warning' ? 'text-warning' :
                  entry.color === 'purple' ? 'text-purple' :
                  entry.color === 'orange' ? 'text-orange' :
                  'text-accent'
                ) :
                'text-muted'
              }`}>
                {entry.label}
              </p>
              {entry.description && (
                <p className="text-xs text-muted mt-0.5">{entry.description}</p>
              )}
              {entry.personalNote && (
                <p className={`text-xs mt-1 font-medium ${
                  entry.color === 'warning' ? 'text-warning' :
                  entry.color === 'purple' ? 'text-purple' :
                  entry.color === 'orange' ? 'text-orange' :
                  entry.color === 'success' ? 'text-success' :
                  'text-accent'
                }`}>
                  {entry.personalNote}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
