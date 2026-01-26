import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-6">
            Union Chant
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Collective decision-making for the modern age.
            Small group deliberation at any scale.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/deliberations/new"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Start a Deliberation
            </Link>
            <Link
              href="/deliberations"
              className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Browse Public
            </Link>
            <Link
              href="/demo"
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Watch Demo
            </Link>
            <Link
              href="/whitepaper"
              className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Whitepaper
            </Link>
            <Link
              href="/admin"
              className="bg-slate-600 hover:bg-slate-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Admin
            </Link>
          </div>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-slate-800 rounded-xl p-6">
            <div className="text-3xl mb-4">💡</div>
            <h3 className="text-lg font-semibold text-white mb-2">Submit Ideas</h3>
            <p className="text-slate-400">
              Everyone contributes proposals, not just reacts to preset options.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6">
            <div className="text-3xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-white mb-2">Small Groups Deliberate</h3>
            <p className="text-slate-400">
              Groups of 5 discuss and vote. Ideas that earn support advance.
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6">
            <div className="text-3xl mb-4">🏆</div>
            <h3 className="text-lg font-semibold text-white mb-2">Best Ideas Win</h3>
            <p className="text-slate-400">
              Through multiple rounds, the strongest ideas emerge as champions.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-slate-400 mb-4">
            Scale is not achieved by enlarging a conversation.
            It is achieved by multiplying conversations.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/whitepaper"
              className="text-slate-400 hover:text-slate-300 font-medium"
            >
              Read the Whitepaper
            </Link>
            <span className="text-slate-600">|</span>
            <Link
              href="/donate"
              className="text-slate-400 hover:text-slate-300 font-medium"
            >
              Support Us
            </Link>
            <span className="text-slate-600">|</span>
            <Link
              href="/auth/signin"
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Sign in to get started →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
