'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useChallenge } from '@/components/ChallengeProvider'

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()

  const { triggerChallenge } = useChallenge()
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const stored = localStorage.getItem('topBarOpen')
    // Default: expanded (new users see the full nav)
    if (stored === 'false') setCollapsed(true)

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'topBarOpen') setCollapsed(e.newValue !== 'true')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('topBarOpen', String(!next))
      return next
    })
  }

  // Hide on auth pages and individual chant detail (has its own frame nav)
  const hidden = pathname?.startsWith('/auth/') ||
    (pathname?.startsWith('/chants/') && pathname !== '/chants')
  if (hidden) return null

  // Collapsed: just show toggle in top-right corner
  if (collapsed) {
    return (
      <div className="fixed top-0 right-0 z-[60]">
        <div className="flex items-center gap-1.5 p-2">
          <button
            onClick={toggleCollapsed}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/40 hover:text-white"
            aria-label="Show nav"
            title="Show nav"
          >
            <svg className="w-3.5 h-3.5 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60]">
      <div className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center">
          {/* Left: back arrow */}
          <div className="w-8 shrink-0">
            <button
              onClick={() => router.back()}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Go back"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
          </div>

          {/* Center nav */}
          <nav className="flex-1 flex justify-center items-center gap-1 sm:gap-2">
            {[
              { href: '/sdk', label: 'SDK' },
              { href: '/api-docs', label: 'API' },
              { href: '/ai', label: 'AI' },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  pathname === link.href || pathname?.startsWith(link.href + '/')
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <span onClick={triggerChallenge} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors cursor-pointer">Beta</span>
            {[
              { href: '/humanity', label: 'Humanity' },
              { href: '/embed', label: 'Embed' },
              { href: '/methodology', label: 'Method' },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  pathname === link.href || pathname?.startsWith(link.href + '/')
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleCollapsed}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/40 hover:text-white"
              aria-label="Hide nav"
              title="Hide nav"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
