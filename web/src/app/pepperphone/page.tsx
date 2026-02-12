'use client'

import Link from 'next/link'
import Image from 'next/image'
import FrameLayout from '@/components/FrameLayout'

const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '1469167979320180858'}&permissions=2147485696&scope=bot+applications.commands`

export default function PepperPhonePage() {
  return (
    <FrameLayout hideFooter showBack>
      <div className="py-4">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-3 rounded-full overflow-hidden">
            <Image
              src="/pepperphone-logo.png"
              alt="PepperPhone"
              width={96}
              height={96}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">PepperPhone</h1>
          <p className="text-base text-muted mb-1">by Unity Chant</p>
          <p className="text-subtle text-xs italic mb-4">Many lines into one, and all becomes one.</p>

          <a
            href={BOT_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold py-2.5 px-6 rounded-lg transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Add to Discord
          </a>
        </div>

        {/* What is PepperPhone */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-2">What is PepperPhone?</h2>
          <p className="text-subtle text-xs leading-relaxed">
            PepperPhone is the official Unity Chant bot for Discord. It lets your server run
            chants — structured discussions where everyone submits ideas and the group
            votes to find the strongest answer. Voting can happen on Unity Chant or
            directly on your server, and results flow back automatically.
          </p>
        </section>

        {/* Commands */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">Commands</h2>

          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Participation</h3>
          <div className="space-y-2 mb-4">
            <CommandCard
              command="/idea"
              description="Pick a chant, then submit your idea."
              example='/idea chant:[pick] text:"Build a community garden"'
            />
            <CommandCard
              command="/vote"
              description="Cast your vote with buttons — pick your favorite idea."
            />
          </div>

          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">/chant — Deliberations</h3>
          <div className="space-y-2 mb-4">
            <CommandCard
              command="/chant new"
              description="Start a new deliberation. Pose a question and collect ideas."
              example='/chant new question:"What should our next project be?"'
            />
            <CommandCard
              command="/chant results"
              description="View standings for a chant, or see a summary of all active chants."
            />
            <CommandCard
              command="/chant status"
              description="List all active chants in your server with their current phase."
            />
          </div>

          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">/manage — Admin Controls</h3>
          <div className="space-y-2 mb-4">
            <CommandCard
              command="/manage facilitate"
              description="Facilitator controls — start voting, extend timer, or end a chant."
            />
            <CommandCard
              command="/manage delete"
              description="Delete a chant from your server."
            />
            <CommandCard
              command="/manage default"
              description="Set the default chant. /idea will submit to it automatically."
            />
            <CommandCard
              command="/manage load"
              description="Load a chant from another server for cross-server deliberation."
              example='/manage load code:"invite code"'
            />
            <CommandCard
              command="/manage unload"
              description="Remove a loaded chant from your server."
            />
          </div>

          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Server Setup</h3>
          <div className="space-y-2">
            <CommandCard
              command="/setup"
              description="Server configuration — set announcement channel and permissions."
              example="/setup channel:#announcements"
            />
            <CommandCard
              command="/help"
              description="Show all available commands and how to use them."
            />
          </div>
        </section>

        {/* How it works */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">How It Works</h2>
          <div className="space-y-2.5">
            <Step number={1} title="Add PepperPhone">
              Add the bot to your Discord server. A community is automatically created
              for your server on Unity Chant.
            </Step>
            <Step number={2} title="Start a Chant">
              Any member uses <code className="text-accent bg-accent-light px-1 rounded text-xs">/chant new</code> to
              pose a question. The server owner can use <code className="text-accent bg-accent-light px-1 rounded text-xs">/manage facilitate</code> to control the process.
            </Step>
            <Step number={3} title="Submit Ideas">
              Members use <code className="text-accent bg-accent-light px-1 rounded text-xs">/idea</code> to
              submit their answers directly in Discord.
            </Step>
            <Step number={4} title="Vote">
              When voting starts, members use <code className="text-accent bg-accent-light px-1 rounded text-xs">/vote</code> to
              pick their favorite idea with a single button press — or vote on unitychant.com. Ideas compete
              in small groups of 5. Winners advance until a priority emerges.
            </Step>
            <Step number={5} title="See Results">
              Results are announced in Discord and on the web. The winning idea becomes
              the group&apos;s priority.
            </Step>
          </div>
        </section>

        {/* What happens on the web */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-2">Your Discord Server on Unity Chant</h2>
          <p className="text-subtle text-xs leading-relaxed mb-2">
            When you add PepperPhone, your Discord server gets a public mirror community on unitychant.com.
            Members who use bot commands get accounts created automatically that they can claim
            by signing in with Discord — no separate signup needed.
          </p>
          <ul className="text-subtle text-xs leading-relaxed space-y-1.5 list-disc list-inside">
            <li>Server owner becomes the community owner on Unity Chant</li>
            <li>Members who use bot commands get accounts created automatically that they can claim with Discord sign-in</li>
            <li>Voting can happen in Discord or on unitychant.com — more space for discussion and nuance</li>
            <li>Want your community private? <Link href="/pricing" className="text-accent hover:text-accent-hover">Upgrade to Pro</Link></li>
            <li>Remove the bot from Discord and the community is deleted</li>
          </ul>
        </section>

        {/* CTA */}
        <div className="text-center py-6 border-t border-border">
          <a
            href={BOT_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold py-2.5 px-6 rounded-lg transition-colors text-sm"
          >
            Add PepperPhone to Your Server
          </a>
          <p className="text-muted text-xs mt-2">
            Free forever. No premium required for basic use.
          </p>
        </div>
      </div>
    </FrameLayout>
  )
}

function CommandCard({ command, description, example }: { command: string; description: string; example?: string }) {
  return (
    <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
      <code className="text-accent font-mono font-semibold text-xs">{command}</code>
      <p className="text-subtle text-xs mt-1">{description}</p>
      {example && (
        <p className="text-muted text-[10px] mt-1.5 font-mono bg-background px-2 py-1 rounded">{example}</p>
      )}
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </div>
      <div>
        <h3 className="text-foreground font-medium text-xs">{title}</h3>
        <p className="text-subtle text-xs leading-relaxed">{children}</p>
      </div>
    </div>
  )
}
