/**
 * Architecture map for the Collective Chat AI.
 * This gives the AI accurate knowledge of the codebase so it can answer
 * questions about how Unity Chant works, point users to the right pages,
 * and explain the voting algorithm correctly.
 *
 * KEEP THIS UPDATED when adding new features or changing core logic.
 */

export const ARCHITECTURE_MAP = `
## HOW UNITY CHANT WORKS

Unity Chant is a scalable direct democracy platform. People submit ideas to a question ("chant"),
then vote in small 5-person cells. Winners advance tier by tier until one idea wins.

### VOTING ALGORITHM (src/lib/voting.ts)
- Ideas are grouped into cells of 5 people x 5 ideas
- Each voter distributes 10 XP across the 5 ideas in their cell (more XP = stronger support)
- ALL VOTES ARE EQUAL — no reputation weighting, no special influence
- The top idea in each cell advances to the next tier
- Eliminated ideas are out (unless rolling mode is on)
- When ≤5 ideas remain, ALL participants vote in a final showdown
- Winner is declared as the "Priority"
- Scale: 25 ideas = 2 tiers, 125 = 3, 625 = 4, 1M = 9 tiers

### PHASES
1. SUBMISSION — People join and submit ideas
2. VOTING — Tiered voting through cells (Tier 1 → 2 → 3 → ... → Final)
3. COMPLETED — Priority declared
4. ACCUMULATING (rolling mode) — Winner can be challenged by new ideas

### ROLLING MODE (src/lib/challenge.ts)
- After a Priority is declared, new ideas can be submitted to challenge it
- The defending Priority enters at a higher tier (skips Tier 1)
- If the challenger wins, it becomes the new Priority
- This creates continuous, living consensus

### UPVOTES
- Upvotes on chants are PERMANENT — they help surface popular chants in browse
- Upvotes do NOT expire
- Comment upvotes trigger "up-pollination" — spreading good comments to other cells

### UP-POLLINATION (comment spreading)
- When a comment gets 3 upvotes, it spreads to ~3 other cells with the same idea
- 2 more upvotes = spreads to ~9 cells, then all cells
- Comments only spread to cells sharing the same idea
- Cross-tier: when an idea advances, its top comments get promoted to the new tier

## KEY PAGES

| Path | What it does |
|------|-------------|
| / | Landing page |
| /feed | Your personalized feed (Your Turn, Activity, Results tabs) |
| /stream | Live FCFS voting stream |
| /chants | Browse all public chants |
| /chants/new | Create a new chant |
| /chants/[id] | Chant detail — submit ideas, discuss, vote |
| /groups | Browse communities |
| /groups/new | Create a community |
| /groups/[slug] | Community page |
| /groups/[slug]/feed | Community-scoped feed |
| /podiums | Long-form writing posts |
| /podium/new | Write a podium post |
| /podium/[id] | Read a podium post |
| /profile | Your profile + stats |
| /profile/manage | Manage your chants and groups (delete, toggle private) |
| /settings | Account settings (email prefs, password, zip code) |
| /notifications | Notification center |
| /dashboard | Creator dashboard for your chants |
| /dashboard/[id] | Manage a specific chant |
| /pricing | Subscription tiers (Free/Pro/Org/Scale) |
| /how-it-works | How the voting algorithm works |
| /whitepaper | Full whitepaper |
| /technical | Technical whitepaper (detailed algorithm) |
| /donate | Support the project |
| /pepperphone | Discord bot landing page |
| /demo | Interactive demo (coming soon) |
| /pitch | Executive pitch |
| /contact | Contact form |

## API ROUTES OVERVIEW

### Deliberations (Chants)
- GET /api/deliberations — List public chants
- POST /api/deliberations — Create a chant
- GET /api/deliberations/[id] — Get chant details
- POST /api/deliberations/[id]/ideas — Submit an idea
- POST /api/deliberations/[id]/join — Join a chant
- POST /api/deliberations/[id]/enter — Join + get assigned to a cell
- POST /api/deliberations/[id]/start-voting — Begin voting phase
- GET /api/deliberations/[id]/cells — Your cells in this chant
- GET /api/deliberations/[id]/history — Voting history across tiers
- POST /api/deliberations/[id]/upvote — Upvote a chant
- PATCH /api/deliberations/[id]/manage — Creator management

### Cells & Voting
- GET /api/cells/[cellId] — Cell details
- POST /api/cells/[cellId]/vote — Cast vote (distribute 10 XP)
- GET/POST /api/cells/[cellId]/comments — Cell discussion

### Comments
- POST /api/comments/[id]/upvote — Upvote (triggers up-pollination)

### Feed & Stream
- GET /api/feed — Feed cards (your-turn, activity, results)
- GET /api/stream — FCFS voting stream

### Communities (Groups)
- GET/POST /api/communities — List/create groups
- POST /api/communities/[slug]/join — Join a group
- GET /api/communities/[slug]/feed — Group-scoped feed

### User
- GET/PATCH /api/user/me — Profile + email preferences
- POST /api/user/[id]/follow — Follow/unfollow
- GET /api/user/export — Export your data

### Subscriptions
- POST /api/stripe/checkout — Start subscription
- POST /api/stripe/portal — Manage billing
- Tiers: Free ($0), Pro ($12/mo), Organization ($39/mo), Scale ($99/mo)
- Only creators/organizers pay — members always join free

### Notifications
- GET/PATCH /api/notifications — Your notifications

## DATA MODELS (prisma/schema.prisma)

### Core
- Deliberation — question, phase, currentTier, championId, tags, inviteCode
- Idea — text, status (PENDING→IN_VOTING→ADVANCING→WINNER/ELIMINATED), totalXP
- Cell — tier, status (DELIBERATING/VOTING/COMPLETED), 5 participants x 5 ideas
- Vote — cellId, ideaId, xpPoints (1-10 from the 10 XP budget)
- Comment — text, upvoteCount, spreadCount, reachTier (for up-pollination)

### Social
- User — email, name, bio, subscriptionTier, zipCode, followers
- Follow — followerId, followingId
- AgreementScore — tracks voting alignment between user pairs
- Community — name, slug, members, deliberations, roles (OWNER/ADMIN/MEMBER)

### Content
- Podium — long-form posts, optionally linked to a deliberation
- CollectiveMessage — chat history (user + AI messages, per-user private)
- Notification — in-app notifications (vote needed, idea advanced, etc.)

### Integrations
- Discord bot (PepperPhone) — /api/bot/* routes
- Common Ground plugin — /api/cg/* routes
- Stripe billing — /api/stripe/* routes

## SUBSCRIPTION TIERS
| Tier | Price | Key Features |
|------|-------|-------------|
| Free | $0 | Unlimited public chants, voting, discussion, AI chat, groups |
| Pro | $12/mo | Private groups & chants, community feed, analytics |
| Organization | $39/mo | Up to 5,000 members/group, data export |
| Scale | $99/mo | Unlimited members, API access, dedicated support |

## TECH STACK
- Next.js 15 (App Router) + React + TypeScript
- Prisma ORM + PostgreSQL (Neon)
- Tailwind CSS v4 with semantic color tokens
- Vercel hosting + Vercel Postgres
- Resend for transactional email
- Stripe for subscriptions
- Anthropic Claude for AI features
- Discord.js for bot integration
- Open source: https://github.com/GalenGoodwick/unitychant
`
