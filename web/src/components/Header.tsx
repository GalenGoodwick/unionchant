'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'
import NotificationBell from '@/components/NotificationBell'

interface HeaderProps {
  showSettings?: boolean
}

export default function Header({ showSettings = true }: HeaderProps) {
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { href: '/feed', label: 'Feed', authRequired: true, highlight: true },
    { href: '/demo', label: 'Demo', highlight: true },
    { href: '/deliberations', label: 'Deliberations' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/whitepaper', label: 'Whitepaper' },
    { href: '/donate', label: 'Donate' },
  ]

  return (
    <header className="bg-header text-white relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
          Union Chant
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
          {session && (
            <Link
              href="/deliberations/new"
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              + Create
            </Link>
          )}
          {navLinks.map(link => (
            (!link.authRequired || session) && (
              <Link
                key={link.href}
                href={link.href}
                className={link.highlight ? 'text-accent-light hover:text-white transition-colors font-medium' : 'hover:text-accent-light transition-colors'}
              >
                {link.label}
              </Link>
            )
          ))}
          {isAdmin && (
            <Link href="/admin" className="text-orange-300 hover:text-orange-200 transition-colors">
              Admin
            </Link>
          )}
          {showSettings && session && (
            <Link href="/settings" className="hover:text-accent-light transition-colors">
              Settings
            </Link>
          )}
          {session && <NotificationBell />}
          {session?.user ? (
            <Link
              href="/profile"
              className="flex items-center gap-2 hover:text-accent-light transition-colors"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center text-xs font-medium">
                  {(session.user.name || 'U').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden sm:inline">{session.user.name || 'Profile'}</span>
            </Link>
          ) : (
            <Link href="/auth/signin" className="hover:text-accent-light transition-colors">
              Sign In
            </Link>
          )}
        </nav>

        {/* Mobile: notification + burger */}
        <div className="flex items-center gap-3 md:hidden">
          {session && <NotificationBell />}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-header border-t border-white/10 z-50">
          <nav className="flex flex-col p-4 space-y-3 text-sm">
            {session && (
              <Link
                href="/deliberations/new"
                onClick={() => setMenuOpen(false)}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors text-center"
              >
                + Create Deliberation
              </Link>
            )}
            {navLinks.map(link => (
              (!link.authRequired || session) && (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 px-4 rounded-lg transition-colors ${link.highlight ? 'text-accent-light hover:bg-white/10' : 'hover:bg-white/10'}`}
                >
                  {link.label}
                </Link>
              )
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="py-2 px-4 rounded-lg text-orange-300 hover:bg-white/10 transition-colors"
              >
                Admin
              </Link>
            )}
            {showSettings && session && (
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="py-2 px-4 rounded-lg hover:bg-white/10 transition-colors"
              >
                Settings
              </Link>
            )}
            <div className="border-t border-white/10 pt-3 mt-2">
              {session?.user ? (
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 py-2 px-4 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {session.user.image ? (
                    <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center text-sm font-medium">
                      {(session.user.name || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>{session.user.name || 'Profile'}</span>
                </Link>
              ) : (
                <Link
                  href="/auth/signin"
                  onClick={() => setMenuOpen(false)}
                  className="block py-2 px-4 rounded-lg bg-accent hover:bg-accent-hover text-center font-medium transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
