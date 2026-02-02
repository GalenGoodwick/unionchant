'use client'

import { useState } from 'react'

interface UserGuideProps {
  onClose: (dontShowAgain: boolean) => void
}

const steps = [
  {
    title: 'Submit Your Ideas',
    icon: '💡',
    description: 'When a deliberation is in the submission phase, anyone can submit their idea. Share your best solution to the question being asked.',
    tip: 'Be clear and concise. Your idea competes with others, so make it count!',
  },
  {
    title: 'Vote in Your Cell',
    icon: '🗳️',
    description: 'When voting begins, you\'re assigned to a "cell" with 4 other voters. Your cell reviews 5 ideas and votes together. Each person picks their favorite.',
    tip: 'Take your time to read all ideas. You can change your vote until voting ends.',
  },
  {
    title: 'Discuss & Up-Pollinate',
    icon: '💬',
    description: 'Share thoughts with your cell during voting. If your comment gets upvotes, it "up-pollinates" to other cells discussing the same ideas—your insight can reach thousands!',
    tip: 'Great comments spread organically. Help others see what you see.',
  },
  {
    title: 'Winners Advance',
    icon: '🏆',
    description: 'The winning idea from your cell advances to the next tier. This repeats: winners from Tier 1 compete in Tier 2, and so on.',
    tip: 'This process ensures the best ideas rise through the ranks.',
  },
  {
    title: 'Final Round',
    icon: '🎯',
    description: 'When only a few ideas remain, ALL participants vote together. The idea with the most support becomes the top priority!',
    tip: 'Even if your idea lost earlier, you can still vote for the winner.',
  },
  {
    title: 'Challenge the Champion',
    icon: '👑',
    description: 'In Rolling Mode, the champion can be challenged! Submit new ideas during the accumulation period. If challengers beat the champion, there\'s a new winner.',
    tip: 'Great decisions aren\'t set in stone—they can evolve over time.',
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
      <div className="bg-background rounded-xl max-w-md w-full shadow-xl overflow-hidden">
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
        <div className="p-6">
          <div className="text-center mb-6">
            <span className="text-5xl mb-4 block">{step.icon}</span>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {step.title}
            </h2>
            <p className="text-muted">
              {step.description}
            </p>
          </div>

          {/* Tip box */}
          <div className="bg-accent-light border border-accent rounded-lg p-3 mb-6">
            <p className="text-sm text-foreground">
              <span className="font-medium">Tip:</span> {step.tip}
            </p>
          </div>

          {/* Step indicator */}
          <div className="text-center text-muted text-sm mb-4">
            Step {currentStep + 1} of {steps.length}
          </div>

          {/* Don't show again */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm text-muted">
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
                className="flex-1 py-2 border border-border rounded-lg text-muted hover:text-foreground hover:border-border-strong transition-colors"
              >
                Back
              </button>
            )}
            {isFirst && (
              <button
                onClick={() => onClose(dontShowAgain)}
                className="flex-1 py-2 border border-border rounded-lg text-muted hover:text-foreground hover:border-border-strong transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => isLast ? onClose(dontShowAgain) : setCurrentStep(currentStep + 1)}
              className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
            >
              {isLast ? 'Get Started' : 'Next'}
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
