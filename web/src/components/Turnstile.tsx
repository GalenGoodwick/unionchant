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
  appearance?: 'always' | 'execute' | 'interaction-only'
}

type Props = {
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
  className?: string
  appearance?: 'always' | 'execute' | 'interaction-only'
}

export default function Turnstile({ onVerify, onExpire, onError, className, appearance }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onVerify, onExpire, onError })
  callbacksRef.current = { onVerify, onExpire, onError }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const cleanup = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current)
      } catch {}
      widgetIdRef.current = null
    }
  }, [])

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) return
    // Clean up any existing widget first
    cleanup()

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => callbacksRef.current.onVerify(token),
      'expired-callback': () => callbacksRef.current.onExpire?.(),
      'error-callback': () => callbacksRef.current.onError?.(),
      theme: 'auto',
      size: 'compact',
      appearance: appearance || 'always',
    })
  }, [siteKey, appearance, cleanup])

  useEffect(() => {
    if (!siteKey) {
      console.warn('Turnstile: No NEXT_PUBLIC_TURNSTILE_SITE_KEY configured')
      if (process.env.NODE_ENV === 'development') {
        onVerify('dev-bypass-token')
      }
      return
    }

    if (window.turnstile) {
      renderWidget()
      return cleanup
    }

    // Load the Turnstile script
    const existingScript = document.querySelector('script[src*="turnstile"]')
    if (existingScript) {
      window.onTurnstileLoad = renderWidget
      return cleanup
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    window.onTurnstileLoad = renderWidget
    document.head.appendChild(script)

    return cleanup
  }, [siteKey, renderWidget, cleanup, onVerify])

  if (!siteKey && process.env.NODE_ENV === 'development') {
    return null
  }

  return <div ref={containerRef} className={className} />
}
