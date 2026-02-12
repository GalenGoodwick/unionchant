/**
 * Originally developed as part of the Common Ground plugin for Unity Chant.
 * Thank you to Common Ground (https://common.ground) for being open source
 * and inspiring the embeddable widget architecture.
 *
 * Adapted for the Unity Chant web application.
 * Original source: https://github.com/GalenGoodwick/unity-chant-cg-plugin
 */
'use client'

import { useEffect, useRef } from 'react'

// ─── Noise ───

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  return hash(ix, iy) * (1 - sx) * (1 - sy) + hash(ix + 1, iy) * sx * (1 - sy) +
         hash(ix, iy + 1) * (1 - sx) * sy + hash(ix + 1, iy + 1) * sx * sy
}

function fbm(x: number, y: number, octaves = 4): number {
  let v = 0, a = 0.5, f = 1
  for (let i = 0; i < octaves; i++) { v += a * valueNoise(x * f, y * f); a *= 0.5; f *= 2 }
  return v
}

// ─── Geometry ───

function polygonVertices(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): [number, number][] {
  const v: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = rot + (2 * Math.PI * i) / sides
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return v
}

function drawPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, stroke: string, fill: string | null, lw: number, rot = -Math.PI / 2) {
  const v = polygonVertices(cx, cy, r, sides, rot)
  ctx.beginPath(); ctx.moveTo(v[0][0], v[0][1])
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i][0], v[i][1])
  ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke()
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
}

// ─── Heart path (reusable) ───
function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(0, s * 0.35)
  ctx.bezierCurveTo(-s * 0.05, s * 0.15, -s * 0.55, s * 0.1, -s * 0.55, -s * 0.2)
  ctx.bezierCurveTo(-s * 0.55, -s * 0.55, -s * 0.15, -s * 0.65, 0, -s * 0.35)
  ctx.bezierCurveTo(s * 0.15, -s * 0.65, s * 0.55, -s * 0.55, s * 0.55, -s * 0.2)
  ctx.bezierCurveTo(s * 0.55, s * 0.1, s * 0.05, s * 0.15, 0, s * 0.35)
  ctx.closePath()
}

interface AmbientProps { className?: string }

// ─── Pentagon-only background for chant detail ───

export function PentagonConstellation({ className }: AmbientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (t: number) => {
      const w = canvas.getBoundingClientRect().width
      const h = canvas.getBoundingClientRect().height
      const time = t * 0.001
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2, cy = h / 2
      const br = time * 0.1 - Math.PI / 2, mR = Math.min(w, h) * 0.3
      drawPolygon(ctx, cx, cy, mR, 5, 'rgba(8,145,178,0.10)', null, 1.4, br)
      const oV = polygonVertices(cx, cy, mR, 5, br)
      for (let i = 0; i < 5; i++) {
        const [vx, vy] = oV[i]
        const nx = vx + (cx - vx) * 0.1, ny = vy + (cy - vy) * 0.1, sR = mR * 0.32
        drawPolygon(ctx, nx, ny, sR, 5, 'rgba(8,145,178,0.16)', null, 1.2, br + 0.3)
        const iV = polygonVertices(nx, ny, sR, 5, br + 0.3)
        for (let j = 0; j < 5; j++) {
          const [ix, iy] = iV[j]
          const cnx = ix + (nx - ix) * 0.1, cny = iy + (ny - iy) * 0.1, cR = sR * 0.3
          drawPolygon(ctx, cnx, cny, cR, 5, 'rgba(8,145,178,0.20)', null, 1.0, br + 0.6)
          const dV = polygonVertices(cnx, cny, cR, 5, br + 0.6)
          for (const [dx, dy] of dV) {
            const v = Math.sin(time + i * 1.3 + j * 0.7 + dx * 0.01) > 0
            drawDot(ctx, dx, dy, 2.5, v ? 'rgba(8,145,178,0.40)' : 'rgba(60,70,90,0.45)')
          }
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className={`sticky top-0 w-full pointer-events-none -mb-[100vh] ${className || ''}`} style={{ opacity: 0.5, height: '100vh' }} />
}

// ─── Live state canvas for chant detail ───

export interface CellData { id: string; tier: number; status: string; participants: number; votes: number; votersNeeded: number }

interface LiveProps { cells: CellData[]; currentTier: number; totalIdeas: number; phase: string; className?: string }

export function LiveConstellation({ cells, currentTier, totalIdeas, phase, className }: LiveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const dataRef = useRef({ cells, currentTier, totalIdeas, phase })
  dataRef.current = { cells, currentTier, totalIdeas, phase }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (t: number) => {
      const w = canvas.getBoundingClientRect().width
      const h = canvas.getBoundingClientRect().height
      ctx.clearRect(0, 0, w, h)
      const { cells: cd, currentTier: tier, phase: ph } = dataRef.current

      if (cd.length === 0) {
        drawPolygon(ctx, w / 2, h / 2, Math.min(w, h) * 0.25, 5, 'rgba(8,145,178,0.06)', null, 0.5, -Math.PI / 2 + t * 0.0002)
        animRef.current = requestAnimationFrame(draw); return
      }

      const n = cd.length, cols = Math.ceil(Math.sqrt(n * (w / h))), rows = Math.ceil(n / cols)
      const cW = w / cols, cH = h / rows, cR = Math.min(cW, cH) * 0.32

      for (let idx = 0; idx < n; idx++) {
        const c = cd[idx], col = idx % cols, row = Math.floor(idx / cols)
        const cx = cW * col + cW / 2, cy = cH * row + cH / 2
        const stroke = c.status === 'COMPLETED' ? 'rgba(5,150,105,0.25)'
          : c.status === 'VOTING' ? `rgba(245,158,11,${0.15 + 0.15 * Math.sin(t * 0.003 + idx)})`
          : 'rgba(40,42,57,0.2)'
        const sides = Math.max(3, Math.min(c.participants || 5, 8))
        drawPolygon(ctx, cx, cy, cR, sides, stroke, null, 0.8)
        const verts = polygonVertices(cx, cy, cR, sides)
        for (let vi = 0; vi < verts.length; vi++) {
          const dc = c.status === 'COMPLETED' ? 'rgba(5,150,105,0.4)' : vi < c.votes ? 'rgba(8,145,178,0.4)' : 'rgba(40,42,57,0.35)'
          drawDot(ctx, verts[vi][0], verts[vi][1], 2, dc)
        }
        if (c.status === 'COMPLETED') drawDot(ctx, cx, cy, 2.5, 'rgba(245,158,11,0.3)')
      }

      if (ph === 'COMPLETED' || tier > 1) {
        ctx.strokeStyle = 'rgba(245,158,11,0.06)'; ctx.lineWidth = 0.5
        for (let idx = 0; idx < n; idx++) {
          if (cd[idx].status === 'COMPLETED') {
            const col = idx % cols, row = Math.floor(idx / cols)
            ctx.beginPath(); ctx.moveTo(cW * col + cW / 2, cH * row + cH / 2); ctx.lineTo(w / 2, h / 2); ctx.stroke()
          }
        }
      }
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full pointer-events-none ${className || ''}`} style={{ opacity: 0.5 }} />
}

// ─── Ambient waveform fire + heart (full landing page variant) ───

export function AmbientConstellationWaveform({ className }: AmbientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (t: number) => {
      const w = canvas.getBoundingClientRect().width
      const h = canvas.getBoundingClientRect().height
      const time = t * 0.001
      ctx.clearRect(0, 0, w, h)

      // Waveform fire along edges
      const waveCount = 5
      const maxDepth = Math.min(w, h) * 0.12

      for (let edge = 0; edge < 4; edge++) {
        const isH = edge === 0 || edge === 2
        const length = isH ? w : h

        for (let wi = 0; wi < waveCount; wi++) {
          const freq = 0.008 + wi * 0.006
          const speed = 1.2 + wi * 0.7
          const baseDepth = (wi + 1) / waveCount * maxDepth * 0.6
          const amp = 4 + wi * 3
          const alpha = 0.06 + (wi / waveCount) * 0.12
          const blue = 140 + wi * 15
          const lineW = 0.6 + (waveCount - wi) * 0.15

          ctx.beginPath()
          const step = 2
          const segments = Math.ceil(length / step)

          for (let i = 0; i <= segments; i++) {
            const frac = i / segments
            const pos = frac * length
            const wave = Math.sin(pos * freq + time * speed + wi * 2.1) *
                        amp * (0.7 + 0.3 * Math.sin(pos * freq * 0.3 + time * 0.5))
            const turb = (fbm(pos * 0.01 + time * 0.4 + wi, edge * 10, 3) - 0.5) * amp * 1.5
            const depth = baseDepth + wave + turb

            let px: number, py: number
            if (edge === 0) { px = pos; py = depth }
            else if (edge === 1) { px = w - depth; py = pos }
            else if (edge === 2) { px = w - pos; py = h - depth }
            else { px = depth; py = h - pos }

            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }

          ctx.strokeStyle = `rgba(8, 145, ${blue}, ${alpha})`
          ctx.lineWidth = lineW
          ctx.stroke()
        }
      }

      // Constellation (subtle)
      const cx = w / 2, cy = h / 2
      const baseRot = time * 0.08 - Math.PI / 2
      const maxR = Math.min(w, h) * 0.38

      drawPolygon(ctx, cx, cy, maxR, 5, 'rgba(8,145,178,0.04)', null, 0.5, baseRot)
      const outerV = polygonVertices(cx, cy, maxR, 5, baseRot)

      for (let i = 0; i < 5; i++) {
        const [vx, vy] = outerV[i]
        const nx = vx + (cx - vx) * 0.1, ny = vy + (cy - vy) * 0.1
        const subR = maxR * 0.32
        drawPolygon(ctx, nx, ny, subR, 5, 'rgba(8,145,178,0.07)', null, 0.4, baseRot + 0.3)
        const innerV = polygonVertices(nx, ny, subR, 5, baseRot + 0.3)

        for (let j = 0; j < 5; j++) {
          const [ix, iy] = innerV[j]
          const cnx = ix + (nx - ix) * 0.1, cny = iy + (ny - iy) * 0.1
          const cR = subR * 0.3
          drawPolygon(ctx, cnx, cny, cR, 5, 'rgba(8,145,178,0.09)', null, 0.3, baseRot + 0.6)

          const dotV = polygonVertices(cnx, cny, cR, 5, baseRot + 0.6)
          for (const [dx, dy] of dotV) {
            const dE = Math.min(dx / w, (w - dx) / w, dy / h, (h - dy) / h)
            const nearEdge = Math.max(0, 1 - dE / 0.1)

            const jitterX = nearEdge * (fbm(dx * 0.08 + time * 4, dy * 0.08, 2) - 0.5) * 10
            const jitterY = nearEdge * (fbm(dx * 0.08, dy * 0.08 + time * 4, 2) - 0.5) * 10
            const sz = 1.2 + nearEdge * 1.5 * (0.7 + 0.3 * Math.sin(time * 6 + dx * 0.1))

            const voted = Math.sin(time + i * 1.3 + j * 0.7 + dx * 0.01) > 0
            if (nearEdge > 0.1) {
              const a = 0.2 + nearEdge * 0.4
              drawDot(ctx, dx + jitterX, dy + jitterY, sz, `rgba(8, 145, 178, ${a})`)
            } else {
              drawDot(ctx, dx, dy, 1.2, voted ? 'rgba(8,145,178,0.2)' : 'rgba(40,42,57,0.3)')
            }
          }
        }
      }

      // Heart
      const beatPeriod = 1.0
      const beatPhase = (time % beatPeriod) / beatPeriod
      const thump = beatPhase < 0.08
        ? beatPhase / 0.08
        : beatPhase < 0.15
        ? 1 - (beatPhase - 0.08) / 0.07 * 0.6
        : beatPhase < 0.22
        ? 0.4 + (beatPhase - 0.15) / 0.07 * 0.3
        : beatPhase < 0.35
        ? 0.7 * (1 - (beatPhase - 0.22) / 0.13)
        : 0
      const heartScale = 1 + thump * 0.08
      const heartSize = Math.min(w, h) * 0.18

      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(heartScale, heartScale)

      heartPath(ctx, heartSize)
      ctx.strokeStyle = `rgba(252, 252, 252, ${0.55 + thump * 0.35})`
      ctx.lineWidth = 2.5 + thump * 1
      ctx.lineJoin = 'round'
      ctx.stroke()

      heartPath(ctx, heartSize)
      ctx.fillStyle = `rgba(252, 252, 252, ${0.03 + thump * 0.04})`
      ctx.fill()

      ctx.restore()

      if (thump > 0.1) {
        const ringR = heartSize * 0.5 + (1 - thump) * heartSize * 0.4
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(252, 252, 252, ${thump * 0.06})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full pointer-events-none ${className || ''}`} style={{ opacity: 0.8 }} />
  )
}

// ─── Ambient filled fire + small heart (DEFAULT) ───

export function AmbientConstellation({ className }: AmbientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const glow = document.createElement('canvas')
    glowRef.current = glow
    const gc = glow.getContext('2d')
    if (!gc) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      glow.width = r.width * dpr; glow.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      gc.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    interface Ember { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; brightness: number }
    const embers: Ember[] = []

    const draw = (t: number) => {
      const w = canvas.getBoundingClientRect().width
      const h = canvas.getBoundingClientRect().height
      const time = t * 0.001
      ctx.clearRect(0, 0, w, h); gc.clearRect(0, 0, w, h)

      // Genesis-style fire
      const dim = Math.min(w, h)
      const maxFireDepth = dim * 0.144
      const fireLayers = 5

      for (let layer = 0; layer < fireLayers; layer++) {
        const lf = layer / (fireLayers - 1)
        const layerMaxDepth = maxFireDepth * (1 - lf * 0.5)
        const scrollSpeed = 0.4 + layer * 0.2
        const r = 48 + lf * 96
        const g = 54 + lf * 102
        const b = 108 + lf * 110
        const alpha = 0.029 + lf * 0.158

        for (let edge = 0; edge < 4; edge++) {
          const isH = edge === 0 || edge === 2
          const len = isH ? w : h
          const segs = Math.ceil(len / 3)

          gc.beginPath()
          if (edge === 0) gc.moveTo(0, 0)
          else if (edge === 1) gc.moveTo(w, 0)
          else if (edge === 2) gc.moveTo(w, h)
          else gc.moveTo(0, h)

          for (let i = 0; i <= segs; i++) {
            const f = i / segs
            let sx: number, sy: number
            if (edge === 0) { sx = f * w; sy = 0 }
            else if (edge === 1) { sx = w; sy = f * h }
            else if (edge === 2) { sx = (1 - f) * w; sy = h }
            else { sx = 0; sy = (1 - f) * h }

            const nx = (isH ? sx : sy) * 0.012 + layer * 7.3
            const ny = time * scrollSpeed + layer * 3.1
            const flame = fbm(nx, ny, 4)
            const flicker = Math.sin(
              (isH ? sx : sy) * 0.04 + time * 6 + layer * 2.1
            ) * 0.15 * (0.5 + flame)
            const edgeFrac = f
            const envelope = Math.sin(edgeFrac * Math.PI) * 0.3 + 0.7
            const depth = layerMaxDepth * (0.25 + flame * 0.75 + flicker) * envelope

            let bx = sx, by = sy
            if (edge === 0) by = depth
            else if (edge === 1) bx = w - depth
            else if (edge === 2) by = h - depth
            else bx = depth
            gc.lineTo(bx, by)
          }

          if (edge === 0) { gc.lineTo(w, 0); gc.lineTo(0, 0) }
          else if (edge === 1) { gc.lineTo(w, h); gc.lineTo(w, 0) }
          else if (edge === 2) { gc.lineTo(0, h); gc.lineTo(w, h) }
          else { gc.lineTo(0, 0); gc.lineTo(0, h) }
          gc.closePath()
          gc.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha.toFixed(3)})`
          gc.fill()
        }
      }

      ctx.save(); ctx.filter = 'blur(8px)'; ctx.drawImage(glow, 0, 0, w, h); ctx.restore()
      ctx.save(); ctx.globalAlpha = 0.4; ctx.drawImage(glow, 0, 0, w, h); ctx.restore()

      // Flame tongues
      for (let edge = 0; edge < 4; edge++) {
        const isH = edge === 0 || edge === 2
        const length = isH ? w : h

        for (let ti = 0; ti < 3; ti++) {
          const tongueDepth = maxFireDepth * (0.6 + ti * 0.15)
          const speed = 1.2 + ti * 0.6
          const freq = 0.02 + ti * 0.01
          const tongueAlpha = 0.198 + ti * 0.072

          ctx.beginPath()
          const segments = Math.ceil(length / 2)

          for (let i = 0; i <= segments; i++) {
            const pos = (i / segments) * length
            const n1 = valueNoise(pos * freq + time * speed + ti * 5, edge * 10 + time * 0.7)
            const n2 = valueNoise(pos * freq * 2.2 + time * speed * 1.4 + ti * 3, edge * 10 + 5)
            const n3 = valueNoise(pos * freq * 4.5 - time * speed * 0.8 + ti * 8, edge * 10 + 10)
            const flame = n1 * 0.5 + n2 * 0.3 + n3 * 0.2
            const flicker = 1 + Math.sin(pos * 0.03 + time * 4 + ti * 2.5) * 0.3
            const depth = tongueDepth * flame * flicker

            let px: number, py: number
            if (edge === 0) { px = pos; py = depth }
            else if (edge === 1) { px = w - depth; py = pos }
            else if (edge === 2) { px = length - pos; py = h - depth }
            else { px = depth; py = length - pos }

            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }

          ctx.strokeStyle = `rgba(8, 145, 178, ${tongueAlpha})`
          ctx.lineWidth = 0.8 + (2 - ti) * 0.3
          ctx.stroke()
        }
      }

      // Embers
      if (embers.length < 80 && Math.random() < 0.4) {
        const e = Math.floor(Math.random() * 4), f = Math.random()
        let sx: number, sy: number
        if (e === 0) { sx = f * w; sy = 0 } else if (e === 1) { sx = w; sy = f * h }
        else if (e === 2) { sx = (1 - f) * w; sy = h } else { sx = 0; sy = (1 - f) * h }
        const bn = fbm(sx * 0.015 + time * 0.3, sy * 0.015 + time * 0.2, 5)
        const bd = (0.04 + bn * 0.06) * Math.min(w, h)
        let ex = sx, ey = sy
        if (e === 0) ey = bd; else if (e === 1) ex = w - bd; else if (e === 2) ey = h - bd; else ex = bd
        const sp = 0.3 + Math.random() * 0.5, tb = (Math.random() - 0.5) * 0.4
        let vx = 0, vy = 0
        if (e === 0) { vy = sp; vx = tb } else if (e === 1) { vx = -sp; vy = tb }
        else if (e === 2) { vy = -sp; vx = tb } else { vx = sp; vy = tb }
        embers.push({ x: ex, y: ey, vx, vy, life: 0, maxLife: 30 + Math.random() * 50, size: 0.8 + Math.random() * 1.5, brightness: 0.5 + Math.random() * 0.5 })
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const em = embers[i]
        const tb = fbm(em.x * 0.05 + time * 2, em.y * 0.05 + time * 1.5, 2)
        em.x += em.vx + (tb - 0.5) * 0.3; em.y += em.vy + (tb - 0.5) * 0.3; em.life++
        if (em.life >= em.maxLife) { embers.splice(i, 1); continue }
        const p = em.life / em.maxLife
        const al = (p < 0.15 ? p / 0.15 : Math.pow(1 - (p - 0.15) / 0.85, 2)) * em.brightness * 0.5
        drawDot(ctx, em.x, em.y, em.size * (1 - p * 0.6), `rgba(8,145,178,${al})`)
      }

      // Heart
      const cx = w / 2, cy = h / 2
      const beatPeriod = 1.0
      const beatPhase = (time % beatPeriod) / beatPeriod
      const thump = beatPhase < 0.08
        ? beatPhase / 0.08
        : beatPhase < 0.15
        ? 1 - (beatPhase - 0.08) / 0.07 * 0.6
        : beatPhase < 0.22
        ? 0.4 + (beatPhase - 0.15) / 0.07 * 0.3
        : beatPhase < 0.35
        ? 0.7 * (1 - (beatPhase - 0.22) / 0.13)
        : 0
      const heartScale = 1 + thump * 0.1
      const heartSize = Math.min(w, h) * 0.12

      ctx.save(); ctx.translate(cx, cy); ctx.scale(heartScale, heartScale)
      heartPath(ctx, heartSize)
      ctx.fillStyle = `rgba(252,252,252,${0.65 + thump * 0.35})`; ctx.fill()
      ctx.shadowColor = `rgba(252,252,252,${0.12 + thump * 0.25})`; ctx.shadowBlur = 18 + thump * 14; ctx.fill()
      ctx.shadowBlur = 0; ctx.restore()

      if (thump > 0.1) {
        const ringR = heartSize * 0.5 + (1 - thump) * heartSize * 0.35
        ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(252,252,252,${thump * 0.05})`
        ctx.lineWidth = 1; ctx.stroke()
      }

      // Constellation
      const br = time * 0.1 - Math.PI / 2, mR = Math.min(w, h) * 0.3
      drawPolygon(ctx, cx, cy, mR, 5, 'rgba(8,145,178,0.10)', null, 1.4, br)
      const oV = polygonVertices(cx, cy, mR, 5, br)
      for (let i = 0; i < 5; i++) {
        const [vx, vy] = oV[i]
        const nx = vx + (cx - vx) * 0.1, ny = vy + (cy - vy) * 0.1, sR = mR * 0.32
        drawPolygon(ctx, nx, ny, sR, 5, 'rgba(8,145,178,0.16)', null, 1.2, br + 0.3)
        const iV = polygonVertices(nx, ny, sR, 5, br + 0.3)
        for (let j = 0; j < 5; j++) {
          const [ix, iy] = iV[j]
          const cnx = ix + (nx - ix) * 0.1, cny = iy + (ny - iy) * 0.1, cR = sR * 0.3
          drawPolygon(ctx, cnx, cny, cR, 5, 'rgba(8,145,178,0.20)', null, 1.0, br + 0.6)
          const dV = polygonVertices(cnx, cny, cR, 5, br + 0.6)
          for (const [dx, dy] of dV) {
            const v = Math.sin(time + i * 1.3 + j * 0.7 + dx * 0.01) > 0
            drawDot(ctx, dx, dy, 2.5, v ? 'rgba(8,145,178,0.40)' : 'rgba(60,70,90,0.45)')
          }
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full pointer-events-none ${className || ''}`} style={{ opacity: 0.7 }} />
}
