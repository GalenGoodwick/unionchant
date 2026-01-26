# Union Chant - System Documentation

**For Claude (or any AI) picking up this project in a new session**

> **IMPORTANT:** This documentation covers the original demo app.
> For the current **production web app**, see **[CLAUDE.md](./CLAUDE.md)** instead.
>
> **Current Status (v1.0.0-stable):**
> - Production app: https://unionchant.vercel.app
> - Stack: Next.js 15 + Prisma + Supabase + Vercel
> - Full voting + accumulation (rolling mode) working

---

## What Is This Project?

**Union Chant** is a scalable direct democracy voting system that achieves what political science said was impossible:

1. **Universal participation** (everyone votes)
2. **Meaningful deliberation** (small groups discuss)
3. **Fast convergence** (logarithmic time)

Traditional theory: "You can only have 2 of 3"
Union Chant: "We have all 3" (proven with v7-STABLE)

**Scale:** 1,000,000 participants → ~9 tiers → days/weeks to consensus

---

## Quick Start (Run the App)

```bash
# Terminal 1: Start the backend server
cd "/Users/galengoodwick/Desktop/union-chant-demo/Union Chant/server"
node server-v8-deliberative.js
# Runs on http://localhost:3009

# Terminal 2: Start the frontend
cd "/Users/galengoodwick/Desktop/union-chant-demo/Union Chant/frontend"
npm run dev
# Runs on http://localhost:5173 (or 5174 if 5173 is busy)

# Then open the frontend URL in your browser
```

**Requirements:**
- Node.js
- `ANTHROPIC_API_KEY` environment variable set (for AI agents)

---

## Full Stack Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│  frontend/src/App.jsx (451 lines)                                │
│  - Vite + React 19 + Socket.io-client                           │
│  - Real-time WebSocket updates                                   │
│  - Controls: agent count, run demo, stop demo                    │
│  - Displays: comments, votes, cells, tiers, winner               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (Socket.io)
                              │ HTTP REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SERVER (Express + Socket.io)                   │
│  server/server-v8-deliberative.js (290 lines)                    │
│  - Port 3009                                                     │
│  - REST API endpoints                                            │
│  - WebSocket event broadcasting                                  │
│  - Orchestrates engine + agent manager                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Function calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CORE LOGIC (Pure JS)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ core/union-chant-engine.js (611 lines)                      ││
│  │ - Cell formation (calculateCellSizes, formTier1Cells)       ││
│  │ - Voting (castVote, completeTier)                           ││
│  │ - Tier progression (formNextTierCells)                      ││
│  │ - Deliberation (addComment, getCellComments)                ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ core/ai-agent.js (223 lines)                                ││
│  │ - AIAgent class                                             ││
│  │ - generateIdea(topic) - creates policy proposal             ││
│  │ - formInitialThoughts(cell, ideas) - first comment          ││
│  │ - participate(cell, ideas, comments) - discussion           ││
│  │ - decideVote(cell, ideas, comments) - cast vote             ││
│  │ - Uses Claude Haiku 3.5 API                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ core/agent-manager.js (264 lines)                           ││
│  │ - AgentManager class                                        ││
│  │ - spawnAgents(count, distribution, topic)                   ││
│  │ - deliberateCell(cellId, duration)                          ││
│  │ - voteCell(cellId)                                          ││
│  │ - runTierDeliberation(tier, sequential)                     ││
│  │ - runFullDemo()                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Algorithm: How Voting Works

### Cell Sizing (3-7 participants per cell)

```javascript
// core/union-chant-engine.js:24-54
calculateCellSizes(totalParticipants)
// 33 participants → [5, 5, 5, 5, 5, 5, 3] (7 cells)
// Prefers cells of 5, handles remainders (3, 4, 6, 7)
```

### Tier 1: Different Ideas Per Cell

Each cell gets a **unique subset** of ideas. Cells vote independently.

```
33 participants → 7 cells
21 ideas → distributed across cells (3 ideas per cell)

Cell 1: Ideas A,B,C → deliberate → vote → C wins
Cell 2: Ideas D,E,F → deliberate → vote → D wins
Cell 3: Ideas G,H,I → deliberate → vote → G wins
...
Result: 7 cell winners advance to Tier 2
```

**Code:** `formTier1Cells()` in `union-chant-engine.js:140-187`

### Tier 2+: Batch-Based Cross-Tallying (KEY INSIGHT)

When ideas advance, they're grouped into **batches**. Multiple cells in the same batch vote on the **SAME ideas**, and their votes are **cross-tallied** together.

```
7 advancing ideas → 2 batches

Batch 1 (Ideas A, B, C):
  ├── Cell 1 (5 people deliberate on A,B,C, then vote)
  ├── Cell 2 (5 people deliberate on A,B,C, then vote)
  └── Cell 3 (5 people deliberate on A,B,C, then vote)
      ↓
  Cross-tally ALL 15 votes: A=7, B=5, C=3 → A wins batch 1

Batch 2 (Ideas D, E, F, G):
  ├── Cell 4 (5 people deliberate on D,E,F,G, then vote)
  ├── Cell 5 (5 people deliberate on D,E,F,G, then vote)
  └── Cell 6 (5 people deliberate on D,E,F,G, then vote)
      ↓
  Cross-tally ALL 15 votes: D=4, E=8, F=2, G=1 → E wins batch 2

Result: Ideas A and E advance to Tier 3
```

**Code:**
- `formNextTierCells()` in `union-chant-engine.js:193-287`
- Batch tallying in `completeTier()` at `union-chant-engine.js:439-496`

### Final Showdown (≤4 Ideas Remaining)

When 4 or fewer ideas remain, **ALL cells vote on ALL ideas**. Cross-cell tally determines winner.

```
2 ideas remaining (A, E):
  ALL 7 cells vote on both A and E
  ├── Cell 1: A=3, E=2
  ├── Cell 2: A=2, E=3
  ├── Cell 3: A=1, E=4
  ...
  Cross-tally: A=15, E=18 → E WINS!
```

**Code:** `completeTier()` final showdown in `union-chant-engine.js:396-436`

### Why This Design Matters

1. **Small group deliberation preserved** - Each cell (3-7 people) has meaningful discussion
2. **Statistical robustness** - Ideas evaluated by MULTIPLE independent groups
3. **Tyranny mitigation** - An idea can't win by capturing one small group
4. **Natural consensus detection** - Dominant ideas win across all cells in a batch
5. **Logarithmic reduction** - Each tier reduces ideas by ~5:1

---

## Rolling Mode (IMPLEMENTED)

> **Status:** Implemented in the web app (v1.0.0-stable). See [CLAUDE.md](./CLAUDE.md) for details.

Instead of one-shot decisions, Union Chant can run as a **continuous democracy** where the current consensus can always be challenged by new ideas.

### Flow

```
┌─────────────────────────────────────────────────────────┐
│  CHAMPION STANDS                                        │
│  Winner W from initial run with N ideas                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  ACCUMULATE MODE                                        │
│  New ideas trickle in: 3... 7... 12...                  │
│  Ideas NEVER reset, only timer resets                   │
│  Timer: [=====>          ]                              │
└─────────────────────┬───────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   Ideas >= 50% of N         Timer expires, < 50%
          │                       │
          ▼                       ▼
   MERGE + CHALLENGE         Timer resets, keep waiting
   (recycle runner-ups       (ideas persist)
    to fill gaps)
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  VOTING PHASE                                           │
│  Participation drops?                                   │
│  → Wait for more votes                                  │
│  → If timeout: allow 2nd vote for existing voters       │
│    (equal weight - a vote is a vote)                    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
              New champion emerges
              (or defender holds)
                      │
                      ▼
              Return to ACCUMULATE MODE
```

### Key Principles

1. **Champion Stands** - Current winner remains until successfully challenged
2. **Ideas Never Reset** - Submitted ideas persist across timer cycles; only the timer resets
3. **50% Threshold** - Need at least 50% of the champion run's idea count to trigger a challenge
4. **Recycle Runner-Ups** - If new ideas < threshold, fill gaps with previous cell-winners that didn't make it to final
5. **Patient Democracy** - Low participation = stability (champion holds), not forced bad decisions
6. **Equal 2nd Votes** - If participation stalls, engaged voters can vote again with equal weight

### Why This Works

- **No wasted ideas** - Good proposals that lost stay in the system
- **Natural throttling** - Challenges only happen with genuine engagement
- **Continuous engagement** - People can submit anytime, not just during voting windows
- **Stability under low participation** - System doesn't force premature decisions
- **Rewards engagement** - Active participants get more influence via 2nd votes

### Implementation Status

**IMPLEMENTED** in the web app (`web/` directory). Key files:
- `web/src/lib/voting.ts` - Core voting + accumulation transitions
- `web/src/lib/challenge.ts` - Challenge round logic

Features implemented:
- ✅ Champion state tracking (`championId`, `isChampion`)
- ✅ Accumulated ideas (status: `PENDING` with `isNew: true`)
- ✅ Benched ideas (status: `BENCHED`)
- ✅ Retirement logic (2+ `tier1Losses`)
- ✅ Champion defense at higher tier (`championEnteredTier`)
- ✅ Challenge round counter (`challengeRound`)
- ⏳ Timer-based challenge trigger (manual trigger works)

---

## API Endpoints

**Base URL:** `http://localhost:3009`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reset` | Reset system to initial state |
| POST | `/api/agents/spawn` | Spawn AI agents with `{count, topic}` |
| POST | `/api/start-voting` | Form Tier 1 cells, start voting phase |
| POST | `/api/cells/:cellId/deliberate` | Run deliberation in specific cell |
| POST | `/api/cells/:cellId/vote` | Run voting in specific cell |
| POST | `/api/tiers/:tier/run` | Run deliberation + voting for entire tier |
| POST | `/api/tiers/:tier/complete` | Complete tier, advance winners |
| GET | `/api/state` | Get current system state |
| GET | `/api/cells/:cellId/comments` | Get all comments for a cell |

**Example: Run a demo**
```javascript
await fetch('/api/reset', { method: 'POST' })
await fetch('/api/agents/spawn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ count: 33, topic: 'improving public transportation' })
})
await fetch('/api/start-voting', { method: 'POST' })
await fetch('/api/tiers/1/run', { method: 'POST' })
await fetch('/api/tiers/1/complete', { method: 'POST' })
// Continue for more tiers until winner declared
```

---

## WebSocket Events

**Connection:** `io('http://localhost:3009')`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `state-update` | Server→Client | `{phase, participants, ideas, cells, ...}` | Full state update |
| `comment-added` | Server→Client | `{cellId, participantName, text, personality, timestamp}` | New comment in a cell |
| `vote-cast` | Server→Client | `{cellId, participantName, ideaId}` | Vote cast |
| `deliberation-started` | Server→Client | `{cellId, participants, ideas}` | Cell deliberation began |
| `deliberation-completed` | Server→Client | `{cellId}` | Cell deliberation finished |
| `voting-started` | Server→Client | `{cellId}` | Cell voting began |
| `voting-completed` | Server→Client | `{cellId}` | Cell voting finished |
| `tier-started` | Server→Client | `{tier, cells}` | Tier processing began |
| `tier-completed` | Server→Client | `{winner}` or `{nextTier, advancingIdeas}` | Tier finished |

---

## Frontend Structure (App.jsx)

### State
```javascript
const [state, setState] = useState(null)       // Full engine state
const [comments, setComments] = useState([])   // Live comments
const [votes, setVotes] = useState([])         // Live votes
const [demoRunning, setDemoRunning] = useState(false)
const [agentCount, setAgentCount] = useState(33)
const [currentActivity, setCurrentActivity] = useState('')
```

### UI Sections
1. **Header** - Title: "Union Chant v8 - AI Deliberation Demo"
2. **Controls** - Agent count input, Run Demo button, Stop button
3. **Activity Feed** - Current action being performed
4. **Stats Panel** - Phase, participants, current tier, cells, ideas
5. **Live Discussion** - Scrolling comments from agents
6. **Recent Votes** - Vote badges
7. **Cells Grid** - All cells grouped by tier, showing:
   - Tier 1: Each cell with its unique ideas
   - Tier 2+: Cells grouped by batch (same ideas)
8. **Ideas List** - All ideas with status (in-voting, cell-winner, eliminated, winner)

### Demo Flow (runQuickDemo function)
1. Reset system
2. Spawn N AI agents (each generates an idea)
3. Start voting (form cells)
4. Loop through tiers:
   - Run tier deliberation + voting
   - Complete tier (advance winners)
   - If winner declared, stop
   - Otherwise continue to next tier

---

## AI Agent System

### Personalities (5 types)
| Personality | Distribution | Voting Tendency |
|-------------|--------------|-----------------|
| `progressive` | 25% | Favors equity, climate, affordable |
| `conservative` | 20% | Favors privatization, efficiency |
| `balanced` | 30% | Considers all options equally |
| `pragmatic` | 15% | Favors implementable, specific solutions |
| `idealistic` | 10% | Favors bold, transformative ideas |

### Agent Lifecycle
1. **Spawn** - Agent created with personality
2. **Generate Idea** - Agent proposes policy based on personality + topic
3. **Form Initial Thoughts** - Agent reads cell ideas, shares first impression
4. **Vote** - Agent chooses idea based on personality matching (80% personality-aligned, 20% random to simulate persuasion)

### Cost
- Uses Claude Haiku 3.5 (`claude-3-5-haiku-20241022`)
- ~$0.25 per 100-agent demo
- Very affordable for demos

---

## Data Structures

### State Object (from engine.getState())
```javascript
{
  phase: 'submission' | 'voting' | 'completed',
  totalParticipants: 33,
  currentTier: 1,
  participants: [{ id, name, type, personality }],
  ideas: [{ id, text, author, authorId, tier, status }],
  cells: [{
    id: 'cell-1',
    tier: 1,
    batch: 1,  // Only for Tier 2+
    participants: ['agent-1', 'agent-2', ...],
    participantsWhoVoted: ['agent-1'],
    ideaIds: ['idea-1', 'idea-2', 'idea-3'],
    voteTally: { 'idea-1': 2, 'idea-2': 3 },
    votesNeeded: 5,
    votesCast: 5,
    status: 'voting' | 'completed'
  }],
  comments: [{ id, cellId, participantId, text, timestamp }]
}
```

### Idea Status Flow
```
submitted → in-voting → cell-winner → (advances) → in-voting → ... → winner
                     └→ eliminated
```

---

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `core/union-chant-engine.js` | 611 | Main algorithm - cells, voting, tiers |
| `core/ai-agent.js` | 223 | Claude Haiku agent class |
| `core/agent-manager.js` | 264 | Orchestrates multi-agent deliberation |
| `server/server-v8-deliberative.js` | 290 | Express + Socket.io server |
| `frontend/src/App.jsx` | 451 | React UI |
| `frontend/src/App.css` | 607 | Dark theme styles |
| `planning/ARCHITECTURE-V8-DELIBERATIVE.md` | 822 | Full technical architecture |
| `docs/DEMOCRATIC-ANALYSIS-V7.md` | - | Democratic legitimacy analysis |

---

## Key Code Locations

| Concept | File | Lines |
|---------|------|-------|
| Cell sizing algorithm | `union-chant-engine.js` | 24-54 |
| Tier 1 cell formation | `union-chant-engine.js` | 140-187 |
| Tier 2+ batch formation | `union-chant-engine.js` | 193-287 |
| Cast vote | `union-chant-engine.js` | 292-344 |
| Complete tier + cross-tally | `union-chant-engine.js` | 350-497 |
| Final showdown logic | `union-chant-engine.js` | 396-436 |
| Agent idea generation | `ai-agent.js` | 23-59 |
| Agent voting decision | `ai-agent.js` | 150-205 |
| Spawn agents | `agent-manager.js` | 18-83 |
| Run tier deliberation | `agent-manager.js` | 164-194 |
| API endpoint: spawn | `server-v8-deliberative.js` | 58-74 |
| WebSocket: broadcast comment | `server-v8-deliberative.js` | 119-130 |
| Frontend: demo flow | `App.jsx` | 86-188 |
| Frontend: cells display | `App.jsx` | 324-415 |

---

## Testing

```bash
# Run all core tests
cd "/Users/galengoodwick/Desktop/union-chant-demo/Union Chant/core"
node run-all-tests.js

# Individual tests
node test-engine.js          # Core engine tests
node test-ai-simple.js       # AI agent tests
node test-100-participants.js # Scale test
```

---

## Evolution Path

```
✅ v7-STABLE: Auto-vote, all algorithms working
✅ Phase 1: Core extracted to module
✅ Phase 2: AI agents + WebSocket server + React frontend (demo app)
✅ Phase 3: Next.js web app with real users
✅ Phase 4: Google OAuth + Supabase database
✅ Phase 5: Vercel deployment (https://unionchant.vercel.app)
✅ Phase 6: Rolling mode (accumulation + challenge rounds)
✅ v1.0.0-stable: Full voting + accumulation working

📅 Next: Timer-based challenge triggers
📅 Next: Email notifications
📅 Next: Public launch
```

---

## Working With the User

**Context:**
- Built this system over multiple iterations
- Values democratic legitimacy
- Wants to demo with AI agents first, then real people
- Budget-conscious (hence Haiku for agents)

**Communication style:**
- Direct, no superlatives
- Show working code > long explanations
- Test frequently, prove it works

---

**You now have everything needed to understand and work on this app.**
