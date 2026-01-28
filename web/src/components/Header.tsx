'use client'

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

  return (
    <header className="bg-header text-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
          Union Chant
        </Link>
        <nav className="flex gap-4 text-sm">
          {session && (
            <Link href="/feed" className="text-accent-light hover:text-white transition-colors font-medium">
              Feed
            </Link>
          )}
          <Link href="/how-it-works" className="hover:text-accent-light transition-colors">
            How It Works
          </Link>
          <Link href="/deliberations" className="hover:text-accent-light transition-colors">
            Deliberations
          </Link>
          <Link href="/donate" className="hover:text-accent-light transition-colors">
            Donate
          </Link>
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
      </div>
    </header>
  )
}
