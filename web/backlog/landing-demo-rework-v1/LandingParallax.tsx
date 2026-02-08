'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { BG, GOLD, isMobile, clearBg } from '@/lib/canvas-engine'

// ── Colors ──
const HEADER = '#020617'
const PALETTE = ['#22d3ee', '#f97316', '#fb7185', '#eab308', '#a78bfa', '#34d399']
const CYAN = '#22d3ee'
const ORANGE = '#f97316'
const MUTED_COLOR = '#475569'
const GOLD_COLOR = '#fbbf24'

// ── Shared dot type ──
interface Dot {
  x: number; y: number; vx: number; vy: number; r: number
  color: string; flare: number; nextFlare: number
  // for convergence
  group?: number; role?: 'gold' | 'dim' | 'stay'
  originX?: number; originY?: number
}

// ── Gap IDs ──
const GAP_IDS = ['gap0', 'gap1', 'gap2', 'gap3', 'gap4', 'gap5']
const GAP_COLORS: [string, string][] = [
  [HEADER, HEADER], [HEADER, HEADER], [HEADER, HEADER],
  [HEADER, HEADER], [HEADER, HEADER], [HEADER, BG],
]

// ═══════════════════════════════════════════════════════════════
// CANVAS 0 — NOISE (after Hero)
// Hundreds of dots, each a different warm color, flaring randomly.
// Beautiful chaos. No connection.
// ═══════════════════════════════════════════════════════════════

interface NoiseState { dots: Dot[] }

function createNoise(W: number, H: number): NoiseState {
  const count = W < 768 ? 300 : 600
  const dots: Dot[] = []
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: 1.8 + Math.random() * 1.4,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      flare: 0, nextFlare: 0.5 + Math.random() * 3,
    })
  }
  return { dots }
}

function updateNoise(s: NoiseState, W: number, H: number, dt: number) {
  for (const d of s.dots) {
    d.x += d.vx; d.y += d.vy
    if (d.x < -5) d.x = W + 5; if (d.x > W + 5) d.x = -5
    if (d.y < -5) d.y = H + 5; if (d.y > H + 5) d.y = -5
    d.vx += (Math.random() - 0.5) * 0.02; d.vy += (Math.random() - 0.5) * 0.02
    d.vx *= 0.995; d.vy *= 0.995
    if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 2)
    else { d.nextFlare -= dt; if (d.nextFlare <= 0) { d.flare = 1; d.nextFlare = 0.5 + Math.random() * 3 } }
  }
}

function drawNoise(ctx: CanvasRenderingContext2D, s: NoiseState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  for (const d of s.dots) {
    const f = d.flare
    const radius = d.r * (1 + f * 0.5)
    if (!mobile && f > 0.3) { ctx.shadowColor = d.color; ctx.shadowBlur = radius * 4 * f }
    ctx.beginPath()
    ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
    if (f > 0) {
      const t = f * 0.7
      ctx.fillStyle = `rgba(255,255,255,${t})`
      ctx.fill()
      ctx.globalAlpha = 1 - t
      ctx.beginPath()
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = d.color
      ctx.fill()
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = d.color
      ctx.fill()
    }
    ctx.shadowBlur = 0
  }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 1 — CONVERSATIONS (after Insight)
// Clusters of 5 dots orbiting shared invisible centers. No outlines.
// Each cluster pulses independently. Intimate, alive.
// ═══════════════════════════════════════════════════════════════

interface ConvCluster { cx: number; cy: number; phase: number; breathPhase: number; active: boolean }
interface ConvState { clusters: ConvCluster[]; dots: Dot[] }

function createConversations(W: number, H: number): ConvState {
  const count = W < 768 ? 20 : 40
  const cols = Math.ceil(Math.sqrt(count * (W / H)))
  const rows = Math.ceil(count / cols)
  const spacingX = W / (cols + 1)
  const spacingY = H / (rows + 1)
  const clusters: ConvCluster[] = []
  const dots: Dot[] = []

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = spacingX * (col + 1) + (Math.random() - 0.5) * spacingX * 0.3
    const cy = spacingY * (row + 1) + (Math.random() - 0.5) * spacingY * 0.3
    const active = Math.random() < 0.3
    const phase = Math.random() * Math.PI * 2
    const breathPhase = Math.random() * Math.PI * 2
    clusters.push({ cx, cy, phase, breathPhase, active })

    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * 2 * j) / 5 + phase
      const orbitR = 12 + Math.random() * 4
      dots.push({
        x: cx + Math.cos(angle) * orbitR,
        y: cy + Math.sin(angle) * orbitR,
        vx: 0, vy: 0,
        r: active ? 2.5 : 2,
        color: CYAN,
        flare: 0, nextFlare: active ? 2 + Math.random() * 4 : 5 + Math.random() * 10,
        group: i,
      })
    }
  }
  return { clusters, dots }
}

function updateConversations(s: ConvState, dt: number, time: number) {
  for (let i = 0; i < s.clusters.length; i++) {
    const c = s.clusters[i]
    const breathR = 12 + Math.sin(time * 0.8 + c.breathPhase) * 3
    const orbitSpeed = c.active ? 0.4 : 0.2
    for (let j = 0; j < 5; j++) {
      const d = s.dots[i * 5 + j]
      const angle = (Math.PI * 2 * j) / 5 + c.phase + time * orbitSpeed
      d.x = c.cx + Math.cos(angle) * breathR
      d.y = c.cy + Math.sin(angle) * breathR
      if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 2)
      else { d.nextFlare -= dt; if (d.nextFlare <= 0) { d.flare = 1; d.nextFlare = c.active ? 2 + Math.random() * 4 : 6 + Math.random() * 10 } }
    }
  }
}

function drawConversations(ctx: CanvasRenderingContext2D, s: ConvState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  for (let i = 0; i < s.clusters.length; i++) {
    const c = s.clusters[i]
    // Subtle glow for active clusters
    if (!mobile && c.active) {
      const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, 25)
      grad.addColorStop(0, 'rgba(34,211,238,0.06)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(c.cx - 25, c.cy - 25, 50, 50)
    }
    for (let j = 0; j < 5; j++) {
      const d = s.dots[i * 5 + j]
      const f = d.flare
      const radius = d.r * (1 + f * 0.4)
      if (!mobile && f > 0.3) { ctx.shadowColor = ORANGE; ctx.shadowBlur = radius * 4 * f }
      ctx.beginPath()
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = f > 0 ? ORANGE : (c.active ? '#34eeff' : CYAN)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 2 — SUBMISSION (after How It Works)
// Wave sweeps across, dots flash orange as they "submit" ideas,
// ideas flow upward to a center ball that grows.
// ═══════════════════════════════════════════════════════════════

interface SubDot { x: number; y: number; r: number; submitted: boolean; flare: number; submitT: number }
interface SubIdea { x: number; y: number; startX: number; startY: number; targetX: number; targetY: number; progress: number }
interface SubState { dots: SubDot[]; ideas: SubIdea[]; waveX: number; waveComplete: boolean; ballX: number; ballY: number; arrivedCount: number }

function createSubmission(W: number, H: number): SubState {
  const dots: SubDot[] = []
  const cols = W < 768 ? 25 : 40
  const rows = W < 768 ? 15 : 25
  const spacingX = (W - 40) / cols
  const spacingY = (H * 0.5) / rows
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    dots.push({
      x: 20 + col * spacingX + spacingX / 2,
      y: H * 0.35 + row * spacingY + spacingY / 2,
      r: 1.8, submitted: false, flare: 0, submitT: 0,
    })
  }
  return { dots, ideas: [], waveX: -50, waveComplete: false, ballX: W / 2, ballY: H * 0.12, arrivedCount: 0 }
}

function updateSubmission(s: SubState, W: number, H: number, dt: number) {
  if (!s.waveComplete) {
    s.waveX += 280 * dt
    if (s.waveX > W + H) s.waveComplete = true
  }
  for (const d of s.dots) {
    if (!d.submitted) {
      const wavePos = d.x + (d.y - H * 0.35) * 0.5
      if (s.waveX > wavePos) {
        d.submitted = true; d.submitT = 0; d.flare = 1
        s.ideas.push({
          x: d.x, y: d.y,
          startX: d.x, startY: d.y,
          targetX: s.ballX + (Math.random() - 0.5) * 4,
          targetY: s.ballY + (Math.random() - 0.5) * 4,
          progress: 0,
        })
      }
    }
    if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 2)
    if (d.submitted) d.submitT += dt
  }
  for (const idea of s.ideas) {
    if (idea.progress >= 1) continue
    idea.progress += dt * 1.2
    const p = idea.progress < 0.5 ? 2 * idea.progress * idea.progress : 1 - Math.pow(-2 * idea.progress + 2, 2) / 2
    const t = Math.min(1, p)
    idea.x = idea.startX + (idea.targetX - idea.startX) * t
    idea.y = idea.startY + (idea.targetY - idea.startY) * t
    if (idea.progress >= 1) s.arrivedCount++
  }
}

function drawSubmission(ctx: CanvasRenderingContext2D, s: SubState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  for (const d of s.dots) {
    const opacity = d.submitted ? Math.max(0.15, 1 - d.submitT * 0.5) : 0.6
    ctx.globalAlpha = opacity
    if (d.flare > 0) {
      if (!mobile) { ctx.shadowColor = ORANGE; ctx.shadowBlur = 8 * d.flare }
      ctx.fillStyle = ORANGE
    } else {
      ctx.fillStyle = d.submitted ? MUTED_COLOR : CYAN
    }
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.globalAlpha = 1
  for (const idea of s.ideas) {
    if (idea.progress >= 1) continue
    if (!mobile) { ctx.shadowColor = ORANGE; ctx.shadowBlur = 4 }
    ctx.beginPath(); ctx.arc(idea.x, idea.y, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = ORANGE; ctx.fill(); ctx.shadowBlur = 0
  }
  if (s.arrivedCount > 0) {
    const r = 4 + Math.sqrt(s.arrivedCount) * 0.8
    const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.05
    if (!mobile) { ctx.shadowColor = ORANGE; ctx.shadowBlur = r * 1.5 }
    ctx.beginPath(); ctx.arc(s.ballX, s.ballY, r * pulse, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(s.ballX, s.ballY, 0, s.ballX, s.ballY, r * pulse)
    grad.addColorStop(0, 'rgba(249,115,22,0.9)')
    grad.addColorStop(0.6, 'rgba(249,115,22,0.6)')
    grad.addColorStop(1, 'rgba(249,115,22,0.15)')
    ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0
  }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 3 — DELIBERATION (after Not A Poll)
// Groups of 5 actively discussing. Some glow brighter (active).
// Dots within active groups orbit tighter, ideas spark between them.
// ═══════════════════════════════════════════════════════════════

interface DelibCluster { cx: number; cy: number; phase: number; intensity: number; breathPhase: number }
interface DelibSpark { x: number; y: number; tx: number; ty: number; progress: number; life: number }
interface DelibState { clusters: DelibCluster[]; dots: Dot[]; sparks: DelibSpark[]; time: number }

function createDelib(W: number, H: number): DelibState {
  const count = W < 768 ? 25 : 50
  const cols = Math.ceil(Math.sqrt(count * (W / H)))
  const rows = Math.ceil(count / cols)
  const spacingX = W / (cols + 1)
  const spacingY = H / (rows + 1)
  const clusters: DelibCluster[] = []
  const dots: Dot[] = []

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = spacingX * (col + 1) + (Math.random() - 0.5) * spacingX * 0.25
    const cy = spacingY * (row + 1) + (Math.random() - 0.5) * spacingY * 0.25
    const intensity = 0.3 + Math.random() * 0.7 // how active this group is
    clusters.push({ cx, cy, phase: Math.random() * Math.PI * 2, intensity, breathPhase: Math.random() * Math.PI * 2 })
    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * 2 * j) / 5 + clusters[i].phase
      const orbitR = 10 + Math.random() * 3
      dots.push({
        x: cx + Math.cos(angle) * orbitR,
        y: cy + Math.sin(angle) * orbitR,
        vx: 0, vy: 0, r: 2, color: CYAN,
        flare: 0, nextFlare: 3 + Math.random() * 5,
        group: i,
      })
    }
  }
  return { clusters, dots, sparks: [], time: 0 }
}

function updateDelib(s: DelibState, dt: number) {
  s.time += dt
  for (let i = 0; i < s.clusters.length; i++) {
    const c = s.clusters[i]
    const orbitR = 10 + Math.sin(s.time * 0.6 + c.breathPhase) * (3 * c.intensity)
    const speed = 0.3 + c.intensity * 0.5
    for (let j = 0; j < 5; j++) {
      const d = s.dots[i * 5 + j]
      const angle = (Math.PI * 2 * j) / 5 + c.phase + s.time * speed
      d.x = c.cx + Math.cos(angle) * orbitR
      d.y = c.cy + Math.sin(angle) * orbitR
      if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 2)
      else { d.nextFlare -= dt; if (d.nextFlare <= 0) { d.flare = 1; d.nextFlare = 2 + Math.random() * (6 / c.intensity) } }
    }
    // Occasionally spawn a spark between two dots in the same cluster
    if (Math.random() < dt * c.intensity * 0.5) {
      const a = i * 5 + Math.floor(Math.random() * 5)
      const b = i * 5 + Math.floor(Math.random() * 5)
      if (a !== b) {
        s.sparks.push({
          x: s.dots[a].x, y: s.dots[a].y,
          tx: s.dots[b].x, ty: s.dots[b].y,
          progress: 0, life: 0.4 + Math.random() * 0.3,
        })
      }
    }
  }
  // Update sparks
  for (const sp of s.sparks) sp.progress += dt / sp.life
  s.sparks = s.sparks.filter(sp => sp.progress < 1)
}

function drawDelib(ctx: CanvasRenderingContext2D, s: DelibState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  // Glows for active clusters
  if (!mobile) {
    for (const c of s.clusters) {
      if (c.intensity > 0.5) {
        const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, 20 + c.intensity * 10)
        grad.addColorStop(0, `rgba(34,211,238,${c.intensity * 0.06})`)
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(c.cx, c.cy, 20 + c.intensity * 10, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  // Sparks
  for (const sp of s.sparks) {
    const alpha = 1 - sp.progress
    const t = sp.progress
    const x = sp.x + (sp.tx - sp.x) * t
    const y = sp.y + (sp.ty - sp.y) * t
    ctx.globalAlpha = alpha * 0.6
    if (!mobile) { ctx.shadowColor = '#eab308'; ctx.shadowBlur = 4 }
    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#eab308'; ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.globalAlpha = 1
  // Dots
  for (let i = 0; i < s.clusters.length; i++) {
    const c = s.clusters[i]
    for (let j = 0; j < 5; j++) {
      const d = s.dots[i * 5 + j]
      const f = d.flare
      const radius = d.r * (1 + f * 0.4) * (0.9 + c.intensity * 0.2)
      if (!mobile && f > 0.3) { ctx.shadowColor = ORANGE; ctx.shadowBlur = radius * 3 * f }
      ctx.beginPath(); ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = f > 0 ? ORANGE : CYAN
      ctx.fill(); ctx.shadowBlur = 0
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 4 — FILTERING (after The Math)
// Multiple layers of groups. Some dots turn gold and rise,
// others dim. Shows the logarithmic tier reduction.
// ═══════════════════════════════════════════════════════════════

interface FilterGroup { cx: number; cy: number; winnerIdx: number; phase: number }
interface FilterDot { x: number; y: number; r: number; groupIdx: number; dotIdx: number; isWinner: boolean; goldProgress: number; dimProgress: number; originX: number; originY: number }
interface FilterState { groups: FilterGroup[]; dots: FilterDot[]; elapsed: number }

function createFilter(W: number, H: number): FilterState {
  const count = W < 768 ? 20 : 45
  const cols = Math.ceil(Math.sqrt(count * (W / H)))
  const rows = Math.ceil(count / cols)
  const spacingX = W / (cols + 1)
  const spacingY = H / (rows + 1)
  const groups: FilterGroup[] = []
  const dots: FilterDot[] = []

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = spacingX * (col + 1) + (Math.random() - 0.5) * spacingX * 0.2
    const cy = spacingY * (row + 1) + (Math.random() - 0.5) * spacingY * 0.2
    const winnerIdx = Math.floor(Math.random() * 5)
    groups.push({ cx, cy, winnerIdx, phase: Math.random() * Math.PI * 2 })
    for (let j = 0; j < 5; j++) {
      const angle = (Math.PI * 2 * j) / 5 - Math.PI / 2 + groups[i].phase
      const orbitR = 11
      const x = cx + Math.cos(angle) * orbitR
      const y = cy + Math.sin(angle) * orbitR
      dots.push({
        x, y, r: 2, groupIdx: i, dotIdx: j,
        isWinner: j === winnerIdx,
        goldProgress: 0, dimProgress: 0,
        originX: x, originY: y,
      })
    }
  }
  return { groups, dots, elapsed: 0 }
}

function updateFilter(s: FilterState, dt: number, time: number) {
  s.elapsed += dt
  // Cycle: 0-2s orbit, 2-5s winners glow + losers fade, 5-7s winners rise, 7-8s reset
  const cycle = s.elapsed % 8
  for (const d of s.dots) {
    const g = s.groups[d.groupIdx]
    const angle = (Math.PI * 2 * d.dotIdx) / 5 - Math.PI / 2 + g.phase + time * 0.2
    const orbitR = 11

    if (cycle < 2) {
      // Orbiting phase
      d.x = g.cx + Math.cos(angle) * orbitR
      d.y = g.cy + Math.sin(angle) * orbitR
      d.goldProgress = 0; d.dimProgress = 0
    } else if (cycle < 5) {
      // Winners glow, losers fade
      const t = (cycle - 2) / 3
      d.x = g.cx + Math.cos(angle) * orbitR
      d.y = g.cy + Math.sin(angle) * orbitR
      if (d.isWinner) d.goldProgress = Math.min(1, t * 1.5)
      else d.dimProgress = Math.min(1, t)
    } else if (cycle < 7) {
      // Winners drift upward
      const t = (cycle - 5) / 2
      if (d.isWinner) {
        d.x = g.cx + Math.cos(angle) * orbitR
        d.y = g.cy + Math.sin(angle) * orbitR - t * 15
        d.goldProgress = 1
      } else {
        d.x = g.cx + Math.cos(angle) * orbitR
        d.y = g.cy + Math.sin(angle) * orbitR
        d.dimProgress = 1
      }
    } else {
      // Reset (fade back)
      const t = (cycle - 7) / 1
      d.x = g.cx + Math.cos(angle) * orbitR
      d.y = g.cy + Math.sin(angle) * orbitR
      d.goldProgress = d.isWinner ? 1 - t : 0
      d.dimProgress = d.isWinner ? 0 : 1 - t
    }
  }
}

function drawFilter(ctx: CanvasRenderingContext2D, s: FilterState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  for (const d of s.dots) {
    if (d.dimProgress > 0.9 && !d.isWinner) { ctx.globalAlpha = 0.15 }
    else if (d.dimProgress > 0) { ctx.globalAlpha = 1 - d.dimProgress * 0.85 }
    else { ctx.globalAlpha = 1 }

    const radius = d.r * (1 + d.goldProgress * 0.3)
    if (!mobile && d.goldProgress > 0.3) {
      ctx.shadowColor = GOLD_COLOR; ctx.shadowBlur = 6 + d.goldProgress * 8
    }
    ctx.beginPath(); ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
    if (d.goldProgress > 0) {
      // Lerp from cyan to gold
      const t = d.goldProgress
      const r = Math.round(34 + (251 - 34) * t)
      const g = Math.round(211 + (191 - 211) * t)
      const b = Math.round(238 + (36 - 238) * t)
      ctx.fillStyle = `rgb(${r},${g},${b})`
    } else if (d.dimProgress > 0) {
      ctx.fillStyle = MUTED_COLOR
    } else {
      ctx.fillStyle = CYAN
    }
    ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1
  }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 5 — CONVERGENCE (after Vision)
// Gold dots drift toward a warm center glow. Others dim.
// Consensus. Unity. 8-second cycle.
// ═══════════════════════════════════════════════════════════════

interface ConvDot {
  x: number; y: number; r: number; originX: number; originY: number
  role: 'gold' | 'dim' | 'stay'; phase: number; speed: number
}
interface ConvergenceState { dots: ConvDot[]; elapsed: number; centerX: number; centerY: number }

function createConvergence(W: number, H: number): ConvergenceState {
  const count = W < 768 ? 200 : 500
  const dots: ConvDot[] = []
  for (let i = 0; i < count; i++) {
    const x = Math.random() * W
    const y = Math.random() * H
    const roll = Math.random()
    const role: 'gold' | 'dim' | 'stay' = roll < 0.2 ? 'gold' : roll < 0.8 ? 'dim' : 'stay'
    dots.push({
      x, y, r: 1.8 + Math.random() * 1,
      originX: x, originY: y,
      role, phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5,
    })
  }
  return { dots, elapsed: 0, centerX: W / 2, centerY: H / 2 }
}

function updateConvergence(s: ConvergenceState, W: number, H: number, dt: number) {
  s.elapsed += dt
  const cycle = s.elapsed % 8
  for (const d of s.dots) {
    if (cycle < 6) {
      // Main phase: gold drifts to center, dim slows, stay holds
      const t = Math.min(1, cycle / 5)
      if (d.role === 'gold') {
        d.x = d.originX + (s.centerX - d.originX) * t * 0.7
        d.y = d.originY + (s.centerY - d.originY) * t * 0.7
      } else if (d.role === 'dim') {
        // gentle drift
        d.x = d.originX + Math.sin(s.elapsed * d.speed + d.phase) * 3
        d.y = d.originY + Math.cos(s.elapsed * d.speed * 0.7 + d.phase) * 3
      } else {
        d.x = d.originX + Math.sin(s.elapsed * 0.3 + d.phase) * 2
        d.y = d.originY + Math.cos(s.elapsed * 0.3 + d.phase) * 2
      }
    } else {
      // Reset phase: drift back
      const t = (cycle - 6) / 2
      const curX = d.x; const curY = d.y
      d.x = curX + (d.originX - curX) * t * 0.1
      d.y = curY + (d.originY - curY) * t * 0.1
    }
  }
}

function drawConvergence(ctx: CanvasRenderingContext2D, s: ConvergenceState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  const cycle = s.elapsed % 8
  const glowIntensity = cycle < 5 ? Math.min(1, cycle / 4) : Math.max(0, 1 - (cycle - 5) / 3)

  // Center glow
  if (!mobile && glowIntensity > 0.1) {
    const grad = ctx.createRadialGradient(s.centerX, s.centerY, 0, s.centerX, s.centerY, 80 + glowIntensity * 60)
    grad.addColorStop(0, `rgba(251,191,36,${glowIntensity * 0.2})`)
    grad.addColorStop(0.5, `rgba(251,191,36,${glowIntensity * 0.08})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(s.centerX, s.centerY, 80 + glowIntensity * 60, 0, Math.PI * 2); ctx.fill()
  }

  for (const d of s.dots) {
    const convergenceT = cycle < 5 ? Math.min(1, cycle / 4) : Math.max(0, 1 - (cycle - 5) / 3)
    if (d.role === 'gold') {
      const radius = d.r * (1 + convergenceT * 0.3)
      if (!mobile) { ctx.shadowColor = GOLD_COLOR; ctx.shadowBlur = 4 + convergenceT * 6 }
      ctx.beginPath(); ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = GOLD_COLOR; ctx.fill()
      ctx.shadowBlur = 0
    } else if (d.role === 'dim') {
      ctx.globalAlpha = 1 - convergenceT * 0.7
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = MUTED_COLOR; ctx.fill()
      ctx.globalAlpha = 1
    } else {
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fillStyle = CYAN; ctx.fill()
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PARALLAX INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════

type CanvasState =
  | { type: 0; state: NoiseState }
  | { type: 1; state: ConvState }
  | { type: 2; state: SubState }
  | { type: 3; state: DelibState }
  | { type: 4; state: FilterState }
  | { type: 5; state: ConvergenceState }

function createScene(idx: number, W: number, H: number): CanvasState {
  switch (idx) {
    case 0: return { type: 0, state: createNoise(W, H) }
    case 1: return { type: 1, state: createConversations(W, H) }
    case 2: return { type: 2, state: createSubmission(W, H) }
    case 3: return { type: 3, state: createDelib(W, H) }
    case 4: return { type: 4, state: createFilter(W, H) }
    case 5: return { type: 5, state: createConvergence(W, H) }
    default: return { type: 0, state: createNoise(W, H) }
  }
}

function updateCanvas(cs: CanvasState, W: number, H: number, dt: number, time: number) {
  switch (cs.type) {
    case 0: updateNoise(cs.state, W, H, dt); break
    case 1: updateConversations(cs.state, dt, time); break
    case 2: updateSubmission(cs.state, W, H, dt); break
    case 3: updateDelib(cs.state, dt); break
    case 4: updateFilter(cs.state, dt, time); break
    case 5: updateConvergence(cs.state, W, H, dt); break
  }
}

function drawCanvas(ctx: CanvasRenderingContext2D, cs: CanvasState, W: number, H: number) {
  switch (cs.type) {
    case 0: drawNoise(ctx, cs.state, W, H); break
    case 1: drawConversations(ctx, cs.state, W, H); break
    case 2: drawSubmission(ctx, cs.state, W, H); break
    case 3: drawDelib(ctx, cs.state, W, H); break
    case 4: drawFilter(ctx, cs.state, W, H); break
    case 5: drawConvergence(ctx, cs.state, W, H); break
  }
}

// ── Viz Gap component ──
function VizGap({ id, colorAbove, colorBelow }: { id: string; colorAbove: string; colorBelow: string }) {
  return (
    <div className="lp-viz-gap" id={id} style={{ '--color-above': colorAbove, '--color-below': colorBelow, position: 'relative', overflow: 'hidden', zIndex: 1, height: '500px' } as React.CSSProperties}>
      <canvas id={`canvas-${id}`} style={{ position: 'absolute', top: '-25%', left: 0, width: '100%', height: '150%' }} />
    </div>
  )
}

export default function LandingParallax() {
  useEffect(() => {
    const scenes: { cs: CanvasState; ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement; gap: HTMLElement; W: number; H: number }[] = []

    for (let i = 0; i < GAP_IDS.length; i++) {
      const id = GAP_IDS[i]
      const canvas = document.getElementById(`canvas-${id}`) as HTMLCanvasElement
      const gap = document.getElementById(id) as HTMLElement
      if (!canvas || !gap) continue
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      const r = gap.getBoundingClientRect()
      const W = Math.ceil(r.width)
      const H = Math.ceil(r.height * 1.5)
      canvas.width = W; canvas.height = H

      scenes.push({ cs: createScene(i, W, H), ctx, canvas, gap, W, H })
    }

    if (!scenes.length) return

    // Visibility tracking
    const vis = new Array(scenes.length).fill(true)
    const gapEls = scenes.map(s => s.gap)
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { const i = gapEls.indexOf(e.target as HTMLElement); if (i >= 0) vis[i] = e.isIntersecting })
    }, { rootMargin: '100px' })
    gapEls.forEach(g => obs.observe(g))

    // Parallax scroll
    function onScroll() {
      for (const s of scenes) {
        const rect = s.gap.getBoundingClientRect()
        const offset = rect.top * -0.25
        s.canvas.style.transform = `translate3d(0,${offset}px,0)`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    // Resize
    function onResize() {
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i]
        const r = s.gap.getBoundingClientRect()
        s.W = Math.ceil(r.width)
        s.H = Math.ceil(r.height * 1.5)
        s.canvas.width = s.W; s.canvas.height = s.H
        s.cs = createScene(i, s.W, s.H)
      }
    }
    window.addEventListener('resize', onResize)

    // Animation loop
    let last = 0
    let time = 0
    let raf: number
    function loop(ts: number) {
      const dt = Math.min((ts - last) / 1000, 0.05); last = ts; time += dt
      for (let i = 0; i < scenes.length; i++) {
        if (!vis[i]) continue
        const s = scenes[i]
        updateCanvas(s.cs, s.W, s.H, dt, time)
        drawCanvas(s.ctx, s.cs, s.W, s.H)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
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
        @media (max-width: 640px) { .lp-viz-gap { height: 350px; } }
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
        </div>
      </section>

      {/* ── GAP 0: Noise ── */}
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
            through a clear, repeatable process.
          </p>
        </div>
      </section>

      {/* ── GAP 1: Conversations ── */}
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
        </div>
      </section>

      {/* ── GAP 2: Submission ── */}
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
        </div>
      </section>

      {/* ── GAP 3: Deliberation ── */}
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
        </div>
      </section>

      {/* ── GAP 4: Filtering ── */}
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
        </div>
      </section>

      {/* ── GAP 5: Convergence ── */}
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

      {/* ── FOOTER ── */}
      <footer className="relative z-[2] bg-header text-white/25 py-6">
        <div className="max-w-[800px] mx-auto px-6 text-center text-sm">
          &copy; 2026 Unity Chant LLC. All rights reserved.
        </div>
      </footer>
    </>
  )
}
