'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useAdmin } from '@/hooks/useAdmin'

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
          <Link href="/deliberations" className="hover:text-accent-light transition-colors">
            Deliberations
          </Link>
          <Link href="/pricing" className="hover:text-accent-light transition-colors">
            Pricing
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
          <Link href="/auth/signin" className="hover:text-accent-light transition-colors">
            {session ? 'Account' : 'Sign In'}
          </Link>
        </nav>
      </div>
    </header>
  )
}
