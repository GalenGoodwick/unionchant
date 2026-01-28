'use client'

import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

type TurnstileOptions = {
  sitekey: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
}

type Props = {
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
  className?: string
}

export default function Turnstile({ onVerify, onExpire, onError, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) return
    if (widgetIdRef.current) return // Already rendered

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      'expired-callback': onExpire,
      'error-callback': onError,
      theme: 'auto',
      size: 'compact',
    })
  }, [siteKey, onVerify, onExpire, onError])

  useEffect(() => {
    // Skip if no site key (development without config)
    if (!siteKey) {
      console.warn('Turnstile: No NEXT_PUBLIC_TURNSTILE_SITE_KEY configured')
      // Auto-verify in development
      if (process.env.NODE_ENV === 'development') {
        onVerify('dev-bypass-token')
      }
      return
    }

    // Check if script already loaded
    if (window.turnstile) {
      renderWidget()
      return
    }

    // Load the Turnstile script
    const existingScript = document.querySelector('script[src*="turnstile"]')
    if (existingScript) {
      // Script exists, wait for it to load
      window.onTurnstileLoad = renderWidget
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    window.onTurnstileLoad = renderWidget
    document.head.appendChild(script)

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey, renderWidget, onVerify])

  // Don't render anything if no site key in development
  if (!siteKey && process.env.NODE_ENV === 'development') {
    return null
  }

  return <div ref={containerRef} className={className} />
}
