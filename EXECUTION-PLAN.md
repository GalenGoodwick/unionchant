# Union Chant - Production Scale Execution Plan

**Created:** 2026-01-27
**Goal:** Get Union Chant to production-ready state

---

## Phase 0: Sync Local to Production (IMMEDIATE)

**Priority:** Must do first - local has 35+ uncommitted changes

### Tasks
- [ ] Review all uncommitted changes
- [ ] Decide what to push vs revert
- [ ] Push stable changes to production
- [ ] Verify deployment succeeds

**Files with significant changes:**
- `web/src/lib/voting.ts` - Core voting logic
- `web/prisma/schema.prisma` - Database schema
- `web/src/lib/meta-deliberation.ts` - NEW feature
- `web/src/app/api/deliberations/[id]/start-challenge/` - NEW route

---

## Phase 1: Core Stability (Week 1)

### 1.1 Fix Race Conditions

**File:** `web/src/lib/voting.ts`

**Problem:** Simultaneous votes can corrupt state

**Implementation:**
```typescript
// Add optimistic locking to vote casting
async function castVote(cellId: string, userId: string, ideaId: string) {
  return await prisma.$transaction(async (tx) => {
    // Lock the cell row
    const cell = await tx.cell.findUnique({
      where: { id: cellId },
      select: { id: true, status: true, _count: { select: { votes: true } } }
    });

    if (cell.status !== 'VOTING') {
      throw new Error('Cell is not in voting phase');
    }

    // Check if user already voted
    const existingVote = await tx.vote.findFirst({
      where: { cellId, oderId: oderId }
    });

    if (existingVote) {
      throw new Error('User has already voted');
    }

    // Create vote within transaction
    return await tx.vote.create({
      data: { cellId, oderId: oderId, ideaId }
    });
  }, {
    isolationLevel: 'Serializable' // Prevents race conditions
  });
}
```

**Files to modify:**
- `web/src/app/api/cells/[cellId]/vote/route.ts`
- `web/src/lib/voting.ts`

---

### 1.2 Fix Edge Cases

**Problem:** Zero ideas, odd participant counts, empty cells

**Implementation:**

```typescript
// In startVotingPhase()
if (ideas.length === 0) {
  // No ideas submitted - end deliberation
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'COMPLETED',
      completedAt: new Date(),
      completionReason: 'NO_IDEAS'
    }
  });
  return { success: false, reason: 'No ideas submitted' };
}

if (participants.length < 3) {
  // Not enough participants
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'COMPLETED',
      completedAt: new Date(),
      completionReason: 'INSUFFICIENT_PARTICIPANTS'
    }
  });
  return { success: false, reason: 'Need at least 3 participants' };
}
```

**Files to modify:**
- `web/src/lib/voting.ts` - Add guards in `startVotingPhase()`
- `web/prisma/schema.prisma` - Add `completionReason` field

---

### 1.3 Add Database Indexes

**File:** `web/prisma/schema.prisma`

```prisma
model Vote {
  // ... existing fields

  @@index([cellId, oderId]) // Fast lookup for duplicate vote check
  @@index([ideaId])         // Fast vote counting
}

model Cell {
  // ... existing fields

  @@index([deliberationId, tier, status]) // Fast tier completion check
}

model Idea {
  // ... existing fields

  @@index([deliberationId, status]) // Fast idea filtering
  @@index([isChampion])             // Fast champion lookup
}

model CellParticipation {
  // ... existing fields

  @@index([oderId, oderId])                    // Fast user cell lookup
  @@index([cellId])                   // Fast cell participant count
}
```

**Command after changes:**
```bash
cd web && npx prisma db push
```

---

## Phase 2: Security (Week 1-2)

### 2.1 Add CAPTCHA to Idea Submission

**Install:**
```bash
cd web && npm install @hcaptcha/react-hcaptcha
```

**Environment variables:**
```env
HCAPTCHA_SITE_KEY=your-site-key
HCAPTCHA_SECRET_KEY=your-secret-key
```

**Frontend - `web/src/app/deliberations/[id]/page.tsx`:**
```typescript
import HCaptcha from '@hcaptcha/react-hcaptcha';

// In idea submission form
<HCaptcha
  sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
  onVerify={(token) => setCaptchaToken(token)}
/>

// Include token in submission
const response = await fetch(`/api/deliberations/${id}/ideas`, {
  method: 'POST',
  body: JSON.stringify({ text: ideaText, captchaToken })
});
```

**Backend - `web/src/app/api/deliberations/[id]/ideas/route.ts`:**
```typescript
async function verifyCaptcha(token: string): Promise<boolean> {
  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `response=${token}&secret=${process.env.HCAPTCHA_SECRET_KEY}`
  });
  const data = await response.json();
  return data.success;
}

export async function POST(request: Request) {
  const { text, captchaToken } = await request.json();

  if (!await verifyCaptcha(captchaToken)) {
    return NextResponse.json({ error: 'Invalid captcha' }, { status: 400 });
  }

  // ... rest of idea creation
}
```

---

### 2.2 Basic Content Moderation

**File:** `web/src/lib/moderation.ts` (NEW)

```typescript
// Simple word filter - upgrade to AI moderation later
const BLOCKED_PATTERNS = [
  /\b(spam|scam|viagra|casino)\b/i,
  // Add more patterns
];

const SUSPICIOUS_PATTERNS = [
  /https?:\/\/[^\s]+/g,  // URLs (flag for review)
  /(.)\1{4,}/,           // Repeated characters
];

export function moderateContent(text: string): {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
} {
  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, flagged: true, reason: 'Blocked content detected' };
    }
  }

  // Check suspicious patterns (allow but flag)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: true, flagged: true, reason: 'Contains URLs or suspicious patterns' };
    }
  }

  return { allowed: true, flagged: false };
}
```

**Add to idea submission:**
```typescript
import { moderateContent } from '@/lib/moderation';

// In POST handler
const moderation = moderateContent(text);
if (!moderation.allowed) {
  return NextResponse.json({ error: moderation.reason }, { status: 400 });
}

// Create idea with flag
await prisma.idea.create({
  data: {
    text,
    flagged: moderation.flagged,
    // ... other fields
  }
});
```

**Schema addition:**
```prisma
model Idea {
  // ... existing
  flagged     Boolean  @default(false)
  flagReason  String?
}
```

---

### 2.3 Rate Limiting Improvements

**File:** `web/src/lib/rate-limit.ts` (NEW)

```typescript
import { prisma } from './prisma';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMinutes: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  // Count recent actions
  const count = await prisma.rateLimitLog.count({
    where: {
      oderId: oderId,
      action,
      createdAt: { gte: windowStart }
    }
  });

  if (count >= limit) {
    const oldestInWindow = await prisma.rateLimitLog.findFirst({
      where: { oderId: oderId, action, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'asc' }
    });

    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(oldestInWindow!.createdAt.getTime() + windowMinutes * 60 * 1000)
    };
  }

  // Log this action
  await prisma.rateLimitLog.create({
    data: { oderId: oderId, action }
  });

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt: new Date(Date.now() + windowMinutes * 60 * 1000)
  };
}

// Usage limits
export const LIMITS = {
  IDEA_SUBMISSION: { limit: 10, windowMinutes: 60 },      // 10 ideas/hour
  DELIBERATION_CREATE: { limit: 3, windowMinutes: 1440 }, // 3/day
  VOTE: { limit: 100, windowMinutes: 60 },                // 100 votes/hour
  COMMENT: { limit: 50, windowMinutes: 60 },              // 50 comments/hour
};
```

**Schema addition:**
```prisma
model RateLimitLog {
  id        String   @id @default(cuid())
  oderId      String
  action    String
  createdAt DateTime @default(now())

  user User @relation(fields: [oderId], references: [id], onDelete: Cascade)

  @@index([oderId, action, createdAt])
}
```

---

## Phase 3: Reliability (Week 2)

### 3.1 Error Tracking with Sentry

**Install:**
```bash
cd web && npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

**Configuration - `sentry.client.config.ts`:**
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

**Wrap API routes:**
```typescript
import * as Sentry from '@sentry/nextjs';

export async function POST(request: Request) {
  try {
    // ... handler code
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

---

### 3.2 Health Check Endpoint

**File:** `web/src/app/api/health/route.ts` (NEW)

```typescript
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const checks = {
    database: false,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (e) {
    checks.database = false;
  }

  const healthy = checks.database;

  return NextResponse.json(checks, {
    status: healthy ? 200 : 503
  });
}
```

---

### 3.3 Test Timer Transitions

**File:** `web/src/lib/__tests__/timer-processor.test.ts` (NEW)

```typescript
import { processExpiredSubmissions, processExpiredCells } from '../timer-processor';

describe('Timer Processor', () => {
  test('processExpiredSubmissions starts voting when deadline passes', async () => {
    // Create deliberation with past submissionDeadline
    const delib = await prisma.deliberation.create({
      data: {
        title: 'Test',
        phase: 'SUBMISSION',
        submissionDeadline: new Date(Date.now() - 1000), // 1 second ago
        creatorId: testUser.id,
      }
    });

    await processExpiredSubmissions();

    const updated = await prisma.deliberation.findUnique({ where: { id: delib.id } });
    expect(updated.phase).toBe('VOTING');
  });

  test('processExpiredCells completes cells when voting deadline passes', async () => {
    // ... similar test for cell expiration
  });
});
```

---

## Phase 4: User Experience (Week 2-3)

### 4.1 Email Notifications

**Install:**
```bash
cd web && npm install @sendgrid/mail
```

**File:** `web/src/lib/email.ts` (NEW)

```typescript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendVotingStartedEmail(
  to: string,
  deliberationTitle: string,
  deliberationId: string
) {
  await sgMail.send({
    to,
    from: 'noreply@unionchant.org',
    subject: `Voting has started: ${deliberationTitle}`,
    html: `
      <h2>Time to vote!</h2>
      <p>Voting has started for "${deliberationTitle}".</p>
      <p><a href="https://unionchant.org/deliberations/${deliberationId}">Cast your vote now</a></p>
    `,
  });
}

export async function sendYourTurnEmail(
  to: string,
  deliberationTitle: string,
  deliberationId: string,
  tier: number
) {
  await sgMail.send({
    to,
    from: 'noreply@unionchant.org',
    subject: `Your turn to vote (Tier ${tier}): ${deliberationTitle}`,
    html: `
      <h2>Your cell is ready for voting!</h2>
      <p>Tier ${tier} voting is now open for "${deliberationTitle}".</p>
      <p><a href="https://unionchant.org/deliberations/${deliberationId}">Vote now</a></p>
    `,
  });
}

export async function sendChampionDeclaredEmail(
  to: string,
  deliberationTitle: string,
  winningIdea: string
) {
  await sgMail.send({
    to,
    from: 'noreply@unionchant.org',
    subject: `Champion declared: ${deliberationTitle}`,
    html: `
      <h2>We have a winner!</h2>
      <p>"${deliberationTitle}" has crowned a champion:</p>
      <blockquote>${winningIdea}</blockquote>
    `,
  });
}
```

**Add email preferences to User:**
```prisma
model User {
  // ... existing
  emailNotifications Boolean @default(true)
}
```

---

### 4.2 Better Onboarding

**File:** `web/src/components/OnboardingModal.tsx` (NEW)

```typescript
'use client';

import { useState, useEffect } from 'react';

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('onboarding-complete');
    if (!seen) setShow(true);
  }, []);

  const steps = [
    {
      title: 'Welcome to Union Chant',
      content: 'A new way to make decisions together.',
    },
    {
      title: 'Submit Ideas',
      content: 'Propose solutions to the question being deliberated.',
    },
    {
      title: 'Vote in Small Groups',
      content: 'You\'ll be placed in a cell of 5 people to discuss and vote.',
    },
    {
      title: 'Best Ideas Win',
      content: 'Winners advance through tiers until one champion remains.',
    },
  ];

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface p-6 rounded-lg max-w-md">
        <h2 className="text-xl font-serif mb-4">{steps[step].title}</h2>
        <p className="text-muted mb-6">{steps[step].content}</p>

        <div className="flex justify-between">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="text-muted">
              Back
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} className="bg-accent text-white px-4 py-2 rounded">
              Next
            </button>
          ) : (
            <button
              onClick={() => {
                localStorage.setItem('onboarding-complete', 'true');
                setShow(false);
              }}
              className="bg-accent text-white px-4 py-2 rounded"
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 5: Compliance (Week 3)

### 5.1 GDPR Data Export

Already exists in settings - verify it exports:
- [ ] All user data
- [ ] All ideas submitted
- [ ] All votes cast
- [ ] All comments made

### 5.2 Account Deletion Flow

**File:** `web/src/app/api/user/delete/route.ts`

```typescript
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const oderId = session.user.id;

  // Check if user is admin of any active deliberations
  const adminOf = await prisma.deliberation.count({
    where: { creatorId: oderId, phase: { not: 'COMPLETED' } }
  });

  if (adminOf > 0) {
    return NextResponse.json({
      error: 'Cannot delete account while admin of active deliberations'
    }, { status: 400 });
  }

  // Anonymize user data instead of hard delete
  await prisma.user.update({
    where: { id: oderId },
    data: {
      email: `deleted-${oderId}@anonymized.local`,
      name: 'Deleted User',
      image: null,
      deletedAt: new Date(),
    }
  });

  return NextResponse.json({ success: true });
}
```

### 5.3 Audit Logging

**Schema:**
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  oderId      String?
  action    String   // 'vote', 'create_deliberation', 'delete_idea', etc.
  targetType String? // 'deliberation', 'idea', 'cell'
  targetId  String?
  metadata  Json?
  ip        String?
  createdAt DateTime @default(now())

  user User? @relation(fields: [oderId], references: [id])

  @@index([oderId])
  @@index([action])
  @@index([createdAt])
}
```

**File:** `web/src/lib/audit.ts`

```typescript
export async function logAudit(
  oderId: string | null,
  action: string,
  target?: { type: string; id: string },
  metadata?: Record<string, unknown>,
  ip?: string
) {
  await prisma.auditLog.create({
    data: {
      oderId: oderId,
      action,
      targetType: target?.type,
      targetId: target?.id,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ip,
    }
  });
}
```

---

## Phase 6: Performance (Week 3-4)

### 6.1 Query Optimization

**Identify slow queries:**
```typescript
// In prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'warn', emit: 'stdout' },
    { level: 'error', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) { // Log queries over 100ms
    console.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});
```

### 6.2 Caching Layer

**File:** `web/src/lib/cache.ts`

```typescript
const cache = new Map<string, { data: unknown; expires: number }>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlSeconds: number) {
  cache.set(key, {
    data,
    expires: Date.now() + ttlSeconds * 1000,
  });
}

// Usage: Cache deliberation list for 30 seconds
const CACHE_KEY = 'deliberations:public';
let deliberations = getCached(CACHE_KEY);
if (!deliberations) {
  deliberations = await prisma.deliberation.findMany(...);
  setCache(CACHE_KEY, deliberations, 30);
}
```

---

## Execution Order Summary

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| 0 | Sync | Push local changes to production |
| 1 | Stability | Race conditions fixed, edge cases handled, indexes added |
| 1-2 | Security | CAPTCHA, content moderation, rate limiting |
| 2 | Reliability | Sentry, health checks, timer tests |
| 2-3 | UX | Email notifications, onboarding |
| 3 | Compliance | Data export verified, account deletion, audit logs |
| 3-4 | Performance | Query optimization, caching |

---

## Immediate Next Actions

1. **Review and push local changes** - 35+ files modified
2. **Add database indexes** - Quick win for performance
3. **Implement CAPTCHA** - Blocks spam immediately
4. **Set up Sentry** - Know when things break

---

**Ready to execute. Which phase do you want to start with?**
