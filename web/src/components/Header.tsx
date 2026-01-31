'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'
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
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { href: '/feed', label: 'Feed', authRequired: true, highlight: true },
    { href: '/communities', label: 'Communities' },
    { href: '/deliberations', label: 'Deliberations' },
    { href: '/about', label: 'About' },
    { href: '/donate', label: 'Donate' },
  ]

  return (
    <header className="bg-header text-white relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2.5 hover:text-accent-light transition-colors">
          <Image src="/logo.svg" alt="" width={32} height={32} />
          <div className="flex flex-col leading-none">
            <span className="text-xl font-semibold font-serif">Union Chant</span>
            <span className="text-[10px] text-white/50 tracking-wider uppercase">continuous consensus</span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
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
          {session && (
            <Link href="/dashboard" className="hover:text-accent-light transition-colors">
              Manage
            </Link>
          )}
          {session && <NotificationBell />}
          {session?.user ? (
            <Link
              href="/profile"
              className="flex items-center gap-2 hover:text-accent-light transition-colors"
            >
              <ProfileAvatar
                image={session.user.image}
                name={session.user.name}
                size={24}
                className="w-6 h-6"
                textClass="text-xs"
              />
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
          {session && <NotificationBell onOpen={() => setMenuOpen(false)} />}
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
            {session && (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="py-2 px-4 rounded-lg hover:bg-white/10 transition-colors"
              >
                Dashboard
              </Link>
            )}
            <div className="border-t border-white/10 pt-3 mt-2">
              {session?.user ? (
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 py-2 px-4 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ProfileAvatar
                    image={session.user.image}
                    name={session.user.name}
                    size={32}
                    className="w-8 h-8"
                    textClass="text-sm"
                  />
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
