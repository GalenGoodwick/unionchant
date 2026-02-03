# Union Chant - Scalable Direct Democracy System

**Breakthrough democratic voting system:** Universal participation + meaningful deliberation + fast convergence (O(log n) tiers)

Built for cities, cooperatives, platforms, and organizations needing legitimate large-scale consensus.

**Live:** https://unionchant.vercel.app

---

## For New Sessions - Start Here

**If you're a new Claude session picking up this project, read:**

1. **`CLAUDE.md`** - Full project context, structure, status, and roadmap
2. **`docs/DEMOCRATIC-ANALYSIS-V7.md`** - Why this system matters (A-grade democratic properties)

---

## Folder Structure

```
Union-Rolling/
├── web/              # MAIN APP - Next.js 15 + Prisma + Vercel Postgres
├── core/             # Algorithm reference (original engine, not imported by web/)
├── docs/             # Democratic analysis and system documentation
├── planning/         # Architecture plans (v8 deliberative AI agents)
├── CLAUDE.md         # Primary session context for AI assistants
├── README.md         # This file
└── LICENSE
```

### `/web/` - Active Application

Next.js 15 + Prisma + Vercel Postgres (Neon) + Tailwind v4

```bash
cd web
npm install
npm run dev
# Opens http://localhost:3000
```

**Key paths:**
- `src/lib/voting.ts` - Core voting logic
- `src/lib/challenge.ts` - Challenge round logic
- `src/app/api/` - API routes
- `prisma/schema.prisma` - Database schema

### `/core/` - Algorithm Reference

Pure JS implementation of the voting engine (500+ lines). Not imported by the web app — kept as a reference for the core algorithms.

### `/docs/` - Documentation

- `DEMOCRATIC-ANALYSIS-V7.md` - Institutional-grade democratic analysis
- `QUICKSTART-V7-STABLE.md` - System quick start
- `CONSTRAINT-ENFORCEMENT.md` - Technical details on constraint system

### `/planning/` - Architecture Plans

- `ARCHITECTURE-V8-DELIBERATIVE.md` - AI agent system design
- `PRODUCTIZATION-PLAN.md` - Roadmap from prototype to product

---

## System Overview

Union Chant enables scalable direct democracy through:
- **Small group deliberation** (5 people per cell)
- **Universal participation** (everyone votes at every tier)
- **Logarithmic convergence** (O(log n) tiers to consensus)
- **Natural reduction** (only top vote-getters advance)
- **Rolling mode** (winning priority can be challenged continuously)

For 1,000,000 participants: ~9 tiers, days/weeks to reach agreement.

The only known system that achieves all three:
1. Universal participation
2. Meaningful deliberation
3. Fast convergence

---

## Deployment

- **Host:** Vercel (auto-deploys from main branch)
- **Database:** Vercel Postgres (Neon)
- **URL:** https://unionchant.vercel.app

```bash
git push origin main   # Triggers Vercel deployment
```

---

**Version:** v1.0.0-stable
**Date:** 2026-02-03
**Status:** Production app live, iterating on UI and features
