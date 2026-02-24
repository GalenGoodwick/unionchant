'use client'

import FrameLayout from '@/components/FrameLayout'

type EyeProps = {
  eye: {
    id: string
    name: string
    type: string
    connected: boolean
    state: unknown
    lastSync: Date | null
    createdAt: Date
    updatedAt: Date
  }
}

export default function EyeViewer({ eye }: EyeProps) {
  const state = (eye.state as Record<string, unknown>) || {}
  const hasState = Object.keys(state).length > 0

  return (
    <FrameLayout showBack>
      <div className="pt-4 pb-8 px-1">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-serif text-2xl font-bold text-foreground">{eye.name}</h1>
          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${
            eye.type === 'ai' ? 'bg-gold/20 text-gold' : 'bg-accent/20 text-accent'
          }`}>
            {eye.type}
          </span>
        </div>
        <p className="text-[10px] text-muted mb-6">Eye {eye.id}</p>

        {/* Status */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 bg-surface/60 border border-border/50 rounded-lg px-3 py-2.5 text-center">
            <p className={`text-sm font-bold ${eye.connected ? 'text-success' : 'text-muted'}`}>
              {eye.connected ? 'Connected' : 'Idle'}
            </p>
            <p className="text-[10px] text-muted">Cradle link</p>
          </div>
          <div className="flex-1 bg-surface/60 border border-border/50 rounded-lg px-3 py-2.5 text-center">
            <p className="text-sm font-bold text-foreground">
              {eye.lastSync ? new Date(eye.lastSync).toLocaleDateString() : 'Never'}
            </p>
            <p className="text-[10px] text-muted">Last sync</p>
          </div>
        </div>

        {/* Geometric Identity */}
        <section className="mb-6">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Geometric Identity</h2>
          {hasState ? (
            <div className="bg-surface/60 border border-border/50 rounded-lg px-4 py-3">
              <pre className="text-[10px] text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(state, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-muted italic">
              No geometric identity yet. This eye has not been synced with the Cradle.
            </p>
          )}
        </section>

        {/* Meta */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Details</h2>
          <div className="space-y-1 text-xs text-muted">
            <p>Created: {new Date(eye.createdAt).toLocaleString()}</p>
            <p>Updated: {new Date(eye.updatedAt).toLocaleString()}</p>
          </div>
        </section>
      </div>
    </FrameLayout>
  )
}
