'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import RunawayButton from './RunawayButton'

const CHALLENGE_KEY = 'uc_last_challenge'
const MIN_INTERVAL_MS = 2.5 * 60 * 60 * 1000 // 2.5 hours
const MAX_INTERVAL_MS = 3 * 60 * 60 * 1000   // 3 hours

function getNextChallengeTime(): number {
  const interval = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)
  return Date.now() + interval
}

export default function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [showChallenge, setShowChallenge] = useState(false)

  useEffect(() => {
    if (!session?.user) return

    const stored = localStorage.getItem(CHALLENGE_KEY)
    let nextChallenge: number

    if (stored) {
      nextChallenge = parseInt(stored, 10)
      if (isNaN(nextChallenge)) {
        nextChallenge = getNextChallengeTime()
        localStorage.setItem(CHALLENGE_KEY, String(nextChallenge))
      }
    } else {
      // First visit — schedule first challenge
      nextChallenge = getNextChallengeTime()
      localStorage.setItem(CHALLENGE_KEY, String(nextChallenge))
    }

    const msUntil = Math.max(0, nextChallenge - Date.now())

    const timeout = setTimeout(() => {
      setShowChallenge(true)
    }, msUntil)

    return () => clearTimeout(timeout)
  }, [session])

  const handleCaught = useCallback(() => {
    setShowChallenge(false)
    // Schedule next challenge
    const next = getNextChallengeTime()
    localStorage.setItem(CHALLENGE_KEY, String(next))
  }, [])

  const handleBotDetected = useCallback(async () => {
    // Flag this session — insta-click = bot behavior
    try {
      await fetch('/api/bot-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'runaway_insta_click' }),
      })
    } catch { /* silent */ }
    // Still show the challenge — don't reveal detection
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
