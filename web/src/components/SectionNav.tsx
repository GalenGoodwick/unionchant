'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import NotificationBell from '@/components/NotificationBell'
import { useAdmin } from '@/hooks/useAdmin'
import { useChallenge } from '@/components/ChallengeProvider'

const sections = [
  { href: '/chants', label: 'Chants' },
  { href: '/podiums', label: 'Podiums' },
  { href: '/groups', label: 'Groups' },
]

const topBarLinks = [
  { href: '/sdk', label: 'SDK' },
  { href: '/api-docs', label: 'API' },
  { href: '/ai', label: 'AI' },
]

const topBarLinksRight = [
  { href: '/humanity', label: 'Humanity' },
  { href: '/embed', label: 'Embed' },
  { href: '/methodology', label: 'Method' },
]

export default function SectionNav({ active }: { active: 'chants' | 'podiums' | 'groups' }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()
  const { triggerChallenge } = useChallenge()
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  const [topBarOpen, setTopBarOpen] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('topBarOpen') === 'true'
    return false
  })

  const toggleTopBar = () => {
    setTopBarOpen(prev => {
      const next = !prev
      localStorage.setItem('topBarOpen', String(next))
      return next
    })
  }

  useEffect(() => {
    if (menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
  }, [menuOpen])

  return (
    <div className="border-b-2 border-accent/30 pb-3 mb-3">
      {/* Top bar: SDK / API / AI / Beta / Humanity / Embed / Method */}
      {topBarOpen && (
        <div className="flex justify-center items-center gap-1 mb-2 pb-2 border-b border-border/50 flex-wrap">
          {topBarLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'bg-white/15 text-foreground font-semibold'
                  : 'text-muted hover:text-foreground hover:bg-surface/80'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <span onClick={triggerChallenge} className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors cursor-pointer">Beta</span>
          {topBarLinksRight.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'bg-white/15 text-foreground font-semibold'
                  : 'text-muted hover:text-foreground hover:bg-surface/80'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}

      {/* Section nav: Chants / Podiums / Groups */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {sections.map(s => {
            const isActive = s.href === `/${active}`
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {s.label}
              </Link>
            )
          })}
        </div>

        <div className="ml-auto shrink-0 flex items-center gap-2">
          {/* Toggle top bar */}
          <button
            onClick={toggleTopBar}
            className="w-6 h-6 rounded-full bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent flex items-center justify-center transition-colors shrink-0"
            aria-label={topBarOpen ? 'Hide top bar' : 'Show top bar'}
            title={topBarOpen ? 'Hide top bar' : 'Show top bar'}
          >
            <svg className={`w-3 h-3 transition-transform duration-200 ${topBarOpen ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {session && (
            <>
              <NotificationBell />
              <Link href={`/user/${session.user?.id}`} className="shrink-0">
                {session.user?.image ? (
                  <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center text-[10px] font-medium text-accent">
                    {(session.user?.name || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>
              <button
                ref={btnRef}
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-6 h-6 flex items-center justify-center text-muted hover:text-foreground transition-colors shrink-0"
                aria-label="Menu"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {menuOpen && createPortal(
                <div className="fixed inset-0 z-[9999]" onClick={() => setMenuOpen(false)}>
                  <div
                    className="fixed w-36 bg-surface border border-border rounded-lg shadow-lg"
                    style={{ top: menuPos.top, right: menuPos.right }}
                    onClick={e => e.stopPropagation()}
                  >
                    {[
                      { href: '/chants', label: 'Chants' },
                      { href: '/tools', label: 'Tools' },
                      { href: '/resources', label: 'Resources' },
                      { href: '/dashboard', label: 'Manage' },
                      { href: '/settings', label: 'Settings' },
                      { href: '/pricing', label: 'Sustain Us' },
                      { href: '/contact', label: 'Contact' },
                      ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
                    ].map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors first:rounded-t-lg last:rounded-b-lg"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
