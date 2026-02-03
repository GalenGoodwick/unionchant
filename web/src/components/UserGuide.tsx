'use client'

import { useState } from 'react'

interface UserGuideProps {
  onClose: (dontShowAgain: boolean) => void
}

const steps = [
  {
    title: 'Submit Your Ideas',
    icon: '💡',
    description: 'When a talk is open for ideas, anyone can submit their answer. Share your best solution to the question being asked.',
    tip: 'Be clear and concise. Your idea competes with others, so make it count!',
  },
  {
    title: 'Spend Your 10 XP',
    icon: '🎯',
    description: 'Each voter gets 10 XP points to distribute across ideas in their cell. Put all 10 on your favorite, or spread them to show nuanced support. Voting is always anonymous — no one can see how you allocated your XP.',
    tip: 'You must allocate all 10 XP. The idea with the most total XP wins the cell. Only totals are shown, never individual votes.',
  },
  {
    title: 'Discuss & Chant',
    icon: '💬',
    description: 'Your cell discusses ideas together. Anyone can propose a chant — a revised version of any idea. Swipe between original and chant. If 30% of cell members confirm, the chant replaces the original across all cells.',
    tip: 'Chants can up-pollinate to other cells. Strengthening ideas benefits everyone!',
  },
  {
    title: 'Winners Advance',
    icon: '🏆',
    description: 'The idea with the most XP in your cell advances to the next tier. This repeats: winners from Tier 1 compete in Tier 2, and so on.',
    tip: 'This process ensures the best ideas rise through the ranks.',
  },
  {
    title: 'Final Round',
    icon: '🎯',
    description: 'When only a few ideas remain, ALL participants vote together. The idea with the most XP becomes the top priority!',
    tip: 'Even if your idea lost earlier, you can still allocate XP to the winner.',
  },
  {
    title: 'Challenge the Priority',
    icon: '👑',
    description: 'In Rolling Mode, the current priority can be challenged! Submit new ideas while the talk is accepting new ideas. If a challenger wins, there\'s a new priority.',
    tip: 'Great decisions aren\'t set in stone — they can evolve over time.',
  },
  {
    title: 'Podium Posts',
    icon: '📝',
    description: 'Write long-form Podium posts to explain your thinking, make the case for an idea, or provide context. Podium posts can be linked to talks so readers can join the deliberation directly.',
    tip: 'Link a Podium post to your talk to drive informed participation. Readers see a "Join" button right on the post.',
  },
  {
    title: 'The Collective',
    icon: '🌐',
    description: 'The Collective is a shared chat visible to everyone. You can auto-generate talks from any message — or create them manually at /talks/new. Collective conversations can spark deliberations that the whole community joins.',
    tip: 'Hit "Set as Talk" on any message to auto-create a deliberation from it.',
  },
  {
    title: 'Facilitator Controls',
    icon: '🎛️',
    description: 'If you created a talk, you\'re the facilitator. Use the Manage page to start voting, open challenge rounds, set timers, and control the flow. You can move between phases freely — reopen submissions, restart voting, or close the talk at any time.',
    tip: 'Go to your talk\'s detail page and tap the gear icon to access facilitator controls.',
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
