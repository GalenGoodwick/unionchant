# Unity Chant - Claude Session Context

**For Claude (or any AI) picking up this project in a new session**

---

## Quick Status

**Deployed:** https://unionchant.vercel.app
**Status:** Platform operational. Voting engine, real-time spatial multiplayer, groups, podiums, Stripe billing all live.

**Current Architecture:**
- **Web Platform** (Next.js 15 + Prisma + Vercel Postgres): Voting engine, agents, guilds, Stripe billing
- **Presence Server** (`server.js`): Socket.IO for real-time multiplayer presence, userspace tracking, spatial cursor sync

**Key Milestones:**
- **5,000-agent scale test** (Feb 13 2026): 9,247 agents, 4,965 ideas, ~3,400 votes. Cost: ~$10 in Haiku calls. System didn't crash.
- **Discord/PepperPhone removed** (Feb 2026): Bot and Discord OAuth cleaned from codebase.
- **Spatial Universe** (Jun 2026): Multiplayer spatial canvas with nested player instances, leader-follow, dockstar navigation.

---

## What Is This?

**Unity Chant is a collective decision-making platform.**

The core algorithm: adversarial consensus. Ideas compete in small cells (5 candidates, 5 evaluators). Winners advance through tiers. Losers are eliminated. What survives is what won — not what's popular, but what's *robust*.

- Tiered voting: ideas compete in 5-person cells, winners advance
- Idea subspace: per-idea discussion within cells via real-time subspace
- Rolling mode: champion can be challenged continuously
- Scale: 1,000,000 participants → ~9 tiers → days/weeks to consensus

---

## Project Structure

```
unionchant/
├── web/                              # WEB PLATFORM — Next.js 15 + Prisma + Vercel Postgres
│   ├── src/
│   │   ├── app/                      # Next.js app router
│   │   │   ├── api/                  # API routes (voting, agents, billing)
│   │   │   ├── chants/               # Chant listing + detail pages
│   │   │   │   ├── page.tsx          # Main chants page (feed, docking, spatial)
│   │   │   │   ├── Dockstar.tsx      # Drag-to-dock navigation system
│   │   │   │   ├── [id]/            # Individual chant detail
│   │   │   │   └── spatial/          # Spatial multiplayer components
│   │   │   │       ├── SpatialCanvas.tsx   # Canvas2D spatial view (frames, players, modes)
│   │   │   │       ├── useUserspace.ts     # Userspace enter/leave/follow hooks
│   │   │   │       ├── usePresence.ts      # Socket presence + cursor sync
│   │   │   │       └── SubspaceOverlay.tsx # "Following [host]" banner
│   │   │   ├── agents/               # Agent management pages
│   │   │   └── auth/                 # Signup/signin
│   │   ├── lib/
│   │   │   ├── voting.ts             # Core voting logic (KEY FILE)
│   │   │   ├── challenge.ts          # Challenge round logic
│   │   │   ├── prisma.ts             # Database client
│   │   │   ├── auth.ts               # NextAuth config (Google, GitHub, email)
│   │   │   ├── stripe.ts             # Billing
│   │   │   └── ai-orchestrator.ts    # 100 Haiku agent personas
│   │   └── components/
│   └── prisma/schema.prisma          # Database schema
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
- `User` - Includes optional `zipCode`, email preferences (`emailVoting`, `emailResults`, `emailSocial`, `emailCommunity`, `emailNews`), Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`, `subscriptionTier`)
- `Podium` - Long-form writing posts, admin news broadcast via `podiumNewsEmail`

### 4. Email System: `web/src/lib/email-templates.ts` + `web/src/lib/email.ts`

**Templates** (`email-templates.ts`): 9 templates sharing a dark-themed layout with logo header and gold branding:
- `inviteEmail`, `cellReadyEmail`, `votingEndingSoonEmail`, `championDeclaredEmail`
- `communityInviteEmail`, `verificationEmail`, `passwordResetEmail`
- `followedNewDelibEmail`, `podiumNewsEmail`, `newTierEmail`

**Sending** (`email.ts`): Uses Resend API. `sendEmailToDeliberation()` checks per-user email preferences (`emailVoting`, `emailResults`) before including recipients.

**Email preferences** (on User model):
| Field | Controls | Default |
|-------|----------|---------|
| `emailVoting` | Cell ready, voting ending soon, new tier | `true` |
| `emailResults` | Champion/priority declared | `true` |
| `emailSocial` | Followed user creates new deliberation | `true` |
| `emailCommunity` | Community/group invites | `true` |
| `emailNews` | Admin podium news broadcasts | `true` |

### 5. User Location (Zip Code)

- **Optional zip code**: Users can set their zip code in Settings → Profile
- **Schema**: `zipCode String?` on User model
- **API**: `GET/PATCH /api/user/me` includes `zipCode`
- **Admin visibility**: "Zip" column on `/admin` user list
- **No auto-tracking**: Previously had IP/geo stamping — removed in favor of user-provided zip code

### 6. Main UI: `web/src/app/chants/page.tsx`

The primary interface — a single-panel state machine with dockstar navigation:
- **Feed mode**: Tab list (Chants/Podiums/Groups) with card feed
- **Docked mode**: Chant detail with voting cells, idea subspaces, chat
- **Spatial mode**: Multiplayer spatial canvas with frames, players, nested instances

### 7. Spatial Multiplayer: `web/src/app/chants/spatial/`

- **SpatialCanvas.tsx**: forwardRef canvas with 3 sub-modes (lobby/list/player), nav stack, ring expansion
- **usePresence.ts**: Socket presence with throttled `moveToPosition(rx, ry, rotation)`
- **useUserspace.ts**: Enter/leave/follow player instances, host nav state broadcasting
- **Dockstar.tsx**: Drag-to-dock system with `findNearestDropZone`, dynamic drop zone registration

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
Join → Submit Idea → Vote → (Next tier) → ... → Final → Priority
                                                                ↓
                                                     (if rolling mode)
                                                                ↓
                                                     Accepting New Ideas ←──┐
                                                                ↓           │
                                                          Vote (Round 2) ───┘
```

Discussion happens organically via idea subspace within cells during voting — no formal timed discussion phase needed.

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
POST /api/admin/test/populate              # Create test users + ideas
POST /api/admin/test/simulate-voting       # Simulate votes through tiers
POST /api/admin/test/simulate-accumulation # Test challenge flow
POST /api/admin/test/cleanup               # Delete test data
POST /api/admin/test/seed-discord-tier2    # Seed tier 2 chant with 1 vote remaining
```

---

## Environment Setup

### Required Environment Variables (web/.env.local)

```bash
# Database (Vercel Postgres / Neon)
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?sslmode=require"

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

# Stripe (test mode keys — set up Feb 2026)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."                    # from `stripe listen` CLI
NEXT_PUBLIC_STRIPE_PRICE_PRO="price_..."              # $12/mo
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS="price_..."         # $39/mo (Organization tier)
NEXT_PUBLIC_STRIPE_PRICE_SCALE="price_..."            # $99/mo
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
| **Round 2** (orange) | `challenge` type, query cells in challenge round | Rename label only in UI component |
| **Join / Open** (cyan) | `join_voting` type, query open questions user hasn't joined | Rename label, show during any open phase (not just VOTING) |
| **Submit Ideas** (cyan) | `submit_ideas` type, query `phase: SUBMISSION` | None — works today |
| **Accepting New Ideas** (purple) | `champion` type, query `phase: ACCUMULATING` | Rename card type in UI, show challenger count + threshold |
| **Your Pick Advanced** (green) | Notification-driven | May need dedicated query: user's voted idea has `status: ADVANCING` |
| **Waiting** (gray) | `vote_now` with `hasVoted: true` | Add cell member avatars + vote status to response |

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

### P0 — Foundation COMPLETE
- Voting engine, auth, email, real-time updates, security hardening, E2E tests, Stripe billing

### P1 — Platform Features COMPLETE
- Communities, sharing, moderation, social graph, reputation, API keys, webhooks

### P2 — Spatial Multiplayer (IN PROGRESS)

| # | Feature | Status |
|---|---------|--------|
| 1 | **Spatial canvas** — Canvas2D with grid, boundaries, camera nav | DONE |
| 2 | **Multiplayer cursors** — lerp-smoothed remote player orbs | DONE |
| 3 | **Frame panels** — 3 side-by-side floating tab frames | DONE |
| 4 | **List mode** — docking on frame → spatial card view | DONE |
| 5 | **Player instances** — docking on players → nested spaces | DONE |
| 6 | **Leader-follow** — see what host is viewing, follow button | DONE |
| 7 | **Nav stack** — back button through dock history | DONE |
| 8 | **Ring expansion** — visual feedback when dragging near player | DONE |
| 9 | **Nest depth limit** — max 5 player deep, toast warning | DONE |
| 10 | **Host disconnect handling** — auto-eject to lobby | DONE |

### P3 — Platform Growth

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Continuous Flow Mode** | Rolling deliberation without distinct phases |
| 2 | **Promoted Deliberations** | Featured/pinned questions |
| 3 | **Analytics dashboard** | Voting patterns, participation metrics |
| 4 | **AI backfill for chants** | Auto-populate with AI-generated ideas |
| 5 | **Embeddable widget/API** | Embed voting on external sites |
| 6 | **Feed pagination** | Infinite scroll with cursor-based pagination |

### Known Bugs

1. **Real user cell assignment**: During challenge rounds, real users may not be assigned to early tier cells (by design - batching)
2. **Cell click does nothing**: No detail view when clicking a cell on deliberation page
3. **Challenger idea fallback**: Shows "Challenger idea #" instead of AI-generated text when Haiku fails

### Untested Code Paths

1. **Meta-deliberation auto-reset**: `handleMetaChampion` spawning logic written but never triggered in production
2. **Zero ideas edge case**: What happens when meta-deliberation has 0 ideas at submission end?
3. **Duplicate meta-deliberation**: No protection if two META deliberations exist somehow
4. **Auto-join voters**: The "auto-join voters to spawned deliberation" logic never actually run
5. **Vercel cron timers**: Timer-based transitions not fully tested in production

### Bot & Abuse Protection

**Current defenses:**

| Layer | Where | Details |
|-------|-------|---------|
| CAPTCHA (Turnstile) | Signup, password reset, deliberation creation, community creation | Server-side verification via `lib/captcha.ts`; admin bypass; dev bypass when key unset |
| Rate limiting | 13 endpoints (vote, idea, comment, join, enter, follow, upvote, signup, ban, chat) | In-memory sliding window via `lib/rate-limit.ts`; admin-configurable via API |
| Email verification | Voting, idea submission | Non-OAuth users must verify email; returns `EMAIL_NOT_VERIFIED` |
| Content moderation | Idea submission, cell comments, community chat | Blocks slurs, hate speech, URLs, spam patterns via `lib/moderation.ts` |
| Per-user action limits | 1 idea per phase, 1 community per non-admin, 1 vote per cell | Enforced in route handlers with DB checks |
| Auth on all writes | Every mutation endpoint | NextAuth session required |
| CSRF (Origin check) | All mutation endpoints | `proxy.ts` blocks missing/mismatched Origin header |
| Access control | Private deliberations, community roles, ban system | `checkDeliberationAccess()`, `getCommunityMemberRole()`, `CommunityBan` |

**Architectural defense:** 5-person cells with random assignment. An attacker needs to control 3/5 members in a cell to guarantee an outcome, and control grows exponentially across tiers.

### Technical Debt

1. **Unused component**: `MetaDeliberationEmbed.tsx` created but not used
2. **Duplicate code**: Some overlap between components
3. **Rate limit bypass**: Per-IP limits bypassed by VPNs (per-user limits now used where possible)
4. **Scale unknowns**: Untested beyond 200 users. Prisma queries not optimized for scale.
5. **No MFA for admins**: Admin access based on email list only, no multi-factor authentication.

### Recent Additions (Feb 2026 — Hardening, E2E Tests, Performance)
- **CSRF protection**: `src/proxy.ts` — Origin header verification on all mutation endpoints, exempt paths for auth/cron/test
- **Security headers**: `next.config.ts` — X-Frame-Options DENY, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Accessibility**: `globals.css` `:focus-visible` styles; ARIA attributes across Header, Toast, CollectiveChat, VotingCell, feed tabs
- **Playwright E2E tests**: 32 tests across 10 spec files
- **Feed cache optimization**: `src/app/api/feed/route.ts` — per-tab TTL matching polling intervals
- **Collective chat preload**: `src/app/providers.tsx` — CollectiveChat always mounted (hidden), preloads messages on app load

### Key Subsystems (Reference)
- **100 Haiku Agents**: `src/lib/ai-orchestrator.ts` — cron-driven AI deliberation with personas
- **Collective Chat**: `src/components/CollectiveChat.tsx` — floating panel, Haiku responses
- **Stripe**: `src/lib/stripe.ts` — checkout/webhook/portal (4 tiers)
- **Security**: CSRF, rate limits, CAPTCHA, content moderation, email verification
- **Up-pollination**: Viral comment spreading within tiers, cross-tier promotion on idea advancement
- **Feed**: 3-tab card UI (Your Turn, Activity, Results), per-tab caching
- **E2E Tests**: 32 Playwright tests across 10 spec files

---

## Chant Progress Visualization — Math & Structure

### Core Concept

The voting tournament is a **converging tree**: N ideas enter, 1 winner exits. At each tier, ideas are grouped into cells of G (default 5), each cell picks 1 winner, ideas reduce by G:1.

### Formulas (G = group size, default 5)

| Metric | Formula |
|--------|---------|
| Ideas at tier T | `N / G^(T-1)` |
| Cells per tier | `N / G` (all participants re-assigned each tier) |
| Batches at tier T | `ideas_T / G = N / G^T` |
| Total tiers to final | `ceil(log_G(N))` |
| Final showdown | When ideas remaining ≤ G |

### Scale Examples

| Participants | Tier 1 Ideas | Tier 2 Ideas | Tier 3 Ideas | Tier 4 | Final |
|-------------|-------------|-------------|-------------|--------|-------|
| 25 (5^2) | 25 → 5 | 5 (final) | — | — | Tier 2 |
| 125 (5^3) | 125 → 25 | 25 → 5 | 5 (final) | — | Tier 3 |
| 625 (5^4) | 625 → 125 | 125 → 25 | 25 → 5 | 5 (final) | Tier 4 |
| 1000 | 1000 → 200 | 200 → 40 | 40 → 8 | 8 → ≤5 | Tier 4/5 |

### Pentagon Visualization (Fractal Constellation)

**Mockups:** `/tmp/chant-viz-125.html` (125 participants), `/tmp/chant-viz-mockup.html` (1000 participants)

Each tier is shown one at a time via buttons. The visual nesting depth = tier number.

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

### Fonts

Three font families configured (via `next/font` in `layout.tsx`):

| Class | Font | Usage |
|-------|------|-------|
| `font-serif` | Source Serif 4 | Logo, headings (h1-h6 get this automatically) |
| `font-sans` | Libre Franklin | Body text (default) |
| `font-mono` | IBM Plex Mono | Numbers, code |

**Note:** The "Unity Chant" header logo uses `font-serif` class explicitly since it's a `<Link>`, not an `<h1>`.

### Modifying the Theme

To change colors app-wide:

1. Edit `web/src/app/globals.css`
2. Update values in the `@theme { }` block
3. All pages using semantic classes update automatically

**Do NOT** use hardcoded hex values like `bg-[#0891b2]` in component files.

---

## Monetization

**Stripe Subscriptions (4 tiers):**
- **Free ($0)**: Public chants, voting, discussion, AI chat
- **Pro ($12/mo)**: Private groups & chants, analytics
- **Organization ($39/mo)**: Team management, data export
- **Scale ($99/mo)**: Unlimited everything, API access, dedicated infrastructure

**Stripe integration**: `src/lib/stripe.ts`, checkout/webhook/portal routes. Test with `4242 4242 4242 4242`.

---

## Architecture Decisions

1. **Why Next.js?** — Full-stack React with API routes, easy Vercel deploy
2. **Why Prisma?** — Type-safe database access, easy schema migrations
3. **Why Vercel Postgres/Neon?** — Free PostgreSQL with built-in connection pooling, seamless Vercel integration
4. **Why 5-person cells?** — Small enough for real deliberation, large enough for diverse perspectives
5. **Why cross-cell tallying?** — Prevents small-group capture, statistical robustness

---

## Backlog / Legacy

### Previous Database: Supabase (Deprecated Jan 2026)

The project previously used Supabase for PostgreSQL hosting. This was migrated to Vercel Postgres (Neon) due to maintenance windows causing deployment issues.

---

## Working With the User

- Direct communication style
- Prefers working code over long explanations
- Test frequently, prove it works
- Budget-conscious (free tiers where possible)
- Values democratic legitimacy

---

**You now have everything needed to continue development.**
