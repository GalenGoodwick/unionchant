'use client'

import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    grecaptcha: any
    onRecaptchaLoad?: () => void
  }
}

interface ReCaptchaProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  action?: string
  className?: string
}

/**
 * reCAPTCHA v3 — invisible, score-based.
 * Automatically executes on mount and calls onVerify with a token.
 * No visible widget — Google scores the user silently.
 */
export default function ReCaptcha({ onVerify, action = 'submit', className = '' }: ReCaptchaProps) {
  const executedRef = useRef(false)
  const onVerifyRef = useRef(onVerify)
  onVerifyRef.current = onVerify

  const executeRecaptcha = useCallback(() => {
    if (executedRef.current) return
    if (!window.grecaptcha?.execute) return

    executedRef.current = true
    window.grecaptcha.execute(
      process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!,
      { action }
    ).then((token: string) => {
      onVerifyRef.current(token)
    })
  }, [action])

  useEffect(() => {
    if (window.grecaptcha?.execute) {
      executeRecaptcha()
      return
    }

    if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
      window.onRecaptchaLoad = executeRecaptcha
      const script = document.createElement('script')
      script.src = `https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}`
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    } else {
      const interval = setInterval(() => {
        if (window.grecaptcha?.execute) {
          clearInterval(interval)
          executeRecaptcha()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [executeRecaptcha])

  // v3 is invisible — render nothing (or a hidden container)
  return <div className={className} />
}
