'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import NotificationBell from '@/components/NotificationBell'
import { useAdmin } from '@/hooks/useAdmin'
import { AmbientConstellation } from '@/components/ConstellationCanvas'
import { useCollectiveChat } from '@/app/providers'
import CollectiveChat from '@/components/CollectiveChat'
import { useChallenge } from '@/components/ChallengeProvider'

interface FrameLayoutProps {
  active?: 'chants' | 'podiums' | 'groups' | 'install' | 'contact' | 'how' | 'agents' | 'foresight' | 'stream'
  header?: React.ReactNode
  children: React.ReactNode
  footerRight?: React.ReactNode
  hideFooter?: boolean
  showBack?: boolean
  onBack?: () => void
  scrollRef?: React.Ref<HTMLDivElement>
  contentClassName?: string
  noPadding?: boolean
  hideHeart?: boolean
}

const menuLinks = [
{ href: '/tools', label: 'Tools' },
  { href: '/resources', label: 'Resources' },
  { href: '/dashboard', label: 'Manage' },
  { href: '/settings', label: 'Settings' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
]

const topBarLinksLeft = [
  { href: '/sdk', label: 'SDK' },
  { href: '/api-docs', label: 'API' },
  { href: '/ai', label: 'AI' },
]

const topBarLinksRight = [
  { href: '/humanity', label: 'Humanity' },
  { href: '/embed', label: 'Embed' },
  { href: '/methodology', label: 'Method' },
]

export default function FrameLayout({
  active,
  header,
  children,
  footerRight,
  hideFooter,
  showBack,
  onBack,
  scrollRef,
  contentClassName = '',
  noPadding,
  hideHeart,
}: FrameLayoutProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()
  const { chatOpen, toggleChat } = useCollectiveChat()
  const { triggerChallenge } = useChallenge()
  const router = useRouter()

  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  const [topBarOpen, setTopBarOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setIsInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      const prompt = installPrompt as Event & { prompt: () => Promise<void> }
      await prompt.prompt()
      setInstallPrompt(null)
    } else {
      setShowIOSHint(v => !v)
    }
  }, [installPrompt])

  useEffect(() => {
    if (localStorage.getItem('topBarOpen') === 'true') setTopBarOpen(true)
  }, [])

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

  const tabs = [
    { key: 'chants', href: '/chants', label: 'Chants', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    )},
    { key: 'podiums', href: '/podiums', label: 'Podiums', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    )},
    { key: 'groups', href: '/groups', label: 'Groups', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )},
    { key: 'contact', href: '/contact', label: 'Contact', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    )},
    { key: 'how', href: '/how-it-works', label: 'How', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    )},
    { key: 'install', href: '#install', label: 'Install', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v6m0 0l-2.25-2.25M12 14.25l2.25-2.25" />
      </svg>
    )},
  ]

  return (
    <div className="fixed top-0 left-0 w-screen h-[100dvh] z-10 flex flex-col bg-background overflow-clip sm:px-4 sm:pb-4 sm:pt-4">
      <div className="flex-1 min-h-0 flex flex-col overflow-clip max-w-full w-full mx-auto relative sm:border-4 sm:border-white/50 sm:rounded-xl">
        <AmbientConstellation hideHeart={hideHeart} />

        {/* -- Collapsible top bar (SDK / API / AI / Beta / Humanity / Embed / Method) — admin only -- */}
        {topBarOpen && !hideFooter && isAdmin && (
          <div className="shrink-0 relative z-10 px-3 pt-2 pb-1 border-b border-border/50">
            <div className="flex justify-center items-center gap-1 flex-wrap">
              {topBarLinksLeft.map(link => (
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
          </div>
        )}

        {/* -- Top bar (in-frame controls) -- */}
        {(showBack || header || session || !hideFooter) && (
          <div className="shrink-0 px-3 pt-2 pb-1 relative z-10">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (onBack) {
                    onBack()
                  } else if (typeof window !== 'undefined' && window.history.length > 2) {
                    router.back()
                  } else {
                    router.push('/chants')
                  }
                }}
                className="w-7 h-7 rounded-full bg-surface/80 hover:bg-surface border border-border text-muted hover:text-foreground flex items-center justify-center transition-colors shrink-0"
                aria-label="Go back"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>

              {/* Toggle top bar — admin only */}
              {isAdmin && (
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
              )}

              <div className="flex-1" />

              {session && (
                <>
                  <NotificationBell />
                  <Link href={`/user/${session.user?.id}`} className="shrink-0">
                    {session.user?.image ? (
                      <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} />
                    ) : null}
                    <span className={`w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center text-[10px] font-medium text-accent ${session.user?.image ? 'hidden' : ''}`}>
                      {(session.user?.name || 'U').charAt(0).toUpperCase()}
                    </span>
                  </Link>
                  {isAdmin && (
                    <>
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
                            <button
                              onClick={() => { setMenuOpen(false); toggleChat() }}
                              className="w-full text-left px-3 py-2 text-xs text-gold hover:text-gold hover:bg-gold/10 transition-colors rounded-t-lg font-medium"
                            >
                              Collective
                            </button>
                            {[
                              ...menuLinks,
                              { href: '/agents', label: 'Agents' },
                              { href: '/foresight', label: 'Foresight' },
                              { href: '/stream', label: 'Stream' },
                              { href: '/admin', label: 'Admin' },
                            ].map(link => (
                              <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMenuOpen(false)}
                                className="block px-3 py-2 text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors last:rounded-b-lg"
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
                </>
              )}
              {!session && (
                <Link
                  href="/auth/signin"
                  className="px-2.5 py-1 text-[11px] font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>

            {/* Optional header content (filters, search, etc.) */}
            {header && <div className="mt-2">{header}</div>}
          </div>
        )}

        {/* -- Content -- */}
        <div
          ref={scrollRef}
          className={`flex-1 min-h-0 overflow-y-auto relative z-10 border-t-2 border-b-2 border-accent/30 ${noPadding ? '' : 'px-4 pb-4'} ${contentClassName}`}
        >
          {children}
        </div>

        {/* -- Bottom bar -- */}
        <div className="shrink-0 relative z-10 border-t border-border/50">
          <div className="flex items-end px-2 py-1.5">
            {!hideFooter && (
              <div className="flex-1 flex items-center gap-1">
                {tabs.filter(tab => !(tab.key === 'install' && isInstalled)).map(tab => {
                  const isActive = tab.key === active

                  if (tab.key === 'install') {
                    return (
                      <div key={tab.key} className="relative">
                        <button
                          onClick={handleInstall}
                          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[48px] text-muted hover:text-foreground cursor-pointer"
                        >
                          {tab.icon}
                          <span className="text-[9px] font-medium">{tab.label}</span>
                        </button>
                        {showIOSHint && !installPrompt && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg p-3 text-xs text-muted w-52 z-50 shadow-lg">
                            {/iPhone|iPad|iPod/.test(navigator.userAgent) ? (
                              <>
                                <span className="text-foreground font-medium block mb-1">Install on iOS</span>
                                Tap share <span className="inline-block align-middle">&#x1F4E4;</span> then &ldquo;Add to Home Screen&rdquo;
                              </>
                            ) : (
                              <>
                                <span className="text-foreground font-medium block mb-1">Install in Safari</span>
                                Click the share button <span className="inline-block align-middle">&#x1F4E4;</span> then &ldquo;Add to Dock&rdquo;
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <Link
                      key={tab.key}
                      href={tab.href}
                      className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[48px] ${
                        isActive
                          ? 'text-accent'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      {tab.icon}
                      <span className={`text-[9px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
            {hideFooter && <div className="flex-1" />}

            {footerRight && (
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {footerRight}
              </div>
            )}
          </div>
        </div>

        {/* -- Collective Chat (inside frame) -- */}
        {chatOpen && (
          <div className="absolute inset-0 z-50 bg-black/50" onClick={toggleChat} />
        )}
        <div className={`absolute inset-0 z-50 shadow-2xl transition-transform duration-200 ${
          chatOpen ? 'translate-y-0 opacity-100' : 'translate-y-full pointer-events-none opacity-0'
        }`}>
          <div className="h-full flex flex-col">
            <CollectiveChat onClose={toggleChat} />
          </div>
        </div>
      </div>
    </div>
  )
}
