import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Unity Chant - the collective decision-making platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <article className="bg-background rounded-lg border border-border p-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-muted mb-8">Last updated: February 2026</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
              <p className="text-subtle mb-4">
                By accessing or using Unity Chant ("the Service"), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Description of Service</h2>
              <p className="text-subtle mb-4">
                Unity Chant is a collective decision-making platform that enables groups to deliberate and reach
                consensus through structured small-group discussions and tiered voting.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">3. User Accounts</h2>
              <p className="text-subtle mb-4">
                To use certain features of the Service, you must create an account. You are responsible for:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>Providing accurate and complete information</li>
                <li>Notifying us immediately of any unauthorized use</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">4. User Conduct</h2>
              <p className="text-subtle mb-4">
                When using the Service, you agree not to:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Submit false, misleading, or spam content</li>
                <li>Harass, abuse, or threaten other users</li>
                <li>Attempt to manipulate deliberation outcomes through deception</li>
                <li>Create multiple accounts to gain voting advantage</li>
                <li>Interfere with the proper functioning of the Service</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">5. Open Source Content</h2>
              <p className="text-subtle mb-4">
                <strong className="text-foreground">All content submitted to public deliberations is open source.</strong>{' '}
                By submitting ideas, votes, or comments to a public deliberation, you agree that this content
                becomes a public contribution to collective decision-making and is freely available for anyone
                to view, reference, build upon, and redistribute.
              </p>
              <p className="text-subtle mb-4">
                This reflects the core philosophy of Unity Chant: democratic decisions should be transparent
                and their inputs should belong to everyone, not locked behind proprietary walls.
              </p>
              <p className="text-subtle mb-4">
                Specifically, content submitted to public deliberations is made available under{' '}
                <a href="https://creativecommons.org/publicdomain/zero/1.0/" className="text-accent hover:text-accent-hover" target="_blank" rel="noopener noreferrer">
                  Creative Commons Zero (CC0)
                </a>{' '}
                — dedicated to the public domain. You waive all copyright and related rights to the extent
                permitted by law.
              </p>
              <p className="text-subtle mb-4">
                <strong className="text-foreground">Private deliberations</strong> are excluded from this clause.
                Content in private deliberations is visible only to invited members and is not made public.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">6. Public Deliberations</h2>
              <p className="text-subtle mb-4">
                Ideas, votes, and comments submitted to public deliberations are visible to all users.
                This transparency is fundamental to democratic decision-making. Consider this before
                submitting sensitive information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">7. Privacy and Anti-Data Policy</h2>
              <p className="text-subtle mb-4">
                We operate an explicit anti-data policy. We do not collect IP addresses, location data,
                device fingerprints, or browsing behavior. See our{' '}
                <Link href="/privacy" className="text-accent hover:text-accent-hover">Privacy Policy</Link>{' '}
                for full details on what we do and do not collect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">8. Termination</h2>
              <p className="text-subtle mb-4">
                We reserve the right to suspend or terminate accounts that violate these terms.
                You may delete your account at any time through your account settings.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">9. Disclaimer of Warranties</h2>
              <p className="text-subtle mb-4">
                The Service is provided "as is" without warranties of any kind. We do not guarantee
                uninterrupted access, freedom from errors, or specific outcomes from deliberations.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">10. Limitation of Liability</h2>
              <p className="text-subtle mb-4">
                Unity Chant shall not be liable for any indirect, incidental, special, or consequential
                damages arising from your use of the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">11. Changes to Terms</h2>
              <p className="text-subtle mb-4">
                We may update these terms from time to time. Continued use of the Service after changes
                constitutes acceptance of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">12. Contact</h2>
              <p className="text-subtle">
                Questions about these terms? Contact us at{' '}
                <a href="mailto:galen.goodwick@icloud.com" className="text-accent hover:text-accent-hover">
                  galen.goodwick@icloud.com
                </a>
              </p>
            </section>
          </div>
        </article>

        <div className="mt-8 text-center">
          <Link href="/privacy" className="text-accent hover:text-accent-hover">
            View Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  )
}
