# Union Chant - Product Specification

## Vision

A "Quora for collective decision-making" where anyone can pose a question, gather ideas from participants, and use cell-based deliberation to surface the best answer through structured voting.

---

## Core Concepts

### Deliberation (Room)
A single question/topic that people deliberate on. Each deliberation is isolated with its own participants, ideas, cells, and votes.

### Cell
A small group (3-7 people) that discusses and votes on a subset of ideas. Cells enable scalable deliberation - instead of everyone debating everything, small groups have focused discussions.

### Tier
A round of voting. Tier 1 has many cells with different ideas. Winners advance to Tier 2 where cells vote on the advancing ideas. Process continues until one idea wins.

### Champion
The winning idea. In accumulation mode, the champion can be challenged by new ideas over time.

### Accumulation Mode
After a winner is declared, new ideas can be submitted. When enough challengers accumulate, a new vote is triggered. The champion enters at Tier N+1 (one tier higher than where it originally won) as an advantage for being previously vetted.

---

## User Roles

### Creator
- Creates a deliberation with a question/topic
- Configures timers:
  - Idea submission phase duration
  - Voting tier timeout
  - 2nd vote timeout (after main timeout)
  - Accumulation timeout (if enabled)
- Can enable/disable accumulation mode
- Can manually trigger challenge (optional)

### Participant
- Joins a deliberation
- Submits ideas during submission phase
- Assigned to cells for voting
- Deliberates (comments) within their cell
- Casts votes
- Can rejoin if they drop out (placed in available cell)

### Spectator
- Browses public deliberations
- Views cell discussions (read-only)
- Sees results and champion
- Cannot vote or comment

---

## User Flows

### 1. Create Deliberation

```
Creator clicks "New Question"
  → Enter question/topic
  → Configure settings:
      - Submission phase: [duration picker]
      - Voting timeout per tier: [duration picker]
      - 2nd vote timeout: [duration picker]
      - Enable accumulation mode: [toggle]
      - Public/Private: [toggle]
  → Create
  → Share link with participants
```

### 2. Join & Submit Ideas

```
Participant opens deliberation link
  → Login/signup if needed
  → See question and current ideas
  → Submit their idea (during submission phase)
  → Wait for voting to begin
```

### 3. Voting Phase

```
Voting begins
  → Participant assigned to Cell
  → See ideas in their cell
  → Read/participate in cell discussion
  → Cast vote before timeout
  → If timeout: 2nd vote period begins
  → Tier completes → advance to next tier or winner declared
```

### 4. Session Recovery

```
Participant closes browser
  → Marked as "idle" after inactivity timeout
  → If voting deadline passes → marked as "dropped"
  → Their slot opens for late joiners

Participant returns:
  → If their cell still voting → resume in same cell
  → If their cell completed → show what happened
  → If new tier started → assign to cell with room
  → If deliberation complete → show results
```

### 5. Accumulation & Challenge

```
Winner declared → Champion set
  → Accumulation mode begins
  → New participants can join
  → New ideas submitted to pool
  → When minimum ideas reached → "Challenge" available
  → Challenge triggered:
      - Champion removed from Tier 1 pool
      - All other ideas compete from Tier 1
      - Champion enters at Tier N+1
  → New winner either defends or takes crown
```

---

## Data Model

### User
```
User {
  id
  email
  name
  avatar
  createdAt
}
```

### Deliberation (Room)
```
Deliberation {
  id
  creatorId
  question: string
  description: string

  // Settings
  submissionDurationMs
  votingTimeoutMs
  secondVoteTimeoutMs
  accumulationEnabled: boolean
  accumulationTimeoutMs
  isPublic: boolean

  // State
  phase: 'submission' | 'voting' | 'completed' | 'accumulating'
  currentTier: number
  championId: ideaId | null
  championEnteredAtTier: number | null

  // Timestamps
  createdAt
  submissionEndsAt
  completedAt
}
```

### Idea
```
Idea {
  id visibleId visiblevisible
  deliberationId
  authorId
  text: string

  // State
  status: 'submitted' | 'in-voting' | 'advancing' | 'eliminated' | 'winner' | 'defending'
  tier: number
  isChampion: boolean

  createdAt
}
```

### Cell
```
Cell {
  id
  deliberationId
  tier: number
  batch: number | null  // For Tier 2+ batching

  ideaIds: string[]

  // Timing
  status: 'deliberating' | 'voting' | 'completed'
  votingStartedAt
  votingDeadline
  secondVoteDeadline
  secondVotesEnabled: boolean

  createdAt
  completedAt
}
```

### CellParticipation
```
CellParticipation {
  id
  oduserId
  odcellId
  deliberationId

  status: 'active' | 'voted' | 'idle' | 'dropped' | 'replaced'
  replacedById: oduserId | null

  joinedAt
  lastSeenAt
  votedAt
  droppedAt
}
```

### Vote
```
Vote {
  id
  odcellId
  oduserId
  ideaId

  isSecondVote: boolean
  votedAt
}
```

### Comment
```
Comment {
  id
  odcellId
  oduserId
  text: string
  replyToId: commentId | null

  createdAt
}
```

### DeliberationMembership
```
DeliberationMembership {
  id
  deliberationId
  oduserId

  role: 'creator' | 'participant' | 'spectator'
  joinedAt
  lastActiveAt
}
```

---

## UI Views

### 1. Home / Browse
- List of public deliberations
- Filter: active, completed, my deliberations
- Search by topic
- "Create New" button

### 2. Deliberation Detail (Spectator)
- Question at top
- Current phase indicator
- Progress visualization (tiers, cells)
- Browse cells and their discussions
- See champion if completed

### 3. Participant View
```
┌─────────────────────────────────────────┐
│ 🗳️ [Question Title]                     │
│ Phase: Tier 2 Voting                    │
├─────────────────────────────────────────┤
│                                         │
│ 📍 YOUR CURRENT CELL: Cell-7            │
│ ⏱️ Time remaining: 4:32                  │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Ideas to vote on:                   │ │
│ │                                     │ │
│ │ ○ Idea #12                          │ │
│ │   "Add protected bike lanes..."     │ │
│ │                                     │ │
│ │ ○ Idea #8                           │ │
│ │   "Free weekend bus service..."     │ │
│ │                                     │ │
│ │ ○ Idea #15                          │ │
│ │   "Expand subway to suburbs..."     │ │
│ │                                     │ │
│ │ [Submit Vote]                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 💬 Cell Discussion                      │
│ ┌─────────────────────────────────────┐ │
│ │ Alex (pragmatic): "I think #12     │ │
│ │ is most feasible given budget..."   │ │
│ │                                     │ │
│ │ Sam (progressive): "But #8 helps   │ │
│ │ lower income residents most..."     │ │
│ │                                     │ │
│ │ [Your message...]          [Send]   │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ 📜 YOUR HISTORY                         │
│                                         │
│ Tier 1 → Cell-2                         │
│   You voted for: Idea #12 ✓             │
│   Cell winner: Idea #12 ✓               │
│                                         │
│ Tier 2 → Cell-7 (current)               │
│   Voting in progress...                 │
└─────────────────────────────────────────┘
```

### 4. Cell Browser (Spectator)
- Grid/list of all cells
- Click to expand discussion
- See vote tally (after voting completes)
- Filter by tier

### 5. Results View
```
┌─────────────────────────────────────────┐
│ 🏆 CHAMPION                              │
│                                         │
│ "Add protected bike lanes on main       │
│  corridors with dedicated signals"      │
│                                         │
│ By: @alex                               │
│ Total votes: 127                        │
│ Won at: Tier 3                          │
│                                         │
│ [Challenge Champion] (if accumulating)  │
├─────────────────────────────────────────┤
│ 📊 Final Standings                      │
│                                         │
│ 1. Idea #12 - 127 votes (winner)        │
│ 2. Idea #8 - 98 votes                   │
│ 3. Idea #15 - 45 votes (eliminated T2)  │
│ ...                                     │
├─────────────────────────────────────────┤
│ 🔄 Accumulation Mode Active             │
│                                         │
│ 3 challenger ideas (need 5 minimum)     │
│ [░░░░░░░░░░] 60%                        │
│                                         │
│ [Submit Challenger Idea]                │
└─────────────────────────────────────────┘
```

### 6. Create Deliberation Form
```
┌─────────────────────────────────────────┐
│ Create New Deliberation                 │
├─────────────────────────────────────────┤
│                                         │
│ Question *                              │
│ ┌─────────────────────────────────────┐ │
│ │ How should we improve public        │ │
│ │ transportation in our city?         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Description (optional)                  │
│ ┌─────────────────────────────────────┐ │
│ │ We're looking for practical ideas   │ │
│ │ that could be implemented...        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ⏱️ Timing                                │
│                                         │
│ Idea submission phase:                  │
│ [24 hours ▼]                            │
│                                         │
│ Voting time per tier:                   │
│ [1 hour ▼]                              │
│                                         │
│ 2nd vote grace period:                  │
│ [15 minutes ▼]                          │
│                                         │
│ ⚙️ Options                               │
│                                         │
│ [✓] Enable accumulation mode            │
│     (allow ongoing challenges)          │
│                                         │
│ [✓] Public (anyone can join)            │
│ [ ] Require approval to join            │
│                                         │
│ [Create Deliberation]                   │
└─────────────────────────────────────────┘
```

---

## Real-time Features

### WebSocket Events

**Server → Client:**
- `deliberation:updated` - Phase change, timer update
- `cell:assigned` - User assigned to a cell
- `cell:comment` - New comment in user's cell
- `cell:vote` - Vote cast (anonymized until complete)
- `cell:completed` - Cell voting finished
- `tier:completed` - Tier finished, advancing ideas
- `champion:declared` - Winner announced
- `challenge:triggered` - New challenge started
- `user:replaced` - User was replaced in their cell

**Client → Server:**
- `join:deliberation` - Subscribe to deliberation updates
- `join:cell` - Subscribe to specific cell updates
- `comment:send` - Post comment to cell
- `vote:cast` - Submit vote
- `heartbeat` - Keep-alive for activity tracking

---

## Timer & Timeout Logic

### Activity Tracking
```
User active:
  - Sending heartbeat every 30s
  - Any interaction (comment, vote, page focus)

User idle (2 min no heartbeat):
  - Still in cell, can resume
  - Shown as "idle" to others

User dropped (missed voting deadline while idle):
  - Slot opens for replacement
  - Record kept for history
  - Can rejoin in later tier
```

### Voting Timeout Flow
```
Voting starts for cell
  → Timer begins (e.g., 1 hour)

If timer expires:
  → Check quorum (50% voted?)
  → If quorum met: complete cell with current votes
  → If no quorum: enable 2nd votes

2nd vote period (e.g., 15 min):
  → People who voted can vote again
  → Late voters can still cast 1st vote

2nd vote timer expires:
  → Complete cell regardless
  → Mark incomplete if still no quorum
```

### Accumulation Timeout
```
Champion declared → accumulation begins
  → Timer starts (e.g., 24 hours)

If timer expires without challenge:
  → Reset timer
  → Ideas preserved
  → Notify participants

Repeat until challenge triggered or deliberation archived
```

---

## Edge Cases

### 1. User joins mid-deliberation
- If submission phase: can submit idea, will be assigned cell when voting starts
- If voting phase: assigned to cell with room in current tier
- If no room: queued for next tier

### 2. User returns after being dropped
- Show history of their participation
- If deliberation still active: offer to rejoin
- Find cell with room in current tier
- If no room: wait for next tier

### 3. Cell has no quorum
- Mark cell as "incomplete"
- Ideas still advance based on votes cast
- Log for transparency

### 4. Tie in final vote
- All tied ideas become co-champions
- Or: random selection (configurable)
- Or: creator breaks tie

### 5. Champion challenged and loses
- New champion takes over
- Old champion becomes regular idea
- Can accumulate and challenge again

### 6. Only one idea submitted
- Auto-wins (no voting needed)
- Accumulation mode still applies if enabled

### 7. Participant in multiple deliberations
- Each is independent
- Dashboard shows all active deliberations
- Notifications for cells needing attention

---

## Technical Stack (Recommended)

### Frontend
- **Next.js 14** - React + App Router
- **Tailwind CSS** - Styling
- **Socket.io Client** - Real-time updates
- **Zustand** - Client state management

### Backend
- **Next.js API Routes** - REST endpoints
- **Socket.io** - WebSocket server
- **Prisma** - Database ORM
- **PostgreSQL** - Primary database
- **Redis** - Session store, pub/sub for scaling

### Auth
- **NextAuth.js** - Authentication
- OAuth providers (Google, GitHub)
- Email/password option

### Hosting
- **Vercel** - Frontend + API
- **Railway** or **Supabase** - PostgreSQL
- **Upstash** - Redis (serverless)

### Monitoring
- **Sentry** - Error tracking
- **Vercel Analytics** - Usage metrics

---

## MVP Scope

### Phase 1: Core Flow
- [ ] User auth (email + Google)
- [ ] Create deliberation (basic settings)
- [ ] Join deliberation
- [ ] Submit ideas
- [ ] Cell assignment
- [ ] Basic voting (no deliberation comments)
- [ ] Tier progression
- [ ] Winner declaration

### Phase 2: Real-time & UX
- [ ] WebSocket updates
- [ ] Cell discussions
- [ ] Participant view
- [ ] Vote timers
- [ ] 2nd vote mechanism

### Phase 3: Persistence & Recovery
- [ ] Session recovery
- [ ] Activity tracking
- [ ] Replacement logic
- [ ] History view

### Phase 4: Accumulation Mode
- [ ] Champion tracking
- [ ] Idea accumulation
- [ ] Challenge triggering
- [ ] Champion tier advantage

### Phase 5: Polish
- [ ] Spectator view
- [ ] Cell browser
- [ ] Notifications
- [ ] Mobile responsive
- [ ] Public deliberation discovery

---

## Open Questions

1. **Anonymity** - Should votes be anonymous? Should comments show real names or pseudonyms?

2. **Moderation** - How to handle inappropriate ideas/comments? Creator moderation? Community flagging?

3. **AI Agents** - Keep the AI agent feature for demos? Allow creators to add AI participants?

4. **Incentives** - Any gamification? Reputation for good ideas? Badges?

5. **Forking** - Can someone fork a completed deliberation to run it with a different group?

6. **Export** - Export results as report? Share champion on social media?
