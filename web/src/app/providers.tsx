'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ToastProvider } from '@/components/Toast'
import Onboarding from '@/components/Onboarding'
import UserGuide from '@/components/UserGuide'
import CollectiveChat from '@/components/CollectiveChat'

import ChallengeProvider from '@/components/ChallengeProvider'
import PasskeyPrompt from '@/components/PasskeyPrompt'
import { useOnboarding } from '@/hooks/useOnboarding'
import Header from '@/components/Header'
import dynamic from 'next/dynamic'

const WalletProvider = dynamic(() => import('@/components/crypto/WalletProvider'), { ssr: false })

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

// ── Passkey Prompt ────────────────────────────────────────────

type PasskeyPromptContextType = {
  triggerPasskeyPrompt: (action: string, onCancel?: () => void) => void
}

const PasskeyPromptContext = createContext<PasskeyPromptContextType>({
  triggerPasskeyPrompt: () => {},
})

export function usePasskeyPrompt() {
  return useContext(PasskeyPromptContext)
}

function PasskeyPromptGate({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [promptAction, setPromptAction] = useState<string | null>(null)
  const [cancelCallback, setCancelCallback] = useState<(() => void) | null>(null)

  const triggerPasskeyPrompt = useCallback((action: string, onCancel?: () => void) => {
    // Only show for anonymous users who haven't dismissed or registered
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('passkeyPromptDismissed')) return
    if (sessionStorage.getItem('passkeyRegistered')) return
    setPromptAction(action)
    setCancelCallback(() => onCancel || null)
  }, [])

  // Only relevant for anonymous users
  const isAnonymous = session?.user?.email?.includes('@temporary.unitychant.com')

  const handleDone = useCallback(() => {
    setPromptAction(null)
    setCancelCallback(null)
  }, [])

  const handleCancel = useCallback(() => {
    const cb = cancelCallback
    setPromptAction(null)
    setCancelCallback(null)
    cb?.()
  }, [cancelCallback])

  return (
    <PasskeyPromptContext.Provider value={{ triggerPasskeyPrompt }}>
      {children}
      {isAnonymous && promptAction && (
        <PasskeyPrompt action={promptAction} onDone={handleDone} onCancel={handleCancel} />
      )}
    </PasskeyPromptContext.Provider>
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
  const { triggerPasskeyPrompt } = usePasskeyPrompt()
  const toggleChat = useCallback(() => {
    setChatOpen(prev => !prev)
  }, [])
  // Trigger passkey prompt after state update (not during render)
  useEffect(() => {
    if (chatOpen) {
      triggerPasskeyPrompt('opened the collective chat', () => setChatOpen(false))
    }
  }, [chatOpen, triggerPasskeyPrompt])
  const pathname = usePathname()
  const hideChat = pathname === '/demo'

  return (
    <CollectiveChatContext.Provider value={{ chatOpen, toggleChat }}>
      {children}
      {!hideChat && <>
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
      </>}
    </CollectiveChatContext.Provider>
  )
}

const CRYPTO_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CRYPTO === 'true'

function MaybeWalletProvider({ children }: { children: React.ReactNode }) {
  if (!CRYPTO_ENABLED) return <>{children}</>
  return <WalletProvider>{children}</WalletProvider>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeGate>
        <ToastProvider>
          <GuideGate>
            <OnboardingGate>
              <PasskeyPromptGate>
                <CollectiveChatGate>
                  <ChallengeProvider>
                    <MaybeWalletProvider>
                      <Header />
                      {children}
                    </MaybeWalletProvider>
                  </ChallengeProvider>
                </CollectiveChatGate>
              </PasskeyPromptGate>
            </OnboardingGate>
          </GuideGate>
        </ToastProvider>
      </ThemeGate>
    </SessionProvider>
  )
}
