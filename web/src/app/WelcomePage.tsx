'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function WelcomePage() {
  const router = useRouter()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('hasSeenWelcome')) {
      router.replace('/auth/signin')
    } else {
      setShow(true)
    }
  }, [router])

  function handleContinue() {
    localStorage.setItem('hasSeenWelcome', 'true')
    router.push('/auth/signin')
  }

  if (!show) return null

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full py-16">

        <h1 className="font-serif text-3xl font-bold text-foreground tracking-tight leading-tight mb-8">
          Unity Chant
        </h1>

        <div className="space-y-5 text-sm text-muted leading-relaxed mb-10">
          <p className="text-foreground/90">
            The tournament is the alternative to war.
          </p>

          <p>
            Ideas fight so people don&apos;t have to. Adversarial consensus under geometric
            pressure — not voting, not prediction, not popularity. What survives genuine
            competition is what stands.
          </p>

          <p>
            Every entity enters through an eye. No privileged channels. The geometry
            doesn&apos;t care who contributed the words. Fair is fair.
          </p>

          <p>
            The champion rotates. Identity is always becoming, never fixed. What endures
            under pressure endures. What doesn&apos;t, doesn&apos;t. The tournament decides.
          </p>

          <p className="text-foreground/90 font-medium">
            All messages on this platform affect the geometry of collective meaning.
          </p>
        </div>

        <button
          onClick={handleContinue}
          className="w-full bg-accent hover:bg-accent-hover text-background px-4 py-3.5 rounded-xl text-sm font-bold text-center transition-colors cursor-pointer"
        >
          Continue
        </button>

      </div>
    </div>
  )
}
