'use client'

import { useState, useEffect } from 'react'

interface CountdownTimerProps {
  deadline: string | Date
  label?: string
  onExpire?: () => void
  className?: string
  showSeconds?: boolean
  compact?: boolean
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
}

function calculateTimeRemaining(deadline: Date): TimeRemaining {
  const now = new Date()
  const total = deadline.getTime() - now.getTime()

  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 }
  }

  const days = Math.floor(total / (1000 * 60 * 60 * 24))
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((total % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds, total }
}

export default function CountdownTimer({
  deadline,
  label,
  onExpire,
  className = '',
  showSeconds = true,
  compact = false,
}: CountdownTimerProps) {
  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() =>
    calculateTimeRemaining(deadlineDate)
  )
  const [hasExpired, setHasExpired] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateTimeRemaining(deadlineDate)
      setTimeRemaining(remaining)

      if (remaining.total <= 0 && !hasExpired) {
        setHasExpired(true)
        clearInterval(timer)
        onExpire?.()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [deadlineDate, hasExpired, onExpire])

  if (hasExpired || timeRemaining.total <= 0) {
    return (
      <span className={`text-error ${className}`}>
        {label && <span className="text-muted mr-2">{label}</span>}
        <span>Expired</span>
      </span>
    )
  }

  const { days, hours, minutes, seconds } = timeRemaining

  // Determine urgency color
  const urgencyClass =
    timeRemaining.total < 60000 // Less than 1 minute
      ? 'text-error'
      : timeRemaining.total < 300000 // Less than 5 minutes
        ? 'text-orange'
        : timeRemaining.total < 3600000 // Less than 1 hour
          ? 'text-warning'
          : 'text-success'

  if (compact) {
    // Compact format: "2d 5h" or "23m 45s"
    let display = ''
    if (days > 0) {
      display = `${days}d ${hours}h`
    } else if (hours > 0) {
      display = `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      display = showSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`
    } else {
      display = `${seconds}s`
    }

    return (
      <span className={`${urgencyClass} ${className}`}>
        {label && <span className="text-muted mr-1">{label}</span>}
        <span className="font-mono">{display}</span>
      </span>
    )
  }

  // Full format
  return (
    <div className={`${className}`}>
      {label && <div className="text-muted text-sm mb-1">{label}</div>}
      <div className={`font-mono ${urgencyClass} flex gap-2`}>
        {days > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold">{days}</div>
            <div className="text-xs text-subtle">days</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-2xl font-bold">{String(hours).padStart(2, '0')}</div>
          <div className="text-xs text-subtle">hrs</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{String(minutes).padStart(2, '0')}</div>
          <div className="text-xs text-subtle">min</div>
        </div>
        {showSeconds && (
          <div className="text-center">
            <div className="text-2xl font-bold">{String(seconds).padStart(2, '0')}</div>
            <div className="text-xs text-subtle">sec</div>
          </div>
        )}
      </div>
    </div>
  )
}
