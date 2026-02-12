'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  return (
    <pre className="bg-background border border-border rounded-lg p-3 overflow-x-auto text-xs text-foreground font-mono leading-relaxed">
      <code>{code}</code>
    </pre>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      {children}
    </section>
  )
}

export default function EmbedPage() {
  return (
    <FrameLayout hideFooter>
      <div className="py-4">
        <h1 className="text-xl font-bold text-foreground mb-1">Embed Unity Chant</h1>
        <p className="text-muted text-xs mb-2">
          Unity Chant is a <span className="text-foreground font-medium">protocol</span>, not just a product.
          Any platform can embed deliberation cells to bring structured collective intelligence to their users.
        </p>
        <p className="text-muted text-xs mb-6">
          Style it to match your brand. Use our API for full control. Or drop in an iframe and go.
        </p>

        {/* Table of Contents */}
        <nav className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4 mb-8">
          <p className="text-xs font-bold text-foreground mb-2">On this page</p>
          <ul className="space-y-1 text-xs">
            {[
              ['quick-start', 'Quick Start (iframe)'],
              ['authentication', 'Authentication'],
              ['api-reference', 'API Reference'],
              ['styling', 'Styling Your Embed'],
              ['example-cg', 'Example: Common Ground'],
              ['example-discord', 'Example: Discord Bot'],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-accent hover:underline">{label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">

          {/* Quick Start */}
          <Section id="quick-start" title="Quick Start">
            <p className="text-muted text-xs mb-3">
              The fastest way to embed a chant is with an iframe pointing to the chant&apos;s page on unitychant.com.
            </p>
            <CodeBlock lang="html" code={`<iframe
  src="https://unitychant.com/chants/YOUR_CHANT_ID"
  width="100%"
  height="700"
  style="border: none; border-radius: 12px;"
  allow="clipboard-write"
></iframe>`} />
            <p className="text-muted mt-3 text-xs">
              Replace <code className="text-foreground bg-background px-1 py-0.5 rounded border border-border font-mono text-[10px]">YOUR_CHANT_ID</code> with
              the ID of your chant. Users will authenticate via their Unity Chant account inside the iframe.
            </p>
          </Section>

          {/* Authentication */}
          <Section id="authentication" title="Authentication">
            <p className="text-muted text-xs mb-3">
              For programmatic access (bots, backends, agents), register for a free API key:
            </p>
            <CodeBlock code={`# Self-register (no auth required)
curl -X POST https://unitychant.com/api/v1/register \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My Agent", "email": "agent@example.com"}'

# Response: { "apiKey": "uc_ak_...", "userId": "..." }`} />
            <p className="text-muted mt-3 mb-3 text-xs">
              Then use the key in all subsequent requests:
            </p>
            <CodeBlock code={`curl https://unitychant.com/api/v1/chants \\
  -H "Authorization: Bearer uc_ak_YOUR_KEY"`} />
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mt-3">
              <p className="text-xs text-foreground">
                <span className="font-bold">Free for everyone.</span> No paywall, no rate limits on registration.
                Create as many chants as you need.
              </p>
            </div>
          </Section>

          {/* API Reference */}
          <Section id="api-reference" title="API Reference">
            <p className="text-muted text-xs mb-4">
              All endpoints accept JSON and return JSON. Auth via <code className="text-foreground bg-background px-1 py-0.5 rounded border border-border font-mono text-[10px]">Authorization: Bearer uc_ak_...</code> header.
            </p>

            <div className="space-y-2">
              {[
                {
                  method: 'POST',
                  path: '/api/v1/register',
                  desc: 'Register a new agent/user (returns API key)',
                  auth: false,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chants',
                  desc: 'Create a new chant (question + settings)',
                  auth: true,
                },
                {
                  method: 'GET',
                  path: '/api/v1/chants/:id',
                  desc: 'Get chant status, ideas, cells, progress',
                  auth: true,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chants/:id/ideas',
                  desc: 'Submit an idea to a chant',
                  auth: true,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chants/:id/join',
                  desc: 'Join a chant as a participant',
                  auth: true,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chants/:id/start',
                  desc: 'Start voting phase (creator only)',
                  auth: true,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chants/:id/vote',
                  desc: 'Cast a vote (XP allocation across ideas)',
                  auth: true,
                },
                {
                  method: 'GET',
                  path: '/api/v1/chants/:id/comments',
                  desc: 'Read comments on ideas',
                  auth: true,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chants/:id/comments',
                  desc: 'Post a comment on an idea',
                  auth: true,
                },
                {
                  method: 'POST',
                  path: '/api/v1/chat',
                  desc: 'Natural language interface (AI translates to actions)',
                  auth: true,
                },
              ].map(({ method, path, desc, auth }) => (
                <div key={path + method} className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 flex items-start gap-2">
                  <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${method === 'GET' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
                    {method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <code className="text-xs text-foreground font-mono break-all">{path}</code>
                    <p className="text-[10px] text-muted mt-0.5">{desc}{!auth && ' (no auth required)'}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
              <p className="text-xs text-foreground font-bold mb-1.5">Natural Language API</p>
              <p className="text-xs text-muted mb-2">
                Don&apos;t want to parse endpoints? Use <code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">/api/v1/chat</code> — send plain English and our AI executes the right actions.
              </p>
              <CodeBlock code={`curl -X POST https://unitychant.com/api/v1/chat \\
  -H "Authorization: Bearer uc_ak_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Create a chant asking: What should we build next?"}'`} />
            </div>
          </Section>

          {/* Styling */}
          <Section id="styling" title="Styling Your Embed">
            <p className="text-muted text-xs mb-3">
              Building a custom integration? Style it to match your brand. Unity Chant uses
              semantic design tokens (CSS variables) that you can override.
            </p>
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-3">
              <p className="text-xs text-foreground">
                <span className="font-bold">Pro tip:</span> Tell your AI (Claude, Cursor, etc.)
                to style the plugin according to your brand. Give it your colors, fonts, and
                border-radius — it will generate a tailwind config and globals.css in minutes.
              </p>
            </div>
            <p className="text-muted text-xs mb-3">Core tokens you can override:</p>
            <CodeBlock lang="css" code={`:root {
  --color-accent: #0891b2;      /* Primary action color */
  --color-success: #059669;     /* Success / winner */
  --color-warning: #f59e0b;     /* Voting / attention */
  --color-error: #ef4444;       /* Error states */
  --color-background: #0d0d12;  /* Page background */
  --color-surface: #111118;     /* Card background */
  --color-foreground: #f5f5f5;  /* Primary text */
  --color-muted: #71717a;       /* Secondary text */
  --color-border: #27272a;      /* Borders */
}`} />
          </Section>

          {/* Example: Common Ground */}
          <Section id="example-cg" title="Example: Common Ground">
            <p className="text-muted text-xs mb-3">
              <a href="https://app.common.ground" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Common Ground</a> is
              an open-source platform for community governance. Unity Chant&apos;s embeddable widget
              architecture was directly inspired by their plugin system.
            </p>
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-3">
              <p className="text-xs text-foreground font-bold mb-1.5">How it works</p>
              <ul className="text-xs text-muted space-y-1 list-disc list-inside">
                <li>CG loads the Unity Chant plugin as an iframe inside community spaces</li>
                <li>User identity is passed via CG&apos;s signed token protocol (postMessage)</li>
                <li>The plugin maps CG users to UC accounts automatically</li>
                <li>Voting, commenting, and idea submission all happen inside the iframe</li>
              </ul>
            </div>
            <p className="text-muted text-xs">
              Thank you to Common Ground for being open source and inspiring this architecture.
              The HeartCall plugin (our CG integration) is open source too:{' '}
              <a href="https://github.com/GalenGoodwick/unity-chant-cg-plugin" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                unity-chant-cg-plugin
              </a>
            </p>
          </Section>

          {/* Example: Discord */}
          <Section id="example-discord" title="Example: Discord Bot">
            <p className="text-muted text-xs mb-3">
              <Link href="/pepperphone" className="text-accent hover:underline">PepperPhone</Link> is
              our Discord bot — a different integration pattern using slash commands instead of iframe embeds.
            </p>
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-3">
              <p className="text-xs text-foreground font-bold mb-1.5">How it works</p>
              <ul className="text-xs text-muted space-y-1 list-disc list-inside">
                <li>Bot registers via <code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">/api/v1/register</code> with a shared secret</li>
                <li>Discord users are mapped to synthetic UC accounts (<code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">discord_&#123;id&#125;@bot.unitychant.com</code>)</li>
                <li>Slash commands (<code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">/chant</code>, <code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">/idea</code>, <code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">/vote</code>) call UC API endpoints</li>
                <li>Bot renders results as Discord embeds with interactive buttons</li>
              </ul>
            </div>
            <p className="text-muted text-xs">
              This pattern works for any chat platform — Slack, Telegram, or custom CLIs.
              The API is the same; only the presentation layer changes.
            </p>
          </Section>

        </div>

        {/* CTA */}
        <div className="mt-10 bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-6 text-center">
          <h3 className="text-base font-bold text-foreground mb-1.5">Ready to embed?</h3>
          <p className="text-muted text-xs mb-4">
            Register for a free API key and start building in minutes.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/tools"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
            >
              Get API Key
            </Link>
            <a
              href="https://github.com/GalenGoodwick/unity-chant-cg-plugin"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-surface hover:bg-background text-foreground font-medium rounded-lg border border-border transition-colors text-sm"
            >
              View Source
            </a>
          </div>
        </div>
      </div>
    </FrameLayout>
  )
}
