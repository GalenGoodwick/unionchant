# Union Chant - Scalable Direct Democracy System

**Breakthrough democratic voting system:** Universal participation + meaningful deliberation + fast convergence (O(log n) tiers)

Built for cities, cooperatives, platforms, and organizations needing legitimate large-scale consensus.

---

## 🚀 For New Sessions - Start Here

**If you're a new Claude session picking up this project, read in this order:**

**Read these files first to understand the project:**
1. **This README** - Project overview and structure
2. **`PROGRESS.md`** - Current development status and what's been built
3. **`docs/DEMOCRATIC-ANALYSIS-V7.md`** - Why this system matters (A-grade democratic properties)
4. **`planning/ARCHITECTURE-V8-DELIBERATIVE.md`** - What we're building next (AI agents)

**Current phase:** Phase 1 complete (core extracted), starting Phase 2 (AI agents)

### Connect to Project Infrastructure

Before starting work, verify access to all services:

**1. Check current access:**
```bash
# GitHub
gh auth status

# Vercel
npx vercel whoami

# Supabase
npx supabase projects list

# Prisma (from web directory)
cd web && npx prisma --version
```

**2. If Supabase needs authentication:**
```bash
# Option A: Interactive login (if in terminal)
npx supabase login

# Option B: Use access token (for non-TTY environments like Claude)
# Get token from: https://supabase.com/dashboard/account/tokens
# Then run:
export SUPABASE_ACCESS_TOKEN="your-token-here"
npx supabase link --project-ref pgjqpwtwhwbjcocrttdc
```

**3. Expected access when fully connected:**

| Service | Status | Account/Project |
|---------|--------|-----------------|
| GitHub | ✅ | `GalenGoodwick` |
| Vercel | ✅ | `galengoodwick-9225` |
| Supabase | ✅ | `pgjqpwtwhwbjcocrttdc` (East US) |
| Prisma | ✅ | Connected via DATABASE_URL |

**4. Read the codebase:**
Ask Claude to "read all files for the project" - this triggers a comprehensive exploration of:
- All source code in `/web/src/`
- Database schema in `/web/prisma/schema.prisma`
- Core voting logic in `/web/src/lib/voting.ts` and `/web/src/lib/challenge.ts`
- API routes in `/web/src/app/api/`
- Documentation files

---

## Folder Structure

### `/core/` - Core Engine ✅ **Phase 1 Complete**
Pure logic module extracted from v7-stable.
- `union-chant-engine.js` - All proven algorithms (500+ lines)
- `test-engine.js` - Comprehensive test suite
- `run-all-tests.js` - Run all tests
- `README.md` - API documentation

**Status:** ✅ All tests passing, ready for AI agents

**Run tests:**
```bash
cd core
node run-all-tests.js
```

### `/v7-stable/` - Production Ready ✅
The stable, tested implementation with all fixes applied.
- `server-v7-stable.js` - Server (port 3008)
- `index-v7-stable.html` - Web UI

**Key features:**
- Natural reduction (only top vote-getters advance)
- Constraint enforcement (max 7 ideas, ideas ≤ participants)
- Multi-tier progression (3, 4, 5+ tiers)
- Everyone votes at every tier (no delegation)

**Run it:**
```bash
cd v7-stable
node server-v7-stable.js
# Open http://localhost:3008
```

### `/docs/` - Documentation
Complete documentation for v7-stable:
- `V7-STABLE-README.md` - System overview and architecture
- `QUICKSTART-V7-STABLE.md` - 30-second quick start
- `V7-STABLE-CHANGELOG.md` - All fixes from v7-initial to v7-stable
- `V7-STABLE-FILES.txt` - File manifest
- `DEMOCRATIC-ANALYSIS-V7.md` - Institutional-grade democratic analysis (A- to A rating)
- `DEMOCRATIC-ANALYSIS-CORRECTIONS.md` - Key corrections from user feedback
- `CONSTRAINT-ENFORCEMENT.md` - Technical details on constraint system

### `/tests/` - Test Suite
Comprehensive tests validating v7-stable:
- `test-v7-scalable.js` - 100 participants, multi-tier progression
- `test-constraints.js` - Edge case constraint validation
- `test-multi-tier.js` - Verifies Tier 3, 4, 5+ progression

### `/planning/` - Future Architecture
Plans for v8 with AI agents and React frontend:
- `PRODUCTIZATION-PLAN.md` - Roadmap from prototype to demo-ready product
- `ARCHITECTURE-V8-DELIBERATIVE.md` - AI agent system design (Claude Haiku)

**Evolution path:**
1. Auto-vote (current placeholder)
2. AI agents with deliberation (demo phase)
3. Email-verified real people (production)

### `/legacy/` - Historical Versions
Previous versions (v2-v6) preserved for reference:
- v2: Basic voting
- v3: Cell structure
- v4: Tier system
- v5: Core algorithm
- v6: Delegation model
- v7: Scalable direct democracy (everyone votes)

### `/Logo/` - Branding Assets
Logo and visual identity files.

---

## Quick Start

1. **Run v7-stable:**
   ```bash
   cd v7-stable
   node server-v7-stable.js
   ```
   Open http://localhost:3008

2. **Read the analysis:**
   ```bash
   open docs/DEMOCRATIC-ANALYSIS-V7.md
   ```

3. **Run tests:**
   ```bash
   cd tests
   node test-v7-scalable.js
   ```

---

## Current Status

**Phase 1: Core Extraction** ✅ **COMPLETE**
- ✅ Pure logic module (`core/union-chant-engine.js`)
- ✅ All algorithms extracted from v7-STABLE
- ✅ Deliberation methods added
- ✅ Comprehensive test suite (all passing)
- ✅ Ready for AI agents and React frontend

**v7-STABLE:** Production ready ✅
- All tests passing
- Constraints enforced
- Multi-tier progression working
- Natural democratic reduction
- Institutional-grade documentation

**Phase 2: AI Agents** 🔄 **NEXT**
- 🔜 Build AI agent system (Claude Haiku)
- 🔜 Cell-based deliberation orchestration
- 🔜 Enhanced server with WebSocket
- Cost: ~$0.25 per 100-agent demo

**Phase 3: React Frontend** 📅 **PLANNED**
- React + D3 visualizations
- Real-time deliberation UI
- Demo controls
- Export/sharing features

**Phase 4: Production** 📅 **FUTURE**
- Email verification
- User authentication
- Real people replace AI agents
- Multi-tenancy support

---

## System Overview

Union Chant enables scalable direct democracy through:
- **Small group deliberation** (3-7 people per cell)
- **Universal participation** (everyone votes at every tier)
- **Logarithmic convergence** (O(log n) tiers to consensus)
- **Natural reduction** (only top vote-getters advance)

For 1,000,000 participants: ~9 tiers, days/weeks to reach agreement.

The only known system that achieves all three:
1. Universal participation
2. Meaningful deliberation
3. Fast convergence

---

**Version:** v7-STABLE
**Date:** 2026-01-25
**Status:** Production ready, planning v8
