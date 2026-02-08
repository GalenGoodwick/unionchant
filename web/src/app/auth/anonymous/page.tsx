'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReCaptcha from '@/components/ReCaptcha'

export default function AnonymousSignIn() {
  const router = useRouter()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
    setError('CAPTCHA expired. Please verify again.')
  }, [])

  const handleSubmit = async () => {
    if (!captchaToken) {
      setError('Please complete the CAPTCHA verification')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captchaToken }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create anonymous session')
        setLoading(false)
        return
      }

      // Sign in with temporary anonymous credentials
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
            <li><strong>No IP address stored in our database</strong> — We never read or log IP addresses in our application code</li>
            <li><strong>No tracking cookies</strong> — Session expires when you close your browser or after 24 hours</li>
            <li><strong>No vote history saved</strong> — Your participation is anonymous, even to us</li>
          </ul>
          <div className="text-xs mt-3 pt-3 border-t border-success/20">
            <p className="font-semibold mb-2">How your data flows:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Client → sends request</li>
              <li>Cloudflare/Vercel Edge → sees IP (for DDoS, rate limiting) — we cannot block this</li>
              <li>Next.js handler → our code runs — we reject IP data here</li>
              <li>Database → never sees IP — we guarantee this</li>
            </ol>
            <p className="mt-2"><strong>What we do:</strong> Delete IP headers in code, never read req.ip or geo data, never write IP to database.</p>
            <p className="mt-1"><strong>Infrastructure note:</strong> Cloudflare and Vercel may see IPs for DDoS protection, but this data is not shared with Unity Chant.</p>
            <p className="mt-3 text-warning flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <span><strong>Only you can verify this.</strong> We publish our source code at <a href="https://github.com/GalenGoodwick/unionchant" target="_blank" rel="noopener noreferrer" className="underline hover:text-warning-hover">github.com/GalenGoodwick/unionchant</a>, but infrastructure providers (hosting, CDN) operate outside our control. True privacy requires trust or self-hosting.</span>
            </p>
          </div>
        </div>

        {/* Why CAPTCHA */}
        <div className="bg-warning-bg border border-warning/30 text-warning text-sm p-3 rounded-lg mb-6">
          <strong>CAPTCHA Required.</strong> This prevents bot spam while preserving your anonymity. No other verification required.
        </div>

        {error && (
          <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Single CAPTCHA */}
          <div className="flex justify-center">
            <ReCaptcha
              onVerify={handleCaptchaVerify}
              onExpire={handleCaptchaExpire}
              className="flex justify-center"
            />
          </div>

          {/* Submit button */}
          {captchaToken && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Enter Anonymously'}
            </button>
          )}
        </div>

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
