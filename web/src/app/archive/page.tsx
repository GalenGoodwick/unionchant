'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import { useAdmin } from '@/hooks/useAdmin'

const sections = [
  {
    title: 'Core',
    links: [
      { href: '/chants', label: 'Chants' },
      { href: '/podiums', label: 'Podiums' },
      { href: '/groups', label: 'Groups' },
      { href: '/agents', label: 'Agents' },
      { href: '/foresight', label: 'Foresight' },
      { href: '/feed', label: 'Feed' },
      { href: '/stream', label: 'Stream' },
    ],
  },
  {
    title: 'Docs',
    links: [
      { href: '/methodology', label: 'Methodology' },
      { href: '/whitepaper', label: 'Whitepaper' },
      { href: '/technical', label: 'Technical' },
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/sdk', label: 'SDK' },
      { href: '/api-docs', label: 'API Docs' },
      { href: '/ai', label: 'AI' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { href: '/embed', label: 'Embed' },
      { href: '/humanity', label: 'Humanity' },
      { href: '/humans', label: 'Humans' },
      { href: '/demo', label: 'Demo' },
      { href: '/pepperphone', label: 'PepperPhone' },
      { href: '/tools', label: 'Tools' },
      { href: '/resources', label: 'Resources' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/settings', label: 'Settings' },
      { href: '/profile', label: 'Profile' },
      { href: '/notifications', label: 'Notifications' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/billing', label: 'Billing' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/contact', label: 'Contact' },
    ],
  },
]

export default function ArchivePage() {
  const { isAdmin } = useAdmin()

  return (
    <FrameLayout showBack>
      <div className="pt-4 pb-8">
        <h1 className="text-lg font-semibold text-foreground mb-1">Archive</h1>
        <p className="text-xs text-muted mb-6">All pages on Unity Chant.</p>

        <div className="space-y-5">
          {sections.map(section => (
            <div key={section.title}>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">
                {section.title}
              </h2>
              <div className="grid grid-cols-2 gap-1">
                {section.links.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-surface/80 rounded-md transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">
                Admin
              </h2>
              <div className="grid grid-cols-2 gap-1">
                <Link
                  href="/admin"
                  className="px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-surface/80 rounded-md transition-colors"
                >
                  Admin Panel
                </Link>
                <Link
                  href="/admin/test"
                  className="px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-surface/80 rounded-md transition-colors"
                >
                  Test Suite
                </Link>
                <Link
                  href="/nav"
                  className="px-3 py-2 text-xs text-foreground/80 hover:text-foreground hover:bg-surface/80 rounded-md transition-colors"
                >
                  Navigation
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </FrameLayout>
  )
}
