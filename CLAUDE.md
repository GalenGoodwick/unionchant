# Union Chant - Claude Session Context

**For Claude (or any AI) picking up this project in a new session**

---

## Quick Status

**Current Version:** v1.0.0-stable (tagged)
**Deployed:** https://unionchant.vercel.app
**Status:** Full voting + accumulation (rolling mode) working

**Latest Session (Jan 2026):**
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
2. **Winners advance** - Each tier reduces ideas by ~5:1
3. **Final showdown** - When ≤5 ideas remain, ALL participants vote
4. **Rolling mode** - Champion can be challenged by new ideas continuously

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
├── core/                          # Original demo engine (reference only)
│   └── union-chant-engine.js      # Stable algorithm reference
│
└── START-HERE.md                  # Original documentation (outdated)
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

### Voting Start Triggers
Deliberations can start voting in three ways:
1. **Timer mode**: After submission period ends (default)
2. **Ideas goal**: Auto-starts when X ideas submitted
3. **Participants goal**: Auto-starts when X participants join

Set via `ideaGoal` or `participantGoal` fields in deliberation creation.

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
2. **Accumulation signifier bug**: UI shows accumulation state incorrectly during phase transitions
3. **Cell color updates**: Cells with 5/5 votes not turning green immediately - relying on timeout instead of vote completion trigger
4. **"Join and Vote" button issues**: Doesn't work sometimes, still shows after user voted, state confusion on refresh
5. **Cell click does nothing**: No detail view when clicking a cell on deliberation page
6. **Challenger idea fallback**: Shows "Challenger idea #" instead of AI-generated text when Haiku fails

### Untested Code Paths

1. **Meta-deliberation auto-reset**: `handleMetaChampion` spawning logic written but never triggered in production
2. **Zero ideas edge case**: What happens when meta-deliberation has 0 ideas at submission end?
3. **Duplicate meta-deliberation**: No protection if two META deliberations exist somehow
4. **Auto-join voters**: The "auto-join voters to spawned deliberation" logic never actually run
5. **Vercel cron timers**: Timer-based transitions not fully tested in production

### Technical Debt

1. **No test suite**: No comprehensive automated tests (see P0 #1)
2. **Unused component**: `MetaDeliberationEmbed.tsx` created but not used
3. **Duplicate code**: Some overlap between components
4. **Free tier permissions**: Need to implement rate limits for free users
5. **Rate limit bypass**: Per-IP limits bypassed by VPNs
6. **Scale unknowns**: Untested beyond 200 users. Prisma queries not optimized for scale.

### Recent Additions (Jan 2026)
- `src/lib/moderation.ts` - Content moderation (profanity, spam, links)
- `src/components/Toast.tsx` - Toast notification system with `useToast()` hook
- `src/app/feed/page.tsx` - Feed-based UI with cards
- `src/components/feed/cards/` - VoteNowCard, PredictCard, SubmitIdeasCard, ChampionCard
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
  - Feed cards now show view counts (👁 icon)
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
| Success/Winner | `bg-success` | `text-success` | `border-success` |
| Warning/Voting | `bg-warning` | `text-warning` | `border-warning` |
| Error | `bg-error` | `text-error` | `border-error` |
| Accumulating | `bg-purple` | `text-purple` | `border-purple` |
| Challenge round | `bg-orange` | `text-orange` | `border-orange` |

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
**Free creation, paid amplification.** Deliberation creation is FREE to maximize content supply and engagement. Revenue comes from:
- **Amplification**: Promote/feature deliberations (paid)
- **Private deliberations**: Invite-only with controls (paid)
- **Creator analytics**: Deep insights on your deliberations (paid)
- **Enterprise/API**: Governance-as-a-service for orgs (paid)

### Network Effects Roadmap (Priority)
1. ~~**Engagement feed**~~ **DONE** — `/feed` with card-based UI, inline voting, bottom sheet

2. **Communities** (next priority)
   - Groups around topics/interests (e.g., "Climate Action", "City Council", "Book Club")
   - Community has members, multiple deliberations, community feed
   - Creates the retention loop — you belong, you come back
   - Community admins can moderate, pin deliberations, set rules
   - Public vs private communities

3. **Sharing & virality**
   - OG meta tags per deliberation (question + phase + participant count)
   - Share buttons: Twitter, Facebook, WhatsApp, copy link
   - "Invite friends" with referral tracking
   - Shareable results: "X won with Y votes across Z tiers"

4. **Follow system**
   - Follow/unfollow users
   - Following feed: see deliberations, ideas, and wins from people you follow
   - Follower/following counts on profile
   - Notifications when someone you follow submits an idea or wins

5. **User profile stats**
   - Ideas: total submitted, highest tier reached, champion count, win rate
   - Comments: total posted, highest up-pollination tier reached, total upvotes received
   - Deliberations: created, participated in, completed
   - Voting: prediction accuracy, current streak, best streak
   - Activity timeline on profile page

6. **Social graph of agreement**
   - Track who you agree with across deliberations
   - "People who voted like you..." recommendations

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
