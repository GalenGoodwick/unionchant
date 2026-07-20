'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import RunawayButton, { type ChallengeData } from './RunawayButton'

const ChallengeContext = createContext<{ triggerChallenge: () => void }>({ triggerChallenge: () => {} })
export function useChallenge() { return useContext(ChallengeContext) }

/**
 * Server-authoritative challenge system.
 *
 * Checks /api/challenge/status:
 * - On mount (2s delay)
 * - On every page navigation
 * - Every 30s via interval
 *
 * When server says needsChallenge, modal pops over everything.
 * Can't be bypassed by navigating — re-checks on every route.
 * Challenge token ties each attempt to a server-issued nonce.
 */
export default function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const [showChallenge, setShowChallenge] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const showRef = useRef(false)

  // Keep ref in sync so triggerChallenge closure reads fresh value
  useEffect(() => { showRef.current = showChallenge }, [showChallenge])

  // Auto-polling removed — challenge only triggers via triggerChallenge() (auth pages, admin, Beta badge)

  const handleCaught = useCallback(async (data: ChallengeData) => {
    try {
      const res = await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'passed',
          challengeToken,
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
          surrendered: data.surrendered,
          chasePath: data.chasePath,
        }),
      })
      const json = await res.json()
      if (json.verified) {
        setShowChallenge(false)
        showRef.current = false
        setChallengeToken(null)
      } else {
        // Server rejected — fetch fresh token and reset the RunawayButton
        try {
          const statusRes = await fetch(`/api/challenge/status?t=${Date.now()}`, { cache: 'no-store' })
          const statusData = await statusRes.json()
          if (statusData.needsChallenge) {
            setChallengeToken(statusData.challengeToken || null)
          }
        } catch { /* use existing token */ }
        setRetryKey(k => k + 1)
      }
    } catch {
      // Network error — reset button so user can retry
      setRetryKey(k => k + 1)
    }
  }, [challengeToken])

  const handleBotDetected = useCallback(async (data: ChallengeData) => {
    try {
      await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'failed_insta_click',
          challengeToken,
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
          surrendered: data.surrendered,
          chasePath: data.chasePath,
        }),
      })
    } catch { /* silent */ }
  }, [challengeToken])

  const triggerChallenge = useCallback(async () => {
    if (showRef.current) return
    try {
      const res = await fetch(`/api/challenge/status?t=${Date.now()}&force=1`, { cache: 'no-store' })
      const data = await res.json()
      if (data.challengeToken) {
        setChallengeToken(data.challengeToken)
        setShowChallenge(true)
        showRef.current = true
      }
      // No token = admin or already passed — skip silently
    } catch { /* silent */ }
  }, [])

  return (
    <ChallengeContext.Provider value={{ triggerChallenge }}>
      {children}
      {showChallenge && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg p-6 max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-lg font-bold text-foreground text-center mb-1">
              Still human?
            </h2>
            <p className="text-muted text-sm text-center mb-4">
              Quick check, catch the button to continue.
            </p>
            <div className="sr-only" role="note">
              Audio cues: A rising vroom sound with a drum roll means the chase has started.
              A ding means the button has stopped moving, tap anywhere in the box to catch it.
              A falling vroom sound means you passed the challenge.
            </div>
            <RunawayButton key={retryKey} onCaught={handleCaught} onBotDetected={handleBotDetected} />
          </div>
        </div>
      )}
    </ChallengeContext.Provider>
  )
}
