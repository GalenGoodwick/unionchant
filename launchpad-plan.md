# Crypto Launchpad at unitychant.app

## Context

Unity Chant's governance engine (5-person cells, XP voting, tiered advancement) can power a crypto launchpad where users pool funds, propose projects, deliberate in cells, and the winning project gets the pot. This creates aligned communities with no incentive to dump — everyone deliberated on what to fund.

The hackathon showed UC's API works for external agents. Now we apply the same pattern for a crypto use case: a **separate proprietary app** that uses UC's public API as its decision engine.

**Goal**: Build a standalone Next.js app at `unitychant.app` that wraps UC's governance in a crypto launchpad UX. Deletable with zero impact on UC.

---

## Architecture: Separate App, Shared API

```
unitychant.app (new proprietary repo)     unitychant.com (existing, unchanged)
┌──────────────────────────┐              ┌──────────────────────────┐
│  Next.js 15 + Tailwind   │  server-to-  │  Next.js 15 + Prisma     │
│  Own Prisma DB (launches, │──server───→ │  /api/v1/* endpoints     │
│  contributions, metadata) │  HTTP calls  │  (chants, ideas, votes)  │
│  Solana wallet connect    │              │                          │
│  Landing page (crypto)    │  ←─webhook── │  Integration webhooks    │
└──────────────────────────┘              └──────────────────────────┘
```

- All UC interactions are **server-side** (launchpad API routes call UC API routes)
- No CORS changes needed on UC
- Users never see UC API keys
- Deleting the launchpad repo = zero UC impact

---

## Step 1: Scaffold the New Repo

Create `unitychant-launchpad/` with:

```
├── package.json           # next@15, react@19, tailwind@4, prisma, @solana/wallet-adapter-*
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .env.local.example
├── prisma/schema.prisma   # Launch, Contribution, ProjectMeta, User (launchpad-only DB)
├── src/
│   ├── app/
│   │   ├── layout.tsx     # WalletProvider + theme
│   │   ├── page.tsx       # Landing page
│   │   ├── launches/
│   │   │   ├── page.tsx           # Browse active launches
│   │   │   ├── new/page.tsx       # Create a launch
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Launch detail (pool + proposals + voting)
│   │   │       └── propose/page.tsx
│   │   ├── dashboard/page.tsx     # User's launches & history
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── launches/
│   │       │   ├── route.ts                    # POST create launch
│   │       │   └── [id]/
│   │       │       ├── route.ts                # GET launch details
│   │       │       ├── proposals/route.ts      # POST submit proposal
│   │       │       ├── vote/route.ts           # POST proxy vote to UC
│   │       │       ├── status/route.ts         # GET poll UC status
│   │       │       └── webhook/route.ts        # POST receive UC events
│   │       └── wallet/verify/route.ts
│   ├── lib/
│   │   ├── uc-client.ts   # Wraps all UC /api/v1/* calls
│   │   ├── prisma.ts
│   │   └── solana.ts
│   └── components/
│       ├── WalletProvider.tsx
│       ├── LaunchCard.tsx
│       ├── ProposalCard.tsx
│       ├── VotingCell.tsx
│       ├── PoolProgress.tsx
│       └── Header.tsx
└── vercel.json            # unitychant.app domain
```

---

## Step 2: Launchpad Prisma Schema (own DB, NOT UC's)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String?  @unique
  walletAddress String?  @unique
  name          String?
  ucUserId      String?  @unique   // UC agent user ID
  ucApiKey      String?            // Encrypted UC API key (from /api/v1/register)
  createdAt     DateTime @default(now())
}

model Launch {
  id               String     @id @default(cuid())
  name             String
  description      String?
  creatorId        String
  ucChantId        String     @unique  // Maps to UC deliberation
  targetAmountSol  Float
  currentAmountSol Float      @default(0)
  treasuryAddress  String?             // Solana escrow address (Phase 2)
  poolDeadline     DateTime
  status           LaunchStatus @default(OPEN)
  winnerUcIdeaId   String?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
}

enum LaunchStatus {
  OPEN          // Accepting contributions + proposals
  VOTING        // UC deliberation in voting phase
  DISTRIBUTING  // Winner declared, funds being sent
  COMPLETE      // Done
  CANCELLED     // Refunds issued
}

model Contribution {
  id          String    @id @default(cuid())
  launchId    String
  userId      String
  amountSol   Float
  txSignature String?   @unique  // Solana tx (Phase 2; Phase 1 = honor system)
  createdAt   DateTime  @default(now())
}

model ProjectMeta {
  id          String  @id @default(cuid())
  launchId    String
  ucIdeaId    String  @unique  // Maps to UC idea
  proposerId  String
  tokenName   String?
  tokenSymbol String?
  website     String?
  teamInfo    String?
  createdAt   DateTime @default(now())
}
```

---

## Step 3: UC Client Library

`src/lib/uc-client.ts` — wraps all UC API calls:

```typescript
class UCClient {
  constructor(private apiKey: string) {}

  createChant(question, opts)     // POST /api/v1/chants
  getChant(id)                    // GET /api/v1/chants/:id
  getStatus(id)                   // GET /api/v1/chants/:id/status
  submitIdea(chantId, text)       // POST /api/v1/chants/:id/ideas
  join(chantId)                   // POST /api/v1/chants/:id/join
  getCell(chantId)                // GET /api/v1/chants/:id/cell
  vote(chantId, allocations)      // POST /api/v1/chants/:id/vote
  getComments(chantId)            // GET /api/v1/chants/:id/comment
  postComment(chantId, text)      // POST /api/v1/chants/:id/comment
  startVoting(chantId)            // POST /api/v1/chants/:id/start
  registerWebhook(name, url, events) // POST /api/v1/integrations
}
```

Each launchpad user gets their own UC agent (via `POST /api/v1/register` on first interaction). The API key is stored encrypted in the launchpad's User model.

---

## Step 4: Core User Journey

### Create Launch
1. User fills form: name, description, pool target, deadline
2. Launchpad creates UC chant: `POST /api/v1/chants { question: "Which project should get the 50 SOL pool?", cellSize: 5, callbackUrl: "https://unitychant.app/api/launches/{id}/webhook" }`
3. Stores `Launch` record with `ucChantId`

### Submit Proposal
1. User submits project: name, token info, team, description
2. Launchpad calls UC: `POST /api/v1/chants/{ucChantId}/ideas { text: "ProjectName — description" }`
3. Stores `ProjectMeta` linking `ucIdeaId` to rich metadata

### Pool Funds (Phase 1: Honor System)
1. User pledges amount → stored in `Contribution` table (no on-chain verification yet)
2. Pool progress bar shows current vs target
3. Phase 2: actual Solana tx verification via `@solana/web3.js`

### Deliberate & Vote
1. Launchpad fetches cell: `GET /api/v1/chants/{ucChantId}/cell` (using user's UC key)
2. Renders 5 proposals with rich metadata from `ProjectMeta`
3. User allocates 10 XP → launchpad proxies: `POST /api/v1/chants/{ucChantId}/vote { allocations }`

### Winner Declared
1. UC fires webhook → `POST /api/launches/{id}/webhook { event: "winner_declared", ideaId }`
2. Launchpad updates `Launch.status = DISTRIBUTING`, `winnerUcIdeaId = ideaId`
3. Phase 1: admin manually sends funds. Phase 2: smart contract auto-distributes.

---

## Step 5: Minimal UC Changes (2 changes)

### Change A: Landing page toggle (optional promo section)

**File**: `/Users/galengoodwick/Desktop/Union-Rolling/web/src/components/LandingParallax.tsx`

Add a feature-flagged section before the "Use Cases" section (~line 323):

```tsx
{process.env.NEXT_PUBLIC_FEATURE_LAUNCHPAD === 'true' && (
  <section className="...">
    <h2>Governance meets crypto</h2>
    <p>Pool funds. Propose projects. Deliberate in cells. Winner gets the pot.</p>
    <a href="https://unitychant.app">Explore the Launchpad →</a>
  </section>
)}
```

**Rip-out**: Remove `NEXT_PUBLIC_FEATURE_LAUNCHPAD` env var from Vercel → section disappears.

### Change B: (NOT needed for MVP)

No CORS changes required — all UC calls are server-to-server from the launchpad's API routes.

---

## Step 6: Env Vars

```bash
# Launchpad .env.local
DATABASE_URL="postgresql://..."           # Separate DB from UC!
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3001"
UC_API_URL="https://unitychant.com"
UC_WEBHOOK_SECRET="..."                   # For verifying inbound UC webhooks
NEXT_PUBLIC_SOLANA_NETWORK="devnet"       # devnet for testing, mainnet for prod
```

---

## What's Buildable NOW vs Later

### Phase 1 (NOW — no smart contracts)
- Landing page with crypto branding
- Wallet connect auth (Phantom)
- Create launch → UC chant
- Submit proposals → UC ideas with rich metadata
- View cells + vote → proxied to UC
- Winner via webhook
- Honor-system pooling (pledges tracked in DB, no on-chain verification)

### Phase 2 (needs Solana work)
- On-chain fund pooling (SPL escrow program)
- Contribution verification (verify Solana tx signatures)
- Auto-distribution to winner
- Refund mechanism for cancelled launches

### Phase 3 (growth)
- Token-gated launches
- Reputation-weighted voting (UC reputation API)
- Launch analytics

---

## Key Packages

```json
{
  "next": "^15",
  "react": "^19",
  "@prisma/client": "^7",
  "next-auth": "^4",
  "@solana/web3.js": "^1.95",
  "@solana/wallet-adapter-react": "^0.15",
  "@solana/wallet-adapter-wallets": "^0.19",
  "tailwindcss": "^4"
}
```

---

## Verification

1. `npm run build` passes in the new repo
2. Create a launch → verify UC chant exists via `GET /api/v1/chants/:id`
3. Submit a proposal → verify UC idea created
4. Vote → verify UC records the vote
5. Trigger tier completion → verify webhook fires to launchpad
6. Toggle `NEXT_PUBLIC_FEATURE_LAUNCHPAD=true` on UC → verify promo section renders
7. Delete the launchpad env var → verify UC landing page is unchanged

---

## Implementation Order

1. Scaffold repo + Prisma schema + basic Next.js config
2. Build `uc-client.ts` (the API wrapper)
3. Auth flow (wallet connect + UC agent registration)
4. Create launch page + API route
5. Submit proposal page + API route
6. Voting UI + proxy route
7. Webhook handler for winner_declared
8. Landing page (crypto branding)
9. Dashboard (user's launches)
10. UC landing page toggle (the one UC-side change)
