import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Union Chant. Learn how we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
            Union Chant
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/deliberations" className="hover:text-accent-light transition-colors">
              Deliberations
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <article className="bg-background rounded-lg border border-border p-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-muted mb-8">Last updated: January 2025</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Overview</h2>
              <p className="text-subtle mb-4">
                Union Chant ("we", "our", "us") is committed to protecting your privacy. This policy explains
                how we collect, use, and protect your personal information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Information We Collect</h2>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">Account Information</h3>
              <p className="text-subtle mb-4">
                When you sign in, we collect:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2 mb-4">
                <li>Name and email address (from your authentication provider)</li>
                <li>Profile picture (if provided by your authentication provider)</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">Usage Information</h3>
              <p className="text-subtle mb-4">
                When you use the Service, we collect:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2 mb-4">
                <li>Ideas you submit to deliberations</li>
                <li>Votes you cast in voting cells</li>
                <li>Comments you post in discussions</li>
                <li>Deliberations you create or join</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">Technical Information</h3>
              <p className="text-subtle mb-4">
                We automatically collect:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Browser type and version</li>
                <li>Device information</li>
                <li>IP address</li>
                <li>Pages visited and time spent</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">How We Use Your Information</h2>
              <p className="text-subtle mb-4">
                We use your information to:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Provide and improve the Service</li>
                <li>Authenticate your identity</li>
                <li>Facilitate deliberations and voting</li>
                <li>Send notifications about deliberations you're participating in</li>
                <li>Respond to support requests</li>
                <li>Analyze usage patterns to improve the Service</li>
                <li>Prevent fraud and abuse</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Information Sharing</h2>
              <p className="text-subtle mb-4">
                We do not sell your personal information. We may share information:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li><strong>With other participants:</strong> Your name and ideas are visible to other deliberation participants</li>
                <li><strong>With service providers:</strong> We use third-party services for hosting, analytics, and email</li>
                <li><strong>For legal compliance:</strong> When required by law or to protect our rights</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Public vs Private Deliberations</h2>
              <p className="text-subtle mb-4">
                <strong>Public deliberations:</strong> Ideas, votes, and participant names are visible to all users.
              </p>
              <p className="text-subtle">
                <strong>Private deliberations:</strong> Only invited members can see content. Private deliberations
                require a paid subscription.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Data Retention</h2>
              <p className="text-subtle mb-4">
                We retain your data as long as your account is active or as needed to provide the Service.
                You can request deletion of your account and data at any time.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Your Rights</h2>
              <p className="text-subtle mb-4">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Delete your account and data</li>
                <li>Export your data</li>
                <li>Opt out of non-essential communications</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Cookies</h2>
              <p className="text-subtle mb-4">
                We use essential cookies to:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>Keep you signed in</li>
                <li>Remember your preferences</li>
                <li>Protect against fraud</li>
              </ul>
              <p className="text-subtle mt-4">
                We do not use cookies for advertising or cross-site tracking.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Security</h2>
              <p className="text-subtle mb-4">
                We implement industry-standard security measures including:
              </p>
              <ul className="list-disc pl-6 text-subtle space-y-2">
                <li>HTTPS encryption for all traffic</li>
                <li>Secure authentication via OAuth providers</li>
                <li>Regular security audits</li>
                <li>Access controls and monitoring</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">Children's Privacy</h2>
              <p className="text-subtle mb-4">
                The Service is not intended for children under 13. We do not knowingly collect
                personal information from children under 13.
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
                <a href="mailto:privacy@unionchant.com" className="text-accent hover:text-accent-hover">
                  privacy@unionchant.com
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
