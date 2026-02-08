// ═══════════════════════════════════════════════════════════════
// Shared Canvas Rendering Engine
// Used by: LandingParallax, Demo page, and future canvas views
// ═══════════════════════════════════════════════════════════════

// ── Colors ──────────────────────────────────────────────────────
export const BG      = '#0f172a'
export const ACCENT  = '#22d3ee'
export const MUTED   = '#94a3b8'
export const SUCCESS = '#34d399'
export const WARNING = '#eab308'
export const PURPLE  = '#a78bfa'
export const GOLD    = '#fbbf24'
export const BORDER  = '#334155'

// ── Types ───────────────────────────────────────────────────────
export interface FreeDot {
  x: number; y: number; vx: number; vy: number
  r: number; flare: number; nextFlare: number
}

export interface Person {
  bx: number; by: number; x: number; y: number
  voted: number; sx: number; sy: number
  px: number; py: number; amp: number
  va: number; ja: number; jx: number; jy: number
  isWinner?: boolean
}

export interface Cell {
  cx: number; cy: number; r: number; n: number; dotR: number
  status: string; people: Person[]; fa: number; bi: number; pp: number
}

export interface Particle {
  sx: number; sy: number; tx: number; ty: number
  t: number; dur: number; arc: number
}

export interface BgPoly {
  cx: number; cy: number; r: number; n: number
  fill: string; stroke: string; sw: number
}

export interface CellData {
  n: number; voted: number[]; status: string; winnerIdx?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TierCfg {
  mode: string; count?: number; speed?: number; dotR?: number
  palette?: string; cellR?: number; zoom?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cd?: any[]; bc?: number; cols?: number; levels?: any[]
}

export interface Level {
  r?: number; dotR?: number; n?: number
  fill?: string; stroke?: string; sw?: number
}

export interface SceneState {
  W: number; H: number; time: number; at: number; pt: number
  freeDots: FreeDot[]; cells: Cell[]; particles: Particle[]
  bgPolygons: BgPoly[]; palette: string
}

// ── Math ────────────────────────────────────────────────────────
export function verts(cx: number, cy: number, r: number, n: number): number[][] {
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

export function nudge(vx: number, vy: number, cx: number, cy: number, pct: number): number[] {
  return [vx + (cx - vx) * pct, vy + (cy - vy) * pct]
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function bezierPt(
  sx: number, sy: number, mx: number, my: number,
  tx: number, ty: number, t: number
): number[] {
  const u = 1 - t
  return [
    u * u * sx + 2 * u * t * mx + t * t * tx,
    u * u * sy + 2 * u * t * my + t * t * ty,
  ]
}

export function drawPoly(
  c: CanvasRenderingContext2D, cx: number, cy: number,
  r: number, n: number, fill: string | null, stroke: string | null, sw: number
) {
  const pts = verts(cx, cy, r, n)
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1])
  c.closePath(); c.lineJoin = 'round'
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = sw; c.stroke() }
}

// ── Cell Data Factories ─────────────────────────────────────────
export function makeCD(count: number, cp: number, ap: number): CellData[] {
  const o: CellData[] = []
  for (let i = 0; i < count; i++) {
    const r = i / count; let s: string, v: number[]
    if (r < cp) { s = 'complete'; v = [1, 1, 1, 1, 1] }
    else if (r < cp + ap) {
      s = 'active'
      v = [1, 1, Math.random() > .3 ? 1 : 0, Math.random() > .6 ? 1 : 0, 0]
    } else { s = 'waiting'; v = [0, 0, 0, 0, 0] }
    o.push({ n: 5, voted: v, status: s })
  }
  return o
}

export function makeCDWinners(count: number): CellData[] {
  const o: CellData[] = []
  for (let i = 0; i < count; i++) {
    o.push({
      n: 5, voted: [1, 1, 1, 1, 1], status: 'complete',
      winnerIdx: Math.floor(Math.random() * 5),
    })
  }
  return o
}

// ── Internal Layout Helpers ─────────────────────────────────────
function scaleLevels(levels: Level[], s: number): Level[] {
  return levels.map(l => ({
    ...l,
    r: l.r ? l.r * s : undefined,
    dotR: l.dotR ? l.dotR * s : undefined,
  }))
}

function mkCell(
  cells: Cell[], cx: number, cy: number,
  r: number, dotR: number, data: CellData, bi: number
) {
  const pts = verts(cx, cy, r, data.n)
  const people: Person[] = []
  for (let i = 0; i < data.n; i++) {
    people.push({
      bx: pts[i][0], by: pts[i][1], x: pts[i][0], y: pts[i][1],
      voted: data.voted[i],
      sx: .8 + Math.random() * .6, sy: .7 + Math.random() * .7,
      px: Math.random() * Math.PI * 2, py: Math.random() * Math.PI * 2,
      amp: r * .15, va: 0, ja: -1, jx: 0, jy: 0,
      isWinner: data.winnerIdx !== undefined && i === data.winnerIdx,
    })
  }
  cells.push({
    cx, cy, r, n: data.n, dotR: dotR || r * .2,
    status: data.status, people,
    fa: data.status === 'complete' ? 1 : 0,
    bi, pp: Math.random() * Math.PI * 2,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function layRecursive(
  cells: Cell[], bg: BgPoly[],
  cx: number, cy: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  levels: any[], cd: CellData[], ci: { i: number }, bi: number
) {
  if (levels.length === 1) {
    const lv = levels[0]; const d = cd[ci.i++]
    if (!d) return
    mkCell(cells, cx, cy, lv.r, lv.dotR, d, bi)
  } else {
    const lv = levels[0]
    bg.push({ cx, cy, r: lv.r, n: lv.n, fill: lv.fill, stroke: lv.stroke, sw: lv.sw })
    const pts = verts(cx, cy, lv.r, lv.n)
    for (let i = 0; i < lv.n; i++) {
      const [vx, vy] = pts[i]
      const [nx, ny] = nudge(vx, vy, cx, cy, 0.1)
      layRecursive(cells, bg, nx, ny, levels.slice(1), cd, ci, bi)
    }
  }
}

// ── Layout Functions ────────────────────────────────────────────
// Each returns fresh arrays — no mutation of external state.

export function layoutGrid(W: number, H: number, cfg: TierCfg): { cells: Cell[], bg: BgPoly[] } {
  const cells: Cell[] = [], bg: BgPoly[] = []
  const sc = Math.min(W, H) / 750 * (cfg.zoom || 1)
  const n = cfg.cd!.length
  const cols = Math.ceil(Math.sqrt(n * (W / H) * 1.2))
  const cr = cfg.cellR! * sc, dr = cfg.dotR! * sc, g = cr * 2.8
  const rows = Math.ceil(n / cols)
  const ox = W / 2 - (cols * g) / 2 + g / 2
  const oy = H / 2 - (rows * g) / 2 + g / 2
  for (let i = 0; i < n; i++) {
    mkCell(cells, ox + (i % cols) * g, oy + Math.floor(i / cols) * g, cr, dr, cfg.cd![i], -1)
  }
  return { cells, bg }
}

export function layoutBatchGrid(W: number, H: number, cfg: TierCfg): { cells: Cell[], bg: BgPoly[] } {
  const cells: Cell[] = [], bg: BgPoly[] = []
  const sc = Math.min(W, H) / 750 * (cfg.zoom || 1)
  const nB = cfg.bc!
  const lv = scaleLevels(cfg.levels!, sc)
  let sp = lv[0].r! * 2
  for (let l = 1; l < lv.length; l++) sp += lv[l].r! * 2
  sp += 15 * sc
  const cols = cfg.cols || Math.ceil(Math.sqrt(nB * (W / H) * 1.2))
  const rows = Math.ceil(nB / cols)
  const ox = W / 2 - (cols * sp) / 2 + sp / 2
  const oy = H / 2 - (rows * sp) / 2 + sp / 2
  const ci = { i: 0 }
  for (let b = 0; b < nB; b++) {
    layRecursive(cells, bg,
      ox + (b % cols) * sp, oy + Math.floor(b / cols) * sp,
      lv, cfg.cd!, ci, b)
  }
  return { cells, bg }
}

export function layoutSingle(W: number, H: number, cfg: TierCfg): { cells: Cell[], bg: BgPoly[] } {
  const cells: Cell[] = [], bg: BgPoly[] = []
  const sc = Math.min(W, H) / 750 * (cfg.zoom || 1)
  const lv = scaleLevels(cfg.levels!, sc)
  const ci = { i: 0 }
  layRecursive(cells, bg, W / 2, H / 2, lv, cfg.cd!, ci, 0)
  return { cells, bg }
}

export function createFreeDots(W: number, H: number, cfg: TierCfg): FreeDot[] {
  const dots: FreeDot[] = []
  const count = W < 768 ? Math.min(cfg.count || 1000, 300) : (cfg.count || 1000)
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * (cfg.speed || 0.3),
      vy: (Math.random() - 0.5) * (cfg.speed || 0.3),
      r: (cfg.dotR || 2.5) * (0.7 + Math.random() * 0.6),
      flare: 0, nextFlare: 1 + Math.random() * 5,
    })
  }
  return dots
}

// Convenience: build a SceneState from any TierCfg
export function buildLayout(W: number, H: number, cfg: TierCfg): SceneState {
  const state: SceneState = {
    W, H, time: 0, at: 0, pt: 0,
    freeDots: [], cells: [], particles: [], bgPolygons: [], palette: 'pre',
  }
  if (cfg.mode === 'free-dots') {
    state.freeDots = createFreeDots(W, H, cfg)
    state.palette = cfg.palette || 'pre'
  } else if (cfg.mode === 'grid') {
    const r = layoutGrid(W, H, cfg)
    state.cells = r.cells; state.bgPolygons = r.bg
  } else if (cfg.mode === 'batch-grid') {
    const r = layoutBatchGrid(W, H, cfg)
    state.cells = r.cells; state.bgPolygons = r.bg
  } else if (cfg.mode === 'single') {
    const r = layoutSingle(W, H, cfg)
    state.cells = r.cells; state.bgPolygons = r.bg
  }
  return state
}

// Also export the grid cell positions (useful for demo cell-form step)
export function computeGridPositions(W: number, H: number, count: number, cellR: number, zoom: number) {
  const sc = Math.min(W, H) / 750 * zoom
  const cr = cellR * sc, g = cr * 2.8
  const cols = Math.ceil(Math.sqrt(count * (W / H) * 1.2))
  const rows = Math.ceil(count / cols)
  const ox = W / 2 - (cols * g) / 2 + g / 2
  const oy = H / 2 - (rows * g) / 2 + g / 2
  const positions: { cx: number; cy: number; r: number; dotR: number; verts: number[][] }[] = []
  const dr = 2.2 * sc
  for (let i = 0; i < count; i++) {
    const pcx = ox + (i % cols) * g
    const pcy = oy + Math.floor(i / cols) * g
    positions.push({ cx: pcx, cy: pcy, r: cr, dotR: dr, verts: verts(pcx, pcy, cr, 5) })
  }
  return positions
}

// ── Animation Ticks ─────────────────────────────────────────────
export function tickVote(cells: Cell[]) {
  const active = cells.filter(c => c.status === 'active')
  if (!active.length) return
  const cell = active[Math.floor(Math.random() * active.length)]
  const uv = cell.people.filter(p => !p.voted && p.ja < 0)
  if (!uv.length) return
  const p = uv[Math.floor(Math.random() * uv.length)]
  p.voted = 1; p.va = 1; p.x = p.bx; p.y = p.by
  if (cell.people.every(p => p.voted)) {
    cell.status = 'complete'
    const w = cells.filter(c => c.status === 'waiting')
    if (w.length) {
      const n = w[0]; n.status = 'active'
      for (const p of n.people) {
        p.ja = 0
        const a = Math.random() * Math.PI * 2, d = n.r * 3 + Math.random() * 40
        p.jx = n.cx + Math.cos(a) * d; p.jy = n.cy + Math.sin(a) * d
      }
    }
  }
}

export function tickPoll(cells: Cell[], particles: Particle[]) {
  const bm: Record<number, Cell[]> = {}
  for (const c of cells) { if (c.bi < 0) continue; (bm[c.bi] = bm[c.bi] || []).push(c) }
  const bs = Object.values(bm).filter(b => b.length > 1)
  if (!bs.length) return
  const b = bs[Math.floor(Math.random() * bs.length)]
  const src = b[Math.floor(Math.random() * b.length)]
  let dst = src, t = 0
  while (dst === src && t < 5) { dst = b[Math.floor(Math.random() * b.length)]; t++ }
  if (dst === src) return
  const d = Math.hypot(dst.cx - src.cx, dst.cy - src.cy)
  particles.push({
    sx: src.cx, sy: src.cy, tx: dst.cx, ty: dst.cy,
    t: 0, dur: .8 + d / 300, arc: 15 + d * .15,
  })
}

// ── Physics Updates ─────────────────────────────────────────────
export function updateFreeDotPhysics(dots: FreeDot[], W: number, H: number, dt: number) {
  for (const d of dots) {
    d.x += d.vx; d.y += d.vy
    if (d.x < -10) d.x = W + 10; if (d.x > W + 10) d.x = -10
    if (d.y < -10) d.y = H + 10; if (d.y > H + 10) d.y = -10
    if (d.flare > 0) { d.flare = Math.max(0, d.flare - dt * 1.5) }
    else {
      d.nextFlare -= dt
      if (d.nextFlare <= 0) { d.flare = 1; d.nextFlare = 3 + Math.random() * 10 }
    }
  }
}

export function updateCellPhysics(cells: Cell[], time: number, dt: number) {
  for (const cell of cells) {
    if (cell.status === 'waiting') continue
    for (const p of cell.people) {
      if (p.ja >= 0) {
        p.ja = Math.min(1, p.ja + dt * 2.5)
        const e = easeInOut(p.ja)
        p.x = lerp(p.jx, p.bx, e); p.y = lerp(p.jy, p.by, e)
        if (p.ja >= 1) p.ja = -1
      } else if (!p.voted && cell.status === 'active') {
        p.x = p.bx + Math.sin(time * p.sx + p.px) * p.amp
        p.y = p.by + Math.cos(time * p.sy + p.py) * p.amp
      }
      if (p.va > 0) p.va = Math.max(0, p.va - dt * 3)
    }
    if (cell.status === 'complete' && cell.fa < 1) cell.fa = Math.min(1, cell.fa + dt * 2)
  }
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  for (const p of particles) p.t += dt / p.dur
  return particles.filter(p => p.t < 1)
}

/** Combined update: advances time, runs physics, triggers vote/poll */
export function updateScene(state: SceneState, dt: number) {
  state.time += dt; state.at += dt; state.pt += dt
  updateFreeDotPhysics(state.freeDots, state.W, state.H, dt)
  updateCellPhysics(state.cells, state.time, dt)
  state.particles = updateParticles(state.particles, dt)
  if (state.cells.length && state.at > .8 + Math.random() * 1.2) {
    state.at = 0; tickVote(state.cells)
  }
  if (state.cells.length && state.pt > 3 + Math.random() * 3) {
    state.pt = 0; tickPoll(state.cells, state.particles)
  }
}

// ── Drawing ─────────────────────────────────────────────────────
/** Returns true on small screens where shadowBlur would kill performance */
export function isMobile(ctx: CanvasRenderingContext2D): boolean {
  return ctx.canvas.width < 768
}

export function clearBg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
}

export function drawFreeDotsOnCanvas(ctx: CanvasRenderingContext2D, dots: FreeDot[], palette: string) {
  const mobile = isMobile(ctx)
  for (const d of dots) {
    const f = d.flare
    let r: number, g: number, b: number
    if (palette === 'post') {
      r = Math.round(234 + (255 - 234) * f)
      g = Math.round(179 + (247 - 179) * f)
      b = Math.round(8 + (237 - 8) * f)
      if (!mobile) { ctx.shadowColor = GOLD; ctx.shadowBlur = d.r * 2 + d.r * 6 * f }
    } else {
      r = Math.round(34 + (234 - 34) * f)
      g = Math.round(211 + (179 - 211) * f)
      b = Math.round(238 + (8 - 238) * f)
      if (!mobile && f > 0.3) { ctx.shadowColor = WARNING; ctx.shadowBlur = d.r * 4 * f }
    }
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 + f * 0.4), 0, Math.PI * 2)
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill(); ctx.shadowBlur = 0
  }
}

export function drawBgPolygons(ctx: CanvasRenderingContext2D, bg: BgPoly[]) {
  for (const pg of bg) drawPoly(ctx, pg.cx, pg.cy, pg.r, pg.n, pg.fill, pg.stroke, pg.sw)
}

export function drawCellsOnCanvas(ctx: CanvasRenderingContext2D, cells: Cell[], time: number) {
  const mobile = isMobile(ctx)
  for (const cell of cells) {
    drawPoly(ctx, cell.cx, cell.cy, cell.r, cell.n, BG, null, 0)
    if (cell.fa > 0) {
      ctx.globalAlpha = cell.fa * .15
      drawPoly(ctx, cell.cx, cell.cy, cell.r, cell.n, SUCCESS, null, 0)
      ctx.globalAlpha = 1
    }
    let st: string, sw: number
    if (cell.status === 'complete') { st = SUCCESS; sw = .8 }
    else if (cell.status === 'active') {
      const p = .3 + .7 * (.5 + .5 * Math.sin(time * 2.5 + cell.pp))
      ctx.globalAlpha = p; st = WARNING; sw = .8
    } else { st = BORDER; sw = .5 }
    drawPoly(ctx, cell.cx, cell.cy, cell.r, cell.n, null, st, sw)
    ctx.globalAlpha = 1
    for (const p of cell.people) {
      if (p.voted && p.ja < 0) {
        const pr = p.va > 0 ? 1 + p.va * .6 : 1
        if (!mobile) { ctx.shadowColor = WARNING; ctx.shadowBlur = cell.dotR * 2 }
        ctx.beginPath(); ctx.arc(p.x, p.y, cell.dotR * pr, 0, Math.PI * 2)
        ctx.fillStyle = WARNING; ctx.fill(); ctx.shadowBlur = 0
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, cell.dotR * .8, 0, Math.PI * 2)
        ctx.fillStyle = ACCENT; ctx.fill()
      }
    }
  }
}

export function drawParticlesOnCanvas(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  const mobile = isMobile(ctx)
  if (mobile) return // skip particles entirely on mobile
  for (const pt of particles) {
    const t = pt.t
    const mx = (pt.sx + pt.tx) / 2, my = (pt.sy + pt.ty) / 2 - pt.arc
    for (let i = 5; i >= 0; i--) {
      const tt = Math.max(0, t - i * .03)
      const [px, py] = bezierPt(pt.sx, pt.sy, mx, my, pt.tx, pt.ty, tt)
      ctx.globalAlpha = (1 - i / 6) * (1 - t * .5)
      ctx.shadowColor = PURPLE; ctx.shadowBlur = 4
      ctx.beginPath(); ctx.arc(px, py, Math.max(2 - i * .2, .5), 0, Math.PI * 2)
      ctx.fillStyle = PURPLE; ctx.fill()
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1
  }
}

/** Combined draw: clears canvas, draws all elements */
export function drawScene(ctx: CanvasRenderingContext2D, state: SceneState) {
  clearBg(ctx, state.W, state.H)
  if (state.freeDots.length) drawFreeDotsOnCanvas(ctx, state.freeDots, state.palette)
  drawBgPolygons(ctx, state.bgPolygons)
  drawCellsOnCanvas(ctx, state.cells, state.time)
  drawParticlesOnCanvas(ctx, state.particles)
}
