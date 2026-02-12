'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

const resources = [
  {
    href: '/whitepaper',
    title: 'Whitepaper',
    description: 'Collective decision-making for the modern age. The vision behind Unity Chant.',
    icon: '📄',
  },
  {
    href: '/technical',
    title: 'Technical Whitepaper',
    description: 'How tiered small-group voting cells produce reliable consensus at scale.',
    icon: '🔬',
  },
  {
    href: '/how-it-works',
    title: 'How It Works',
    description: 'Step-by-step guide to submitting ideas, discussing, and voting.',
    icon: '📖',
  },
  {
    href: '/demo',
    title: 'Interactive Demo',
    description: 'Try the voting process yourself with a live simulation.',
    icon: '🎮',
  },
]

export default function ResourcesPage() {
  return (
    <FrameLayout
      active="chants"
      showBack
      header={<h2 className="text-sm font-semibold text-foreground pb-3">Resources</h2>}
      footerRight={
        <Link
          href="/chants"
          className="h-10 px-4 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Chants</span>
        </Link>
      }
    >
      <div className="space-y-2.5">
        {resources.map(r => (
          <Link
            key={r.href}
            href={r.href}
            className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground leading-tight">{r.title}</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">{r.description}</p>
              </div>
              <svg className="w-4 h-4 text-muted shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </FrameLayout>
  )
}
