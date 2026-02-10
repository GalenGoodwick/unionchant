import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Unity Chant. We do not track you. No IP addresses, no location data, no analytics fingerprinting.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <article className="bg-background rounded-lg border border-border p-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-muted mb-8">Last updated: February 2026</p>

          <div className="prose prose-slate max-w-none">

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Our Anti-Data Philosophy</h2>
              <p className="text-subtle mb-4">
                Unity Chant is built on the principle that <strong className="text-foreground">we should collect as little data as possible</strong>.
                Most platforms harvest your data to sell ads or build profiles. We do the opposite: we actively
                avoid collecting data we don't need.
              </p>
              <p className="text-subtle mb-4">
                We believe the integrity of collective decision-making requires trust, and trust requires
                privacy. You should be able to participate in deliberations without surveillance.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">What We Do NOT Collect</h2>
              <p className="text-subtle mb-4">
                We explicitly <strong className="text-foreground">do not</strong> collect, store, or log:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li><strong className="text-foreground">IP addresses</strong> — We do not store your IP address in our database. For anonymous accounts, we actively strip IP headers before processing. IP addresses are only used transiently for in-memory rate limiting (to prevent abuse) and are never written to disk or database.</li>
                <li><strong className="text-foreground">Location data</strong> — No GPS, no city, no country, no timezone auto-detection. We previously had location tracking fields and deliberately removed them.</li>
                <li><strong className="text-foreground">Device fingerprints</strong> — No browser fingerprinting, no canvas fingerprinting, no device IDs.</li>
                <li><strong className="text-foreground">Browsing behavior</strong> — No page view tracking, no click tracking, no session recordings, no heat maps.</li>
                <li><strong className="text-foreground">Analytics</strong> — We do not use Google Analytics, Mixpanel, Amplitude, or any third-party analytics service.</li>
                <li><strong className="text-foreground">Advertising data</strong> — No ad trackers, no pixel tags, no cross-site tracking, no data brokers.</li>
                <li><strong className="text-foreground">User agent strings</strong> — We do not store what browser or operating system you use.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">What We Do Collect</h2>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">Account Information (Minimum Required)</h3>
              <ul className="list-disc pl-6 text-subtle space-y-2 mb-4">
                <li>Name and email address (from your authentication provider, or chosen by you)</li>
                <li>Profile picture (only if provided by your authentication provider)</li>
                <li>Zip code (only if you voluntarily provide it in settings)</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">Content You Create</h3>
              <ul className="list-disc pl-6 text-subtle space-y-2 mb-4">
                <li>Ideas you submit to deliberations</li>
                <li>Votes you cast in voting cells</li>
                <li>Comments you post in discussions</li>
                <li>Deliberations you create</li>
              </ul>
              <p className="text-subtle mb-4">
                This content is necessary for the service to function. Ideas and votes are the core of
                the decision-making process.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">Anonymous Participation</h3>
              <p className="text-subtle mb-4">
                You can participate in Unity Chant without providing any personal information. Anonymous
                accounts are created with randomly generated identifiers. We actively strip IP headers
                from anonymous account creation requests before processing.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">How We Use Your Information</h2>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Authenticate your identity (so only you can vote as you)</li>
                <li>Run the voting process (cell assignment, tally, tier advancement)</li>
                <li>Send email notifications you've opted into</li>
                <li>Prevent abuse via transient in-memory rate limiting</li>
              </ul>
              <p className="text-subtle mt-4">
                That's it. We do not analyze your behavior, build profiles, or sell data.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Information Sharing</h2>
              <p className="text-subtle mb-4">
                We do not sell your personal information. We do not share it with advertisers. We do not
                share it with data brokers. We share information only:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li><strong className="text-foreground">With other participants:</strong> Your name and ideas are visible to other deliberation participants. Votes in public deliberations are visible.</li>
                <li><strong className="text-foreground">With essential service providers:</strong> Resend (email delivery), Vercel (hosting), Neon (database). These providers process data only as needed to run the service.</li>
                <li><strong className="text-foreground">For legal compliance:</strong> Only when required by law.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Open Source Content</h2>
              <p className="text-subtle mb-4">
                All ideas, votes, and comments submitted to public deliberations are treated as open source
                contributions to collective decision-making. See our{' '}
                <Link href="/terms" className="text-accent hover:text-accent-hover">Terms of Service</Link>{' '}
                for details.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Public vs Private Deliberations</h2>
              <p className="text-subtle mb-4">
                <strong className="text-foreground">Public deliberations:</strong> Ideas, votes, and participant names are visible to all users. This
                transparency is by design — democratic decision-making requires accountability.
              </p>
              <p className="text-subtle">
                <strong className="text-foreground">Private deliberations:</strong> Only invited members can see content. Private deliberations
                require a paid subscription.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Cookies</h2>
              <p className="text-subtle mb-4">
                We use only essential cookies:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Authentication session cookie (to keep you signed in)</li>
                <li>Admin verification cookie (for admin access, if applicable)</li>
              </ul>
              <p className="text-subtle mt-4">
                We do not use analytics cookies, advertising cookies, or any form of cross-site tracking cookies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Security</h2>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>HTTPS encryption for all traffic</li>
                <li>Secure authentication via OAuth or WebAuthn passkeys</li>
                <li>Passwords hashed with bcrypt (never stored in plaintext)</li>
                <li>API keys stored as SHA-256 hashes (never stored in plaintext)</li>
                <li>CSRF protection on all mutation endpoints</li>
                <li>Content moderation to prevent abuse</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Your Rights</h2>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Delete your account and data at any time</li>
                <li>Export your data</li>
                <li>Opt out of all non-essential emails (granular per-category controls in settings)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Data Retention</h2>
              <p className="text-subtle mb-4">
                We retain your data only as long as your account is active. When you delete your account,
                your personal information is removed. Ideas and votes you submitted to public deliberations
                may be retained in anonymized form to preserve the integrity of completed decision processes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Children's Privacy</h2>
              <p className="text-subtle mb-4">
                The Service is not intended for children under 13. We do not knowingly collect
                personal information from children under 13.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Verify Our Claims</h2>
              <p className="text-subtle mb-4">
                Unity Chant is open source. You can verify everything in this policy by reviewing our code.
                If you find any data collection that contradicts this policy, please report it.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Changes to This Policy</h2>
              <p className="text-subtle mb-4">
                We may update this policy from time to time. We will notify you of significant changes
                by email or through the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Contact Us</h2>
              <p className="text-subtle">
                Questions about this policy? Contact us at{' '}
                <a href="mailto:galen.goodwick@icloud.com" className="text-accent hover:text-accent-hover">
                  galen.goodwick@icloud.com
                </a>
              </p>
            </section>
          </div>
        </article>

        <div className="mt-8 text-center">
          <Link href="/terms" className="text-accent hover:text-accent-hover">
            View Terms of Service
          </Link>
        </div>
      </div>
    </div>
  )
}
