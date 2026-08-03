'use client'

import { useState } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'

interface NotificationPromptProps {
  onClose: () => void
}

/**
 * Explanatory pop-up shown once to a newly-registered account before the
 * browser's native notification permission prompt. The native prompt only
 * fires after the user clicks "Enable" — never automatically.
 */
export default function NotificationPrompt({ onClose }: NotificationPromptProps) {
  const { subscribe, isLoading } = usePushNotifications()
  const [error, setError] = useState<string | null>(null)

  const handleEnable = async () => {
    setError(null)
    const result = await subscribe()
    if (!result.success) {
      // If they blocked at the browser prompt, just close — don't trap them.
      if (result.error && !result.error.toLowerCase().includes('denied')) {
        setError(result.error)
        return
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
      <div className="bg-background border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <div className="text-center mb-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-foreground">Turn on notifications?</h3>
          <p className="text-muted text-sm mt-1">
            We&apos;ll let you know when it&apos;s your turn to vote or a result is in — nothing
            else. Your browser will ask you to confirm.
          </p>
        </div>

        {error && (
          <div className="bg-error-bg border border-error text-error text-xs p-2 rounded-lg mb-3 text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 mb-2"
        >
          {isLoading ? 'Enabling…' : 'Enable notifications'}
        </button>

        <button
          onClick={onClose}
          className="w-full text-muted text-sm hover:text-foreground py-2 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
