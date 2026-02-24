'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import NotificationBell from '@/components/NotificationBell'
import { useAdmin } from '@/hooks/useAdmin'
import { AmbientConstellation } from '@/components/ConstellationCanvas'
import { useCollectiveChat } from '@/app/providers'
import CollectiveChat from '@/components/CollectiveChat'

interface FrameLayoutProps {
  active?: string // legacy — no longer rendered
  header?: React.ReactNode
  children: React.ReactNode
  footerRight?: React.ReactNode
  hideFooter?: boolean
  showBack?: boolean
  scrollRef?: React.Ref<HTMLDivElement>
  contentClassName?: string
  noPadding?: boolean
}

export default function FrameLayout({
  header,
  children,
  footerRight,
  hideFooter,
  showBack,
  scrollRef,
  contentClassName = '',
  noPadding,
}: FrameLayoutProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()
  const { chatOpen, toggleChat } = useCollectiveChat()
  const router = useRouter()

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background overflow-clip sm:px-4 sm:pb-4 sm:pt-4">
      <div className="flex-1 min-h-0 flex flex-col overflow-clip sm:max-w-[480px] w-full mx-auto relative sm:border-4 sm:border-white/50 sm:rounded-xl">
        <AmbientConstellation />

        {/* -- Top bar -- */}
        {(showBack || header || session || !hideFooter) && (
          <div className="shrink-0 px-3 pt-2 pb-1 relative z-10">
            <div className="flex items-center gap-2">
              {showBack && (
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.history.length > 1) {
                      router.back()
                    } else {
                      router.push('/')
                    }
                  }}
                  className="w-7 h-7 rounded-full bg-surface/80 hover:bg-surface border border-border text-muted hover:text-foreground flex items-center justify-center transition-colors shrink-0"
                  aria-label="Go back"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              )}

              <div className="flex-1" />

              {/* Archive button */}
              <Link
                href="/archive"
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
                  pathname === '/archive'
                    ? 'bg-white/15 text-foreground font-semibold'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                Archive
              </Link>

              {session && (
                <>
                  <NotificationBell />
                  <button
                    onClick={toggleChat}
                    className="w-6 h-6 flex items-center justify-center text-gold hover:text-gold/80 transition-colors shrink-0"
                    aria-label="Collective Chat"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                  <Link href={`/user/${session.user?.id}`} className="shrink-0">
                    {session.user?.image ? (
                      <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-accent/30 flex items-center justify-center text-[10px] font-medium text-accent">
                        {(session.user?.name || 'U').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </Link>
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

        {/* -- Bottom bar (minimal) -- */}
        {footerRight && (
          <div className="shrink-0 relative z-10 border-t border-border/50">
            <div className="flex items-end px-2 py-1.5">
              <div className="flex-1" />
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {footerRight}
              </div>
            </div>
          </div>
        )}

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
