'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

export default function ToolsPage() {
  const tools = [
    {
      name: 'Mind Map',
      path: '/mindmap',
      description: 'Visual thinking and idea organization. Create connected thoughts, drag to arrange.',
      icon: '🧠',
      color: 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20'
    },
    {
      name: 'Spreadsheet',
      path: '/spreadsheet',
      description: 'Structured data management. Rows, columns, formulas, and filtering.',
      icon: '📊',
      color: 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
    },
    {
      name: 'Chants',
      path: '/chants',
      description: 'Adversarial consensus deliberations. Tiered voting, 5-person cells, champion selection.',
      icon: '⚖️',
      color: 'bg-accent/10 border-accent/30 hover:bg-accent/20'
    },
    {
      name: 'Communities',
      path: '/communities',
      description: 'Group collaboration spaces. Public/private communities, roles, moderation.',
      icon: '👥',
      color: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'
    },
    {
      name: 'Feed',
      path: '/',
      description: 'Activity stream. Your Turn, Activity, Results tabs. See what needs your attention.',
      icon: '📱',
      color: 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20'
    }
  ]

  return (
    <FrameLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tools Overview</h1>
          <p className="text-muted">
            Unity Chant architecture: collective intelligence infrastructure for coordinated decision-making
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {tools.map(tool => (
            <Link
              key={tool.path}
              href={tool.path}
              className={`p-6 rounded-lg border transition-all ${tool.color}`}
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">{tool.icon}</div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground mb-2">{tool.name}</h2>
                  <p className="text-sm text-muted">{tool.description}</p>
                </div>
                <div className="text-accent">→</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
          <h2 className="text-2xl font-bold text-foreground">Architecture</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Core Engine</h3>
              <p className="text-sm text-muted">
                Adversarial consensus algorithm: ideas compete in 5-person cells, winners advance through tiers.
                What survives is what's robust, not what's popular.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">The Cradle</h3>
              <p className="text-sm text-muted">
                18-eye geometric cognition engine. Pure adversarial consensus from words to thought.
                No LLM, no API, no cost. Template dimensions discovered through tournament selection.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Authentication</h3>
              <p className="text-sm text-muted">
                Multiple entry points: passkeys (Touch ID/Face ID), Google OAuth, email/password, anonymous.
                Push notifications for passkey and anonymous users.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Social Layer</h3>
              <p className="text-sm text-muted">
                Communities, following, feed, podium (long-form writing), collective chat with AI.
                Feed tabs: Your Turn (actionable), Activity (what's happening), Results (outcomes).
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Infrastructure</h3>
              <p className="text-sm text-muted">
                Next.js 15, Prisma, Postgres (Neon), Vercel deployment, Stripe billing (4 tiers),
                Email (Resend), Push notifications, CAPTCHA, rate limiting, E2E tests (Playwright).
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Tech Stack</h3>
            <div className="flex flex-wrap gap-2">
              {['Next.js 15', 'React', 'TypeScript', 'Tailwind v4', 'Prisma', 'PostgreSQL',
                'NextAuth', 'Stripe', 'WebAuthn', 'Resend', 'Vercel', 'Playwright'].map(tech => (
                <span key={tech} className="px-3 py-1 bg-background rounded text-xs text-muted border border-border">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FrameLayout>
  )
}
