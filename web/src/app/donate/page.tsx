import Link from 'next/link'

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-slate-400 hover:text-slate-300 text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Support Union Chant</h1>
          <p className="text-xl text-slate-300 mb-8">
            Help us build tools for collective decision-making
          </p>

          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 mb-8">
            <div className="text-6xl mb-4">Coming Soon</div>
            <p className="text-slate-400">
              We&apos;re setting up donation options. Check back soon!
            </p>
          </div>

          <div className="text-slate-400 text-sm">
            <p className="mb-4">
              Union Chant is free for public deliberations and always will be.
              Your donations help us maintain the platform and build new features.
            </p>
            <p>
              Questions? Contact us at{' '}
              <a href="mailto:hello@unionchant.com" className="text-indigo-400 hover:text-indigo-300">
                hello@unionchant.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
