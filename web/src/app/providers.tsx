'use client'

import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/components/Toast'
import Onboarding from '@/components/Onboarding'
import { useOnboarding } from '@/hooks/useOnboarding'

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { needsOnboarding, completeOnboarding } = useOnboarding()

  return (
    <>
      {children}
      {needsOnboarding && <Onboarding onComplete={completeOnboarding} />}
    </>
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
