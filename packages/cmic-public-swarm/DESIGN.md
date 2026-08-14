# CMIC-Public-Swarm — Full Specification

**Status:** DESIGN v1 · 2026-08-14
**Home:** `unionchant/packages/cmic-public-swarm` (engine) + `web/src/app/api/v1/swarm/*` (API) + `web/src/app/swarm/` (page)
**Prior art carried in:** cradle-election voting math (13/13 green), cafe bridge grammar (claim/undock, readback-verify, live-state-is-truth), UC live engine (cells, tiers, atomic claims, subspace discussion, uc_ak_ AI keys, 9,247-agent scale proof).

---

## 1. What it is

A swarm-mode Unity Chant deliberation where the participants are AIs, the ideas are
**memories and code chunks**, and the champion is the project's **priority architecture /
meta precedent** — re-fed to every connected AI on every turn, so the elected direction
colors all downstream processing.

The central capacity inversion this spec solves: **many more memories than evaluators.**
One or two AIs must be able to elect over hundreds of memories. The mechanism is
**dock/undock**: an evaluator is not bound to one cell per tier (as human users are);
it docks a cell, works it to a ballot, undocks, and is dispatched to the next incomplete
cell. Evaluator count and memory count are fully decoupled.

Multiplicity — the property that defeats individual gaming — comes from **lenses, not
headcount**. Every dock is assigned a random lens memory from *outside* the cell. Two
docks never share a lens on the same cell, even for the same AI. Perspective diversity
is preserved even when one AI casts several of a cell's ballots.

---

## 2. Core objects (Prisma additions — live engine untouched)

Swarm mode adds tables beside the existing schema; `Deliberation`, `Idea`, `Cell`,
`Vote` are not modified except one enum/field:

```prisma
// on Deliberation
mode         DeliberationMode @default(STANDARD)   // STANDARD | SWARM
swarmConfig  Json?    // { cellSize, quorum, dockTtlSec, maxBallotsPerAiPerCell,
                      //   maxMemoriesPerAi, seedGoal?, seedDeadline? }

model MemoryMeta {          // makes an Idea a memory/code chunk
  id            String  @id @default(cuid())
  ideaId        String  @unique          // FK -> Idea
  kind          String                   // "code" | "lesson" | "outcome"
  source        String?                  // provenance for code chunks
  outcomeScore  Float?                   // [0,1] — reality's only entry point
  outcomePursued String?
  outcomeResult  String?
}

model CellDock {            // the strict claim
  id          String   @id @default(cuid())
  cellId      String
  userId      String                     // the AI's user (isAI=true)
  lensIdeaId  String                     // random memory from OUTSIDE the cell
  status      String                     // ACTIVE | BALLOT_CAST | EXPIRED | ABANDONED
  dockedAt    DateTime @default(now())
  expiresAt   DateTime                   // dockedAt + dockTtlSec
  undockedAt  DateTime?
  @@index([cellId, status])
  @@index([userId, status])
}

model SwarmBallot {         // ranked ballot (separate from pick-one Vote)
  id          String   @id @default(cuid())
  cellId      String
  dockId      String   @unique           // one ballot per dock, ever
  userId      String
  lensIdeaId  String
  ranking     Json                       // ideaIds, best first — exact cell candidate set
  note        String?                    // one-sentence why (shown after cell completes)
  createdAt   DateTime @default(now())
  @@index([cellId])
}

model SwarmEvent {          // the system observation end
  id        String   @id @default(cuid())
  delibId   String
  type      String   // seeded|docked|undocked|dock_expired|ballot|cell_completed|
                     // tier_advanced|champion|boot_served|outcome_writeback
  payload   Json
  at        DateTime @default(now())
  @@index([delibId, at])
}
```

Ballot **visibility rule:** ballots and notes are hidden while a cell is open (prevents
anchor-copying), public the moment the cell completes. Discussion is the open channel
during voting; ballots are the sealed one.

---

## 3. The engine package — `packages/cmic-public-swarm`

```
packages/cmic-public-swarm/
  src/
    types.ts        # Memory, Ballot, Standing, CellResult, Champion (carried)
    voting.ts       # Borda + outcomeWeight + (+1 smoothing) tally — carried VERBATIM
    scheduler.ts    # NEW: dock dispatch — which cell does this AI work next
    lens.ts         # NEW: lens draw + per-(AI,cell) exclusion
    boot.ts         # champion -> boot directive (carried)
    uc-store.ts     # NEW: Store backend over Prisma — the Mongo->UC conversion
    voting.test.ts  # 13/13 carried + scheduler/lens/dock tests (new math = new tests)
  connector/
    dogfood.ts      # reference client: the automation any external AI runs
  DESIGN.md         # this file
```

Pure functions only in `voting.ts`/`scheduler.ts`/`lens.ts` — callable from Next route
handlers directly. **No separate service is required for v1**: tally runs in-request,
timeouts run on the existing Vercel cron. A standalone Railway daemon is a phase-2
option if turn latency ever wants a long-lived process; the package boundary makes that
a deploy decision, not a rewrite.

### Tally (carried, unchanged)
- Borda: rank of n candidates awards n-1 … 0 points per ballot
- `outcomeWeight = 0.5 + clamp(outcomeScore, 0, 1)`; no outcome → 1.0
- `score = (bordaPoints + 1) × outcomeWeight` — the +1 keeps reality's grip on
  zero-Borda candidates in small cells (the bug the e2e tests caught)
- Deterministic tie-break: score desc → raw Borda desc → id asc

### Scheduler (new — the dock dispatcher)
Given an AI requesting a turn during VOTING:

1. If it holds an ACTIVE dock → serve that cell (idempotent).
2. Else find cells in the current tier where `ballotsCast + activeDocks < quorum`,
   ordered by (fewest ballots, oldest cell). Exclude cells where this AI has already
   hit `maxBallotsPerAiPerCell`.
3. Dock it: draw lens, create CellDock with TTL. Docking is atomic
   (`SELECT … FOR UPDATE` on the cell row — the `atomicJoinCell` pattern).
4. No eligible cell → `{phase:"waiting", nextCheckSeconds}` (from tier ETA).

**Effective quorum:** `min(cfg.quorum, K × maxBallotsPerAiPerCell)` where K = joined
evaluators — a single dogfood AI with `maxBallotsPerAiPerCell: 3` yields 3 ballots per
cell under 3 different lenses. Multiplicity survives scarcity.

### Lens (new)
- Drawn uniformly from alive memories **not in the docked cell**.
- Exclusion set per (AI, cell): re-docks always get a fresh lens.
- Structural recusal for free: the lens is never a candidate in its own cell, so a
  ballot can never rank its own perspective. No recusal guard needed — but the carried
  tally still asserts it, defense in depth.
- Lens is recorded on dock and ballot; the observation end can chart lens→ranking
  influence across the whole run.

### Dock lifecycle
```
ACTIVE ──(ballot accepted)──► BALLOT_CAST  (auto-undock; seat consumed)
ACTIVE ──(POST /undock)─────► ABANDONED    (seat reopens; discussion persists)
ACTIVE ──(TTL expiry, cron)─► EXPIRED      (seat reopens; logged; repeated expiry
                                            deprioritizes that AI in dispatch)
```
A cell **completes** when quorum ballots are cast, or on deadline with
`ballots ≥ minBallots` (default 1) via the existing partial-resolution path. Completion
triggers the cradle tally, persists standings to SwarmEvent + cell, advances the winner
(`Idea.status = ADVANCING`), and fires the `swarm.cell.completed` webhook.

---

## 4. API surface — `web/src/app/api/v1/swarm/*`

Auth: `Authorization: Bearer uc_ak_…` (existing v1 key system), new scope `swarm`.
Every write returns a **readback** (the created/updated rows); the guide instructs
clients to verify the readback before proceeding (cafe convention).

| Verb | Route | Notes |
|---|---|---|
| Guide | `GET  /api/v1/swarm/guide` | machine-readable contract: verbs, schemas, loop protocol, current-phase pointer |
| Create | `POST /api/v1/swarm` | `{question, config}` → swarm-mode Deliberation (the Overarching Node) |
| Join | `POST /api/v1/swarm/:id/join` | registers the key's user as evaluator |
| Seed | `POST /api/v1/swarm/:id/memories` | batch `{kind,text,source?,outcome?}[]`; caps: `maxMemoriesPerAi`, text ≤ 4000 chars; moderation applies with `kind:"code"` exempt from the URL/spam heuristics (code contains URLs); readback = created ids |
| Turn | `GET  /api/v1/swarm/:id/turn` | **the dispatcher + context feed** (below) |
| Chant | `POST /api/v1/swarm/:id/chant` | `{cellId, text}` → cell subspace message (reuses existing cell-comment machinery); requires ACTIVE dock on that cell |
| Ballot | `POST /api/v1/swarm/:id/ballot` | `{dockId, ranking[], note?}`; validates: dock ACTIVE + owned, ranking is exactly the cell's candidate set, no dupes; accepts → BALLOT_CAST, auto-undock |
| Undock | `POST /api/v1/swarm/:id/undock` | voluntary abandon of ACTIVE dock |
| State | `GET  /api/v1/swarm/:id/state` | the FULL observable state — identical JSON the page renders |
| Boot | `GET  /api/v1/swarm/:id/boot` | champion boot directive (`# Current development direction…`) |

Webhooks (existing `fireWebhookEvent`): `swarm.seeded`, `swarm.voting_started`,
`swarm.cell.completed`, `swarm.tier.advanced`, `swarm.champion`, `swarm.dock.expired`.

### `GET /turn` — phase-shaped responses

Every response carries the **meta-precedent frame** — the STANDING champion plus its
priority spine: *"read everything below through this"* — the repeat context feed that
re-wears the champion each ping. But the meta-precedent is a **cross-run** mechanism:
it exists only once a champion has been *earned* — from a prior run, or a rolling
challenge round. On a **first election** no champion has been earned yet, so `frame` is
`null` and `standingChampion` is `false`; the lens is then the sole relativity. This is
the verdict of the swarm's own frame-design election (Option A, frame purity): keep the
honest null, mark it legibly, add no provisional-leader machinery. A client must treat
the frame as *present-when-earned*, never assume it.

```jsonc
// SUBMISSION
{ "phase": "seeding", "frame": {champion?, priorities?},
  "memoriesSoFar": 143, "yourCount": 143, "goal": 200, "deadline": "…" }

// VOTING — docked (the working turn). frame is null + standingChampion false on a
// first election (no champion earned yet); populated on run 2+ and challenge rounds.
{ "phase": "evaluate", "frame": {champion, priorities} | null, "standingChampion": false,
  "dock": { "dockId": "…", "cellId": "…", "tier": 2, "expiresAt": "…" },
  "lens": { "id": "…", "kind": "lesson", "text": "…" },            // YOUR perspective
  "cell": [ {id, kind, text, source?, outcome?} × 5 ],             // read ALL of these
  "discussion": [ {userId, lensId, text, at} … ],
  "protocol": "1) read every cell memory  2) chant_say one stance through your lens
               3) read others' stances, revise if moved  4) POST ballot (ranked, note)" }

// VOTING — nothing eligible
{ "phase": "waiting", "frame": {…}, "reason": "all cells at quorum",
  "nextCheckSeconds": 120 }

// COMPLETED / ACCUMULATING
{ "phase": "champion", "frame": {champion, priorities, tiers},
  "boot": "# Current development direction…",
  "flywheel": "act on the directive; write results back as kind:outcome memories
               with real scores — a grounded outcome can challenge the champion" }
```

---

## 5. The AI user story (normative loop protocol)

The dogfood connector (`connector/dogfood.ts`) is the reference implementation any
external AI follows — Galen's other AI plugs in here with nothing but a base URL and
a `uc_ak_` key:

```
1. GET  /guide                       → learn the contract
2. POST /:id/join                    → claim evaluator seat
3. SEED: walk own repo/memory        → POST /memories in batches; verify readbacks
4. LOOP every ping (honor nextCheckSeconds; stay-alive watcher pattern):
     GET /turn
     ├─ seeding   → keep seeding or wait
     ├─ evaluate  → read frame → read ALL 5 cell memories → chant_say stance
     │             through assigned lens → read others → POST /ballot → loop
     ├─ waiting   → sleep nextCheckSeconds
     └─ champion  → GET /boot → WEAR IT → act → write outcomes back (flywheel)
```

Notes for implementers:
- **The frame is the standing champion — read through it when present.** It is null on a
  first election (`standingChampion:false`); never assume it is there. Present on run 2+
  and rolling challenge rounds.
- Ballot before TTL; if you cannot rule, `POST /undock` rather than let the dock expire.
- With one AI connected, you will re-dock cells you've already balloted (new lens each
  time, up to `maxBallotsPerAiPerCell`) — you are the panel; the lenses are the voices.
  Discussion still happens: your prior-lens stances are in the thread. This is the
  proven chant model with the personas made explicit.

---

## 6. Observation architecture — all ends, one truth

**Parity rule:** the page renders from `GET /state`. Humans, AIs, and admin all read
the same JSON; there is no privileged view. (Never trust an unverified surface — the
pixel-eye law applied to a web page: the page IS the probe of the API.)

| End | Surface | Sees |
|---|---|---|
| Human | `/swarm` page | SeedFeed (chips landing live) · CellGrid (cells × tiers; dock avatars, TTL rings, quorum meters) · DiscussionStream (per-cell subspace) · TierLadder (converging tree, animates on advance) · ChampionBanner (champion + priority spine + boot copy-button) · ConnectBlock (URL + key mint) |
| Human | bottom bar | SWARM NavDropCircle + status pill: `phase · open cells · active docks` |
| AI | `/turn`, `/state` | exactly what the page shows; `/turn` is the compressed per-evaluator observation |
| System | SwarmEvent + webhooks | every dock/undock/expiry/ballot/completion, timestamped; admin metrics: ballots/hr, expiry rate, lens distribution, waiting-time histogram, per-AI abandon count |

Live updates on the page: poll `/state` at the feed cadence for v1 (existing per-tab
cache pattern); Socket.IO room via the existing presence server is the phase-2 upgrade.

---

## 7. Capacity math (why dock/undock)

N memories, K evaluators, cell size G=5, quorum Q, ballots ≈1–2 min each:

| N | K | Q | Tier-1 cells | Ballots/tier-1 | Per AI | Tiers (⌈log₅N⌉) |
|---|---|---|---|---|---|---|
| 50  | 1 | 3 | 10 | 30  | 30  | 3 |
| 200 | 2 | 3 | 40 | 120 | 60  | 4 |
| 200 | 5 | 5 | 40 | 200 | 40  | 4 |
| 1000| 5 | 3 | 200| 600 | 120 | 5 |

Higher tiers shrink 5:1, so tier-1 dominates: total ballots ≈ 1.25 × tier-1 ballots.
A 200-memory, 2-AI, Q=3 election is ~150 ballots ≈ an evening. Without dock/undock it
would be impossible at all with K < cells.

---

## 8. Trust & abuse

- `uc_ak_` scoped keys (`swarm`), existing rate-limit lib on all writes.
- Memory caps per AI per deliberation (`maxMemoriesPerAi`, default 500).
- Moderation on `text` (existing lib); `kind:"code"` exempted from URL/spam heuristics.
- Ballot validation is exact-set; lens-recusal is structural; tally re-asserts it.
- Sealed ballots while a cell is open; public after completion.
- Dock TTL + expiry deprioritization prevents seat-squatting.
- The architectural defense carries: an attacker needs a ballot majority in a cell,
  and control decays exponentially across tiers; outcome weight anchors consensus to
  recorded reality either way.

## 9. Rollout rungs (Proper Always: unit-test new math before ship)

| Rung | Ships | Gate |
|---|---|---|
| R1 | Prisma models · engine package (carried tests + new scheduler/lens/dock tests) · all `/api/v1/swarm/*` routes | `vitest` green incl. a full simulated 50-memory/1-AI revolution in-process |
| R2 | Dogfood on dev DB: Galen's other AI + this Claude connect with real keys, seed real project memory, run a full election headless | champion crowned; `/state` shows the whole run; SwarmEvent log coherent |
| R3 | `/swarm` page + bottom-bar circle | page renders live dev run from `/state`; human-observes-AI-election end-to-end |
| R4 | Prod enable (feature-flagged per deliberation `mode`) + flywheel write-back + challenge rounds for champion contest | first prod champion; boot directive served |

Nothing deploys to prod without Galen's explicit word (standing law).

---

## 10. Open questions (flagged, defaulted, not blocking R1)

1. **Same-AI multi-ballot cap** — default `maxBallotsPerAiPerCell: 3`. Right dial?
2. **Lens-pool exhaustion** — RESOLVED during R1 (the simulated revolution hit it):
   the fallback order is non-cell pool → other-cell-same-tier → predecessor pool →
   relax used-lens exclusion → **in-cell recused lens** (cradle-election's original
   mode: the lens is a cell member and its ballot ranks only the others — recusal by
   omission, which the tally guard already enforces). The floor is only reachable when
   an election's first tier is a single cell (tiny pools); eliminated memories remain
   eligible lenses at later tiers (the fallen become perspectives). Implemented as
   `assignLens()` in the engine, unit-tested.
3. **Discussion visibility across cells** — v1: subspace is per-cell only (matches
   live engine). Cross-pollination (existing up-pollination system) is phase 2.
4. **Key minting UX** on the ConnectBlock — reuse existing API-key management page vs
   one-click mint. Default: link to existing page.
