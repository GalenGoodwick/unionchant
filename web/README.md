# Union Chant

Collective decision-making for the modern age. Small group deliberation at any scale.

## Overview

Union Chant is a scalable direct democracy platform that enables large groups to deliberate meaningfully through small group discussions. Instead of simple voting, participants engage in structured conversations where ideas compete through multiple rounds of evaluation.

### How It Works

1. **Submit Ideas** - All participants can propose solutions, not just react to preset options
2. **Small Groups Deliberate** - Participants are divided into cells of 5, each evaluating 5 ideas
3. **Best Ideas Advance** - Ideas that earn support move to the next tier
4. **Champion Emerges** - Through multiple rounds, the strongest idea wins

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma 7 with `@prisma/adapter-pg`
- **Authentication**: NextAuth.js with Google OAuth
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL database (Supabase recommended)
- Google Cloud Console project for OAuth

## Environment Variables

Create a `.env` file in the `/web` directory:

```env
# Database - Use Supabase connection pooler with Session mode (port 5432)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-1-us-east-2.pooler.supabase.com:5432/postgres"

# NextAuth
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET="your-secret-key-change-in-production"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Web Push (VAPID keys) - Generate with: npx web-push generate-vapid-keys
VAPID_SUBJECT="mailto:hello@unionchant.com"
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
```

### Supabase Connection Notes

- Use the **Connection Pooler** URL, not the direct connection
- Use **Session mode** (port 5432), not Transaction mode (port 6543)
- Prisma migrations require Session mode
- URL encode special characters in the password (e.g., `!` becomes `%21`)

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the Google+ API
4. Go to Credentials > Create Credentials > OAuth Client ID
5. Application type: Web application
6. Add authorized redirect URI: `http://localhost:3004/api/auth/callback/google`
7. Copy Client ID and Client Secret to `.env`

## Installation

```bash
cd web
npm install
```

## Database Setup

```bash
# Push schema to database
npx prisma db push

# Generate Prisma client
npx prisma generate
```

## Running Locally

```bash
npm run dev
```

The app runs on `http://localhost:3004` (configured in package.json)

## Project Structure

```
web/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts    # NextAuth API
│   │   │   ├── deliberations/
│   │   │   │   ├── route.ts                   # List/create deliberations
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts               # Get single deliberation
│   │   │   │       ├── join/route.ts          # Join deliberation
│   │   │   │       ├── ideas/route.ts         # Submit ideas
│   │   │   │       ├── start-voting/route.ts  # Start voting phase
│   │   │   │       └── cells/route.ts         # Get user's cells
│   │   │   └── cells/[cellId]/
│   │   │       ├── vote/route.ts              # Cast vote
│   │   │       └── comments/route.ts          # Cell discussion
│   │   ├── auth/signin/page.tsx               # Sign-in page
│   │   ├── deliberations/
│   │   │   ├── page.tsx                       # Browse deliberations
│   │   │   ├── new/page.tsx                   # Create deliberation
│   │   │   └── [id]/page.tsx                  # Deliberation detail + voting
│   │   ├── demo/page.tsx                      # Automated demo
│   │   ├── whitepaper/page.tsx                # Whitepaper
│   │   └── page.tsx                           # Homepage
│   └── lib/
│       ├── auth.ts                            # NextAuth configuration
│       └── prisma.ts                          # Prisma client with adapter
└── .env                                       # Environment variables
```

## Database Schema

### Core Models

- **User** - Authenticated users
- **Deliberation** - A decision-making session with question and phases
- **DeliberationMember** - User participation in deliberations
- **Idea** - Proposed solutions submitted by participants
- **Cell** - Small groups of 5 participants evaluating 5 ideas
- **CellIdea** - Ideas assigned to a cell
- **CellParticipation** - Users assigned to a cell
- **Vote** - Individual votes within cells
- **Comment** - Discussion messages within cells

### Deliberation Phases

1. `submission` - Participants submit ideas
2. `voting` - Small group deliberation and voting
3. `complete` - Champion determined

## Voting Algorithm

1. **Cell Formation**: When voting starts, participants are divided into cells of 5
2. **Idea Assignment**: Each cell receives 5 ideas to evaluate
3. **Voting**: Each participant votes for their preferred idea
4. **Cell Completion**: When all 5 members vote, results are tallied
5. **Tier Advancement**: Winners advance to next tier, losers are eliminated
6. **Champion**: Process repeats until one idea remains

### Tier System

- **Tier 0**: Initial round with all ideas
- **Tier 1+**: Winners from previous tier compete
- Each tier reduces ideas by ~80% (1 winner per 5 ideas)

## What's Built

- [x] Google OAuth authentication
- [x] Create and browse deliberations
- [x] Join deliberations
- [x] Submit ideas during submission phase
- [x] Cell-based voting engine
- [x] Multi-tier tournament advancement
- [x] Champion determination
- [x] In-cell discussion/chat
- [x] Automated demo page (125 participants simulation)
- [x] Whitepaper page
- [x] Homepage with call-to-action
- [x] PWA support (installable, offline-capable)
- [x] Push notifications when voting starts

## What's Left to Build

### High Priority
- [ ] Email notifications (fallback for users without push)
- [ ] Invite links for private deliberations
- [ ] Mobile responsive design improvements
- [ ] Voting timeouts/deadlines with spot reservation
- [ ] Real-time updates (WebSocket or polling)
- [ ] PWA icons (replace placeholders with proper 192x192 and 512x512 PNGs)

### Medium Priority
- [ ] Private deliberations (invite-only)
- [ ] Admin dashboard
- [ ] Idea editing/deletion
- [ ] User profiles
- [ ] Deliberation search and filters

### Monetization
- [ ] Stripe integration for payments
- [ ] Subscription management
- [ ] Usage tracking
- [ ] Feature gating by tier

### Advanced Features
- [ ] Rolling/challenge mode (ongoing deliberations)
- [ ] Export results
- [ ] Analytics dashboard
- [ ] API for integrations
- [ ] Multi-language support

## Pricing Tiers (Planned)

| Tier | Price | Participants | Features |
|------|-------|--------------|----------|
| Free | $0 | Up to 25 | Basic deliberations, public only |
| Pro | $29/mo | Up to 500 | Private deliberations, custom branding |
| Organization | $99/mo | Up to 5,000 | API access, analytics, priority support |
| Enterprise | $499+/mo | Unlimited | Custom deployment, SLA, dedicated support |

## Key Technical Decisions

### Prisma 7 Adapter Pattern

Prisma 7 removed the `datasources` property. The client must be initialized with an adapter:

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
export const prisma = new PrismaClient({ adapter })
```

### Next.js 15 Route Params

Route params are now async and must be awaited:

```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```

## Troubleshooting

### Database Connection Failed (P1001)
- Verify DATABASE_URL uses the connection pooler, not direct connection
- Ensure you're using port 5432 (Session mode)
- Check that the password is URL-encoded

### Prisma Client Error
- Run `npx prisma generate` after schema changes
- Ensure `@prisma/adapter-pg` and `pg` are installed

### OAuth Redirect Error
- Verify redirect URI in Google Cloud Console matches exactly
- Include the full path: `http://localhost:3004/api/auth/callback/google`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
