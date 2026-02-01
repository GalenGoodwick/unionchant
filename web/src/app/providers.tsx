'use client'

import { createContext, useContext } from 'react'
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
        <OnboardingGate>
          {children}
        </OnboardingGate>
      </ToastProvider>
    </SessionProvider>
  )
}
