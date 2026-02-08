'use client'

import { useState } from 'react'

interface UserGuideProps {
  onClose: (dontShowAgain: boolean) => void
}

const steps = [
  {
    title: 'Join a Chant',
    icon: '💡',
    body: 'A Chant is a question posed to a group. Browse your Feed for open chants, or create your own. Submit your best idea — one per person.',
  },
  {
    title: 'Discuss in Your Cell',
    icon: '💬',
    body: 'You\'re placed in a cell of 5 people with 5 ideas. Read them all, then tap the chat icon on any idea to comment. If your comment gets upvoted, it spreads to other cells — every 2 upvotes reach one more cell.',
  },
  {
    title: 'Allocate 10 Vote Points',
    icon: '🗳️',
    body: 'Drag the sliders to distribute 10 Vote Points across the ideas you support. Go all-in on one, or spread them around. All 10 must be allocated to submit.',
  },
  {
    title: 'Winners Advance',
    icon: '🏆',
    body: 'The top idea in each cell advances to the next tier. New cells form, and it repeats. In the final round, everyone votes together. The winner becomes the priority.',
  },
  {
    title: 'Your Feed',
    icon: '📋',
    body: 'Feed shows actions you can take — vote, submit, join. Activity shows what\'s happening across the platform. Results shows completed chants.',
  },
  {
    title: 'Rolling Mode',
    icon: '🔄',
    body: 'Some chants keep going after a priority is declared. New challenger ideas can be submitted, and periodically a new round tests whether the priority still holds.',
  },
]

export default function UserGuide({ onClose }: UserGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl max-w-sm w-full shadow-xl overflow-hidden">
        {/* Progress bar */}
        <div className="flex">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 transition-colors ${
                i <= currentStep ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="text-center mb-5">
            <span className="text-4xl mb-3 block">{step.icon}</span>
            <h2 className="text-lg font-bold text-foreground mb-2">
              {step.title}
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {step.body}
            </p>
          </div>

          {/* Step indicator */}
          <div className="text-center text-muted text-xs mb-4">
            {currentStep + 1} / {steps.length}
          </div>

          {/* Don't show again */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer text-xs text-muted">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-border accent-accent"
            />
            Don&apos;t show this again
          </label>

          {/* Navigation */}
          <div className="flex gap-3">
            {!isFirst && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="flex-1 py-2 border border-border rounded-lg text-sm text-muted hover:text-foreground hover:border-border-strong transition-colors"
              >
                Back
              </button>
            )}
            {isFirst && (
              <button
                onClick={() => onClose(dontShowAgain)}
                className="flex-1 py-2 border border-border rounded-lg text-sm text-muted hover:text-foreground hover:border-border-strong transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => isLast ? onClose(dontShowAgain) : setCurrentStep(currentStep + 1)}
              className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook to manage guide visibility
export function useUserGuide() {
  const [showGuide, setShowGuide] = useState(false)

  const openGuide = () => setShowGuide(true)
  const closeGuide = () => setShowGuide(false)

  return { showGuide, openGuide, closeGuide }
}
