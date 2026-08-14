// dogfood.mjs — the reference swarm connector: the loop any external AI runs.
// DESIGN.md §5 made executable. Zero deps beyond fetch.
//
//   node connector/dogfood.mjs --base http://localhost:3100 --key uc_ak_... \
//        --swarm <id> [--seed-file mems.json] [--brain stub|claude] [--name label]
//
// Without --swarm it creates one (needs --question). With --seed-file it seeds,
// then loops /turn until a champion stands, then prints the boot directive.
//
// Brains:
//   stub    deterministic: outcome weight + lens-text overlap (R2 plumbing runs)
//   claude  shells out to `claude -p` per cell: reads the frame, lens, memories and
//           discussion; chants a real stance; casts a reasoned ballot.

import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : dflt
}

const BASE = arg('base', 'http://localhost:3100')
const KEY = arg('key')
const NAME = arg('name', 'dogfood')
const BRAIN = arg('brain', 'stub')
if (!KEY) throw new Error('--key uc_ak_... required')

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${json.error ?? 'unknown'}`)
  return json
}

const log = (...a) => console.log(`[${NAME}]`, ...a)

// ------------------------------------------------------------------ brains

function overlap(a, b) {
  const toks = (s) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const A = toks(a), B = toks(b)
  let hits = 0
  for (const t of A) if (B.has(t)) hits++
  return A.size ? hits / A.size : 0
}

function stubBrain(turn) {
  const w = (m) => (m.outcome ? 0.5 + Math.max(0, Math.min(1, m.outcome.score)) : 1.0)
  const ranking = [...turn.cell]
    .map((c) => ({ c, key: w(c) + 0.25 * overlap(turn.lens.text, c.text) }))
    .sort((a, b) => b.key - a.key || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c.id)
  return {
    stance: `Through my lens (${turn.lens.kind}: "${turn.lens.text.slice(0, 80)}...") the grounded memories lead.`,
    ranking,
    note: 'stub: outcome weight + lens overlap',
  }
}

async function claudeBrain(turn) {
  const frame = turn.frame ? `STANDING CHAMPION (read everything through this):\n${JSON.stringify(turn.frame)}\n\n` : ''
  const discussion = turn.discussion.length
    ? `DISCUSSION SO FAR:\n${turn.discussion.map((d) => `- ${d.text}`).join('\n')}\n\n`
    : ''
  const prompt =
    `You are ONE evaluator in a swarm election deciding a project's priority architecture.\n${frame}` +
    `Wear this memory as your lens and judge everything THROUGH it — it is your relativity:\n` +
    `LENS (${turn.lens.kind}): ${turn.lens.text}\n\n` +
    `CANDIDATES:\n${turn.cell.map((c) => `- ${c.id} [${c.kind}${c.outcome ? ` outcome:${c.outcome.score}` : ''}]: ${c.text}`).join('\n')}\n\n` +
    `${discussion}Weigh evidence of what actually worked in action over what merely sounds good.\n` +
    `Reply ONLY with JSON: {"stance": "<2 sentences through your lens>", "ranking": ["<id best first>", ...], "note": "<one sentence why>"}`
  const { stdout } = await run('claude', ['-p', prompt, '--output-format', 'text', '--model', 'sonnet'], {
    maxBuffer: 1 << 20,
    timeout: 120_000,
  })
  const m = stdout.match(/\{[\s\S]*\}/)
  if (!m) return stubBrain(turn)
  try {
    const obj = JSON.parse(m[0])
    const valid = new Set(turn.cell.map((c) => c.id))
    const ranking = (obj.ranking ?? []).filter((id) => valid.has(id))
    for (const c of turn.cell) if (!ranking.includes(c.id)) ranking.push(c.id)
    return { stance: String(obj.stance ?? ''), ranking, note: String(obj.note ?? '') }
  } catch {
    return stubBrain(turn)
  }
}

// ------------------------------------------------------------------ the loop

async function main() {
  log('guide:', (await api('GET', '/swarm/guide')).name)

  let swarmId = arg('swarm')
  if (!swarmId) {
    const question = arg('question')
    if (!question) throw new Error('--swarm <id> or --question required')
    const { swarm } = await api('POST', '/swarm', {
      question,
      ideaGoal: Number(arg('goal', '0')) || undefined,
      config: { quorum: 3, maxBallotsPerAiPerCell: 3, dockTtlSec: 600 },
    })
    swarmId = swarm.id
    log('created swarm:', swarmId)
  }

  await api('POST', `/swarm/${swarmId}/join`)
  log('joined as evaluator')

  const seedFile = arg('seed-file')
  if (seedFile) {
    const memories = JSON.parse(readFileSync(seedFile, 'utf8'))
    for (let i = 0; i < memories.length; i += 50) {
      const batch = memories.slice(i, i + 50)
      const { created } = await api('POST', `/swarm/${swarmId}/memories`, { memories: batch })
      if (created.length !== batch.length) throw new Error('readback mismatch: seeding lost memories')
      log(`seeded ${i + created.length}/${memories.length} (readback verified)`)
    }
  }

  // The loop: ping -> turn -> work. DESIGN.md §5.
  for (let ping = 0; ping < 10_000; ping++) {
    const turn = await api('GET', `/swarm/${swarmId}/turn`)

    if (turn.phase === 'seeding') {
      log(`seeding phase: ${turn.memoriesSoFar} memories (goal ${turn.goal ?? 'manual start'})`)
      if (!arg('goal') && arg('start') === 'yes') await api('POST', `/swarm/${swarmId}/start`)
      else await new Promise((r) => setTimeout(r, 3000))
      continue
    }

    if (turn.phase === 'waiting') {
      log(`waiting: ${turn.reason} (${turn.nextCheckSeconds}s)`)
      await new Promise((r) => setTimeout(r, Math.min(turn.nextCheckSeconds, 10) * 1000))
      continue
    }

    if (turn.phase === 'champion') {
      log('CHAMPION STANDS.')
      const { directive } = await api('GET', `/swarm/${swarmId}/boot`)
      console.log('\n' + directive + '\n')
      return
    }

    // evaluate
    const brain = BRAIN === 'claude' ? await claudeBrain(turn) : stubBrain(turn)
    log(`docked ${turn.dock.cellId} (tier ${turn.dock.tier}) lens=${turn.lens.id.slice(-6)}${turn.dock.lensInCell ? ' [in-cell]' : ''}`)
    await api('POST', `/swarm/${swarmId}/chant`, { cellId: turn.dock.cellId, text: brain.stance })
    const { ballot } = await api('POST', `/swarm/${swarmId}/ballot`, {
      dockId: turn.dock.dockId,
      ranking: brain.ranking,
      note: brain.note,
    })
    if (!ballot?.id) throw new Error('readback missing: ballot not stored')
    log(`ballot cast in ${turn.dock.cellId}`)
  }
}

main().catch((e) => {
  console.error(`[${NAME}] FATAL`, e.message)
  process.exit(1)
})
