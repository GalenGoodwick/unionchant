'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function WelcomeModal() {
  const router = useRouter()
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Check if user has seen the welcome modal before
    const seen = localStorage.getItem('welcome_modal_seen')
    if (!seen) {
      setShow(true)
    }
  }, [])

  const handleUseIt = () => {
    localStorage.setItem('welcome_modal_seen', 'true')
    localStorage.setItem('show_chants_tutorial', 'true')
    setShow(false)
    router.push('/chants')
  }

  const handleReadAbout = () => {
    localStorage.setItem('welcome_modal_seen', 'true')
    setShow(false)
    router.push('/how')
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-lg shadow-2xl p-8 max-w-md mx-4 animate-in fade-in zoom-in duration-300">
        <h2 className="text-2xl font-bold text-foreground mb-3">
          Welcome to Unity Chant
        </h2>
        <p className="text-muted mb-6">
          Turn group chaos into clarity. Make decisions your team actually trusts. Every voice heard, every idea tested—what survives isn't what's popular, it's what works.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleUseIt}
            className="w-full px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-semibold transition-colors"
          >
            Use it
          </button>
          <button
            onClick={handleReadAbout}
            className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-semibold transition-colors"
          >
            Read about it
          </button>
        </div>
      </div>
    </div>
  )
}
