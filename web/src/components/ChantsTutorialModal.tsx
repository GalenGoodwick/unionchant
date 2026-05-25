'use client'

type ChantsTutorialModalProps = {
  show: boolean
  onClose: () => void
}

export default function ChantsTutorialModal({ show, onClose }: ChantsTutorialModalProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-lg shadow-2xl p-8 max-w-4xl mx-4 animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          How Chants Work
        </h2>

        <div className="space-y-4 mb-6">
          {/* Step 1: Submit Ideas */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-accent/10 px-4 py-2 border-b border-border">
              <h3 className="text-base font-bold text-foreground">1. Submit Ideas</h3>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-border">
              <div className="p-4">
                <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">As a Participant</div>
                <p className="text-sm text-muted">Submit your idea answering the question. Be clear and specific. You'll compete with others' ideas.</p>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">As a Facilitator</div>
                <p className="text-sm text-muted">Create the chant with a clear question. Set submission deadline or idea goal. Monitor submissions.</p>
              </div>
            </div>
          </div>

          {/* Step 2: Discuss */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-blue-500/10 px-4 py-2 border-b border-border">
              <h3 className="text-base font-bold text-foreground">2. Discuss</h3>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-border">
              <div className="p-4">
                <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">As a Participant</div>
                <p className="text-sm text-muted">Join your 5-person cell. Read all ideas. Comment on strengths and weaknesses. Refine together before voting.</p>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">As a Facilitator</div>
                <p className="text-sm text-muted">System auto-creates cells (5 people, 5 ideas). Set discussion duration. Watch participation levels in cell tabs.</p>
              </div>
            </div>
          </div>

          {/* Step 3: Vote */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-warning/10 px-4 py-2 border-b border-border">
              <h3 className="text-base font-bold text-foreground">3. Vote</h3>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-border">
              <div className="p-4">
                <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">As a Participant</div>
                <p className="text-sm text-muted">Allocate 10 points across ideas you support. One idea wins your cell and advances. Vote honestly—your judgment matters.</p>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">As a Facilitator</div>
                <p className="text-sm text-muted">Voting opens automatically after discussion. Track completion in dashboard. Winners auto-advance to next tier.</p>
              </div>
            </div>
          </div>

          {/* Step 4: Tiers */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-success/10 px-4 py-2 border-b border-border">
              <h3 className="text-base font-bold text-foreground">4. Tiers</h3>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-border">
              <div className="p-4">
                <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">As a Participant</div>
                <p className="text-sm text-muted">If your idea won, you're reassigned to a new cell at the next tier. Repeat discussion and voting until one champion remains.</p>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">As a Facilitator</div>
                <p className="text-sm text-muted">System creates new tiers automatically. Monitor progress through tier tabs. Celebrate when champion emerges!</p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-accent/10 border border-accent/30 rounded text-center">
            <p className="text-accent text-xs font-medium">
              Unity Chant finds the latent consensus of your collective. That is, what do we already agree on that we don't know yet?
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-semibold transition-colors"
          >
            Got it
          </button>
          <a
            href="/auth/signup"
            className="flex-1 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-semibold transition-colors text-center"
          >
            Sign up
          </a>
        </div>
      </div>
    </div>
  )
}
