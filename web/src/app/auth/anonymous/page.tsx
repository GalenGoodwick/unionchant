'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function RunawayButton({ onCaught }: { onCaught: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const chaseStartRef = useRef<number | null>(null)
  const [pos, setPos] = useState({ x: 50, y: 50 }) // percentage-based
  const [surrendered, setSurrendered] = useState(false)
  const [chasing, setChasing] = useState(false)
  const [chaseTime, setChaseTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Update chase timer display
  useEffect(() => {
    if (chasing && !surrendered) {
      timerRef.current = setInterval(() => {
        if (chaseStartRef.current) {
          const elapsed = (Date.now() - chaseStartRef.current) / 1000
          setChaseTime(elapsed)
          if (elapsed >= 3) {
            setSurrendered(true)
            if (timerRef.current) clearInterval(timerRef.current)
          }
        }
      }, 50)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [chasing, surrendered])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (surrendered) return
    const container = containerRef.current
    const btn = btnRef.current
    if (!container || !btn) return

    const rect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const btnCenterX = btnRect.left - rect.left + btnRect.width / 2
    const btnCenterY = btnRect.top - rect.top + btnRect.height / 2

    const dist = Math.sqrt((mouseX - btnCenterX) ** 2 + (mouseY - btnCenterY) ** 2)

    // Start chase timer on first approach
    if (dist < 150 && !chaseStartRef.current) {
      chaseStartRef.current = Date.now()
      setChasing(true)
    }

    // Evade when mouse gets close
    if (dist < 100) {
      // Move away from mouse
      const angle = Math.atan2(btnCenterY - mouseY, btnCenterX - mouseX)
      const jumpDist = 20 + Math.random() * 15 // percentage
      let newX = pos.x + Math.cos(angle) * jumpDist
      let newY = pos.y + Math.sin(angle) * jumpDist

      // Keep in bounds (10-90%)
      newX = Math.max(10, Math.min(90, newX))
      newY = Math.max(10, Math.min(90, newY))

      // If cornered, jump to opposite side
      if ((newX <= 12 || newX >= 88) && (newY <= 12 || newY >= 88)) {
        newX = 100 - newX
        newY = 100 - newY
      }

      setPos({ x: newX, y: newY })
    }
  }, [surrendered, pos])

  const handleClick = () => {
    if (surrendered) {
      onCaught()
    }
    // If not surrendered, click does nothing (bot clicked too fast)
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full h-48 bg-surface border border-border rounded-lg overflow-hidden select-none"
    >
      {chasing && !surrendered && (
        <div className="absolute top-2 left-2 text-xs text-muted">
          Chasing: {chaseTime.toFixed(1)}s / 3.0s
        </div>
      )}
      {surrendered && (
        <div className="absolute top-2 left-2 text-xs text-success font-semibold">
          You caught it! Click the button.
        </div>
      )}
      <button
        ref={btnRef}
        onClick={handleClick}
        className={`absolute px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-150 -translate-x-1/2 -translate-y-1/2 ${
          surrendered
            ? 'bg-success text-white hover:bg-success-hover cursor-pointer animate-pulse'
            : 'bg-accent text-white cursor-default'
        }`}
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
        }}
      >
        {surrendered ? 'OK fine, click me!' : 'Catch me!'}
      </button>
      {!chasing && (
        <p className="absolute bottom-3 w-full text-center text-xs text-muted">
          Move your mouse toward the button
        </p>
      )}
    </div>
  )
}

export default function AnonymousSignIn() {
  const router = useRouter()
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create anonymous session')
        setLoading(false)
        return
      }

      const { signIn } = await import('next-auth/react')
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        setError('Failed to sign in')
        setLoading(false)
      } else {
        router.push('/')
      }
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-background rounded-lg p-8 max-w-2xl w-full border border-border">
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Anonymous Entry
        </h1>
        <p className="text-muted text-center mb-6">
          One-time session, zero data collection
        </p>

        {/* Privacy Notice */}
        <div className="bg-success-bg border border-success/30 text-success text-sm p-4 rounded-lg mb-6 space-y-2">
          <p className="font-semibold">🔒 Complete Privacy Guarantee</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong>No account created</strong> — Your session exists only in your browser</li>
            <li><strong>No email, name, or password required</strong></li>
            <li><strong>No IP address stored in our database</strong></li>
            <li><strong>No tracking cookies</strong> — Session expires after 24 hours</li>
            <li><strong>No vote history saved</strong> — Your participation is anonymous, even to us</li>
          </ul>
        </div>

        {error && (
          <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {!verified ? (
          <div className="space-y-3">
            <p className="text-muted text-sm text-center">Prove you&apos;re human — chase the button for 3 seconds:</p>
            <RunawayButton onCaught={() => setVerified(true)} />
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating session...' : 'Enter Anonymously'}
          </button>
        )}

        <div className="mt-8 text-center space-y-3">
          <p className="text-muted text-sm">
            Want to save your participation history?{' '}
            <Link href="/auth/signin" className="text-accent hover:text-accent-hover">
              Sign in
            </Link>
            {' or '}
            <Link href="/auth/signup" className="text-accent hover:text-accent-hover">
              Sign up
            </Link>
          </p>
          <Link href="/" className="text-muted hover:text-foreground text-sm block">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
