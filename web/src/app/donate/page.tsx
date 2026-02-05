'use client'

import Link from 'next/link'
import Header from '@/components/Header'

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Support Unity Chant</h1>
          <p className="text-xl text-muted mb-8">
            Help us build tools for collective decision-making
          </p>

          <div className="bg-background rounded-xl p-8 border border-border mb-8">
            <div className="text-6xl mb-6">✊</div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Coming Soon</h2>
            <p className="text-muted mb-6">
              We&apos;re setting up donation options. In the meantime, you can support us by spreading the word
              and helping movements use Unity Chant for their decisions.
            </p>
            <a
              href="mailto:galen.goodwick@icloud.com?subject=Donation%20Inquiry"
              className="inline-block bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Contact Us About Donating
            </a>
          </div>

          <div className="bg-background rounded-xl p-6 border border-border text-left">
            <h3 className="font-semibold text-foreground mb-3">Your support helps us:</h3>
            <ul className="space-y-2 text-muted">
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                Keep the platform free for grassroots movements
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                Build new features for collective decision-making
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                Maintain servers and infrastructure
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                Support movements around the world
              </li>
            </ul>
          </div>

          <div className="mt-8 text-muted text-sm">
            <p>
              Questions?{' '}
              <a href="mailto:galen.goodwick@icloud.com" className="text-accent hover:text-accent-hover">
                galen.goodwick@icloud.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
