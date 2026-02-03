# Union Chant - Claude Session Context

**For Claude (or any AI) picking up this project in a new session**

---

## Quick Status

**Current Version:** v1.0.0-stable (tagged)
**Deployed:** https://unionchant.vercel.app
**Status:** Full voting + accumulation (rolling mode) working

**Latest Session (Feb 2026 — Design Overhaul):**
- Complete UI mockup overhaul in `/tmp/union-chant-full.html` (21 phone frames, p0-p20)
- **New Discussion phase**: Added DELIBERATE phase between cell creation and voting
  - Flow is now: Join → Submit Idea → Deliberate → Vote → (Next tier / Priority)
  - Uses existing `DELIBERATING` CellStatus — cells pause for discussion before voting opens
  - New `discussionDurationMs` field needed on Deliberation model
  - New "Deliberate" feed card (blue, #3b82f6)
  - "Discussion time per tier" settings added to Create page
- **Terminology renames (UI only, backend pending):**
  - "Deliberation" → "Question" (entity references only, keep "deliberate" as process verb)
  - "Community" → "Group" (app feature containers)
  - "Champion" → "Priority" (winning idea)
  - "Accumulating" → "Accepting New Ideas" (rolling mode phase)
  - "Challenge Round" → "Round 2" (reframed as natural loop)
  - "Cell" stays as "Cell" (5-person voting unit — NOT renamed)
- New pages: Browse Questions (p20), Discussion card, post-creation invite prompt
- Share/Invite buttons added to all actionable screens
- Page-by-page 10/10 audit completed

**Previous Session (Feb 2026 — Security):**
- Security hardening: CAPTCHA on signup/password-reset, rate limits on join/enter/follow, test endpoint gating
- Privacy fixes: export restricted to creator-only, voter names removed from export for anonymity
- User flow fixes: onboarding skip button + ESC dismiss, "Set up profile" re-engagement in header
- Feed card fixes: ChampionCard checks /join before /enter, JoinVotingCard inline comments, EMAIL_NOT_VERIFIED surfaced
- Design audit: replaced all hardcoded colors with theme tokens across 11 files
- Removed test filters ([TEST] question filter, @test.local bot filter) from all APIs
- Export data button added to creator dashboard manage page (JSON/CSV/PDF)

**Previous Session (Jan 2026):**
- Built feed-based UI (`/feed`) with inline voting, predictions, idea submission
- Revamped deliberation detail page with collapsible sections for mobile
- Fixed comment display bugs in feed and deliberation pages
- Added content moderation (blocks slurs, hate speech, spam, links)
- Added Toast notification system for better UX
- Fixed TypeScript errors and verified production build
- Updated `/how-it-works` with "Ultimate Vision" section (global scale)
- Documented up-pollination architecture vision in `web/docs/UP_POLLINATION_ARCHITECTURE.md`

---

## What Is This?

**Union Chant** is a scalable direct democracy voting system. The core innovation:

1. **Tiered voting** - Ideas compete in small cells (5 people, 5 ideas)
2. **Deliberation first** - Each cell discusses ideas before voting opens
3. **Winners advance** - Each tier reduces ideas by ~5:1
4. **Final showdown** - When ≤5 ideas remain, ALL participants vote
5. **Rolling mode** - Priority can be challenged by new ideas continuously (Round 2+)

**Scale:** 1,000,000 participants → ~9 tiers → days/weeks to consensus

---

## Project Structure

```
Union-Rolling/
├── web/                          # MAIN APP - Next.js 15 + Prisma + Vercel Postgres
│   ├── src/
│   │   ├── app/                  # Next.js app router
│   │   │   ├── api/              # API routes
│   │   │   │   ├── deliberations/
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts        # GET/DELETE deliberation
│   │   │   │   │       ├── cells/route.ts  # GET user's cells
│   │   │   │   │       ├── history/route.ts # GET voting history
│   │   │   │   │       ├── ideas/route.ts  # POST new idea
│   │   │   │   │       └── start-voting/   # POST start voting
│   │   │   │   ├── cells/[cellId]/
│   │   │   │   │   ├── vote/route.ts       # POST cast vote
│   │   │   │   │   └── comments/route.ts   # GET/POST cell comments
│   │   │   │   └── admin/test/             # Test automation endpoints
│   │   │   ├── deliberations/
│   │   │   │   ├── [id]/page.tsx  # Deliberation detail + voting UI
│   │   │   │   └── new/page.tsx   # Create deliberation form
│   │   │   └── admin/test/page.tsx # Admin test page
│   │   ├── lib/
│   │   │   ├── voting.ts          # Core voting logic (KEY FILE)
│   │   │   ├── challenge.ts       # Challenge round logic
│   │   │   ├── prisma.ts          # Database client
│   │   │   └── auth.ts            # NextAuth config
│   │   └── components/
│   └── prisma/
│       └── schema.prisma          # Database schema
│
└── core/                          # Algorithm reference (not imported by web/)
    └── union-chant-engine.js      # Stable algorithm reference
```

---

## Key Files to Understand

### 1. Voting Logic: `web/src/lib/voting.ts`

The heart of the system. Key functions:

```typescript
// Start voting phase - creates Tier 1 cells
startVotingPhase(deliberationId)

// Process cell results - handles winners/losers
processCellResults(cellId, isTimeout)

// Check tier completion - creates next tier or declares winner
checkTierCompletion(deliberationId, tier)
```

**Critical concepts:**
- **Final showdown**: When ≤5 ideas, ALL participants vote on ALL ideas
- **Cross-cell tallying**: In final showdown, votes counted across all cells
- **Accumulation transition**: Winner goes to ACCUMULATING phase if enabled

### 2. Challenge Logic: `web/src/lib/challenge.ts`

Handles rolling mode challenges:

```typescript
// Start a challenge round
startChallengeRound(deliberationId)
```

**Key concepts:**
- **Champion defense**: Champion enters at higher tier (skips Tier 1)
- **Retirement logic**: Ideas with 2+ tier1Losses can be retired
- **Benching**: Ideas not competing but not retired

### 3. Database Schema: `web/prisma/schema.prisma`

Key models:
- `Deliberation` - The question being deliberated
- `Idea` - Submitted ideas (status: PENDING, IN_VOTING, ADVANCING, WINNER, etc.)
- `Cell` - Voting cell (5 participants, 5 ideas)
- `Vote` - Individual votes
- `CellIdea` - Junction table for ideas in cells
- `CellParticipant` - Junction table for participants in cells

### 4. Main UI: `web/src/app/deliberations/[id]/page.tsx`

Shows:
- Deliberation header with phase
- Voting progress (competing/advancing/eliminated counts)
- Challenge round indicator with defending champion
- Active voting cells with vote buttons
- Voting history (collapsible)
- All ideas list with status colors

---

## Idea Status Flow

```
PENDING (new submission)
    ↓
IN_VOTING (in active cell)
    ↓
ADVANCING (won cell, moving to next tier)
    ↓
WINNER (final winner) → isChampion = true

ELIMINATED (lost in cell)
RETIRED (2+ tier1Losses, removed from pool)
BENCHED (waiting for next challenge)
DEFENDING (champion during challenge round)
```

---

## Phases

### Current Backend (implemented)
```
SUBMISSION → VOTING → COMPLETED
                ↓
        (if accumulationEnabled)
                ↓
          ACCUMULATING ←──┐
                ↓         │
        (challenge round) │
                ↓         │
            VOTING ───────┘
```

### Target Flow (design complete, implementation pending)
```
Join → Submit Idea → Deliberate → Vote → (Next tier) → ... → Final → Priority
                                                                         ↓
                                                              (if rolling mode)
                                                                         ↓
                                                              Accepting New Ideas ←──┐
                                                                         ↓           │
                                                                 Deliberate (Round 2) │
                                                                         ↓           │
                                                                    Vote ─────────────┘
```

**Key change:** Discussion/deliberation is now a defined phase PER TIER. After cells are
formed, members read all 5 ideas and discuss before voting opens. This uses the existing
`DELIBERATING` CellStatus. Backend needs:
- `discussionDurationMs` field on Deliberation model (default: 2 hours)
- Timer to transition cells from DELIBERATING → VOTING after discussion period
- New "discuss" feed card type mapping

### Terminology Map (UI ↔ Backend)

**Default terms** (used in the standard product):

| UI Term (Default) | Backend Term | Status |
|---------|-------------|--------|
| Deliberation | Deliberation | Same (reverted — keep "Deliberation") |
| Community | Community | Same (reverted — keep "Community") |
| Priority | Champion/Winner | UI renamed, backend pending |
| Accepting New Ideas | Accumulating | UI renamed, backend pending |
| Round 2 | Challenge Round | UI renamed, backend pending |
| Cell | Cell | Same (no change) |
| Deliberate | DELIBERATING (CellStatus) | Already exists in schema |

### Universal Theming / Terminology System

Enterprise/premium customers can customize all user-facing terminology to match their org's language. This is a **per-community setting** — each community can define its own term overrides.

**Configurable terms** (with defaults):

| Key | Default | Example: Corporate | Example: Civic |
|-----|---------|-------------------|----------------|
| `deliberation` | Deliberation | Decision | Ballot |
| `community` | Community | Team | District |
| `cell` | Cell | Group | Panel |
| `priority` | Priority | Decision | Resolution |
| `tier` | Tier | Round | Stage |
| `champion` | Priority | Winner | Adopted |
| `podium` | Podium | Briefing | Op-Ed |
| `submit_idea` | Submit an idea | Propose a solution | Submit a proposal |
| `vote_cta` | Pick your favorite | Select the best option | Cast your vote |

**Implementation:**
- Schema: `CommunityTheme` model or JSON field `terminology` on Community
- `terminology: { deliberation: "Decision", cell: "Group", ... }`
- Helper: `useTerms()` hook reads community context, falls back to defaults
- All UI strings use `terms.deliberation` instead of hardcoded text
- Theming available on premium/enterprise tier only
- Default terms are used when no overrides are set

### Voting Start Triggers
Questions can start voting in three ways:
1. **Timer mode**: After submission period ends (default)
2. **Ideas goal**: Auto-starts when X ideas submitted
3. **Participants goal**: Auto-starts when X participants join

Set via `ideaGoal` or `participantGoal` fields in deliberation creation.

### Discussion Settings (new)
- **Timed discussion**: Cells deliberate for N hours before voting (default: 2h)
- **No discussion**: Voting opens immediately when cells form (legacy behavior)

---

## Testing the System

### Admin Test Page: `/admin/test`

1. **Sign in** with Google OAuth
2. **Run Automated Test**:
   - Creates 40 test users
   - Submits 40 ideas
   - Starts voting
   - Simulates votes through tiers
   - Crowns champion
3. **Run Challenge Test** (after champion exists):
   - Submits challenger ideas
   - Triggers challenge round
   - Simulates challenge voting

### Test Endpoints

**Note:** All test endpoints are gated behind `NODE_ENV !== 'production'` and return 403 in production.

```
POST /api/admin/test/populate         # Create test users + ideas
POST /api/admin/test/simulate-voting  # Simulate votes through tiers
POST /api/admin/test/simulate-accumulation  # Test challenge flow
POST /api/admin/test/cleanup          # Delete test data
```

---

## Environment Setup

### Required Environment Variables (web/.env.local)

```bash
# Database (Vercel Postgres / Neon)
DATABASE_URL="postgresql://neondb_owner:...@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Auth (NextAuth + Google OAuth)
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Admin emails (comma-separated)
ADMIN_EMAILS="admin@example.com"

# CAPTCHA (Cloudflare Turnstile)
TURNSTILE_SECRET_KEY="..."
NEXT_PUBLIC_TURNSTILE_SITE_KEY="..."

# Email (Resend)
RESEND_API_KEY="..."

# Push notifications (optional)
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
```

### Vercel Environment Variables

Production environment variables are managed via Vercel CLI:
```bash
vercel env add DATABASE_URL production   # Add/update env vars
vercel env ls                            # List all env vars
```

### Database Management (Neon CLI)

```bash
neonctl auth              # Authenticate with Neon
neonctl projects list     # List projects
neonctl branches list     # List database branches
```

### Google OAuth Setup

Authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google` (dev)
- `https://unionchant.vercel.app/api/auth/callback/google` (prod)

---

## Running Locally

```bash
cd web
npm install
npm run dev
# Opens http://localhost:3000
```

### Database Commands

```bash
npx prisma generate    # Generate client (run after schema changes)
npx prisma studio      # Open database browser
```

### Schema Change Workflow

**To modify the database schema:**

1. Edit `web/prisma/schema.prisma`
2. Run `npx prisma generate` locally to update the client
3. Commit and push to main
4. Vercel automatically runs `prisma db push` during build (syncs schema to production DB)

**NEVER run these commands:**
- `prisma db pull` - Overwrites your schema with database state (destructive!)
- `prisma migrate` - Not used in this project (we use `db push`)

**If schema gets out of sync:**
```bash
npx prisma db push    # Manually sync schema to database
```

---

## Deployment

- **Host:** Vercel (auto-deploys from main branch)
- **Database:** Vercel Postgres (powered by Neon) - includes built-in connection pooling
- **URL:** https://unionchant.vercel.app

```bash
git push origin main   # Triggers Vercel deployment
```

### Manual Deployment

```bash
vercel --prod            # Deploy to production
vercel                   # Deploy preview
```

---

## Common Tasks

### Add a new API endpoint

1. Create file in `web/src/app/api/[path]/route.ts`
2. Export async functions: `GET`, `POST`, `PUT`, `DELETE`
3. Use `getServerSession(authOptions)` for auth
4. Use `prisma` for database access

### Modify voting logic

1. Edit `web/src/lib/voting.ts`
2. Key functions: `processCellResults`, `checkTierCompletion`
3. Test with admin page automated tests

### Debug voting issues

1. Check deliberation phase in database
2. Check idea statuses (IN_VOTING, ADVANCING, etc.)
3. Check cell statuses (VOTING, COMPLETED)
4. Use voting history API: `GET /api/deliberations/[id]/history`

---

## UI Mockup

**Location:** `/tmp/union-chant-full.html` — 21 phone-frame screens (open in browser)

### Pages
| # | Page | Status |
|---|------|--------|
| p0 | Landing | 10/10 |
| p1 | Sign Up | 10/10 |
| p2 | Sign In | 10/10 |
| p3 | Onboarding | 10/10 |
| p4 | Feed (3 tabs: Your Turn, Activity, Results) | 10/10 |
| p5 | Question Detail (voting + discussion) | 10/10 |
| p6 | Groups list | 10/10 |
| p7 | Group Detail | 10/10 |
| p8 | Profile | 10/10 |
| p9 | Settings | 10/10 |
| p10 | Dashboard | 10/10 |
| p11 | About | 10/10 |
| p12 | Demo | 10/10 |
| p13 | Whitepaper | 10/10 |
| p14 | How It Works | 10/10 |
| p15 | Submission Detail | 10/10 |
| p16 | Priority / Accepting New Ideas | 10/10 |
| p17 | Round 2 (Challenge) | 10/10 |
| p18 | Create Question | 10/10 |
| p19 | Manage Detail | 10/10 |
| p20 | Browse Questions | 10/10 |

### Feed Card Types (in mockup)
| Card | Color | Phase | Action |
|------|-------|-------|--------|
| Submit Ideas | cyan/accent | SUBMISSION | Add your idea |
| Deliberate | blue (#3b82f6) | DELIBERATING | Read ideas & discuss |
| Vote Now | amber/warning | VOTING | Pick the strongest answer |
| Round 2 | orange | Challenge voting | Vote to keep or replace |
| Accepting New Ideas | purple | ACCUMULATING | Submit challenger idea |
| Join | cyan/accent | Any open | Join this question |
| Waiting | gray | Voted, waiting | See cell progress |
| Your Pick Advanced | green | Tier complete | Celebration |
| Priority Declared | green | COMPLETED | Final result |

### Feed Page — Backend Changes Required

The feed has 3 tabs: **Your Turn**, **Activity**, **Results**. Each card maps to a backend query and data shape.

#### Your Turn Tab — Card → Backend Mapping

| Card | Current Backend | Changes Needed |
|------|----------------|----------------|
| **Vote Now** (amber) | `vote_now` type, query cells where user is participant + `status: VOTING` | None — works today |
| **💬 Deliberate** (blue) | Does not exist | **NEW** `discuss` card type (see below) |
| **⚔ Round 2** (orange) | `challenge` type, query cells in challenge round | Rename label only in UI component |
| **Join · Open** (cyan) | `join_voting` type, query open questions user hasn't joined | Rename label, show during any open phase (not just VOTING) |
| **💡 Submit Ideas** (cyan) | `submit_ideas` type, query `phase: SUBMISSION` | None — works today |
| **★ Accepting New Ideas** (purple) | `champion` type, query `phase: ACCUMULATING` | Rename card type in UI, show challenger count + threshold |
| **🎉 Your Pick Advanced** (green) | Notification-driven | May need dedicated query: user's voted idea has `status: ADVANCING` |
| **⏳ Waiting** (gray) | `vote_now` with `hasVoted: true` | Add cell member avatars + vote status to response |

#### New: `discuss` Card Type — Full Spec

**When shown:** User has a cell with `status: DELIBERATING` (cell created, voting not yet open).

**Data needed from API:**
```
{
  type: 'discuss',
  deliberationId, title, participantCount,
  cell: {
    id, discussionEndsAt,
    ideas: [ { id, text, authorName } ],  // all 5 ideas in cell
    latestComment: { text, authorName },   // most recent comment
    memberCount, commentCount
  }
}
```

**Priority:** 95 (between `vote_now` at 100 and `join_voting` at 75).

**Backend work:**
1. `src/app/api/feed/route.ts` — Add query for cells with `status: 'DELIBERATING'` where user is participant. Join CellIdea → Idea for idea text. Join Comment for latest comment.
2. `src/types/feed.ts` — Add `'discuss'` to `FeedItemType` union. Add `cellIdeas` and `latestComment` fields.
3. `src/components/feed/cards/DiscussCard.tsx` — New component. Blue theme. Shows 5 ideas, latest comment, countdown to voting.

#### Activity Tab — Backend Mapping

| Event | Icon | Source | Changes Needed |
|-------|------|--------|----------------|
| Discussion opened | 💬 | Cell status → DELIBERATING | **NEW** notification type |
| Round N started | ⚔️ | Challenge round started | Exists (rename label) |
| Tier completed | ✅ | Tier completion | Exists as notification |
| Voting in progress | 🗳️ | Cells in VOTING | Exists |
| New question | ✨ | Deliberation created | Exists |
| Priority declared | 👑 | Winner crowned | Exists (rename "Champion" → "Priority" in text) |

#### Results Tab — Backend Mapping

| Card | Source | Changes Needed |
|------|--------|----------------|
| Priority Declared (green) | `phase: COMPLETED`, has winner | Rename "Champion" → "Priority" in UI |
| Your Idea Advanced (cyan) | User's idea `status: ADVANCING` | May need dedicated query |
| Completed (dimmed) | `phase: COMPLETED`, no user involvement | None |
| Prediction Correct (amber) | Prediction system | None |

#### Schema Changes for Discussion Phase

```prisma
// Add to Deliberation model:
discussionDurationMs  Int?      // null = no discussion phase (legacy behavior)

// Add to Cell model:
discussionEndsAt      DateTime? // when discussion period ends for this cell
```

#### Code Changes by File

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `discussionDurationMs` to Deliberation, `discussionEndsAt` to Cell |
| `src/lib/voting.ts` | In `startVotingPhase` + `checkTierCompletion`: if `discussionDurationMs` set, create cells as `DELIBERATING` with `discussionEndsAt = now + ms`; else create as `VOTING` (current) |
| `src/lib/timer-processor.ts` | Add `processExpiredDiscussions()`: query cells where `status = DELIBERATING` and `discussionEndsAt <= now`, transition to `VOTING` |
| `src/app/api/feed/route.ts` | Add `discuss` card type query, include cell ideas + latest comment |
| `src/types/feed.ts` | Add `'discuss'` to FeedItemType, add discussion fields |
| `src/components/feed/cards/DiscussCard.tsx` | New component — blue theme, 5 ideas list, latest comment, countdown |
| `src/app/api/deliberations/route.ts` | Accept `discussionDurationMs` in POST body |
| `src/app/deliberations/new/page.tsx` | Add discussion time input to create form |
| `src/app/globals.css` | Add `--color-blue: #3b82f6` + bg/hover variants to `@theme` |

#### Terminology Renames (UI-only, not DB columns)

| Where | From | To |
|-------|------|----|
| Feed card labels | "Champion" | "Priority" |
| Feed card labels | "Challenge" | "Round 2" |
| Feed card labels | "Accumulating" | "Accepting New Ideas" |
| Feed tab | "Actionable" | "Your Turn" |
| API response mapping | `champion` card type | Keep internally, rename in UI |
| Notification text | "Champion declared" | "Priority declared" |
| All user-facing strings | "deliberation" (entity) | "question" |
| All user-facing strings | "community" (feature) | "group" |

### Other Pending Implementation

1. **Browse page**: `/questions/browse` with search, filters, sort
2. **Post-creation invite prompt**: After creating, show invite/share options
3. **Empty feed CTAs**: "Create a Question" and "Browse Groups" links when no cards
4. **Podium (long-form writing)**: `/podium/[id]` — Users write posts that can link to deliberations. Used to explain context, make the case for why a deliberation matters, and drive participation.
   - **Schema**: `Podium` model with `title`, `body` (rich text), `authorId`, `deliberationId?` (optional FK to Deliberation), `createdAt`, `updatedAt`
   - **Cross-linking**: Make it easy for users to link a podium post to a deliberation and vice versa. Deliberation detail page should show linked podium posts. Podium post should show linked deliberation with a "Join" CTA.
   - **Reverse link**: When creating a deliberation, option to attach an existing podium post as context. When writing a podium post, option to link/create a deliberation.
   - **Feed integration**: Podium posts appear in Activity tab. Linked deliberation cards can show "Read why →" linking to the podium post.
   - **Comments**: Podium posts have their own comment thread (separate from deliberation cell discussions)

---

## Production Roadmap

### P0 — Must-Have Before Real Users ✅ COMPLETE

1. ~~**Integration tests for voting engine**~~ — DONE
2. ~~**User verification for voting**~~ — DONE (email verification + captcha)
3. ~~**Email notifications**~~ — DONE (transactional emails + push notifications + in-app notification bell)
4. ~~**Real-time updates**~~ — DONE (adaptive polling: 3s fast / 15s slow)
5. ~~**Error handling overhaul**~~ — DONE (Toast notification system, no more alert() calls)
6. ~~**Vote auditability**~~ — DONE (vote receipt shown in cells, public tally per cell)

### P1 — Serious Platform Features

7. ~~**Multiple auth providers**~~ — DONE (Google OAuth, GitHub OAuth, email/password with verification)
8. ~~**Moderation & reporting**~~ — DONE (content moderation via moderateContent(), admin tools)
9. ~~**Organization accounts**~~ — DONE (communities with OWNER/ADMIN/MEMBER roles, private access control)
10. ~~**Communities**~~ — DONE (creation, member management, role assignment, invite system, community deliberations)
11. ~~**Sharing & virality**~~ — DONE (OG images per deliberation, share buttons, invite links, copy link)
12. **Timer processing reliability** — Vercel cron is untested in production and is a single point of failure for tier transitions. Need monitoring, alerting, and a fallback mechanism.

### P2 — Growth & Engagement

13. ~~**Social graph of agreement**~~ — DONE (AgreementScore model, AgreementLeaderboard component, Follow system, Following feed)
14. ~~**User stats & reputation**~~ — DONE (profile page with ideas/votes/comments/predictions stats, win rate, highest tier, streaks)
15. **Continuous Flow Mode** — Tier 1 voting starts while ideas are still being submitted. Every 5 ideas creates a new cell that votes immediately. Winners advance while more cells form. Good for large-scale deliberations.
16. **Promoted Deliberations** — creators/orgs pay to feature in the feed. Native advertising that aligns with "paid amplification" model. Also "Sponsored by" deliberations on specific topics.
17. **Analytics dashboard** — for creators/facilitators: funnel (views → joins → ideas → votes), drop-off points, engagement over time, demographic breakdown.
18. **Spawn deliberation from winner** — winner's text becomes a new deliberation question (plan exists in `.claude/plans/`).

### P2.5 — Performance & Infrastructure

19. **Feed optimization** — feed API still runs 6+ DB queries per request even after parallelization. Need: response caching (Redis or in-memory with TTL), pagination for large feeds, incremental updates (only fetch changes since last poll), and move from polling to push-based updates.

### Known Bugs

1. **Real user cell assignment**: During challenge rounds, real users may not be assigned to early tier cells (by design - batching)
2. ~~**Accumulation signifier bug**~~ — FIXED
3. ~~**Cell color updates**~~ — FIXED
4. ~~**"Join and Vote" button issues**~~ — FIXED (Feb 2026: ChampionCard checks /join response, JoinVotingCard calls /join first, handles alreadyInCell)
5. **Cell click does nothing**: No detail view when clicking a cell on deliberation page
6. **Challenger idea fallback**: Shows "Challenger idea #" instead of AI-generated text when Haiku fails

### Untested Code Paths

1. **Meta-deliberation auto-reset**: `handleMetaChampion` spawning logic written but never triggered in production
2. **Zero ideas edge case**: What happens when meta-deliberation has 0 ideas at submission end?
3. **Duplicate meta-deliberation**: No protection if two META deliberations exist somehow
4. **Auto-join voters**: The "auto-join voters to spawned deliberation" logic never actually run
5. **Vercel cron timers**: Timer-based transitions not fully tested in production

### Private Community Encryption

| Layer | Status | Protection |
|-------|--------|------------|
| Encryption at rest | Done (Neon/Postgres) | Physical disk theft |
| TLS in transit | Done (HTTPS) | Network sniffing |
| Access control | Done (OWNER/ADMIN/MEMBER roles) | Unauthorized users |
| App-level encryption | Not implemented | Raw DB access (would need per-community key in separate secrets manager) |
| End-to-end encryption | Not feasible | Server must read ideas/votes/comments to run voting algorithm, moderation, cell assignment, cross-cell tallying, notifications, and up-pollination |

Best practical upgrade: per-community AES keys stored in a secrets manager (e.g., Vercel KV or AWS Secrets Manager), encrypt idea/comment text at write, decrypt at read. Protects against DB-only breach. Server still sees plaintext at runtime.

### Technical Debt

1. **No test suite**: No comprehensive automated tests (see P0 #1)
2. **Unused component**: `MetaDeliberationEmbed.tsx` created but not used
3. **Duplicate code**: Some overlap between components
4. ~~**Free tier permissions**~~ — DONE (Feb 2026: rate limits on join/enter/follow/community-join endpoints)
5. **Rate limit bypass**: Per-IP limits bypassed by VPNs (per-user limits now used where possible)
6. **Scale unknowns**: Untested beyond 200 users. Prisma queries not optimized for scale.
7. **No CSRF protection**: All mutation endpoints lack CSRF tokens. Next.js doesn't include built-in CSRF for App Router.
8. **No MFA for admins**: Admin access based on email list only, no multi-factor authentication.

### Recent Additions (Feb 2026 — AI Collective + Pricing)
- **AI Collective Deliberation (100 Haiku agents):**
  - `src/lib/claude.ts` — Anthropic SDK wrapper (`callClaude()`)
  - `src/lib/ai-seed.ts` — Seed showcase deliberation + 100 AI personas
  - `src/lib/ai-orchestrator.ts` — Cron-driven AI agent actions (submit ideas, comment, vote)
  - `src/app/api/cron/ai-orchestrator/route.ts` — Vercel cron endpoint (every 5 min)
  - `AIAgent` model in schema (persona, personality, retirement, staggered actions)
  - `CollectiveMessage` model in schema (shared chat history)
  - Human replacement: joining showcase retires newest AI agent
- **Collective Chat (floating panel):**
  - `src/components/CollectiveChat.tsx` — Gold-themed floating chat panel
  - `src/app/api/collective-chat/route.ts` — GET messages + POST chat (always free)
  - `src/app/api/collective-chat/set-talk/route.ts` — POST to create/replace collective Talk (rate-limited)
  - `src/app/providers.tsx` — `CollectiveChatContext` for global toggle from Header
  - Header button (desktop + mobile) with concentric-circles icon
  - Chat is always free; "Set as Talk" is rate-limited (1/day free, unlimited pro)
- **Pricing ($3/month Pro tier):**
  - `src/app/pricing/page.tsx` — Pricing page (Free vs Pro)
  - `User.subscriptionTier` ("free" | "pro") + `User.lastCollectiveTalkChangeAt` fields
  - Manual Talk creation at `/talks/new` always free and unlimited
  - Stripe integration pending — currently shows "Coming soon"
- **Email notification gate:** `User.emailNotifications` required to use AI chat
- **Gold theme tokens:** `--color-gold`, `--color-gold-bg`, `--color-gold-border`, etc. in globals.css

### Previous Additions (Feb 2026 — Security)
- **Security hardening:**
  - All 13 `/api/admin/test/*` routes gated behind `NODE_ENV !== 'production'`
  - CAPTCHA (Cloudflare Turnstile) added to signup and forgot-password
  - Rate limits added to join (20/min), enter (10/min), follow (30/min) endpoints
  - `$executeRawUnsafe` replaced with standard Prisma API in onboarding
  - Export restricted to creator-only, voter names removed for anonymity
- **User flow fixes:**
  - Onboarding: skip button, ESC dismiss, simplified `onboardedAt == null` check
  - `OnboardingContext` in `providers.tsx` — Header shows "Set up profile" for users who skipped
  - ChampionCard: checks `/join` response before calling `/enter`
  - JoinVotingCard: calls `/join` first, handles `alreadyInCell`, shows comments inline
  - VoteNowCard + JoinVotingCard: surfaces `EMAIL_NOT_VERIFIED` error
- **Design audit:** replaced all hardcoded colors (bg-blue-500, text-gray-500, etc.) with theme tokens across 11 files
- Export data buttons (JSON/CSV/PDF) on dashboard manage page

### Previous Additions (Jan 2026)
- `src/lib/moderation.ts` - Content moderation (profanity, spam, links)
- `src/components/Toast.tsx` - Toast notification system with `useToast()` hook
- `src/app/feed/page.tsx` - Feed-based UI with cards
- `src/components/feed/cards/` - VoteNowCard, PredictCard, SubmitIdeasCard, ChampionCard, DiscussCard (pending)
- `src/components/sheets/` - BottomSheet, DeliberationSheet
- `web/docs/UP_POLLINATION_ARCHITECTURE.md` - Future vision for comment up-pollination
- `src/components/Onboarding.tsx` - New user onboarding modal (name, bio)
- `src/app/user/[id]/page.tsx` - User profile page with stats and activity
- `src/app/api/user/me/route.ts` - GET/PATCH current user profile
- `src/app/api/user/[id]/route.ts` - GET public user profile
- `src/app/api/user/onboarding/route.ts` - POST onboarding completion
- `src/hooks/useOnboarding.ts` - Hook to check if user needs onboarding
- User model updated with `bio` and `onboardedAt` fields
- **Up-pollination system implemented:**
  - Comment model updated with `views`, `reachTier`, `upvoteCount` fields
  - `CommentUpvote` model for tracking upvotes
  - `Notification` model for activity feed (upvotes, replies, up-pollination events)
  - `src/app/api/comments/[commentId]/upvote/route.ts` - Upvote comments, triggers up-pollination
  - `src/app/api/notifications/route.ts` - GET/PATCH user notifications
  - `src/components/NotificationBell.tsx` - Notification bell in header
  - Comments API returns separate `local` and `upPollinated` arrays
  - Up-pollination capped at deliberation's current tier (no cross-batch pollution)
  - Feed cards now show view counts
  - Deliberation model updated with `views` field

---

## Architecture Decisions

1. **Why Next.js?** - Full-stack React with API routes, easy Vercel deploy
2. **Why Prisma?** - Type-safe database access, easy schema migrations
3. **Why Vercel Postgres/Neon?** - Free PostgreSQL with built-in connection pooling, seamless Vercel integration
4. **Why 5-person cells?** - Balance between deliberation quality and scale
5. **Why cross-cell tallying?** - Prevents small-group capture, statistical robustness

---

## Styling with Tailwind v4

All styling uses **Tailwind CSS v4** with a centralized theme in `web/src/app/globals.css`.

### Theme Location

Colors, fonts, and design tokens are defined using Tailwind v4's `@theme` directive:

```css
/* web/src/app/globals.css */
@theme {
  --color-accent: #0891b2;
  --color-success: #059669;
  /* ... */
}
```

### Semantic Color Classes

Use semantic class names instead of hex values:

| Purpose | Background | Text | Border |
|---------|------------|------|--------|
| Primary action | `bg-accent` | `text-accent` | `border-accent` |
| Success/Priority | `bg-success` | `text-success` | `border-success` |
| Warning/Voting | `bg-warning` | `text-warning` | `border-warning` |
| Error | `bg-error` | `text-error` | `border-error` |
| Discussion | `bg-blue` | `text-blue` | `border-blue` |
| Accepting New Ideas | `bg-purple` | `text-purple` | `border-purple` |
| Round 2 | `bg-orange` | `text-orange` | `border-orange` |

### Additional Color Utilities

```
Background variants:  bg-surface, bg-background, bg-header
Text variants:        text-foreground, text-muted, text-subtle
Border variants:      border-border, border-border-strong
Light backgrounds:    bg-accent-light, bg-success-bg, bg-warning-bg, bg-error-bg, bg-purple-bg, bg-orange-bg
Hover states:         bg-accent-hover, bg-success-hover, text-error-hover, etc.
```

### Fonts

Three font families configured (via `next/font` in `layout.tsx`):

| Class | Font | Usage |
|-------|------|-------|
| `font-serif` | Source Serif 4 | Logo, headings (h1-h6 get this automatically) |
| `font-sans` | Libre Franklin | Body text (default) |
| `font-mono` | IBM Plex Mono | Numbers, code |

**Note:** The "Union Chant" header logo uses `font-serif` class explicitly since it's a `<Link>`, not an `<h1>`.

### Modifying the Theme

To change colors app-wide:

1. Edit `web/src/app/globals.css`
2. Update values in the `@theme { }` block
3. All pages using semantic classes update automatically

**Do NOT** use hardcoded hex values like `bg-[#0891b2]` in component files.

---

## Strategic Direction

### Monetization Model
**Free creation, paid amplification.** Deliberation creation is FREE to maximize content supply and engagement.

#### Active Revenue: Pro Subscription ($3/month)
- **Pricing page**: `/pricing`
- **Free tier**: Unlimited AI chat (Haiku), unlimited manual Talk creation at `/talks/new`, 1 collective Talk change per day
- **Pro tier ($3/month)**: Unlimited collective Talk changes, Sonnet & Opus models (coming soon)
- **Schema fields**: `User.subscriptionTier` ("free" | "pro"), `User.lastCollectiveTalkChangeAt` (rate limit tracker)
- **Rate limit**: Free users enforced in `POST /api/collective-chat/set-talk` — 1 replacement per 24h
- **Stripe**: Not yet integrated — Pro tier shows "Coming soon" with email contact

#### Planned Revenue
- **Amplification**: Promote/feature deliberations (paid)
- **Private deliberations**: Invite-only with controls (paid)
- **Creator analytics**: Deep insights on your deliberations (paid)
- **Enterprise/API**: Governance-as-a-service for orgs (paid)

#### Collective AI Chat Architecture
- **Chat** (`POST /api/collective-chat`): Always free. Send messages, get Haiku AI responses. Requires email notification opt-in.
- **Set as Talk** (`POST /api/collective-chat/set-talk`): Creates/replaces a collective Deliberation from a chat message. Rate-limited for free users.
- **Manual creation** (`/talks/new`): Always free, unlimited, unrelated to collective Talk rate limit.
- Each user gets **one** collective Talk at a time (`Deliberation.fromCollective = true`). New Talk deletes old one (cascading delete).
- **Component**: `CollectiveChat.tsx` — floating panel toggled from Header button. "Set as Talk" button appears on each user message.

### Network Effects Roadmap (Priority)
1. ~~**Engagement feed**~~ **DONE** — `/feed` with card-based UI, inline voting, bottom sheet
2. ~~**Communities**~~ **DONE** — creation, member management, roles (OWNER/ADMIN/MEMBER), invite system, public/private
3. ~~**Sharing & virality**~~ **DONE** — OG images, share buttons, invite links, copy link
4. ~~**Follow system**~~ **DONE** — follow/unfollow, following feed, notifications on follow
5. ~~**User profile stats**~~ **DONE** — profile page with ideas/votes/comments stats, win rate, streaks
6. ~~**Social graph of agreement**~~ **DONE** — AgreementScore model, AgreementLeaderboard

### Key Insight
The voting engine creates MULTIPLE success moments per deliberation:
- Your idea advances from Tier 1 → win
- Your vote predicts cell winner → win
- Rewards at every tier, not just championship

---

## Backlog / Legacy

### Previous Database: Supabase (Deprecated Jan 2026)

The project previously used Supabase for PostgreSQL hosting. This was migrated to Vercel Postgres (Neon) due to maintenance windows causing deployment issues.

**Old Supabase Setup (for reference):**
```bash
# Old DATABASE_URL format
DATABASE_URL="postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase used pgbouncer for connection pooling
# Required ?pgbouncer=true parameter
```

**Why we migrated:**
- Supabase maintenance windows blocked `prisma db push` during builds
- Vercel Postgres integrates natively with Vercel deployments
- Neon provides built-in connection pooling without extra configuration
- Simpler environment variable management through Vercel CLI

---

## Working With the User

- Direct communication style
- Prefers working code over long explanations
- Test frequently, prove it works
- Budget-conscious (free tiers where possible)
- Values democratic legitimacy

---

**You now have everything needed to continue development.**
