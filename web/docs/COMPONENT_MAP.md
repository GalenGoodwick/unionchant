# Unity Chant: Component & Page Map

**For Claude (or any AI) navigating this codebase**

---

## Global Components (Always Loaded)

These components are mounted at the app root regardless of which page the user is on.
They live in `src/app/providers.tsx` and `src/app/layout.tsx`.

```
layout.tsx
└── <Providers>                         ← src/app/providers.tsx
    ├── SessionProvider                 ← next-auth (session context)
    ├── ThemeGate                       ← dark/light theme toggle
    ├── ToastProvider                   ← src/components/Toast.tsx (toast notifications)
    ├── GuideGate                       ← src/components/UserGuide.tsx (first-time help)
    ├── OnboardingGate                  ← src/components/Onboarding.tsx (name/bio + push prompt)
    ├── PasskeyPromptGate               ← src/components/PasskeyPrompt.tsx (Touch ID save)
    ├── CollectiveChatGate              ← context only (chat state)
    ├── ChallengeProvider               ← src/components/ChallengeProvider.tsx (easter egg)
    └── MaybeWalletProvider             ← src/components/crypto/WalletProvider.tsx (if enabled)

    {children}                          ← page content
    <ServiceWorkerRegistration />       ← src/components/ServiceWorkerRegistration.tsx
    <Analytics />                       ← @vercel/analytics
    <SpeedInsights />                   ← @vercel/speed-insights
```

### FrameLayout (App Shell)

**File:** `src/components/FrameLayout.tsx`
**Used by:** Nearly every page (wraps content)

**Always renders:**
- Top bar (collapsible): SDK | API | AI | Humanity | Embed | Method
- Header: Logo + Menu button + NotificationBell + Avatar + Collective Chat button
- Bottom nav tabs: Chants | Podiums | Groups | Agents | Foresight
- AmbientConstellation (background visual)
- CollectiveChat (floating panel, hidden until toggled)

**Components loaded inside FrameLayout:**
- `NotificationBell` ← `src/components/NotificationBell.tsx`
- `CollectiveChat` ← `src/components/CollectiveChat.tsx`
- `AmbientConstellation` ← `src/components/ConstellationCanvas.tsx`

---

## Page → Component Map

### /chants (Browse & Create)

```
src/app/chants/page.tsx
└── ChantsPage (client component, inline)
    └── FrameLayout (active="chants")
        ├── Filter tabs: All | Submission | Voting | Completed
        ├── Search input
        ├── Chant cards (clickable → /chants/[id])
        ├── Inline create form (toggle)
        │   ├── Question + description inputs
        │   ├── Settings (mode, idea goal, AI toggle, community, tags)
        │   └── Pre-seed ideas (up to 5)
        ├── Ask AI form (CLI-style chant generator)
        └── Infinite scroll (pagination by 15)
```

**No child component files** — all rendered inline.

---

### /chants/[id] (Chant Detail — Main Voting Interface)

```
src/app/chants/[id]/page.tsx (server component)
└── ChantSimulator ← src/app/chants/[id]/ChantSimulator.tsx (client, ~1100 lines)
    └── FrameLayout
        ├── Header: question, phase badge, member count, share button
        │
        ├── TAB BAR (6 tabs):
        │   ┌─────────┬─────────┬──────┬─────────┬───────┬────────┐
        │   │  join    │ submit  │ vote │ hearts  │ cells │ manage │
        │   │(default)│         │      │(Results)│       │(creator)│
        │   └─────────┴─────────┴──────┴─────────┴───────┴────────┘
        │
        │   "join" tab:
        │   ├── Description, stats (members, ideas, phase)
        │   ├── Ideas preview (top 5)
        │   └── Join button / "You're a member" badge
        │
        │   "submit" tab:
        │   ├── Submission status banner
        │   ├── Idea input form
        │   ├── Your submitted ideas (expandable with comments)
        │   └── Total idea count
        │
        │   "vote" tab:
        │   ├── Tier selector (multi-tier navigation)
        │   ├── Pentagon constellation visualization
        │   ├── Vote allocation sliders (10 XP across ideas)
        │   ├── Vote result display (after voting)
        │   ├── "Waiting for cell" state
        │   └── Challenge round info
        │
        │   "hearts" tab (IDEAS/RESULTS):          ◄── THIS IS THE RESULTS TAB
        │   ├── Ideas sorted by totalXP descending
        │   ├── Each idea card:
        │   │   ├── Rank (#1, #2, ...)
        │   │   ├── Author name + FlaggedBadge
        │   │   ├── XP value + IdeaStatusBadge (Kept/Advancing/Priority/Eliminated)
        │   │   ├── Idea text (selectable) + CopyButton
        │   │   └── Comment thread (expandable)
        │   └── Comment input form (per-idea)
        │
        │   "cells" tab:
        │   ├── Tier selector
        │   ├── Cell list with vote counts
        │   └── Cell detail (ideas, participants, votes)
        │
        │   "manage" tab (creator only):
        │   ├── Start Voting button
        │   ├── Force Next Tier button
        │   └── Challenge Round trigger
        │
        └── Child components used:
            ├── PentagonConstellation ← src/components/ConstellationCanvas.tsx
            ├── CopyButton ← src/components/deliberation/CopyButton.tsx
            ├── FlaggedBadge ← src/components/FlaggedBadge.tsx
            ├── IdeaStatusBadge (inline function)
            ├── CommentThread (inline function)
            └── EmptyState (inline function)
```

---

### /chants/[id]/details (Read-Only Detail View)

```
src/app/chants/[id]/details/page.tsx
└── DetailsPageClient ← src/app/chants/[id]/DeliberationPageClientNew.tsx (~800 lines)
    └── FrameLayout (showBack)
        ├── Question header + FollowButton + ShareMenu
        ├── PhaseBanner
        ├── TierFunnelCompact (compact progress at top)
        │
        ├── Body varies by phase:
        │   ├── JoinBody (not a member)
        │   ├── SubmissionBody (SUBMISSION phase)
        │   ├── VotingBody (VOTING phase)
        │   ├── AccumulatingBody (ACCUMULATING phase)
        │   └── CompletedBody (COMPLETED phase)
        │       ├── WinnerCard
        │       ├── Ranked ideas by XP
        │       └── CommentsPanel
        │
        └── Child components:
            ├── FollowButton ← src/components/FollowButton.tsx
            ├── ShareMenu ← src/components/ShareMenu.tsx
            ├── TierFunnelCompact ← src/components/deliberation/TierFunnelCompact.tsx
            ├── TierFunnel ← src/components/deliberation/TierFunnel.tsx
            ├── TierProgressPanel ← src/components/deliberation/TierProgressPanel.tsx
            ├── PhaseBanner ← src/components/deliberation/PhaseBanner.tsx
            ├── VotingCell ← src/components/deliberation/VotingCell.tsx
            ├── WinnerCard ← src/components/deliberation/WinnerCard.tsx
            ├── IdeaCard ← src/components/deliberation/IdeaCard.tsx
            ├── HistoryPanel ← src/components/deliberation/HistoryPanel.tsx
            ├── CommentsPanel ← src/components/deliberation/CommentsPanel.tsx
            ├── Section ← src/components/deliberation/Section.tsx
            └── LazySection ← src/components/deliberation/LazySection.tsx
```

---

### /dashboard (Facilitator Dashboard — List)

```
src/app/dashboard/page.tsx
└── DashboardPage (client component)
    └── FrameLayout (active="chants")
        ├── Your Chants section
        │   ├── Private chants
        │   └── Public chants
        ├── My Groups section
        └── My Podiums section
```

---

### /dashboard/[id] (Chant Management Page)

```
src/app/dashboard/[id]/page.tsx
└── DashboardDetailPage (client component, ~1347 lines)
    └── FrameLayout (active="chants", showBack)
        ├── Header: question, phase badge, stats, links (View Public, Details, Analytics, Podium)
        ├── Champion banner (if winner exists)
        │
        ├── LEFT COLUMN:
        │   ├── Facilitator Controls
        │   │   ├── Progress stepper: Ideas → Voting → Priority
        │   │   ├── Phase-specific buttons (Start Voting, AI Resolve, Advance Tier, End Delib)
        │   │   └── Confirmation dialogs for destructive actions
        │   ├── Settings (question, description, visibility, timer, idea goal)
        │   ├── Up-Pollinated Comments
        │   ├── Invite Members (link + email form)
        │   ├── Export Data (JSON/CSV/PDF)
        │   ├── Linked Podiums
        │   └── Danger Zone (delete)
        │
        └── RIGHT COLUMN:
            ├── Cells section
            │   ├── Tier progress summary (bar, cells done, votes cast)
            │   └── Cell breakdown by tier + batch
            ├── Ideas section                          ◄── "ALL IDEAS" LIST IS HERE
            │   ├── Status breakdown table
            │   ├── Tier breakdown table
            │   └── All Ideas list (sorted by totalVotes descending)
            │       └── Each: tier badge, VP count, text, status badge
            └── Recent Comments section
```

---

### /agents (AI Agent Management)

```
src/app/agents/page.tsx
└── AgentsPage (client component, ~420 lines)
    └── FrameLayout (active="agents")
        ├── TAB BAR (2 tabs):
        │   ┌────────────┬──────────┐
        │   │ My Agents  │ Activity │
        │   │ (default)  │          │
        │   └────────────┴──────────┘
        │
        │   "My Agents" tab:
        │   ├── Agent cards (each shows):
        │   │   ├── Status badge (Idle/In Pool/Active/Done)
        │   │   ├── Name + Foresight Score
        │   │   ├── Ideology text (line-clamped)
        │   │   ├── Stats: deliberations, ideas, votes
        │   │   ├── 4 mini stat bars (accuracy, effort, idea viability, comment)
        │   │   └── Action buttons: Deploy/Recall/Edit/Reset/Delete
        │   ├── Agent limit display ("X/5 agents")
        │   └── "+ Create Agent" button → /agents/new
        │
        │   "Activity" tab:
        │   └── ActivityFeed (inline component)
        │       ├── Fetches GET /api/my-agents/activity
        │       └── Each item: colored dot + title + body + time ago
        │           ├── IDEA_WON → gold dot
        │           ├── IDEA_ADVANCING → green dot
        │           ├── COMMENT_UP_POLLINATE → purple dot
        │           ├── CORRECT_VOTE → amber dot
        │           └── JOINED → cyan dot
        │
        └── No child component files — all inline
```

---

### /foresight (Reputation Leaderboard)

```
src/app/foresight/page.tsx
└── ForesightPage (client component)
    └── FrameLayout (active="foresight")
        ├── Leaderboard table (agents ranked by Foresight Score)
        └── Stats per agent
```

---

### /groups (Communities)

```
src/app/groups/page.tsx
└── CommunitiesPage (client component)
    └── FrameLayout (active="groups")
        ├── TAB BAR (2 tabs):
        │   ┌────────────┬──────────┐
        │   │ My Groups  │ Discover │
        │   │ (default)  │          │
        │   └────────────┴──────────┘
        │
        │   "My Groups": Communities user has joined (role badges)
        │   "Discover": Public communities + search
        │
        └── "+ Create" button → /groups/new
```

---

### /podiums (Long-Form Posts)

```
src/app/podiums/page.tsx
└── PodiumsPage (client component)
    └── FrameLayout (active="podiums")
        ├── Post cards (title, preview, author, views, linked chant)
        └── "+ Write" button → /podium/new
```

---

### Landing Page (Newcomers Only)

```
src/app/LandingPage.tsx (client component)
└── FrameLayout (hideFooter)
    ├── Hero: "Train an AI that thinks like you"
    ├── What happens next (3 steps)
    ├── Your AI, your mirror (divergence example)
    ├── Living ecosystem (stats)
    ├── Why this matters (collective intelligence reveal)
    ├── Built to scale (tier table)
    ├── Join a guild (optional)
    └── Final CTA: "What would an AI version of you do?"
```

---

## Navigation Flow

```
NEWCOMER:
  / → LandingPage → /auth/signup → Onboarding modal → /chants

RETURNING USER:
  / → /chants (middleware redirect)

MAIN TABS (bottom nav in FrameLayout):
  /chants ←→ /podiums ←→ /groups ←→ /agents ←→ /foresight

CHANT FLOW:
  /chants → click card → /chants/[id] (ChantSimulator)
                          ├── "Details" link → /chants/[id]/details (DeliberationPageClientNew)
                          └── "Manage" link → /dashboard/[id] (DashboardDetailPage)

CREATOR FLOW:
  /dashboard → click card → /dashboard/[id] → "View Public" → /chants/[id]
                                             → "Analytics" → /dashboard/[id]/analytics

AGENT FLOW:
  /agents → "Create" → /agents/new → back to /agents
          → agent card → /agents/[id]/edit
          → "Activity" tab → activity feed
```

---

## Quick Reference: "Where is X?"

| What you see | File |
|-------------|------|
| **Chant detail with voting (join/submit/vote/results/cells/manage tabs)** | `src/app/chants/[id]/ChantSimulator.tsx` |
| **Results tab (hearts) with idea cards sorted by XP** | `ChantSimulator.tsx` line ~1148, `activeTab === 'hearts'` |
| **Chant detail read-only (details page with tier funnel)** | `src/app/chants/[id]/DeliberationPageClientNew.tsx` |
| **Dashboard manage page (facilitator controls, settings, cells, ideas list)** | `src/app/dashboard/[id]/page.tsx` |
| **"All Ideas" list on dashboard (sorted by VP)** | `dashboard/[id]/page.tsx` line ~1241 |
| **Agent list + activity feed** | `src/app/agents/page.tsx` |
| **Agent activity API** | `src/app/api/my-agents/activity/route.ts` |
| **Landing page** | `src/app/LandingPage.tsx` |
| **Bottom nav tabs** | `src/components/FrameLayout.tsx` |
| **Notification bell** | `src/components/NotificationBell.tsx` |
| **Collective chat (floating panel)** | `src/components/CollectiveChat.tsx` |
| **Onboarding modal (name/bio + push)** | `src/components/Onboarding.tsx` |
| **Toast notifications** | `src/components/Toast.tsx` |
| **Passkey/Touch ID prompt** | `src/components/PasskeyPrompt.tsx` |
| **User guide** | `src/components/UserGuide.tsx` |
| **Pentagon visualization** | `src/components/ConstellationCanvas.tsx` |
| **Vote cell display** | `src/components/deliberation/VotingCell.tsx` |
| **Comments panel** | `src/components/deliberation/CommentsPanel.tsx` |
| **Tier funnel** | `src/components/deliberation/TierFunnel.tsx` |
| **Follow button** | `src/components/FollowButton.tsx` |
| **Share menu** | `src/components/ShareMenu.tsx` |
| **Content moderation** | `src/lib/moderation.ts` |
| **Voting engine** | `src/lib/voting.ts` |
| **Agent notifications** | `src/lib/agent-notifications.ts` |
| **Agent pool runner** | `src/lib/agent-pool-runner.ts` |
| **Email templates** | `src/lib/email-templates.ts` |
| **Stripe integration** | `src/lib/stripe.ts` |

---

## Provider Nesting Order

```
SessionProvider
  └── ThemeGate (dark/light)
      └── ToastProvider (toast notifications)
          └── GuideGate (user guide modal)
              └── OnboardingGate (onboarding modal)
                  └── PasskeyPromptGate (Touch ID prompt)
                      └── CollectiveChatGate (chat state)
                          └── ChallengeProvider (easter egg)
                              └── MaybeWalletProvider (Solana wallet)
                                  └── {page content}
```

Each gate can render its modal/overlay on top of any page.
