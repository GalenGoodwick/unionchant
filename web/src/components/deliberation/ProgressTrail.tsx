'use client'

export type ProgressNode = {
  label: string
  status: 'done' | 'current'
  color?: string
}

export default function ProgressTrail({ nodes }: { nodes: ProgressNode[] }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-hide">
      {nodes.map((node, i) => (
        <div key={i} className="flex items-center shrink-0">
          {/* Connector line */}
          {i > 0 && (
            <div
              className={`w-6 h-0.5 ${
                nodes[i - 1].status === 'done' ? 'bg-success' : 'bg-border'
              }`}
            />
          )}

          {/* Node */}
          <div className="flex items-center gap-1.5">
            {node.status === 'done' ? (
              <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  node.color === 'warning' ? 'border-warning bg-warning-bg' :
                  node.color === 'purple' ? 'border-purple bg-purple-bg' :
                  node.color === 'orange' ? 'border-orange bg-orange-bg' :
                  node.color === 'success' ? 'border-success bg-success-bg' :
                  'border-accent bg-accent-light'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    node.color === 'warning' ? 'bg-warning' :
                    node.color === 'purple' ? 'bg-purple' :
                    node.color === 'orange' ? 'bg-orange' :
                    node.color === 'success' ? 'bg-success' :
                    'bg-accent'
                  }`}
                />
              </div>
            )}
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                node.status === 'done' ? 'text-success' :
                node.color === 'warning' ? 'text-warning' :
                node.color === 'purple' ? 'text-purple' :
                node.color === 'orange' ? 'text-orange' :
                'text-accent'
              }`}
            >
              {node.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
