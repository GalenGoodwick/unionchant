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
  className?: string
}

export default function ReCaptcha({ onVerify, onExpire, className = '' }: ReCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<number | null>(null)
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire

  const renderWidget = useCallback(() => {
    if (window.grecaptcha?.enterprise?.render && containerRef.current && widgetIdRef.current === null) {
      widgetIdRef.current = window.grecaptcha.enterprise.render(containerRef.current, {
        sitekey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!,
        callback: (token: string) => onVerifyRef.current(token),
        'expired-callback': () => onExpireRef.current?.(),
      })
    }
  }, [])

  useEffect(() => {
    if (window.grecaptcha?.enterprise?.render) {
      renderWidget()
      return
    }

    if (!document.querySelector('script[src*="recaptcha/enterprise.js"]')) {
      window.onRecaptchaLoad = renderWidget
      const script = document.createElement('script')
      script.src = 'https://www.google.com/recaptcha/enterprise.js?onload=onRecaptchaLoad&render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    } else {
      const interval = setInterval(() => {
        if (window.grecaptcha?.enterprise?.render) {
          clearInterval(interval)
          renderWidget()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [renderWidget])

  return <div ref={containerRef} className={className} />
}
