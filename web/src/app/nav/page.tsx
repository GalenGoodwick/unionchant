'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

const pages = [
  { section: 'Main', links: [
    { href: '/chants', label: 'Chants (Home)' },
    { href: '/podiums', label: 'Podiums' },
    { href: '/groups', label: 'Groups' },
    { href: '/groups/new', label: 'New Group' },
    { href: '/humans', label: 'Humans' },
    { href: '/archive', label: 'Archive' },
    { href: '/stream', label: 'Stream' },
  ]},
  { section: 'User', links: [
    { href: '/profile', label: 'Profile' },
    { href: '/profile/manage', label: 'Manage Profile' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/settings', label: 'Settings' },
    { href: '/notifications', label: 'Notifications' },
    { href: '/billing', label: 'Billing' },
  ]},
  { section: 'Auth', links: [
    { href: '/auth/signin', label: 'Sign In' },
    { href: '/auth/signup', label: 'Sign Up' },
    { href: '/auth/anonymous', label: 'Anonymous Entry' },
    { href: '/auth/reset-password', label: 'Reset Password' },
  ]},
  { section: 'Agents & AI', links: [
    { href: '/agents', label: 'Agents' },
    { href: '/agents/new', label: 'New Agent' },
    { href: '/ai', label: 'AI' },
    { href: '/foresight', label: 'Foresight' },
  ]},
  { section: 'Info & Docs', links: [
    { href: '/how', label: 'How' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/methodology', label: 'Methodology' },
    { href: '/whitepaper', label: 'Whitepaper' },
    { href: '/technical', label: 'Technical' },
    { href: '/resources', label: 'Resources' },
    { href: '/sdk', label: 'SDK' },
    { href: '/api-docs', label: 'API Docs' },
    { href: '/humanity', label: 'Humanity' },
  ]},
  { section: 'Tools & Demo', links: [
    { href: '/demo', label: 'Demo' },
    { href: '/tools', label: 'Tools' },
    { href: '/mindmap', label: 'Mindmap' },
    { href: '/spreadsheet', label: 'Spreadsheet' },
    { href: '/embed', label: 'Embed' },
  ]},
  { section: 'Business', links: [
    { href: '/pricing', label: 'Pricing' },
    { href: '/contact', label: 'Contact' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ]},
  { section: 'Admin', links: [
    { href: '/admin', label: 'Admin Panel' },
    { href: '/admin/test', label: 'Admin Test' },
    { href: '/admin/chant-structure', label: 'Chant Structure' },
  ]},
]

export default function NavPage() {
  const totalLinks = pages.reduce((sum, s) => sum + s.links.length, 0)
  return (
    <FrameLayout hideFooter>
      <div className="p-4 space-y-5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold text-foreground">All Pages</h1>
          <span className="text-xs font-mono text-muted">{totalLinks} routes</span>
        </div>
        {pages.map((section) => (
          <div key={section.section}>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              {section.section}
              <span className="ml-1.5 text-muted-light/40">{section.links.length}</span>
            </h2>
            <div className="flex flex-col">
              {section.links.map((link) => (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className="flex items-baseline justify-between text-sm py-1.5 px-2 rounded hover:bg-surface transition-colors group"
                >
                  <span className="text-accent group-hover:text-accent-hover">{link.label}</span>
                  <span className="text-[10px] font-mono text-muted-light/30 group-hover:text-muted-light/60">{link.href}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FrameLayout>
  )
}
