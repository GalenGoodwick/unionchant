'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useFirstVisit } from '@/hooks/useFirstVisit'

/**
 * First-visit card set for the facilitator dashboard (/dashboard). Explains the
 * page's sections and buttons so a new facilitator isn't disoriented. Auto-opens
 * once per browser (localStorage via useFirstVisit key 'dashboard-guide'); the
 * feed has its own WelcomeGuide, this is the dashboard's counterpart.
 */
const PANELS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Your facilitator dashboard',
    body: (
      <>
        <p className="text-muted text-sm leading-relaxed mb-4">
          This is where you <span className="text-foreground font-medium">run</span> the chants, groups,
          and podiums you create — not where you vote. The feed is for taking part; this page is for
          facilitating your own.
        </p>
        <div className="flex justify-center my-4">
          <div className="w-16 h-16 rounded-full border-2 border-accent flex items-center justify-center bg-accent/10">
            <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
            </svg>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Create & manage chants',
    body: (
      <>
        <p className="text-muted text-sm leading-relaxed mb-3">
          The chants you make live under <span className="text-foreground font-medium">My Chants</span>.
        </p>
        <ul className="space-y-2 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-accent mt-1">&#x2022;</span>
            <span className="text-muted text-sm">
              Tap <span className="text-foreground font-semibold">+ Create New</span> to start a chant.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent mt-1">&#x2022;</span>
            <span className="text-muted text-sm">Tap any chant in the list to open its controls.</span>
          </li>
        </ul>
        <p className="text-muted/70 text-xs">Nothing yet? The empty state has a “Create Your First Chant” button.</p>
      </>
    ),
  },
  {
    title: 'Run the vote',
    body: (
      <>
        <p className="text-muted text-sm leading-relaxed mb-3">
          Open a chant to <span className="text-foreground font-medium">start voting, set timers, and control the flow</span>.
          The colored badge on each chant shows its phase:
        </p>
        <ul className="space-y-2.5 mb-4">
          <li className="flex items-center gap-2.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-white">Submission</span>
            <span className="text-muted text-sm">people are still submitting ideas</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning text-white">Voting</span>
            <span className="text-muted text-sm">cells are choosing the strongest answer</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-success text-white">Winner</span>
            <span className="text-muted text-sm">a priority has emerged</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Private & Public',
    body: (
      <p className="text-muted text-sm leading-relaxed">
        Your chants split into <span className="text-foreground font-medium">Private Chants</span> (invite-only) and{' '}
        <span className="text-foreground font-medium">Public Chants</span> (anyone can join). Each shows its member
        count, idea count, and current tier at a glance.
      </p>
    ),
  },
  {
    title: 'Groups & Podiums',
    body: (
      <>
        <div className="mb-4">
          <div className="text-foreground text-sm font-semibold mb-1">My Groups</div>
          <p className="text-muted text-sm leading-relaxed">
            The communities you run or belong to — <span className="text-foreground font-medium">Browse All</span> to
            find more. Groups you own open straight to their settings.
          </p>
        </div>
        <div className="mb-4">
          <div className="text-foreground text-sm font-semibold mb-1">My Podiums</div>
          <p className="text-muted text-sm leading-relaxed">
            Long-form posts that give a chant context — <span className="text-foreground font-medium">Write New</span> to
            add one and link it to a chant.
          </p>
        </div>
        <p className="text-muted/70 text-xs">That’s the dashboard — you’re set.</p>
      </>
    ),
  },
]

const TOTAL = PANELS.length

export default function DashboardGuide() {
  const [visible, markSeen] = useFirstVisit('dashboard-guide')
  const [step, setStep] = useState(0)

  if (!visible) return null

  const dismiss = () => {
    setStep(0)
    markSeen()
  }

  const isLast = step === TOTAL - 1

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-background/85 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-lg border border-border bg-surface p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground text-center mb-4">{PANELS[step].title}</h2>

        <div className="mb-6">{PANELS[step].body}</div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? 'bg-accent' : 'bg-border'}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted border border-border transition-colors hover:text-foreground"
            >
              Back
            </button>
          )}
          <button
            onClick={isLast ? dismiss : () => setStep(s => s + 1)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:bg-accent-hover transition-colors"
          >
            {isLast ? "Got it" : 'Next'}
          </button>
        </div>

        {/* Skip or Learn more */}
        {isLast ? (
          <Link
            href="/how"
            onClick={dismiss}
            className="block w-full text-center text-xs text-accent hover:text-accent-hover transition-colors mt-3 py-1"
          >
            Learn more
          </Link>
        ) : (
          <button
            onClick={dismiss}
            className="w-full text-center text-xs text-muted/70 hover:text-muted transition-colors mt-3 py-1"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
