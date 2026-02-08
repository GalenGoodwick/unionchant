'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import Link from 'next/link'
import {
  BG, ACCENT, MUTED, SUCCESS, WARNING, GOLD, BORDER,
  lerp, easeInOut, makeCD,
  buildLayout, SceneState, updateScene, drawScene, clearBg, isMobile,
  computeGridPositions, drawPoly,
} from '@/lib/canvas-engine'

// ── Constants ─────────────────────────────────────────────────────
const TOTAL_STEPS = 8
const CYAN = '#22d3ee'
const ORANGE = '#f97316'
const ROSE = '#fb7185'
const AMBER = '#eab308'
const PURPLE = '#a78bfa'
const GREEN = '#34d399'
const GOLD_COLOR = '#fbbf24'
const MUTED_COLOR = '#475569'

// 5 faction colors (no red, no blue)
const FACTIONS = [GREEN, ORANGE, ROSE, AMBER, PURPLE]

const STEP_TITLES = [
  'The Movement',
  'So Many Ideas',
  'Conflict',
  'Small Groups',
  'Deliberation',
  'Winners Rise',
  'It Repeats',
  'Consensus',
]

const STEP_TEXT = [
  'A movement. 1,000 people who all care about the same cause \u2014 but can\'t agree on what to do next.',
  'Someone asks: what should we focus on? Everyone submits their honest answer.',
  'Five strategies emerge. Each camp is certain theirs is right. Sound familiar?',
  'What if instead of shouting, they sat down in groups of 5 and actually talked?',
  '200 cells, each with 5 ideas from 5 perspectives. They discuss. They vote.',
  'Each cell picks one winner. 800 ideas eliminated. 200 survive.',
  'Winners enter new groups with fresh eyes. The pattern repeats \u2014 each layer sharpens.',
  'Consensus. Not a majority. Not a decree. A thousand conversations arriving at the same answer.',
]

const STEP_STATS: { big: string; sub: string; color: string }[] = [
  { big: '1,000', sub: 'people, one cause', color: CYAN },
  { big: '1,000', sub: 'ideas submitted', color: ORANGE },
  { big: '5', sub: 'strategies, no agreement', color: ROSE },
  { big: '200', sub: 'groups of 5', color: CYAN },
  { big: '200', sub: 'cells deliberating', color: AMBER },
  { big: '200', sub: 'winners advance', color: GOLD },
  { big: '40 \u2192 8', sub: 'each tier sharpens', color: CYAN },
  { big: '1', sub: 'consensus', color: GOLD },
]

// ── Shared utilities ──────────────────────────────────────────────
function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}
function colorLerp(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a), [br, bg, bb] = hexRgb(b)
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`
}

// ═══════════════════════════════════════════════════════════════
// STEP 0 — THE MOVEMENT
// 1000 teal dots drifting aimlessly. Occasional orange flares.
// United but directionless.
// ═══════════════════════════════════════════════════════════════

interface MoveDot {
  x: number; y: number; vx: number; vy: number; r: number
  flare: number; nextFlare: number
  faction?: number // assigned later for conflict step
}

function createMovement(W: number, H: number): MoveDot[] {
  const count = W < 768 ? 400 : 1000
  const dots: MoveDot[] = []
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: 1.8 + Math.random() * 1,
      flare: 0, nextFlare: 3 + Math.random() * 8,
      faction: i % 5,
    })
  }
  return dots
}

function updateMovement(dots: MoveDot[], W: number, H: number, dt: number) {
  for (const d of dots) {
    d.x += d.vx; d.y += d.vy
    if (d.x < -5) d.x = W + 5; if (d.x > W + 5) d.x = -5
    if (d.y < -5) d.y = H + 5; if (d.y > H + 5) d.y = -5
    d.vx += (Math.random() - 0.5) * 0.02; d.vy += (Math.random() - 0.5) * 0.02
    d.vx *= 0.995; d.vy *= 0.995
    if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 1.5)
    else { d.nextFlare -= dt; if (d.nextFlare <= 0) { d.flare = 1; d.nextFlare = 3 + Math.random() * 8 } }
  }
}

function drawMovement(ctx: CanvasRenderingContext2D, dots: MoveDot[], W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  for (const d of dots) {
    const f = d.flare
    const radius = d.r * (1 + f * 0.4)
    if (!mobile && f > 0.3) { ctx.shadowColor = ORANGE; ctx.shadowBlur = radius * 3 * f }
    ctx.beginPath()
    ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = f > 0 ? colorLerp(CYAN, '#ffffff', f * 0.5) : CYAN
    ctx.fill()
    ctx.shadowBlur = 0
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 1 — SO MANY IDEAS
// Wave of submissions, dots flash orange. Ideas flow to center ball.
// ═══════════════════════════════════════════════════════════════

interface SubmitDot { x: number; y: number; r: number; submitted: boolean; flare: number; submitT: number }
interface IdeaDot { x: number; y: number; startX: number; startY: number; targetX: number; targetY: number; progress: number }
interface SubmitState { dots: SubmitDot[]; ideas: IdeaDot[]; waveX: number; waveComplete: boolean; ballX: number; ballY: number; arrivedCount: number }

function createSubmitState(W: number, H: number): SubmitState {
  const dots: SubmitDot[] = []
  const cols = W < 768 ? 25 : 40
  const rows = 25
  const spacingX = (W - 40) / cols
  const spacingY = ((H * 0.55)) / rows
  for (let i = 0; i < 1000; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    dots.push({
      x: 20 + col * spacingX + spacingX / 2,
      y: H * 0.3 + row * spacingY + spacingY / 2,
      r: 1.8, submitted: false, flare: 0, submitT: 0,
    })
  }
  return { dots, ideas: [], waveX: -50, waveComplete: false, ballX: W / 2, ballY: H * 0.13, arrivedCount: 0 }
}

function updateSubmit(state: SubmitState, W: number, H: number, dt: number) {
  if (!state.waveComplete) {
    state.waveX += 300 * dt
    if (state.waveX > W + H) state.waveComplete = true
  }
  for (const d of state.dots) {
    if (!d.submitted) {
      const wavePos = d.x + (d.y - H * 0.3) * 0.5
      if (state.waveX > wavePos) {
        d.submitted = true; d.submitT = 0; d.flare = 1
        state.ideas.push({
          x: d.x, y: d.y,
          startX: d.x, startY: d.y,
          targetX: state.ballX + (Math.random() - 0.5) * 4,
          targetY: state.ballY + (Math.random() - 0.5) * 4,
          progress: 0,
        })
      }
    }
    if (d.flare > 0) d.flare = Math.max(0, d.flare - dt * 2)
    if (d.submitted) d.submitT += dt
  }
  for (const idea of state.ideas) {
    if (idea.progress >= 1) continue
    idea.progress += dt * 1.2
    const p = easeInOut(Math.min(1, idea.progress))
    idea.x = lerp(idea.startX, idea.targetX, p)
    idea.y = lerp(idea.startY, idea.targetY, p)
    if (idea.progress >= 1) state.arrivedCount++
  }
}

function drawSubmit(ctx: CanvasRenderingContext2D, state: SubmitState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  for (const d of state.dots) {
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
  for (const idea of state.ideas) {
    if (idea.progress >= 1) continue
    if (!mobile) { ctx.shadowColor = ORANGE; ctx.shadowBlur = 4 }
    ctx.beginPath(); ctx.arc(idea.x, idea.y, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = ORANGE; ctx.fill(); ctx.shadowBlur = 0
  }
  if (state.arrivedCount > 0) {
    const r = 5 + Math.sqrt(state.arrivedCount) * 1.2
    const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.05
    if (!mobile) { ctx.shadowColor = ORANGE; ctx.shadowBlur = r * 1.5 }
    ctx.beginPath(); ctx.arc(state.ballX, state.ballY, r * pulse, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(state.ballX, state.ballY, 0, state.ballX, state.ballY, r * pulse)
    grad.addColorStop(0, 'rgba(249,115,22,0.9)')
    grad.addColorStop(0.6, 'rgba(249,115,22,0.6)')
    grad.addColorStop(1, 'rgba(249,115,22,0.15)')
    ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — CONFLICT
// Dots separate into 5 colored factions in 5 zones.
// Agitation at borders. Faint pulsing dividing lines.
// ═══════════════════════════════════════════════════════════════

interface ConflictDot {
  x: number; y: number; vx: number; vy: number; r: number
  faction: number; zoneCx: number; zoneCy: number
}
interface ConflictState { dots: ConflictDot[]; zonePositions: { x: number; y: number }[]; elapsed: number }

function createConflict(W: number, H: number): ConflictState {
  const count = W < 768 ? 400 : 1000
  // 5 zones arranged in a pentagon-ish pattern
  const cx = W / 2, cy = H / 2
  const zoneR = Math.min(W, H) * 0.28
  const zonePositions: { x: number; y: number }[] = []
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
    zonePositions.push({ x: cx + Math.cos(angle) * zoneR, y: cy + Math.sin(angle) * zoneR })
  }
  const dots: ConflictDot[] = []
  for (let i = 0; i < count; i++) {
    const faction = i % 5
    const zone = zonePositions[faction]
    const spread = Math.min(W, H) * 0.12
    dots.push({
      x: zone.x + (Math.random() - 0.5) * spread,
      y: zone.y + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: 1.8 + Math.random() * 0.8,
      faction,
      zoneCx: zone.x, zoneCy: zone.y,
    })
  }
  return { dots, zonePositions, elapsed: 0 }
}

function updateConflict(state: ConflictState, W: number, H: number, dt: number) {
  state.elapsed += dt
  const spread = Math.min(W, H) * 0.12
  for (const d of state.dots) {
    // Attraction toward zone center
    const dx = d.zoneCx - d.x
    const dy = d.zoneCy - d.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > spread * 0.8) {
      d.vx += (dx / dist) * 0.08
      d.vy += (dy / dist) * 0.08
    }
    // Agitation
    d.vx += (Math.random() - 0.5) * 0.15
    d.vy += (Math.random() - 0.5) * 0.15
    d.vx *= 0.96; d.vy *= 0.96
    d.x += d.vx; d.y += d.vy
    // Bounds
    if (d.x < 5) { d.x = 5; d.vx = Math.abs(d.vx) }
    if (d.x > W - 5) { d.x = W - 5; d.vx = -Math.abs(d.vx) }
    if (d.y < 5) { d.y = 5; d.vy = Math.abs(d.vy) }
    if (d.y > H - 5) { d.y = H - 5; d.vy = -Math.abs(d.vy) }
  }
}

function drawConflict(ctx: CanvasRenderingContext2D, state: ConflictState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  const cx = W / 2, cy = H / 2
  // Faint dividing lines from center to between zones
  ctx.strokeStyle = `rgba(255,255,255,${0.04 + 0.02 * Math.sin(state.elapsed * 2)})`
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2 + Math.PI / 5
    const len = Math.min(W, H) * 0.45
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
    ctx.stroke()
  }
  // Dots
  for (const d of state.dots) {
    const color = FACTIONS[d.faction]
    // Dots near border of zone are more agitated (brighter)
    const distFromZone = Math.hypot(d.x - d.zoneCx, d.y - d.zoneCy)
    const atBorder = distFromZone > Math.min(W, H) * 0.08
    const radius = d.r * (atBorder ? 1.1 : 1)
    if (!mobile && atBorder) { ctx.shadowColor = color; ctx.shadowBlur = 3 }
    ctx.beginPath(); ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
    ctx.shadowBlur = 0
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — SMALL GROUPS
// Factions dissolve. Dots mix into circles of 5 (all colors together).
// No pentagon outlines — just proximity clustering.
// ═══════════════════════════════════════════════════════════════

interface GroupDot {
  x: number; y: number; r: number; faction: number
  startX: number; startY: number
  targetX: number; targetY: number
  groupIdx: number; dotInGroup: number
}
interface GroupState { dots: GroupDot[]; groupCenters: { cx: number; cy: number }[]; elapsed: number }

function createGroupForming(W: number, H: number): GroupState {
  const dotCount = W < 768 ? 400 : 1000
  const groupCount = dotCount / 5
  const cols = Math.ceil(Math.sqrt(groupCount * (W / H)))
  const rows = Math.ceil(groupCount / cols)
  const spacingX = W / (cols + 1)
  const spacingY = H / (rows + 1)
  const groupCenters: { cx: number; cy: number }[] = []
  for (let g = 0; g < groupCount; g++) {
    const col = g % cols
    const row = Math.floor(g / cols)
    groupCenters.push({
      cx: spacingX * (col + 1) + (Math.random() - 0.5) * spacingX * 0.2,
      cy: spacingY * (row + 1) + (Math.random() - 0.5) * spacingY * 0.2,
    })
  }

  const dots: GroupDot[] = []
  for (let i = 0; i < dotCount; i++) {
    const groupIdx = Math.floor(i / 5)
    const dotInGroup = i % 5
    const gc = groupCenters[groupIdx]
    const angle = (Math.PI * 2 * dotInGroup) / 5
    const orbitR = 10
    dots.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 2, faction: i % 5,
      startX: Math.random() * W, startY: Math.random() * H,
      targetX: gc.cx + Math.cos(angle) * orbitR,
      targetY: gc.cy + Math.sin(angle) * orbitR,
      groupIdx, dotInGroup,
    })
  }
  return { dots, groupCenters, elapsed: 0 }
}

function updateGroupForming(state: GroupState, dt: number, time: number) {
  state.elapsed += dt
  const formProgress = easeInOut(Math.min(1, state.elapsed / 3))
  for (const d of state.dots) {
    const gc = state.groupCenters[d.groupIdx]
    const angle = (Math.PI * 2 * d.dotInGroup) / 5 + time * 0.3
    const orbitR = 10 + Math.sin(time * 0.6) * 2
    const finalX = gc.cx + Math.cos(angle) * orbitR
    const finalY = gc.cy + Math.sin(angle) * orbitR
    d.x = lerp(d.startX, finalX, formProgress)
    d.y = lerp(d.startY, finalY, formProgress)
  }
}

function drawGroupForming(ctx: CanvasRenderingContext2D, state: GroupState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  // Subtle glow at group centers once formed
  if (!mobile && state.elapsed > 2) {
    const alpha = Math.min(0.06, (state.elapsed - 2) * 0.03)
    for (const gc of state.groupCenters) {
      const grad = ctx.createRadialGradient(gc.cx, gc.cy, 0, gc.cx, gc.cy, 18)
      grad.addColorStop(0, `rgba(34,211,238,${alpha})`)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(gc.cx, gc.cy, 18, 0, Math.PI * 2); ctx.fill()
    }
  }
  for (const d of state.dots) {
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
    ctx.fillStyle = FACTIONS[d.faction]; ctx.fill()
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 5 — WINNERS RISE
// Gold dots glow, non-winners fade. Cell borders dissolve.
// ═══════════════════════════════════════════════════════════════

interface WinnerDot {
  x: number; y: number; r: number; isWinner: boolean
  opacity: number; glowR: number; vy: number
  cellCx: number; cellCy: number
}
interface WinnersState {
  cellPositions: { cx: number; cy: number; r: number; dotR: number; verts: number[][] }[]
  dots: WinnerDot[]; elapsed: number; cellBorderOpacity: number
}

function createWinnersState(W: number, H: number, cellCount: number = 200, cellR: number = 10, zoom: number = 2.8): WinnersState {
  const positions = computeGridPositions(W, H, cellCount, cellR, zoom)
  const dots: WinnerDot[] = []
  for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
    const cell = positions[cellIdx]
    const winnerIdx = Math.floor(Math.random() * 5)
    for (let p = 0; p < 5; p++) {
      dots.push({
        x: cell.verts[p][0], y: cell.verts[p][1],
        r: cell.dotR, isWinner: p === winnerIdx,
        opacity: 1, glowR: 0, vy: 0,
        cellCx: cell.cx, cellCy: cell.cy,
      })
    }
  }
  return { cellPositions: positions, dots, elapsed: 0, cellBorderOpacity: 1 }
}

function updateWinners(state: WinnersState, dt: number) {
  state.elapsed += dt
  for (const d of state.dots) {
    if (!d.isWinner) d.opacity = Math.max(0, 1 - state.elapsed / 2)
  }
  state.cellBorderOpacity = Math.max(0, 1 - state.elapsed / 2.5)
  if (state.elapsed > 1.5) {
    for (const d of state.dots) {
      if (d.isWinner) {
        d.glowR = Math.min(1, (state.elapsed - 1.5) / 1.5)
        d.vy = -0.4 * Math.min(1, (state.elapsed - 1.5) / 2)
        d.y += d.vy
      }
    }
  }
}

function drawWinners(ctx: CanvasRenderingContext2D, state: WinnersState, W: number, H: number) {
  clearBg(ctx, W, H)
  const mobile = isMobile(ctx)
  if (state.cellBorderOpacity > 0.01) {
    ctx.globalAlpha = state.cellBorderOpacity * 0.7
    for (const cell of state.cellPositions) {
      drawPoly(ctx, cell.cx, cell.cy, cell.r, 5, null, '#475569', 0.7)
    }
    ctx.globalAlpha = 1
  }
  for (const d of state.dots) {
    if (d.opacity < 0.01) continue
    ctx.globalAlpha = d.opacity
    if (d.isWinner) {
      const glow = d.glowR
      if (!mobile && glow > 0) { ctx.shadowColor = GOLD_COLOR; ctx.shadowBlur = 6 + glow * 8 }
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 + glow * 0.3), 0, Math.PI * 2)
      ctx.fillStyle = GOLD_COLOR; ctx.fill()
      ctx.shadowBlur = 0
    } else {
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = ORANGE; ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function DemoPage() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)
  const [changing, setChanging] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const changingRef = useRef(false)
  const stepRef = useRef(0)

  useEffect(() => { stepRef.current = step }, [step])

  const goToStep = useCallback((n: number) => {
    if (changingRef.current) return
    n = Math.max(0, Math.min(TOTAL_STEPS - 1, n))
    if (n === stepRef.current) return
    changingRef.current = true
    setChanging(true)
    setVisible(false)
    setTimeout(() => {
      setStep(n)
      setTimeout(() => {
        setVisible(true)
        setTimeout(() => { changingRef.current = false; setChanging(false) }, 350)
      }, 100)
    }, 350)
  }, [])

  // Scene lifecycle
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, raf = 0, lastTime = 0

    function resize() {
      const rect = container!.getBoundingClientRect()
      W = Math.ceil(rect.width); H = Math.ceil(rect.height)
      canvas!.width = W; canvas!.height = H
    }
    resize()

    // Custom state
    let movementDots: MoveDot[] | null = null
    let submitState: SubmitState | null = null
    let conflictState: ConflictState | null = null
    let groupState: GroupState | null = null
    let winnersState: WinnersState | null = null
    let engineScene: SceneState | null = null
    let stepTime = 0

    // Initialize based on step
    if (step === 0) {
      movementDots = createMovement(W, H)
    } else if (step === 1) {
      submitState = createSubmitState(W, H)
    } else if (step === 2) {
      conflictState = createConflict(W, H)
    } else if (step === 3) {
      groupState = createGroupForming(W, H)
    } else if (step === 4) {
      engineScene = buildLayout(W, H, {
        mode: 'grid', cellR: 10, dotR: 2.2, zoom: 2.8,
        cd: makeCD(200, 0.3, 0.5),
      })
    } else if (step === 5) {
      winnersState = createWinnersState(W, H)
    } else if (step === 6) {
      engineScene = buildLayout(W, H, {
        mode: 'batch-grid', bc: 40, zoom: 1.6,
        levels: [{ r: 28, n: 5, fill: BG, stroke: BORDER, sw: 1 }, { r: 11, sw: 1, dotR: 2.2 }],
        cd: makeCD(200, 0.5, 0.3),
      })
    } else if (step === 7) {
      engineScene = buildLayout(W, H, {
        mode: 'free-dots', count: 1000, speed: 0.3, dotR: 2.5, palette: 'post',
      })
    }

    function loop(ts: number) {
      const dt = lastTime === 0 ? 0.016 : Math.min((ts - lastTime) / 1000, 0.05)
      lastTime = ts; stepTime += dt

      // Update
      if (step === 0 && movementDots) updateMovement(movementDots, W, H, dt)
      else if (step === 1 && submitState) updateSubmit(submitState, W, H, dt)
      else if (step === 2 && conflictState) updateConflict(conflictState, W, H, dt)
      else if (step === 3 && groupState) updateGroupForming(groupState, dt, stepTime)
      else if (step === 5 && winnersState) updateWinners(winnersState, dt)
      else if (engineScene) updateScene(engineScene, dt)

      // Draw
      if (step === 0 && movementDots) drawMovement(ctx!, movementDots, W, H)
      else if (step === 1 && submitState) drawSubmit(ctx!, submitState, W, H)
      else if (step === 2 && conflictState) drawConflict(ctx!, conflictState, W, H)
      else if (step === 3 && groupState) drawGroupForming(ctx!, groupState, W, H)
      else if (step === 5 && winnersState) drawWinners(ctx!, winnersState, W, H)
      else if (engineScene) drawScene(ctx!, engineScene)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    function onResize() {
      resize()
      stepTime = 0
      if (step === 0) movementDots = createMovement(W, H)
      else if (step === 1) submitState = createSubmitState(W, H)
      else if (step === 2) conflictState = createConflict(W, H)
      else if (step === 3) groupState = createGroupForming(W, H)
      else if (step === 4) engineScene = buildLayout(W, H, { mode: 'grid', cellR: 10, dotR: 2.2, zoom: 2.8, cd: makeCD(200, 0.3, 0.5) })
      else if (step === 5) winnersState = createWinnersState(W, H)
      else if (step === 6) engineScene = buildLayout(W, H, { mode: 'batch-grid', bc: 40, zoom: 1.6, levels: [{ r: 28, n: 5, fill: BG, stroke: BORDER, sw: 1 }, { r: 11, sw: 1, dotR: 2.2 }], cd: makeCD(200, 0.5, 0.3) })
      else if (step === 7) engineScene = buildLayout(W, H, { mode: 'free-dots', count: 1000, speed: 0.3, dotR: 2.5, palette: 'post' })
    }

    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [step])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goToStep(stepRef.current + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goToStep(stepRef.current - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToStep])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      <Header />

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative min-h-[40vh]">
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Stats box -- top right */}
        <div
          className="absolute top-4 right-4 z-20 pointer-events-none"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.75)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            className="rounded-lg px-4 py-3 text-right"
          >
            <div
              className="text-3xl sm:text-4xl font-bold font-mono"
              style={{ color: STEP_STATS[step].color }}
            >
              {STEP_STATS[step].big}
            </div>
            <div className="text-xs sm:text-sm mt-0.5" style={{ color: MUTED }}>
              {STEP_STATS[step].sub}
            </div>
          </div>
        </div>

        {/* Fade overlay for transitions */}
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{ background: BG, opacity: visible ? 0 : 1, transition: 'opacity 0.35s ease' }}
        />
      </div>

      {/* Bottom controls */}
      <div
        style={{ background: BG, borderTop: '1px solid rgba(255,255,255,0.08)' }}
        className="px-4 py-4 sm:py-5 shrink-0"
      >
        <div
          className="max-w-xl mx-auto"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
        >
          {/* Step title */}
          <div className="text-center mb-1.5">
            <span
              className="text-[10px] sm:text-xs uppercase font-semibold"
              style={{ color: step === TOTAL_STEPS - 1 ? GOLD : ACCENT, letterSpacing: '3px' }}
            >
              {STEP_TITLES[step]}
            </span>
          </div>

          {/* Narration */}
          <p
            className="text-center text-sm sm:text-base leading-relaxed mb-4 font-serif italic min-h-[2.5rem]"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            {STEP_TEXT[step]}
          </p>

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 sm:gap-2 mb-4">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 10 : 6,
                  height: i === step ? 10 : 6,
                  background:
                    i === step
                      ? step === TOTAL_STEPS - 1 ? GOLD : ACCENT
                      : i < step ? SUCCESS : 'rgba(255,255,255,0.2)',
                  boxShadow:
                    i === step
                      ? `0 0 8px ${step === TOTAL_STEPS - 1 ? GOLD : ACCENT}`
                      : 'none',
                }}
                aria-label={`Step ${i + 1}: ${STEP_TITLES[i]}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-center items-center gap-3">
            <button
              onClick={() => goToStep(step - 1)}
              disabled={step === 0 || changing}
              className="px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-20"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
            >
              Back
            </button>

            {step < TOTAL_STEPS - 1 ? (
              <button
                onClick={() => goToStep(step + 1)}
                disabled={changing}
                className="px-5 sm:px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: '#0891b2' }}
              >
                Next Step
              </button>
            ) : (
              <Link
                href="/chants/new"
                className="px-5 sm:px-6 py-2 rounded-lg text-sm font-semibold text-white inline-block"
                style={{ background: '#059669' }}
              >
                Start a Chant
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
