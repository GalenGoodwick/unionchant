'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

function CallbackHandler() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const community = searchParams.get('community') || ''
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id || done) return

    async function generateToken() {
      try {
        const res = await fetch('/api/embed/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communitySlug: community }),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'Failed to create token')
          return
        }

        const { token, userId, userName } = await res.json()

        // Send token back to the iframe via postMessage
        if (window.opener) {
          window.opener.postMessage({
            type: 'uc-embed-auth',
            token,
            userId,
            userName,
          }, '*') // The iframe will validate the origin
          setDone(true)
          // Close popup after a short delay
          setTimeout(() => window.close(), 500)
        } else {
          setError('No opener window found. Please try again.')
        }
      } catch {
        setError('Something went wrong')
      }
    }

    generateToken()
  }, [status, session, community, done])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted text-sm">Authenticating...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-surface border border-error rounded-lg p-6 text-center max-w-sm">
          <p className="text-error text-sm mb-3">{error}</p>
          <button
            onClick={() => window.close()}
            className="text-muted text-xs hover:text-foreground"
          >
            Close window
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-success text-sm">Signed in! This window will close...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted text-sm">Setting up your session...</p>
    </div>
  )
}

export default function EmbedCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted">Loading...</div>}>
      <CallbackHandler />
    </Suspense>
  )
}
