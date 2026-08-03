'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ToastProvider } from '@/components/Toast'
import UserGuide from '@/components/UserGuide'
import CollectiveChat from '@/components/CollectiveChat'

import ChallengeProvider from '@/components/ChallengeProvider'
import PasskeyPrompt from '@/components/PasskeyPrompt'
import NotificationPrompt from '@/components/NotificationPrompt'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import Header from '@/components/Header'

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
  // Onboarding disabled — users go straight to Eye dashboard
  return (
    <OnboardingContext.Provider value={{ needsOnboarding: false, openOnboarding: () => {} }}>
      {children}
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

// ── Notification Prompt ───────────────────────────────────────
// Asks for push-notification permission ONCE, only after a real account
// exists — never for anonymous/first-time browsers, and never automatically
// (the browser prompt fires only if the user clicks "Enable" in the modal).

const NOTIF_PROMPT_SEEN_KEY = 'notifPromptSeen'

function NotificationPromptGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const { isSupported, isSubscribed, isLoading, permission } = usePushNotifications()
  const [show, setShow] = useState(false)

  // Real, registered accounts only — skip anonymous/temporary browsing users.
  const email = session?.user?.email || ''
  const isRealAccount = !!email && !email.includes('@temporary.unitychant.com')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (status !== 'authenticated' || !isRealAccount) return
    if (isLoading || !isSupported) return
    if (isSubscribed) return
    if (permission !== 'default') return // already granted or blocked — don't nag
    if (localStorage.getItem(NOTIF_PROMPT_SEEN_KEY) === 'true') return

    // Brief delay so it lands after the post-signup redirect settles.
    const t = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(t)
  }, [status, isRealAccount, isSupported, isSubscribed, isLoading, permission])

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(NOTIF_PROMPT_SEEN_KEY, 'true')
    }
    setShow(false)
  }, [])

  return (
    <>
      {children}
      {show && <NotificationPrompt onClose={handleClose} />}
    </>
  )
}

// ── Collective Chat ───────────────────────────────────────────

type CollectiveChatContextType = {
  chatOpen: boolean
  toggleChat: () => void
  chatTab: 'chat' | 'bridge' | 'bond' | 'family' | 'cradle' | 'stream'
  setChatTab: (tab: 'chat' | 'bridge' | 'bond' | 'family' | 'cradle' | 'stream') => void
}

const CollectiveChatContext = createContext<CollectiveChatContextType>({
  chatOpen: false,
  toggleChat: () => {},
  chatTab: 'chat',
  setChatTab: () => {},
})

export function useCollectiveChat() {
  return useContext(CollectiveChatContext)
}

function CollectiveChatGate({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatTab, setChatTab] = useState<'chat' | 'bridge' | 'bond' | 'family' | 'cradle' | 'stream'>('bond')
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
    <CollectiveChatContext.Provider value={{ chatOpen, toggleChat, chatTab, setChatTab }}>
      {children}
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
              <PasskeyPromptGate>
                <NotificationPromptGate>
                  <CollectiveChatGate>
                    <ChallengeProvider>
                      {children}
                    </ChallengeProvider>
                  </CollectiveChatGate>
                </NotificationPromptGate>
              </PasskeyPromptGate>
            </OnboardingGate>
          </GuideGate>
        </ToastProvider>
      </ThemeGate>
    </SessionProvider>
  )
}
