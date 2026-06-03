'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  BG, MUTED, BORDER,
  type TierCfg, type SceneState,
  makeCD,
  buildLayout, updateScene, drawScene,
} from '@/lib/canvas-engine'


// ── Page-specific constants ──
const HEADER = '#020617'

// ── Gap config ──
interface GapDef { id: string; cfg: TierCfg; colorAbove: string; colorBelow: string }
const GAPS: GapDef[] = [
  { id: 'gap0', cfg: { mode: 'free-dots', count: 1000, speed: 0.3, dotR: 2.5, palette: 'pre' }, colorAbove: HEADER, colorBelow: HEADER },
  { id: 'gap1', cfg: { mode: 'grid', cellR: 10, dotR: 2.2, zoom: 2.8, cd: makeCD(200, .5, .3) }, colorAbove: HEADER, colorBelow: HEADER },
  { id: 'gap2', cfg: { mode: 'batch-grid', bc: 40, zoom: 1.6, levels: [{ r: 28, n: 5, fill: BG, stroke: BORDER, sw: 1 }, { r: 11, sw: 1, dotR: 2.2 }], cd: makeCD(200, .4, .35) }, colorAbove: HEADER, colorBelow: HEADER },
  { id: 'gap3', cfg: { mode: 'batch-grid', bc: 8, cols: 4, zoom: 1.7, levels: [{ r: 65, n: 5, fill: BG, stroke: BORDER, sw: 1.2 }, { r: 22, n: 5, fill: BG, stroke: '#2d3a4f', sw: 1 }, { r: 8, sw: .8, dotR: 1.6 }], cd: makeCD(200, .35, .35) }, colorAbove: HEADER, colorBelow: HEADER },
  { id: 'gap4', cfg: { mode: 'single', zoom: 1.3, levels: [{ r: 250, n: 5, fill: BG, stroke: MUTED, sw: 2 }, { r: 82, n: 5, fill: BG, stroke: BORDER, sw: 1.5 }, { r: 28, n: 5, fill: BG, stroke: '#2d3a4f', sw: 1 }, { r: 10, sw: .8, dotR: 2 }], cd: makeCD(125, .3, .35) }, colorAbove: HEADER, colorBelow: HEADER },
  { id: 'gap5', cfg: { mode: 'free-dots', count: 1000, speed: 0.3, dotR: 2.5, palette: 'post' }, colorAbove: HEADER, colorBelow: BG },
]

// ── Parallax scene: wraps a SceneState with DOM refs ──
interface ParallaxScene {
  state: SceneState
  ctx: CanvasRenderingContext2D
  canvas: HTMLCanvasElement
  gap: HTMLElement
  tierCfg: TierCfg
}

function createParallaxScene(canvas: HTMLCanvasElement, gap: HTMLElement, tierCfg: TierCfg): ParallaxScene {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2d context')

  const scene: ParallaxScene = {
    state: buildLayout(0, 0, tierCfg),
    ctx,
    canvas,
    gap,
    tierCfg,
  }

  function resize() {
    const r = gap.getBoundingClientRect()
    const W = Math.ceil(r.width)
    const H = Math.ceil(r.height * 1.5)
    canvas.width = W; canvas.height = H
    scene.state = buildLayout(W, H, tierCfg)
  }

  resize()
  window.addEventListener('resize', resize)
  return scene
}

// ── Viz Gap component ──
function VizGap({ id, colorAbove, colorBelow }: { id: string; colorAbove: string; colorBelow: string }) {
  return (
    <div className="lp-viz-gap" id={id} style={{ '--color-above': colorAbove, '--color-below': colorBelow, position: 'relative', overflow: 'hidden', zIndex: 1, height: '500px' } as React.CSSProperties}>
      <canvas id={`canvas-${id}`} style={{ position: 'absolute', top: '-25%', left: 0, width: '100%', height: '150%' }} />
    </div>
  )
}

// ── Tab component ──
function TierTab({ children }: { children: React.ReactNode }) {
  return <div className="lp-tier-tab">{children}</div>
}

// ── Add to Phone button ──
function AddToPhoneButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleClick = useCallback(async () => {
    if (deferredPrompt) {
      // Android / desktop Chrome
      const prompt = deferredPrompt as Event & { prompt: () => Promise<void> }
      await prompt.prompt()
      setDeferredPrompt(null)
    } else {
      // iOS Safari — show hint
      setShowIOSHint(v => !v)
    }
  }, [deferredPrompt])

  if (installed) return null

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-lg font-semibold transition-colors border border-white/20 cursor-pointer"
      >
        Add to Phone
      </button>
      {showIOSHint && !deferredPrompt && (
        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-lg p-4 text-sm text-muted w-64 z-50 shadow-lg">
          {/iPhone|iPad|iPod/.test(navigator.userAgent) ? (
            <>
              <p className="text-foreground font-medium mb-2">Install on iOS</p>
              <p>Tap the share button <span className="inline-block align-middle text-base">&#x1F4E4;</span> in Safari, then &ldquo;Add to Home Screen&rdquo;</p>
            </>
          ) : (
            <>
              <p className="text-foreground font-medium mb-2">Install in Safari</p>
              <p>Click the share button <span className="inline-block align-middle text-base">&#x1F4E4;</span> then &ldquo;Add to Dock&rdquo;</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function LandingParallax() {
  const { data: session } = useSession()

  useEffect(() => {
    const scenes: ParallaxScene[] = []
    for (const g of GAPS) {
      const canvas = document.getElementById(`canvas-${g.id}`) as HTMLCanvasElement
      const gap = document.getElementById(g.id) as HTMLElement
      if (!canvas || !gap) { console.warn('LandingParallax: missing element', g.id); continue }
      try { scenes.push(createParallaxScene(canvas, gap, g.cfg)) } catch (e) { console.error('LandingParallax: scene error', g.id, e) }
    }
    if (!scenes.length) { console.warn('LandingParallax: no scenes created'); return }

    const vis = new Array(scenes.length).fill(true)
    const gapEls = GAPS.map(g => document.getElementById(g.id)).filter(Boolean) as HTMLElement[]
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { const i = gapEls.indexOf(e.target as HTMLElement); if (i >= 0) vis[i] = e.isIntersecting })
    }, { rootMargin: '100px' })
    gapEls.forEach(g => obs.observe(g))

    function onScroll() {
      for (const s of scenes) {
        const rect = s.gap.getBoundingClientRect()
        const offset = rect.top * -0.25
        s.canvas.style.transform = `translate3d(0,${offset}px,0)`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    let last = 0
    let raf: number
    function loop(ts: number) {
      const dt = Math.min((ts - last) / 1000, .05); last = ts
      try {
        for (let i = 0; i < scenes.length; i++) if (vis[i]) {
          updateScene(scenes[i].state, dt)
          drawScene(scenes[i].ctx, scenes[i].state)
        }
      } catch (e) { console.error('LandingParallax: render error', e) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      obs.disconnect()
    }
  }, [])

  return (
    <>
      <style>{`
        .lp-viz-gap { position: relative; overflow: hidden; z-index: 1; height: 500px; }
        .lp-viz-gap canvas { position: absolute; top: -25%; left: 0; width: 100%; height: 150%; }
        .lp-viz-gap::before, .lp-viz-gap::after { content: ''; position: absolute; left: 0; right: 0; height: 80px; z-index: 2; pointer-events: none; }
        .lp-viz-gap::before { top: 0; background: linear-gradient(to bottom, var(--color-above), transparent); }
        .lp-viz-gap::after { bottom: 0; background: linear-gradient(to top, var(--color-below), transparent); }
        .lp-tier-tab { position: absolute; bottom: 0; left: 50%; transform: translate(-50%, 100%); z-index: 10; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 3px; color: #e2e8f0; font-weight: 600; white-space: nowrap; text-align: center; line-height: 1.6; background: #020617; padding: 8px 20px; border-top: 2px solid #22d3ee; border-radius: 0 0 8px 8px; }
        @media (max-width: 640px) { .lp-viz-gap { height: 350px; } .lp-tier-tab { font-size: 0.55rem; letter-spacing: 1px; padding: 6px 12px; white-space: normal; max-width: 90vw; } }
      `}</style>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-[10] bg-header/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-[800px] mx-auto px-6 py-3 flex justify-end">
          {session?.user ? (
            <Link href="/chants" className="text-sm text-accent hover:text-accent-hover font-medium transition-colors">
              Go to Chants &rarr;
            </Link>
          ) : (
            <Link href="/auth/signin" className="text-sm text-accent hover:text-accent-hover font-medium transition-colors">
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative z-[2] bg-header text-white">
        <div className="max-w-[800px] mx-auto px-6 py-24 md:py-28 text-center" style={{ paddingTop: '100px', paddingBottom: '100px' }}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-[1.1] tracking-tight font-serif">
            Unity Chant
          </h1>
          <p className="text-2xl sm:text-3xl text-accent font-medium mb-10 font-serif italic">
            Standing for World Peace
          </p>
          <div className="max-w-[560px] mx-auto mb-2 space-y-5 text-white/90 text-lg leading-relaxed">
            <p className="text-white/60 text-sm uppercase tracking-widest mb-1">15-second version</p>
            <p>
              Unity Chant is a decision-making platform that helps communities turn
              hundreds or millions of ideas into one trusted priority. Instead of
              another poll, social media, or chaotic town hall, Unity Chant introduces Collective Media: it breaks people into small deliberation
              groups, advances the strongest ideas through multiple rounds, and produces
              a final decision people understand, trust, and helped shape.
            </p>
            <p className="text-white/60 text-sm uppercase tracking-widest mb-1 pt-4">30-second version</p>
            <p>
              Most civic engagement tools either collect shallow votes or give the
              microphone to the loudest voices. Unity Chant creates a better process.
              Community members submit ideas, discuss them in small groups, and vote
              through structured rounds where the strongest ideas keep advancing. By the
              end, the winning priority has not just received clicks &mdash; it has survived
              repeated discussion, comparison, and support from many different groups. It
              gives cities, organizations, and communities a practical way to listen at
              scale and make decisions with legitimacy.
            </p>
            <p className="text-white/60 text-sm uppercase tracking-widest mb-1 pt-4">Founder-style version</p>
            <p>
              We have tools for broadcasting opinions, but not for building collective
              judgment. Unity Chant lets large communities deliberate the way humans
              actually reason: in small groups. People submit ideas, discuss trade-offs,
              and advance the strongest proposals through multiple rounds until a clear
              community priority emerges. It is designed for cities, institutions, and
              organizations that need more than a survey. They need a trusted process
              people can believe in.
            </p>
          </div>
          <p className="text-4xl sm:text-5xl md:text-6xl text-accent font-bold mt-16 mb-2 font-serif">
            The Journey.
          </p>
          <p className="text-accent text-7xl sm:text-8xl font-black mb-4">&darr;</p>
          <TierTab>so many individuals &mdash; good ideas flare<br />and are lost to disconnection and chaos</TierTab>
        </div>
      </section>

      {/* ── GAP 0: Pre-tier ── */}
      <VizGap id="gap0" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── THE INSIGHT ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Agreement hides in small rooms
          </h2>
          <p className="text-lg text-subtle leading-relaxed mb-5">
            Think about the best discussions you&apos;ve ever had. They
            weren&apos;t in a stadium or a comment section. They were
            around a table, with a few people who actually listened &mdash;
            and you discovered you agreed on more than you expected.
          </p>
          <p className="text-lg text-subtle leading-relaxed">
            Unity Chant scales that moment. Instead of putting
            everyone in one noisy room, we create{' '}
            <em className="text-foreground">thousands</em> of those
            conversations in parallel. Each one uncovers a small piece
            of hidden consensus. Connected together, they reveal the whole.
          </p>
          <TierTab>each person writes 1 idea &mdash; they are arranged<br />into cells of 5 people with 5 ideas from others<br />each cell talks and picks the strongest idea</TierTab>
        </div>
      </section>

      {/* ── GAP 1: Tier 1 ── */}
      <VizGap id="gap1" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── HOW IT WORKS ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            How latent consensus surfaces
          </h2>
          <p className="text-muted text-lg mb-6">
            Nobody knows the answer in advance. The process finds it.
          </p>
          <p className="text-subtle text-sm leading-relaxed max-w-[600px] mx-auto mb-10">
            The current technical model uses small cells of about five people, where ideas are reviewed in batches, scored, and advanced round by round. In the example from the <Link href="/whitepaper" className="text-accent hover:underline">technical paper</Link>, 50,000 ideas can narrow to one priority in roughly seven rounds, with each round happening in parallel rather than sequentially across the whole population. This is the opposite of the United Nations where one person talks at a time.
          </p>

          <h3 className="text-2xl font-bold text-foreground mb-8">How it works</h3>

          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-accent flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-accent">1</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">People submit ideas</h3>
              <p className="text-muted text-sm">The community contributes possible solutions, priorities, or proposals.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-warning flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-warning">2</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Small groups deliberate</h3>
              <p className="text-muted text-sm">Participants are placed into small cells where everyone has space to speak, listen, and weigh trade-offs.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-success flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-success">3</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Strong ideas advance</h3>
              <p className="text-muted text-sm">Each group evaluates a small batch of ideas. The strongest ideas move to the next round.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-[540px] mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-purple flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-purple">4</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Rounds repeat</h3>
              <p className="text-muted text-sm">Surviving ideas face new groups and tougher comparison.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-gold flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-gold">5</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">The community chooses</h3>
              <p className="text-muted text-sm">The final set is presented to the broader group, producing a clear shared priority.</p>
            </div>
          </div>
          <TierTab>strongest ideas advance &mdash; each cell<br />joins with 4 others &mdash; 5 ideas from the<br />previous round are debated and scrutinized</TierTab>
        </div>
      </section>

      {/* ── GAP 2: Tier 2 ── */}
      <VizGap id="gap2" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── WHY IT IS DIFFERENT ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            Why it is different
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Not a poll</h3>
              <p className="text-muted text-sm">People help generate the options, not just choose from a fixed list.</p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Not a town hall</h3>
              <p className="text-muted text-sm">Participation is distributed across many small conversations.</p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Not a popularity contest</h3>
              <p className="text-muted text-sm">Ideas must survive repeated evaluation by different groups.</p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Not a replacement for leadership</h3>
              <p className="text-muted text-sm">It gives leaders a clearer, more legitimate picture of collective judgment.</p>
            </div>
          </div>
          <TierTab>the strongest idea advances &mdash; the pattern repeats<br />each layer distills further and the<br />most collectively durable ideas emerge</TierTab>
        </div>
      </section>

      {/* ── GAP 3: Tier 3 ── */}
      <VizGap id="gap3" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── THE MATH ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            It works at any scale
          </h2>
          <p className="text-muted text-lg mb-10">
            The same process that finds consensus among 25 people can find it among 8 billion.
          </p>
          <div className="flex gap-8 md:gap-10 justify-center mb-10">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold font-mono text-white mb-1">5</div>
              <div className="text-muted text-xs">people per group</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold font-mono text-white mb-1">9</div>
              <div className="text-muted text-xs">rounds for 1 million</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold font-mono text-white mb-1">14</div>
              <div className="text-muted text-xs">rounds for all of humanity</div>
            </div>
          </div>
          <div className="max-w-[400px] mx-auto font-mono text-sm">
            <div className="flex justify-between py-2.5 border-b border-border"><span className="text-muted">25 people</span><span className="text-white font-semibold">2 rounds</span></div>
            <div className="flex justify-between py-2.5 border-b border-border"><span className="text-muted">625 people</span><span className="text-white font-semibold">4 rounds</span></div>
            <div className="flex justify-between py-2.5 border-b border-border"><span className="text-muted">10,000 people</span><span className="text-white font-semibold">6 rounds</span></div>
            <div className="flex justify-between py-2.5 border-t border-white/15 mt-2 pt-4"><span className="text-white font-bold">1,000,000</span><span className="text-purple font-bold">9 rounds</span></div>
            <div className="flex justify-between py-2.5 border-t border-white/15 pt-4"><span className="text-white font-bold">8 billion</span><span className="text-gold font-bold">14 rounds</span></div>
          </div>
          <TierTab>and it repeats until a final 5 remains<br />each tested by every layer<br />no idea wins without surviving real conversation</TierTab>
        </div>
      </section>

      {/* ── GAP 4: Final ── */}
      <VizGap id="gap4" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── VISION ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <p className="font-serif italic text-lg text-foreground/70 leading-[1.8] mb-8">
            &ldquo;Imagine asking a million people: what should we do? Not giving them
            options &mdash; letting them propose. Then watching as, through thousands
            of honest conversations, a single answer surfaces that nobody wrote
            but everyone recognizes. Not a majority outvoting a minority.
            A million people discovering they already agreed.&rdquo;
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
          </div>
          <TierTab>consensus &mdash; not a slim majority<br />but a million conversations arriving at the same answer</TierTab>
        </div>
      </section>

      {/* ── GAP 5: Post-consensus ── */}
      <VizGap id="gap5" colorAbove={HEADER} colorBelow={BG} />

      {/* ── FINAL CTA ── */}
      <section className="relative z-[2] bg-header text-white">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            The question no one could answer before.
          </h2>
          <p className="text-white/60 text-lg mb-8 max-w-[500px] mx-auto">
            What do we collectively agree on? Until now, there was no
            way to ask &mdash; and no way to trust the answer.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/chants" className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Go to Chants
            </Link>
            <Link href="/demo" className="bg-purple hover:bg-purple-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center">
              Demo
            </Link>
            <Link href="/whitepaper" className="bg-gold hover:bg-gold-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Read the Whitepaper
            </Link>
          </div>
        </div>
      </section>

      {/* ── ENTRY ── */}
      <section className="relative z-[2] bg-background border-t border-border">
        <div className="max-w-[800px] mx-auto px-6 py-16 text-center">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup" className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Sign Up
            </Link>
            <Link href="/auth/signin" className="bg-surface hover:bg-surface/80 text-foreground px-8 py-3 rounded-lg font-semibold transition-colors border border-border">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-[2] bg-header text-white/25 py-6">
        <div className="max-w-[800px] mx-auto px-6 text-center text-sm">
          &copy; 2026 Unity Chant LLC. Licensed under the <a href="https://github.com/GalenGoodwick/unionchant/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">Unity Chant License v1.0</a>.
        </div>
      </footer>
    </>
  )
}
