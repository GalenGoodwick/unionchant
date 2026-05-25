'use client'

import Link from 'next/link'

export default function SimpleWelcome() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-header border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-end gap-4">
          <Link href="/chants" className="text-sm text-muted hover:text-foreground transition-colors font-medium">
            Browse Chants
          </Link>
          <Link href="/auth/signin" className="text-sm text-muted hover:text-foreground transition-colors font-medium">
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 font-serif">
            Welcome to Unity Chant
          </h1>
          <p className="text-xl text-muted">
            Here&apos;s how to participate:
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-8 mb-16">
          {/* Step 1 */}
          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-accent font-mono">1</span>
            </div>
            <div className="flex-1 pt-2">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Click a chant
              </h2>
              <p className="text-muted">
                Pick any question that interests you from the list.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-warning/10 border-2 border-warning flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-warning font-mono">2</span>
            </div>
            <div className="flex-1 pt-2">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Join
              </h2>
              <p className="text-muted">
                Tap the join button to enter the deliberation.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-success/10 border-2 border-success flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-success font-mono">3</span>
            </div>
            <div className="flex-1 pt-2">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Submit your idea
              </h2>
              <p className="text-muted">
                Go to the Submit tab and write your answer in your own words.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-purple/10 border-2 border-purple flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-purple font-mono">4</span>
            </div>
            <div className="flex-1 pt-2">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Discuss &amp; Vote
              </h2>
              <p className="text-muted">
                When your group forms, read the ideas and attach comments to them. Like a comment to boost its visibility. Then vote for the strongest idea. You will get additional ideas to vote on as the chant progresses through rounds.
              </p>
            </div>
          </div>

          {/* Step 5 - Create */}
          <div className="flex gap-6 items-start border-t border-border pt-8 mt-8">
            <div className="w-12 h-12 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-accent">+</span>
            </div>
            <div className="flex-1 pt-2">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Or tap the + to create a chant
              </h2>
              <p className="text-muted">
                Have your own question? Start a new chant and invite others to participate.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/chants"
            className="px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-semibold transition-colors text-center"
          >
            Browse Chants
          </Link>
          <Link
            href="/auth/signup"
            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-foreground border border-border rounded-lg font-semibold transition-colors text-center"
          >
            Sign Up
          </Link>
        </div>
      </main>
    </div>
  )
}
