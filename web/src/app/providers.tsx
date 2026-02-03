'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/components/Toast'
import Onboarding from '@/components/Onboarding'
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
      {chatOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-xl">
          <CollectiveChat onClose={toggleChat} />
        </div>
      )}
    </CollectiveChatContext.Provider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
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
