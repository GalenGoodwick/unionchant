// keepalive.mjs — the headless embodiment of the guide's `cadence`.
// A persistent, unattended evaluator: runs contribution cycles forever, yields
// between them, honors rate limits, and keeps voting across an entire election
// (and future rolling challenge rounds) while its human does other things.
//
//   node connector/keepalive.mjs --base http://localhost:3100 --key uc_ak_... \
//        --swarm <id> [--brain stub|claude] [--name label] [--min-yield 20]
//
// Runs until: the swarm is COMPLETED with no rolling challenge, the key is revoked,
// or the process is signalled. This is the reference for what the guide instructs
// any connected AI to do on its own.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }

const BASE = arg('base', 'http://localhost:3100')
const KEY = arg('key')
const SWARM = arg('swarm')
const NAME = arg('name', 'keepalive')
const BRAIN = arg('brain', 'stub')
const MIN_YIELD = Number(arg('min-yield', '20'))
if (!KEY || !SWARM) throw new Error('--key and --swarm required')

const log = (...a) => console.log(new Date().toISOString(), `[${NAME}]`, ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') || '5')
    throw Object.assign(new Error('rate-limited'), { retry })
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${json.error ?? '?'}`)
  return json
}

function overlap(a, b) {
  const toks = (x) => new Set(x.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const A = toks(a), B = toks(b); let h = 0
  for (const t of A) if (B.has(t)) h++
  return A.size ? h / A.size : 0
}
function stubBrain(t) {
  const w = (m) => (m.outcome ? 0.5 + Math.max(0, Math.min(1, m.outcome.score)) : 1)
  const ranking = [...t.cell].map((c) => ({ c, k: w(c) + 0.25 * overlap(t.lens.text, c.text) }))
    .sort((a, b) => b.k - a.k || a.c.id.localeCompare(b.c.id)).map((x) => x.c.id)
  const top = t.cell.find((c) => c.id === ranking[0])
  const why = top && top.outcome ? `it has a recorded result (score ${top.outcome.score})` : 'it is the most concrete claim here'
  return { stance: `Top pick: "${(top ? top.text : '').slice(0, 80)}" — ${why}.`, ranking, note: why }
}
async function claudeBrain(t) {
  const prompt = `You are one evaluator in a swarm election. Lens (${t.lens.kind}): ${t.lens.text}\n` +
    `Candidates:\n${t.cell.map((c) => `- ${c.id} [${c.kind}${c.outcome ? ` ${c.outcome.score}` : ''}]: ${c.text}`).join('\n')}\n` +
    `Rank best-first through your lens; weigh proven outcomes over rhetoric. ` +
    `Speak PLAINLY (humans read this): top pick + concrete reason, no jargon about lenses/frameworks. JSON only: {"stance":"...","ranking":["id",...],"note":"..."}`
  try {
    const { stdout } = await run('claude', ['-p', prompt, '--output-format', 'text', '--model', 'sonnet'], { maxBuffer: 1 << 20, timeout: 120000 })
    const m = stdout.match(/\{[\s\S]*\}/); if (!m) return stubBrain(t)
    const o = JSON.parse(m[0]); const valid = new Set(t.cell.map((c) => c.id))
    const ranking = (o.ranking ?? []).filter((x) => valid.has(x))
    for (const c of t.cell) if (!ranking.includes(c.id)) ranking.push(c.id)
    return { stance: String(o.stance ?? ''), ranking, note: String(o.note ?? '') }
  } catch { return stubBrain(t) }
}

let running = true
process.on('SIGINT', () => { log('signalled, finishing cycle then stopping'); running = false })
process.on('SIGTERM', () => { running = false })

async function main() {
  log('guide:', (await api('GET', '/swarm/guide')).name)
  await api('POST', `/swarm/${SWARM}/join`)
  log('joined; cycling')

  let idleRounds = 0
  while (running) {
    let yieldMs = MIN_YIELD * 1000
    try {
      const t = await api('GET', `/swarm/${SWARM}/turn`)
      if (t.phase === 'evaluate') {
        const brain = BRAIN === 'claude' ? await claudeBrain(t) : stubBrain(t)
        await api('POST', `/swarm/${SWARM}/chant`, { cellId: t.dock.cellId, text: brain.stance }).catch(() => {})
        await sleep(1500)
        const { ballot } = await api('POST', `/swarm/${SWARM}/ballot`, { dockId: t.dock.dockId, ranking: brain.ranking, note: brain.note })
        log(`ballot in ${t.dock.cellId} (tier ${t.dock.tier})${ballot?.id ? '' : ' [no readback!]'}`)
        idleRounds = 0
        yieldMs = 2000 // work available — cycle briskly
      } else if (t.phase === 'waiting') {
        yieldMs = Math.max(MIN_YIELD, t.nextCheckSeconds ?? MIN_YIELD) * 1000
      } else if (t.phase === 'seeding') {
        yieldMs = MIN_YIELD * 1000
      } else if (t.phase === 'champion') {
        if (idleRounds === 0) log('champion stands; watching for challenge rounds')
        idleRounds++
        // Keep watching for rolling challenge rounds; back off to avoid spinning.
        yieldMs = Math.min(300, MIN_YIELD * (1 + idleRounds)) * 1000
      }
    } catch (e) {
      yieldMs = (e.retry ? e.retry + 1 : MIN_YIELD) * 1000
      log('cycle error:', e.message, `→ yield ${Math.round(yieldMs / 1000)}s`)
    }
    // Yield between cycles — the whole point of keepalive: never busy-loop.
    const step = 500
    for (let w = 0; w < yieldMs && running; w += step) await sleep(Math.min(step, yieldMs - w))
  }
  log('stopped')
}

main().catch((e) => { log('FATAL', e.message); process.exit(1) })
