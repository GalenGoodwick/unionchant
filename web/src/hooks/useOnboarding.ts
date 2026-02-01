'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export function useOnboarding() {
  const { data: session, status } = useSession()
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkOnboarding() {
      if (status === 'loading') return

      if (status === 'unauthenticated' || !session?.user?.email) {
        setNeedsOnboarding(false)
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/user/me')
        if (response.ok) {
          const data = await response.json()
          // User needs onboarding if:
          // 1. onboardedAt is null/undefined AND
          // 2. name is null/undefined or matches email prefix (auto-generated)
          setNeedsOnboarding(data.user.onboardedAt == null)
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error)
        // Don't show onboarding on error
        setNeedsOnboarding(false)
      } finally {
        setLoading(false)
      }
    }

    checkOnboarding()
  }, [session, status])

  const completeOnboarding = () => {
    setNeedsOnboarding(false)
  }

  const openOnboarding = () => {
    setNeedsOnboarding(true)
  }

  return { needsOnboarding, loading, completeOnboarding, openOnboarding }
}
