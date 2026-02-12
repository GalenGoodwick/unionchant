'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

const pages = [
  { section: 'Main', links: [
    { href: '/', label: 'Landing' },
    { href: '/feed', label: 'Feed' },

    { href: '/chants', label: 'Chants' },
    { href: '/chants/new', label: 'Chants / New' },
    { href: '/podiums', label: 'Podiums' },
    { href: '/podium/new', label: 'Podium / New' },
    { href: '/groups', label: 'Groups' },
    { href: '/groups/new', label: 'Groups / New' },

  ]},
  { section: 'User', links: [
    { href: '/profile', label: 'Profile' },
    { href: '/profile/manage', label: 'Profile / Manage' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/settings', label: 'Settings' },
    { href: '/notifications', label: 'Notifications' },
    { href: '/billing', label: 'Billing' },
  ]},
  { section: 'Auth', links: [
    { href: '/auth/signin', label: 'Sign In' },
    { href: '/auth/signup', label: 'Sign Up' },
    { href: '/auth/anonymous', label: 'Anonymous' },
    { href: '/auth/reset-password', label: 'Reset Password' },
  ]},
  { section: 'Info', links: [
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/whitepaper', label: 'Whitepaper' },
    { href: '/technical', label: 'Technical' },
    { href: '/resources', label: 'Resources' },
    { href: '/demo', label: 'Demo' },

    { href: '/embed', label: 'Embed' },
    { href: '/pepperphone', label: 'PepperPhone' },
    { href: '/tools', label: 'Tools' },
    { href: '/contact', label: 'Contact' },

    { href: '/pricing', label: 'Pricing' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ]},
  { section: 'Admin', links: [
    { href: '/admin', label: 'Admin' },
    { href: '/admin/test', label: 'Admin / Test' },
  ]},
]

export default function NavPage() {
  return (
    <FrameLayout hideFooter>
      <div className="p-4 space-y-5">
        <h1 className="text-lg font-bold text-foreground">All Pages</h1>
        {pages.map((section) => (
          <div key={section.section}>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">{section.section}</h2>
            <div className="flex flex-col">
              {section.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-accent hover:text-accent-hover text-sm py-1.5 px-2 rounded hover:bg-surface transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FrameLayout>
  )
}
