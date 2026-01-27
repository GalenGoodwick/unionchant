'use client'

import Link from 'next/link'
import Header from '@/components/Header'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Pricing</h1>
          <p className="text-xl text-muted">
            Democratic tools should be accessible to everyone
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Free for Grassroots */}
          <div className="bg-background rounded-xl p-8 border-2 border-accent relative">
            <div className="absolute -top-3 left-6 bg-accent text-white px-3 py-1 rounded-full text-sm font-medium">
              Most Popular
            </div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Free for Grassroots</h2>
              <div className="text-4xl font-bold text-accent mb-2">$0</div>
              <p className="text-muted">Forever free for movements, unions, and communities</p>
            </div>

            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Unlimited public deliberations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Unlimited participants</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Full voting and idea submission</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Rolling mode for ongoing decisions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Push notifications</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Data export</span>
              </li>
            </ul>

            <a
              href="mailto:galen.goodwick@icloud.com?subject=Grassroots%20Inquiry"
              className="block w-full bg-accent hover:bg-accent-hover text-white text-center py-3 rounded-lg font-medium transition-colors"
            >
              Contact Us
            </a>
          </div>

          {/* Enterprise */}
          <div className="bg-background rounded-xl p-8 border border-border">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-2">Enterprise</h2>
              <div className="text-4xl font-bold text-foreground mb-2">Custom</div>
              <p className="text-muted">For organizations and businesses</p>
            </div>

            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Everything in Free</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Private deliberations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">AI-powered facilitation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Advanced analytics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Custom branding</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Priority support</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-1">✓</span>
                <span className="text-foreground">Self-hosted option</span>
              </li>
            </ul>

            <a
              href="mailto:galen.goodwick@icloud.com?subject=Enterprise%20Inquiry"
              className="block w-full bg-header hover:bg-header/90 text-white text-center py-3 rounded-lg font-medium transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>

        {/* FAQ / Mission */}
        <div className="bg-background rounded-xl p-8 border border-border">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Our Mission</h2>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-muted mb-4">
              Union Chant is built to help movements, unions, and communities make collective decisions at scale.
              We believe democratic tools should be free and accessible to everyone fighting for a better world.
            </p>
            <p className="text-muted mb-6">
              Enterprise pricing helps us sustain the platform while keeping it free for grassroots organizing.
              If your organization has the budget, your support enables us to serve those who don&apos;t.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href="/how-it-works"
                className="text-accent hover:text-accent-hover"
              >
                How it works →
              </Link>
              <Link
                href="/whitepaper"
                className="text-accent hover:text-accent-hover"
              >
                Read the whitepaper →
              </Link>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="text-center mt-12 text-muted">
          <p>
            Want to support our mission?{' '}
            <Link href="/donate" className="text-accent hover:text-accent-hover">
              Make a donation
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
