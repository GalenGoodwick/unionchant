'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    grecaptcha: any
    onRecaptchaLoad?: () => void
  }
}

interface ReCaptchaProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

export default function ReCaptcha({ onVerify, onExpire, className = '' }: ReCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<number | null>(null)

  useEffect(() => {
    // Load reCAPTCHA script if not already loaded
    if (!document.querySelector('script[src*="recaptcha"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    // Wait for grecaptcha to be ready
    const renderCaptcha = () => {
      if (window.grecaptcha && window.grecaptcha.render && containerRef.current && widgetIdRef.current === null) {
        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!,
          callback: onVerify,
          'expired-callback': onExpire,
        })
      }
    }

    // Check if grecaptcha is already loaded
    if (window.grecaptcha) {
      renderCaptcha()
    } else {
      // Set up callback for when script loads
      window.onRecaptchaLoad = renderCaptcha
    }

    // Cleanup
    return () => {
      if (widgetIdRef.current !== null && window.grecaptcha) {
        try {
          window.grecaptcha.reset(widgetIdRef.current)
        } catch (e) {
          // Widget might already be destroyed
        }
      }
    }
  }, [onVerify, onExpire])

  return <div ref={containerRef} className={className} />
}
