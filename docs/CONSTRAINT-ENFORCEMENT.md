# Constraint Enforcement in v7-Scalable

## Core Constraints

1. **Maximum 7 ideas per cell** - Small group deliberation limit
2. **Ideas ≤ Participants** - Every cell must have at least as many participants as ideas

These constraints ensure effective small group deliberation at all times.

## Implementation

### Tier 1 Formation (formTier1Cells)

When forming Tier 1 cells, the algorithm:

1. Calculates cell sizes based on participants (3-7 per cell, never 1, 2, or 8+)
2. For each cell, determines max ideas it can receive: `min(cellSize, 7)`
3. Distributes ideas fairly across cells while respecting each cell's maximum

**Example with 38 participants:**
```
Participants: 38
Cell sizes: 5, 5, 5, 5, 5, 5, 5, 3
Ideas distributed:
  - Cells 1-6: 5 participants, 5 ideas each
  - Cell 7: 5 participants, 4 ideas
  - Cell 8: 3 participants, 3 ideas ← Constraint enforced!
```

### Tier Completion (completeTier)

When completing a tier and advancing to the next:

1. Calculates what the next tier's cell sizes will be (based on total participants)
2. Finds the minimum cell size in the next tier
3. Determines max advancing ideas: `min(7, minCellSize)`
4. Advances only the top N ideas that fit within this constraint

**Example with 38 participants (8 cell winners):**
```
Next tier cell sizes: 5, 5, 5, 5, 5, 5, 5, 3
Min cell size: 3
Max advancing ideas: min(7, 3) = 3
Result: Only top 3 of 8 cell winners advance to Tier 2
```

## Why These Constraints Matter

### Small Group Deliberation
With 7 or fewer ideas, a small group (3-7 people) can:
- Meaningfully discuss each option
- Understand the trade-offs
- Make informed decisions

### Ensuring Participation
When ideas ≤ participants:
- Every idea could theoretically have a champion
- No one feels overwhelmed by too many options
- The group size matches the cognitive load

### Scalability
These constraints maintain effective deliberation even with large populations:
- 100,290 participants still results in cells of 3-7 people
- Each cell still votes on 3-7 ideas maximum
- The system scales logarithmically while maintaining small-group dynamics

## Test Results

### 38 Participants Test

**Tier 1:**
- 8 cells (sizes: 5,5,5,5,5,5,5,3)
- All cells satisfy: ideas ≤ participants
- Cell with 3 participants correctly gets only 3 ideas

**Tier 2:**
- Same 8 cells (all 38 participants vote again)
- Only 3 ideas advance (respecting min cell size of 3)
- All cells vote on same 3 ideas
- Even smallest cell (3 participants) can handle 3 ideas

### 100 Participants Test

**Tier 1:**
- 20 cells of 5 participants each
- Each cell votes on 5 ideas
- 20 cell winners advance

**Tier 2:**
- Same 20 cells (all 100 participants vote again)
- 5 ideas (respecting min cell size of 5)
- Cross-cell tallying determines winner

## Code Locations

### Tier 1 Constraint Enforcement
File: `server-v7-scalable.js`
Function: `formTier1Cells()` (lines ~131-178)

Key logic:
```javascript
// Calculate max ideas each cell can receive
const MAX_IDEAS_PER_CELL = 7;
const cellMaxIdeas = cellSizes.map(size => Math.min(size, MAX_IDEAS_PER_CELL));

// Distribute fairly but respect constraints
const cellIdeaCount = Math.min(fairShare, maxIdeasForCell, ideasLeft);
```

### Tier Completion Constraint Enforcement
File: `server-v7-scalable.js`
Function: `completeTier()` (lines ~436-520)

Key logic for Tier 1 completion:
```javascript
const nextTierCellSizes = calculateCellSizes(participants.length);
const minCellSize = Math.min(...nextTierCellSizes);
const MAX_IDEAS_PER_CELL = 7;
const maxAdvancingIdeas = Math.min(MAX_IDEAS_PER_CELL, minCellSize);

const numAdvancing = Math.min(cellWinners.length, maxAdvancingIdeas);
```

Key logic for Tier 2+ completion:
```javascript
const nextTierCellSizes = calculateCellSizes(participants.length);
const minCellSize = Math.min(...nextTierCellSizes);
const maxAdvancingIdeas = Math.min(MAX_IDEAS_PER_CELL, minCellSize);

let numAdvancing = Math.max(1, Math.ceil(sortedIdeas.length / REDUCTION_FACTOR));
numAdvancing = Math.min(numAdvancing, maxAdvancingIdeas);
```

## Verification

Run the constraint test:
```bash
node test-constraints.js
```

This verifies:
- ✓ Each Tier 1 cell: ideas ≤ participants
- ✓ All cells: ideas ≤ 7
- ✓ Tier advancement respects minimum cell size
- ✓ All Tier 2+ cells vote on same ideas
- ✓ Everyone votes in every tier

## Summary

The constraint enforcement ensures that Unity Chant v7-Scalable maintains effective small-group deliberation at all scales, from 10 participants to 100,290+. Every participant always votes in a manageable group (3-7 people) on a manageable number of ideas (3-7 options), while ideas compress logarithmically to reach a final decision.
