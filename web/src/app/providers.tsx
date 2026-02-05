'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { ToastProvider } from '@/components/Toast'
import Onboarding from '@/components/Onboarding'
import UserGuide from '@/components/UserGuide'
import CollectiveChat from '@/components/CollectiveChat'
import { useOnboarding } from '@/hooks/useOnboarding'

type OnboardingContextType = {
  needsOnboarding: boolean
  openOnboarding: () => void
}

const OnboardingContext = createContext<OnboardingContextType>({
  needsOnboarding: false,
  openOnboarding: () => {},
})

export function useOnboardingContext() {
  return useContext(OnboardingContext)
}

// ── Theme ─────────────────────────────────────────────────────

type ThemeContextType = {
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function ThemeGate({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light') {
      setTheme('light')
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      if (next === 'light') {
        document.documentElement.classList.add('light')
      } else {
        document.documentElement.classList.remove('light')
      }
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ── Guide ──────────────────────────────────────────────────────

type GuideContextType = {
  showGuide: boolean
  openGuide: () => void
  closeGuide: (dontShowAgain?: boolean) => void
}

const GuideContext = createContext<GuideContextType>({
  showGuide: false,
  openGuide: () => {},
  closeGuide: () => {},
})

export function useGuideContext() {
  return useContext(GuideContext)
}

function GuideGate({ children }: { children: React.ReactNode }) {
  const [showGuide, setShowGuide] = useState(false)

  const openGuide = useCallback(() => setShowGuide(true), [])
  const closeGuide = useCallback((dontShowAgain: boolean = true) => {
    setShowGuide(false)
    if (dontShowAgain) {
      localStorage.setItem('hasSeenGuide', 'true')
    }
  }, [])

  return (
    <GuideContext.Provider value={{ showGuide, openGuide, closeGuide }}>
      {children}
      {showGuide && <UserGuide onClose={closeGuide} />}
    </GuideContext.Provider>
  )
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { needsOnboarding, completeOnboarding, openOnboarding } = useOnboarding()

  return (
    <OnboardingContext.Provider value={{ needsOnboarding, openOnboarding }}>
      {children}
      {needsOnboarding && <Onboarding onComplete={completeOnboarding} />}
    </OnboardingContext.Provider>
  )
}

// ── Collective Chat ───────────────────────────────────────────

type CollectiveChatContextType = {
  chatOpen: boolean
  toggleChat: () => void
}

const CollectiveChatContext = createContext<CollectiveChatContextType>({
  chatOpen: false,
  toggleChat: () => {},
})

export function useCollectiveChat() {
  return useContext(CollectiveChatContext)
}

function CollectiveChatGate({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false)
  const toggleChat = useCallback(() => setChatOpen(prev => !prev), [])

  return (
    <CollectiveChatContext.Provider value={{ chatOpen, toggleChat }}>
      {children}
      {/* Backdrop on mobile */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={toggleChat}
        />
      )}
      {/* Chat panel — always mounted (preloads messages), hidden when closed */}
      <div className={`fixed z-50 shadow-2xl md:bottom-4 md:right-4 md:w-[380px] md:rounded-xl bottom-0 left-0 right-0 top-14 md:top-auto md:left-auto rounded-t-xl transition-transform duration-200 ${
        chatOpen ? 'translate-y-0 opacity-100' : 'translate-y-full pointer-events-none opacity-0'
      }`}>
        <div className="h-full md:h-[480px] flex flex-col">
          <CollectiveChat onClose={toggleChat} />
        </div>
      </div>
    </CollectiveChatContext.Provider>
  )
}

// ── Signup Stamp ─────────────────────────────────────────────
// Fire-and-forget: stamps geo metadata on first login (once per user)
function SignupStamp() {
  const { data: session } = useSession()
  const stamped = useRef(false)

  useEffect(() => {
    if (session?.user && !stamped.current) {
      stamped.current = true
      fetch('/api/user/stamp', { method: 'POST' }).catch(() => {})
    }
  }, [session])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SignupStamp />
      <ThemeGate>
        <ToastProvider>
          <GuideGate>
            <OnboardingGate>
              <CollectiveChatGate>
                {children}
              </CollectiveChatGate>
            </OnboardingGate>
          </GuideGate>
        </ToastProvider>
      </ThemeGate>
    </SessionProvider>
  )
}
