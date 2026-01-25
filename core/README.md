# Union Chant Core Engine

Pure logic module extracted from v7-STABLE. No HTTP, no side effects - just the proven algorithms.

## What's Inside

**File:** `union-chant-engine.js`

A clean, reusable class containing all core Union Chant logic:
- Cell formation (Tier 1 and Tier 2+)
- Natural reduction algorithm
- Constraint enforcement
- Vote tallying and cross-cell aggregation
- Deliberation/comment system (NEW)

## Usage

```javascript
const { UnionChantEngine } = require('./union-chant-engine')

const engine = new UnionChantEngine()

// Add participants and ideas
engine.addParticipant({ name: 'Alice', type: 'human' })
engine.addIdea({ text: 'Universal healthcare', author: 'Alice', authorId: 'p-1' })

// Start voting (forms Tier 1 cells)
engine.startVoting()

// Cast votes
engine.castVote('cell-1', 'p-1', 'idea-1')

// Complete tier (natural reduction)
const result = engine.completeTier(1)

// Add comments (for deliberation)
engine.addComment('cell-1', 'p-1', 'I support this idea because...')

// Get state
const state = engine.getState()
```

## Key Methods

### Setup
- `addParticipant(data)` - Add human or AI agent
- `addIdea(data)` - Add idea to vote on
- `reset()` - Clear all state

### Voting Flow
- `startVoting()` - Form Tier 1 cells
- `castVote(cellId, participantId, ideaId)` - Cast a vote
- `completeTier(tier)` - Apply natural reduction, advance winners

### Deliberation (NEW)
- `addComment(cellId, participantId, text, replyTo)` - Add discussion comment
- `getCellComments(cellId)` - Get all comments for a cell
- `getCellParticipants(cellId)` - Get participants in a cell
- `getCellIdeas(cellId)` - Get ideas in a cell

### State Access
- `getState()` - Complete system state
- `getCellsByTier(tier)` - Cells in specific tier
- `getIdeasByTier(tier)` - Ideas in specific tier

## Core Algorithms (Preserved)

### Cell Sizing
```javascript
calculateCellSizes(totalParticipants)
// Returns: [5, 5, 5, 5, 3] for 23 participants
// Ensures 3-7 people per cell
```

### Tier 1 Formation
- Different ideas per cell
- Respects max 7 ideas per cell
- Ensures ideas ≤ participants in every cell

### Tier 2+ Formation
- All cells vote on SAME ideas (cross-cell tallying)
- Everyone votes again
- Cell structure stays constant

### Natural Reduction
- Only top vote-getter(s) advance
- Ties go to automatic runoff (all tied ideas advance)
- No arbitrary reduction factors
- Pure democratic selection

## Testing

```bash
node test-engine.js
```

Tests all core functionality:
- ✅ Multi-tier progression
- ✅ Constraint enforcement
- ✅ Natural reduction
- ✅ Cross-cell tallying
- ✅ Deliberation methods

## Why This Matters

**Before:** Core logic was embedded in HTTP server
**After:** Pure module that can be used by:
- HTTP server (Express, raw Node)
- WebSocket server
- CLI tools
- Test suites
- React app (via API)
- AI agent system

## Next Steps

This core engine is now ready for:
1. **AI Agent System** - Use with Claude Haiku agents
2. **Enhanced Server** - Add WebSocket for real-time updates
3. **React Frontend** - Build beautiful UI on top
4. **Email Verification** - Add authentication for real users

All while preserving the proven v7-STABLE algorithms.

---

**Status:** ✅ Extracted and tested
**Source:** v7-STABLE (proven, stable algorithms)
**Dependencies:** None (pure JavaScript)
