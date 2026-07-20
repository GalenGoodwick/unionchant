'use client'

import { useState } from 'react'
import Link from 'next/link'

interface WelcomeGuideProps {
  open: boolean
  onClose: () => void
}

const PANELS = [
  {
    title: 'Welcome to Unity Chant',
    body: (
      <>
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">
          A platform for collective decisions. Groups pose questions, everyone submits ideas,
          small cells vote, and the strongest answer emerges.
        </p>
        {/* UC logo / icon */}
        <div className="flex justify-center my-4">
          <div className="w-16 h-16 rounded-full border-2 border-[#0891b2] flex items-center justify-center"
               style={{ background: 'radial-gradient(circle, rgba(8,145,178,0.15) 0%, transparent 70%)' }}>
            <svg className="w-8 h-8 text-[#22d3ee]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Chants',
    body: (
      <>
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-3">
          A chant is a question you ask a group: everyone submits an answer, then votes narrow them to the best one. It moves through phases:
        </p>
        <ul className="space-y-2.5 mb-4">
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>
              Submission
            </span>
            <span className="text-[#94a3b8] text-sm">Everyone submits their idea</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
              Voting
            </span>
            <span className="text-[#94a3b8] text-sm">You&apos;re placed in a cell of 5 people with 5 ideas. Allocate 10 points across the ideas you support.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(5,150,105,0.15)', color: '#34d399' }}>
              Winner
            </span>
            <span className="text-[#94a3b8] text-sm">Winners advance through tiers until one answer emerges</span>
          </li>
        </ul>
        <p className="text-[#64748b] text-xs">Tap any chant to open it and participate.</p>
      </>
    ),
  },
  {
    title: 'How Voting Works',
    body: (
      <>
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-3">
          You&apos;re assigned to a small cell with 4 other people. Your cell sees 5 competing ideas.
        </p>
        <ul className="space-y-2 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-[#fbbf24] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">Slide the XP bar to allocate points (10 total)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#fbbf24] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">The winning idea from each cell advances to the next tier</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#fbbf24] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">New cells are formed at each tier until one champion remains</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#fbbf24] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">Discuss ideas with your cell to make better decisions</span>
          </li>
        </ul>
        <p className="text-[#64748b] text-xs">This means 1,000 people reach consensus in ~4 rounds.</p>
      </>
    ),
  },
  {
    title: 'Podiums & Groups',
    body: (
      <>
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <svg className="w-4 h-4 text-[#a78bfa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
            </svg>
            <span className="text-[#e2e8f0] text-sm font-semibold">Podiums</span>
          </div>
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            Long-form posts that provide context for chants. Read the case, then join the deliberation.
          </p>
        </div>
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <svg className="w-4 h-4 text-[#fbbf24]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <span className="text-[#e2e8f0] text-sm font-semibold">Groups</span>
          </div>
          <p className="text-[#94a3b8] text-sm leading-relaxed">
            Communities that deliberate together. Public or private. Create chants within your group.
          </p>
        </div>
        <p className="text-[#64748b] text-xs">Switch tabs at the bottom to browse each.</p>
      </>
    ),
  },
  {
    title: 'Managing Chants',
    body: (
      <>
        <p className="text-[#94a3b8] text-sm leading-relaxed mb-3">
          You can create and manage your own chants:
        </p>
        <ul className="space-y-2 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-[#22d3ee] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">Tap the <span className="text-[#e2e8f0] font-semibold">+</span> button to create a new chant</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#22d3ee] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">Tap the <span className="inline-flex items-center align-middle"><svg className="w-3.5 h-3.5 text-[#e2e8f0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span> gear icon on your chant to manage settings</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#22d3ee] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">Once enough ideas are submitted, you decide when to start voting from the gear menu</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#22d3ee] mt-1">&#x2022;</span>
            <span className="text-[#94a3b8] text-sm">Share your chant link to invite others to participate</span>
          </li>
        </ul>
        <p className="text-[#64748b] text-xs">You can create chants publicly or within a private group.</p>
      </>
    ),
  },
  {
    title: "You're ready",
    body: (
      <p className="text-[#94a3b8] text-sm leading-relaxed">
        Tap any card to open it. Use the + button to create a new chant, podium, or group.
        You&apos;re already signed in, just start participating.
      </p>
    ),
  },
]

const TOTAL = PANELS.length

export default function WelcomeGuide({ open, onClose }: WelcomeGuideProps) {
  const [step, setStep] = useState(0)

  if (!open) return null

  const dismiss = () => {
    localStorage.setItem('welcome-guide-seen', 'true')
    setStep(0)
    onClose()
  }

  const isLast = step === TOTAL - 1

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-lg border p-6"
        style={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <h2 className="text-lg font-bold text-[#e2e8f0] text-center mb-4">
          {PANELS[step].title}
        </h2>

        {/* Body */}
        <div className="mb-6">{PANELS[step].body}</div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ backgroundColor: i === step ? '#0891b2' : '#334155' }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[#94a3b8] border transition-colors hover:text-[#e2e8f0] hover:border-[#334155]"
              style={{ borderColor: '#1e293b' }}
            >
              Back
            </button>
          )}
          <button
            onClick={isLast ? dismiss : () => setStep(s => s + 1)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#0891b2' }}
          >
            {isLast ? "Let's go" : 'Next'}
          </button>
        </div>

        {/* Skip or Learn more link */}
        {isLast ? (
          <Link
            href="/how"
            onClick={dismiss}
            className="block w-full text-center text-xs text-[#0891b2] hover:text-[#22d3ee] transition-colors mt-3 py-1"
          >
            Learn more
          </Link>
        ) : (
          <button
            onClick={dismiss}
            className="w-full text-center text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors mt-3 py-1"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
