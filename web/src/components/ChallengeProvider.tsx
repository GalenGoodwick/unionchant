'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import RunawayButton, { type ChallengeData } from './RunawayButton'

const POLL_INTERVAL = 30_000 // 30s — picks up admin triggers fast

/**
 * Server-authoritative challenge system.
 *
 * - Polls /api/challenge/status every 30s so admin triggers reach ALL users
 * - Covers every page — wraps the entire app in providers.tsx
 * - Server validates behavioral data before marking as passed
 * - No secret key ever reaches the client
 */
export default function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [showChallenge, setShowChallenge] = useState(false)
  const checkingRef = useRef(false)

  const checkStatus = useCallback(async () => {
    if (!session?.user || checkingRef.current || showChallenge) return
    checkingRef.current = true
    try {
      const res = await fetch('/api/challenge/status')
      const data = await res.json()
      if (data.needsChallenge) {
        setShowChallenge(true)
      }
    } catch { /* silent */ }
    checkingRef.current = false
  }, [session, showChallenge])

  // Poll every 30s — catches admin triggers, timer expiry, everything
  useEffect(() => {
    if (!session?.user) return

    // Check immediately on mount (small delay for page render)
    const initialId = setTimeout(() => checkStatus(), 2000)

    // Then poll every 30s
    const intervalId = setInterval(() => checkStatus(), POLL_INTERVAL)

    return () => {
      clearTimeout(initialId)
      clearInterval(intervalId)
    }
  }, [session?.user?.email, checkStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCaught = useCallback(async (data: ChallengeData) => {
    try {
      const res = await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'passed',
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
        }),
      })
      const json = await res.json()
      if (json.verified) {
        setShowChallenge(false)
      }
      // If server rejects, challenge stays up
    } catch { /* silent — challenge stays up */ }
  }, [])

  const handleBotDetected = useCallback(async (data: ChallengeData) => {
    try {
      await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'failed_insta_click',
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
        }),
      })
    } catch { /* silent */ }
  }, [])

  return (
    <>
      {children}
      {showChallenge && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg p-6 max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-lg font-bold text-foreground text-center mb-1">
              Still human?
            </h2>
            <p className="text-muted text-sm text-center mb-4">
              Quick check — catch the button to continue.
            </p>
            <RunawayButton onCaught={handleCaught} onBotDetected={handleBotDetected} />
          </div>
        </div>
      )}
    </>
  )
}
