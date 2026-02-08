'use client'

import { useState, useEffect } from 'react'
import Turnstile from './Turnstile'

type Props = {
  open: boolean
  strike: number
  onVerify: (token: string) => void
  onClose: () => void
  mutedUntil?: number | null
}

function MathPuzzle({ onSolved }: { onSolved: () => void }) {
  const [a] = useState(() => Math.floor(Math.random() * 15) + 3)
  const [b] = useState(() => Math.floor(Math.random() * 15) + 3)
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)

  const check = (val: string) => {
    setAnswer(val)
    setWrong(false)
    if (val.trim() && parseInt(val.trim()) === a + b) {
      onSolved()
    }
  }

  const handleSubmitCheck = () => {
    if (parseInt(answer.trim()) !== a + b) {
      setWrong(true)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 mb-4">
      <p className="text-sm font-medium text-foreground mb-2">Solve this to continue:</p>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-mono font-bold text-foreground">{a} + {b} =</span>
        <input
          type="number"
          value={answer}
          onChange={e => check(e.target.value)}
          onBlur={handleSubmitCheck}
          className="w-20 bg-background border border-border rounded-lg px-3 py-2 text-lg font-mono text-foreground text-center focus:outline-none focus:border-accent"
          autoFocus
          placeholder="?"
        />
      </div>
      {wrong && (
        <p className="text-error text-xs mt-2">Incorrect, try again.</p>
      )}
    </div>
  )
}

export default function CaptchaModal({ open, strike, onVerify, onClose, mutedUntil }: Props) {
  const [countdown, setCountdown] = useState(0)
  const [token, setToken] = useState<string | null>(null)
  const [puzzleSolved, setPuzzleSolved] = useState(false)

  // Strike 3: 30 second cooldown before they can submit
  useEffect(() => {
    if (!open) {
      setToken(null)
      setCountdown(0)
      setPuzzleSolved(false)
      return
    }
    if (strike >= 3 && !mutedUntil) {
      setCountdown(30)
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [open, strike, mutedUntil])

  // Muted countdown
  const [muteRemaining, setMuteRemaining] = useState(0)
  useEffect(() => {
    if (!mutedUntil) {
      setMuteRemaining(0)
      return
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((mutedUntil - Date.now()) / 1000))
      setMuteRemaining(remaining)
      if (remaining <= 0) onClose()
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [mutedUntil, onClose])

  if (!open) return null

  const isMuted = mutedUntil && muteRemaining > 0
  const needsPuzzle = strike >= 2 && !mutedUntil
  const canSubmit = token && countdown <= 0 && (!needsPuzzle || puzzleSolved)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {isMuted ? (
          <>
            <h3 className="text-lg font-bold text-error mb-2">Temporarily muted</h3>
            <p className="text-muted text-sm mb-4">
              You&apos;ve been sending too many messages. Try again in{' '}
              <span className="font-mono font-bold text-foreground">
                {Math.floor(muteRemaining / 60)}:{String(muteRemaining % 60).padStart(2, '0')}
              </span>
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg border border-border text-muted hover:text-foreground text-sm transition-colors"
            >
              OK
            </button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-foreground mb-1">
              {strike <= 1 ? 'Confirm you\u2019re not a bot' : 'Please verify you\u2019re human'}
            </h3>
            <p className="text-muted text-sm mb-4">
              {strike <= 1
                ? 'You\u2019re sending messages quickly. Complete this check to continue.'
                : strike === 2
                  ? 'Slow down a bit. Solve the puzzle and verify to keep chatting.'
                  : 'Last warning before a temporary timeout. Solve the puzzle and verify.'}
            </p>

            {needsPuzzle && (
              <MathPuzzle onSolved={() => setPuzzleSolved(true)} />
            )}

            {puzzleSolved && needsPuzzle && (
              <p className="text-success text-xs mb-2 font-medium">Puzzle solved</p>
            )}

            <div className="flex justify-center mb-4">
              <ReCaptcha
                onVerify={setToken}
                onExpire={() => setToken(null)}
                appearance="always"
              />
            </div>

            {countdown > 0 && (
              <p className="text-center text-muted text-xs mb-3 font-mono">
                Wait {countdown}s before continuing
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-border text-muted hover:text-foreground text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => token && onVerify(token)}
                disabled={!canSubmit}
                className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
