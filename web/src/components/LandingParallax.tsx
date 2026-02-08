'use client'

import { useEffect } from 'react'
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

export default function LandingParallax() {
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

      {/* ── HERO ── */}
      <section className="relative z-[2] bg-header text-white">
        <div className="max-w-[800px] mx-auto px-6 py-24 md:py-28 text-center" style={{ paddingTop: '100px', paddingBottom: '100px' }}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-[1.1] tracking-tight">
            What if a million people<br className="hidden sm:block" /> could actually agree?
          </h1>
          <p className="text-xl text-accent-light font-medium mb-8 font-serif italic opacity-80">
            Direct democracy through small-group deliberation.
          </p>
          <p className="max-w-[560px] mx-auto mb-10 font-serif text-white/70 text-lg leading-relaxed">
            Not a slim majority outvoting a frustrated minority. Not a poll. Not a petition.
            Real consensus&mdash;built through real conversation.
            For organizations, communities, and anyone who needs durable consensus at scale.
          </p>
          <Link href="/demo" className="inline-block bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
            Watch the Demo
          </Link>
          <TierTab>so many individuals &mdash; good ideas flare<br />and are lost to disconnection and chaos</TierTab>
        </div>
      </section>

      {/* ── GAP 0: Pre-tier ── */}
      <VizGap id="gap0" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── THE INSIGHT ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            How? The best conversations<br />happen in small groups
          </h2>
          <p className="text-lg text-subtle leading-relaxed mb-5">
            Think about the best discussions you&apos;ve ever experienced. They
            probably weren&apos;t in a stadium or a comment section. They were
            around a table, with a few people who had time to actually listen.
          </p>
          <p className="text-lg text-subtle leading-relaxed">
            Unity Chant provides this insight and scales it. Instead of putting
            everyone in one noisy room, we create{' '}
            <em className="text-foreground">thousands</em> of small
            conversations happening in parallel&mdash;then connect them
            through a clear, repeatable tournament.
          </p>
          <TierTab>each person writes 1 idea &mdash; they are arranged<br />into cells of 5 people with 5 ideas from others<br />each cell talks and picks a winner</TierTab>
        </div>
      </section>

      {/* ── GAP 1: Tier 1 ── */}
      <VizGap id="gap1" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── HOW IT WORKS ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Three steps to consensus
          </h2>
          <p className="text-muted text-lg mb-10">
            From a million ideas to one answer&mdash;and everyone had a voice.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-accent flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-accent">1</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Everyone submits ideas</h3>
              <p className="text-muted text-sm">Not choosing from a preset list. Everyone proposes their own solution to the question.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-warning flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-warning">2</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Small groups deliberate</h3>
              <p className="text-muted text-sm">Groups of 5 discuss, debate, and vote. Each group picks one winner. Thousands deliberate in parallel.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-success flex items-center justify-center mx-auto mb-4 font-mono text-xl font-bold text-success">3</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Winners advance</h3>
              <p className="text-muted text-sm">Winning ideas enter new groups with other winners. The process repeats until one consensus emerges.</p>
            </div>
          </div>
          <TierTab>winning ideas advance &mdash; each cell<br />joins with 4 others &mdash; 5 ideas from the<br />previous round are debated and scrutinized</TierTab>
        </div>
      </section>

      {/* ── GAP 2: Tier 2 ── */}
      <VizGap id="gap2" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── NOT A POLL ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Not a poll. Not a vote. Deliberation.
          </h2>
          <p className="text-muted text-lg max-w-[560px] mx-auto mb-8">
            Traditional voting counts existing preferences. Unity Chant lets preferences evolve through discussion.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Every voice is heard</h3>
              <p className="text-muted text-sm">In a group of 5, you can&apos;t be drowned out. Your perspective gets genuine consideration.</p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Ideas win on merit</h3>
              <p className="text-muted text-sm">To become consensus, an idea must survive scrutiny from many independent groups.</p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">Decisions evolve</h3>
              <p className="text-muted text-sm">Champions can be challenged. New ideas can dethrone old ones. The collective position updates.</p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6 text-left">
              <h3 className="text-lg font-semibold text-foreground mb-2">A stronger mandate</h3>
              <p className="text-muted text-sm">The winner has been evaluated across multiple contexts. That&apos;s legitimacy based on durability.</p>
            </div>
          </div>
          <TierTab>the winner advances &mdash; the pattern repeats<br />each layer distills further and the<br />most collectively durable ideas emerge</TierTab>
        </div>
      </section>

      {/* ── GAP 3: Tier 3 ── */}
      <VizGap id="gap3" colorAbove={HEADER} colorBelow={HEADER} />

      {/* ── THE MATH ── */}
      <section className="relative z-[2] bg-header">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            The math is remarkable
          </h2>
          <p className="text-muted text-lg mb-10">
            Each tier reduces ideas by 80%. The same process handles 25 people or 8 billion.
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
            &ldquo;Imagine a million people reaching genuine consensus on a difficult issue.
            Not a slim majority outvoting a frustrated minority, but a million individuals
            who each participated in real conversations, heard different perspectives,
            and arrived together at a decision they collectively shaped.
            That is not just a vote count. That is a mandate.
            That is collective will made tangible.&rdquo;
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/whitepaper" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Read the Whitepaper &rarr;
            </Link>
            <Link href="/technical" className="text-muted hover:text-foreground font-medium transition-colors">
              Technical Whitepaper &rarr;
            </Link>
            <Link href="/podiums" className="text-muted hover:text-foreground font-medium transition-colors">
              Read Articles &rarr;
            </Link>
          </div>
          <TierTab>consensus &mdash; not a slim majority<br />but a million conversations arriving at the same answer</TierTab>
        </div>
      </section>

      {/* ── GAP 5: Post-consensus ── */}
      <VizGap id="gap5" colorAbove={HEADER} colorBelow={BG} />

      {/* ── USE CASES ── */}
      <section className="relative z-[2] bg-background">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-10">
            For any group, at any scale
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Organizations</h3>
              <p className="text-muted text-sm">The mailroom clerk&apos;s brilliant insight gets the same fair hearing as the VP&apos;s pet project. Ideas evaluated on merit, not rank.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Communities</h3>
              <p className="text-muted text-sm">Participate from your phone, on your own time. More voices lead to better decisions. No more town halls dominated by the usual few.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Governance</h3>
              <p className="text-muted text-sm">Give citizens a structured way to deliberate on specific issues&mdash;not just vote for representatives every few years.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative z-[2] bg-header text-white">
        <div className="max-w-[800px] mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            The world has never had a tool that could do this.
          </h2>
          <p className="text-white/60 text-lg mb-8 max-w-[500px] mx-auto">
            Good decisions don&apos;t emerge from silence or noise.
            They emerge from conversation&mdash;given the right form.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/chants" className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Go to Chants
            </Link>
            <Link href="/chants/new" className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-lg font-semibold transition-colors border border-white/20">
              Start a Chant
            </Link>
          </div>
        </div>
      </section>

      {/* ── ENTRY OPTIONS ── */}
      <section className="relative z-[2] bg-background border-t border-border">
        <div className="max-w-[800px] mx-auto px-6 py-16 text-center">
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Ready to participate?
          </h3>
          <p className="text-muted mb-8 max-w-[600px] mx-auto">
            Create an account to unlock the full experience, or enter anonymously with zero data collection.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link href="/auth/signup" className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Sign Up (Full Access)
            </Link>
            <Link href="/auth/anonymous" className="bg-surface hover:bg-surface/80 text-foreground px-8 py-3 rounded-lg font-semibold transition-colors border border-border">
              Anonymous Entry
            </Link>
          </div>

          {/* Anonymous Limitations Notice */}
          <div className="bg-warning-bg border border-warning/30 text-warning text-sm p-4 rounded-lg max-w-[600px] mx-auto mb-8">
            <p className="font-semibold mb-2">⚠️ Anonymous Mode Limitations</p>
            <p className="text-xs text-left">
              <strong>Anonymous users cannot access the AI Collective Chat.</strong> The collective chat uses Claude AI (Haiku) which costs money per message. To preserve this free resource for dedicated community members and prevent abuse, anonymous sessions are restricted to voting and idea submission only.
            </p>
          </div>

          {/* Open Source Notice */}
          <div className="text-muted text-sm">
            <p>
              🔓 <strong>Open Source:</strong> Verify our privacy claims and contribute at{' '}
              <a href="https://github.com/GalenGoodwick/unionchant" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline font-mono">
                github.com/GalenGoodwick/unionchant
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-[2] bg-header text-white/25 py-6">
        <div className="max-w-[800px] mx-auto px-6 text-center text-sm">
          &copy; 2026 Unity Chant LLC. Licensed under the <a href="https://github.com/GalenGoodwick/unionchant/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">Union Chant License v1.0</a>.
        </div>
      </footer>
    </>
  )
}
