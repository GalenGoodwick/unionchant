'use client'

import { useEffect, useState } from 'react'

export default function ChantsTutorialModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Check if tutorial should be shown
    const shouldShow = localStorage.getItem('show_chants_tutorial')
    if (shouldShow === 'true') {
      setShow(true)
      localStorage.removeItem('show_chants_tutorial')
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-lg shadow-2xl p-8 max-w-2xl mx-4 animate-in fade-in zoom-in duration-300">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          How Chants Work
        </h2>

        <div className="space-y-4 text-sm text-muted mb-6">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">1. Submit Ideas</h3>
            <p>During the submission phase, participants propose ideas answering the question.</p>
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">2. Discuss</h3>
            <p>Ideas are grouped into 5-person cells. Members discuss and refine ideas before voting.</p>
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">3. Vote</h3>
            <p>Each cell votes on their 5 ideas. The winner advances to the next tier. Losers are eliminated.</p>
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">4. Tiers</h3>
            <p>Winners compete in new cells at higher tiers. This continues until one idea remains: the champion.</p>
          </div>

          <div className="p-3 bg-accent/10 border border-accent/30 rounded">
            <p className="text-accent text-xs font-medium">
              What survives isn't what's popular — it's what's robust through adversarial deliberation.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShow(false)}
            className="flex-1 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-semibold transition-colors"
          >
            Got it
          </button>
          <a
            href="/how"
            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-semibold transition-colors text-center"
          >
            Learn more
          </a>
        </div>
      </div>
    </div>
  )
}
