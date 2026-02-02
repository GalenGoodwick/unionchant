'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/components/Toast'
import Onboarding from '@/components/Onboarding'
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <GuideGate>
          <OnboardingGate>
            {children}
          </OnboardingGate>
        </GuideGate>
      </ToastProvider>
    </SessionProvider>
  )
}
