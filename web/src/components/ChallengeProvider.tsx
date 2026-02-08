'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import RunawayButton, { type ChallengeData } from './RunawayButton'

/**
 * Server-authoritative challenge system.
 *
 * - Polls /api/challenge/status on mount + navigation to check if challenge is needed
 * - Server is the only authority — client can't bypass by navigating away
 * - On pass, sends behavioral data to /api/challenge/complete for server validation
 * - Server validates pointer events, chase duration, evasion count before marking as passed
 * - No secret key ever reaches the client
 */
export default function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [showChallenge, setShowChallenge] = useState(false)
  const [checking, setChecking] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCheckRef = useRef<number>(0)

  const checkStatus = useCallback(async () => {
    if (!session?.user || checking) return
    // Don't spam — at most once per 10 seconds
    if (Date.now() - lastCheckRef.current < 10_000) return
    lastCheckRef.current = Date.now()

    setChecking(true)
    try {
      const res = await fetch('/api/challenge/status')
      const data = await res.json()

      if (data.needsChallenge) {
        setShowChallenge(true)
      } else if (data.msUntilNext > 0) {
        // Schedule next check
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          lastCheckRef.current = 0 // allow immediate check
          checkStatus()
        }, data.msUntilNext)
      }
    } catch { /* silent */ }
    setChecking(false)
  }, [session, checking])

  // Check on mount
  useEffect(() => {
    if (session?.user) {
      // Small delay on first load so the page renders first
      const id = setTimeout(() => checkStatus(), 3000)
      return () => clearTimeout(id)
    }
  }, [session?.user?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check on navigation — prevents bypass by navigating away
  useEffect(() => {
    if (session?.user && !showChallenge) {
      checkStatus()
    }
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

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
        // Schedule next check
        lastCheckRef.current = 0
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => checkStatus(), 2.5 * 60 * 60 * 1000)
      }
      // If server rejects, challenge stays up — can't fake it
    } catch { /* silent — challenge stays up */ }
  }, [checkStatus])

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
    // Challenge stays up — don't reveal detection
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
