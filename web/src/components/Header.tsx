'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'
import { useOnboardingContext, useGuideContext, useCollectiveChat } from '@/app/providers'
import NotificationBell from '@/components/NotificationBell'

function ProfileAvatar({ image, name, size, className, textClass }: {
  image?: string | null
  name?: string | null
  size: number
  className: string
  textClass: string
}) {
  const [imgError, setImgError] = useState(false)
  const initial = (name || 'U').charAt(0).toUpperCase()

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className={`${className} rounded-full`}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span className={`${className} rounded-full bg-accent/30 flex items-center justify-center ${textClass} font-medium`}>
      {initial}
    </span>
  )
}

export default function Header() {
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()
  const { needsOnboarding, openOnboarding } = useOnboardingContext()
  const { openGuide } = useGuideContext()
  const { chatOpen, toggleChat } = useCollectiveChat()
  const pathname = usePathname()
  const isTalkPage = pathname?.startsWith('/talks/')
  const [menuOpen, setMenuOpen] = useState(false)
  const [userXP, setUserXP] = useState<number | null>(null)

  useEffect(() => {
    if (!session?.user?.email) return
    fetch('/api/user/me').then(r => r.json()).then(d => {
      if (d.user?.totalXP != null) setUserXP(d.user.totalXP)
    }).catch(() => {})
  }, [session?.user?.email])

  const navLinks = [
    { href: '/feed', label: 'Feed' },
    { href: '/groups', label: 'Groups' },
    { href: '/talks', label: 'Talks' },
    { href: '/podiums', label: 'Podiums' },
    { href: '/contact', label: 'Contact' },
    { href: '/pricing', label: 'Pricing' },
  ]

  return (
    <header className="bg-header text-white relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        <Link href="/?home" className="flex items-center gap-2.5 hover:text-accent transition-colors">
          <Image src="/logo.svg" alt="" width={32} height={32} />
          <div className="flex flex-col leading-none">
            <span className="text-xl font-semibold font-serif">Unity Chant</span>
            <span className="text-[10px] text-white/50 tracking-wider uppercase">consensus at scale</span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-2 text-sm">
          {session && (
            <Link
              href="/talks/new"
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1 rounded-lg font-medium transition-colors"
            >
              + Create
            </Link>
          )}
          {navLinks
            .filter(link => link.href !== '/pricing' || session)
            .map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-accent transition-colors"
              >
                {link.label}
              </Link>
            ))}
          {isAdmin && (
            <Link href="/admin" className="text-orange hover:text-orange-hover transition-colors">
              Admin
            </Link>
          )}
          {session && (
            <Link href="/dashboard" className="text-orange hover:text-orange-hover transition-colors">
              Manage
            </Link>
          )}
          {session && (
            <button
              onClick={openGuide}
              className="w-8 h-8 rounded-full border border-white/30 text-white/60 hover:text-white hover:border-white/60 transition-colors text-xs font-medium flex items-center justify-center"
              aria-label="How it works"
              title="How it works"
            >
              ?
            </button>
          )}
          <button
            onClick={toggleChat}
            className={`relative group flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors ${
              chatOpen
                ? 'bg-gold/20 text-gold'
                : 'hover:bg-header-hover text-white/70 hover:text-gold'
            }`}
            aria-label="Collective Consciousness"
            title="Collective Consciousness"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
              <circle cx="12" cy="12" r="11" strokeDasharray="1.5 3" />
            </svg>
            <span className="text-xs font-medium hidden lg:inline">Collective</span>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gold rounded-full animate-pulse" />
          </button>
          {session && <NotificationBell />}
          {session?.user ? (
            needsOnboarding ? (
              <button
                onClick={openOnboarding}
                className="text-accent hover:text-white transition-colors text-sm font-medium"
              >
                Set up profile
              </button>
            ) : (
              <Link
                href="/profile"
                className="flex items-center gap-2 hover:text-accent transition-colors"
              >
                <ProfileAvatar
                  image={session.user.image}
                  name={session.user.name}
                  size={24}
                  className="w-6 h-6"
                  textClass="text-xs"
                />
                <span className="hidden sm:inline">{session.user.name || 'Profile'}</span>
                {userXP != null && userXP > 0 && (
                  <span className="text-xs font-mono text-warning bg-warning/10 px-1.5 py-0.5 rounded">{userXP} XP</span>
                )}
              </Link>
            )
          ) : (
            <Link href="/auth/signin" className="hover:text-accent transition-colors">
              Sign In
            </Link>
          )}
        </nav>

        {/* Mobile: notification + burger */}
        <div className="flex items-center gap-3 md:hidden">
          {session && <NotificationBell onOpen={() => setMenuOpen(false)} />}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 hover:bg-header-hover rounded-lg transition-colors"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
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
        <div className="md:hidden absolute top-full left-0 right-0 bg-header border-t border-header-hover z-50">
          <nav className="flex flex-col p-4 space-y-3 text-sm">
            {navLinks
              .filter(link => link.href !== '/pricing' || session)
              .map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="py-2 px-4 rounded-lg hover:bg-header-hover transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            {session && (
              <Link
                href="/talks/new"
                onClick={() => setMenuOpen(false)}
                className="py-2 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors text-center"
              >
                + Create
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="py-2 px-4 rounded-lg text-orange hover:bg-header-hover transition-colors"
              >
                Admin
              </Link>
            )}
            {session && (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="py-2 px-4 rounded-lg text-orange hover:bg-header-hover transition-colors"
              >
                Manage
              </Link>
            )}
            <button
              onClick={() => { setMenuOpen(false); toggleChat() }}
              className={`py-2 px-4 rounded-lg transition-colors text-left flex items-center gap-2 ${
                chatOpen ? 'text-gold bg-gold/10' : 'hover:bg-header-hover'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
                <circle cx="12" cy="12" r="11" strokeDasharray="1.5 3" />
              </svg>
              Collective
            </button>
            {session && (
              <button
                onClick={() => { setMenuOpen(false); openGuide() }}
                className="py-2 px-4 rounded-lg hover:bg-header-hover transition-colors text-left flex items-center gap-2"
              >
                <span className="w-5 h-5 rounded-full border border-white/30 text-white/60 text-xs font-medium flex items-center justify-center">?</span>
                How it works
              </button>
            )}
            <div className="border-t border-header-hover pt-3 mt-2">
              {session?.user ? (
                needsOnboarding ? (
                  <button
                    onClick={() => { setMenuOpen(false); openOnboarding() }}
                    className="w-full py-2 px-4 rounded-lg text-accent-light hover:bg-header-hover transition-colors text-left font-medium"
                  >
                    Set up profile
                  </button>
                ) : (
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 py-2 px-4 rounded-lg hover:bg-header-hover transition-colors"
                  >
                    <ProfileAvatar
                      image={session.user.image}
                      name={session.user.name}
                      size={32}
                      className="w-8 h-8"
                      textClass="text-sm"
                    />
                    <span>{session.user.name || 'Profile'}</span>
                    {userXP != null && userXP > 0 && (
                      <span className="text-xs font-mono text-warning bg-warning/10 px-1.5 py-0.5 rounded ml-auto">{userXP} XP</span>
                    )}
                  </Link>
                )
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
      {/* Floating Collective button — hidden on talk detail pages */}
      {!chatOpen && !isTalkPage && (
        <button
          onClick={toggleChat}
          className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-gold text-header shadow-lg flex items-center justify-center"
          aria-label="Open Collective"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
            <circle cx="12" cy="12" r="11" strokeDasharray="1.5 3" />
          </svg>
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-gold rounded-full animate-pulse border border-header" />
        </button>
      )}
    </header>
  )
}
