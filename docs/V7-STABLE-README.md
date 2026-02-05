# Unity Chant v7 - STABLE

**Scalable Multi-Tier Democratic Voting System**

## Overview

Unity Chant v7-STABLE implements a scalable democratic voting system where:
- **Everyone votes in every tier** (Individual Sovereignty preserved)
- **Ideas compress naturally** through cross-cell tallying
- **Only top vote-getter(s) advance** to next tier
- **Ties trigger automatic runoff rounds**

## Core Principles

### 1. Individual Sovereignty
Every participant votes in every tier. No delegation, no representation, no weighting.

### 2. Small Group Deliberation
Participants are organized into cells of 3-7 people for discussion and voting.

### 3. Natural Reduction
- Only the idea(s) with the most votes advance to the next tier
- If multiple ideas tie for top votes, all tied ideas advance (automatic runoff)
- If only 1 idea advances, it's declared the winner

### 4. Constraint Enforcement
- **Max 7 ideas per cell** - ensures manageable deliberation
- **Ideas ≤ Participants** - every cell can handle its assigned ideas

## How It Works

### Tier 1: Cell Formation
1. All participants divided into cells of 3-7 people
2. All ideas distributed across cells (different ideas per cell)
3. Each cell votes, producing 1 winner per cell
4. Cell winners advance to Tier 2

### Tier 2+: Cross-Cell Tallying
1. Same cell structure (all participants still vote)
2. ALL cells vote on the SAME advancing ideas
3. Cross-cell tally determines which idea(s) have most votes
4. Only top vote-getter(s) advance

### Winner Declaration
Winner is declared when:
- Only 1 idea advances from cross-cell tally, OR
- Only 1 cell winner in Tier 1

## Example Flows

### 24 Participants Example

**Tier 1:**
- 24 participants → 5 cells (5,5,5,5,4)
- 24 ideas distributed → 5 cell winners

**Tier 2:**
- All 24 participants vote on same 5 ideas
- Cross-cell tally: {idea-13: 9, idea-10: 9, idea-18: 5, idea-2: 1}
- **Tie!** idea-13 and idea-10 both have 9 votes
- Both advance to Tier 3

**Tier 3:**
- All 24 participants vote on 2 ideas
- Cross-cell tally: {idea-10: 13, idea-13: 11}
- **Winner:** idea-10 with 13 votes

### 16 Participants Example

**Tier 1:**
- 16 participants → 3 cells (5,5,6)
- 16 ideas → 3 cell winners

**Tier 2:**
- All 16 participants vote on same 3 ideas
- Cross-cell tally: {idea-10: 8, idea-16: 5, idea-1: 3}
- **Winner:** idea-10 with 8 votes (no tie, declares winner)

## Scaling

The system scales logarithmically:

**100 Participants:**
- Tier 1: 100 ideas → 20 cells → 20 winners
- Tier 2: 20 ideas → may reduce to 1-5 winners
- Tier 3: 1-5 ideas → winner declared

**100,290 Participants:**
- Tier 1: ~20,058 cells voting on different ideas
- Tier 2+: ~20,058 cells voting on same ideas
- Ideas compress through cross-cell tallying
- Typically 5-7 tiers to reach final winner

## Files

### Server
**server-v7-stable.js** - Main server (port 3008)
- Handles participant registration
- Forms multi-tier cell architecture
- Manages cross-cell tallying
- Enforces constraints
- Declares winners

### UI
**index-v7-stable.html** - Web interface
- Add participants
- Auto-vote cells
- Complete tiers
- View results

## Running the System

### Start Server
```bash
node server-v7-stable.js
```

### Open UI
```
http://localhost:3008
```

### Test Flow
1. Click "Add 15" to add participants
2. Click "Start Voting" to form cells
3. Click "Auto-Vote All Cells" to simulate voting
4. Click "Complete Current Tier" to advance
5. Repeat steps 3-4 until winner declared

## Key Features

### ✅ Constraint Enforcement
- Max 7 ideas per cell (small group deliberation)
- Ideas never exceed participants in any cell
- Validated at tier formation and completion

### ✅ Natural Reduction
- No arbitrary reduction factors
- Only top vote-getter(s) advance
- Ties handled automatically with runoff rounds

### ✅ Multi-Tier Progression
- Continues through Tier 3, 4, 5+ as needed
- No artificial early termination
- Winner declared only when clear

### ✅ Everyone Votes
- 100% participation in every tier
- No delegation or representation
- All voices count equally

### ✅ Tie Breaking
- Automatic runoff rounds when ideas tie
- No random selection or complex tiebreakers
- Democratic resolution through voting

## Testing

### Test Scripts
- **test-v7-scalable.js** - Full multi-tier test with 100 participants
- **test-constraints.js** - Constraint enforcement verification
- **test-multi-tier.js** - Tier progression validation

### Run Tests
```bash
node test-v7-scalable.js
node test-constraints.js
node test-multi-tier.js
```

## Architecture Highlights

### Cell Sizing Algorithm
Ensures cells of 3-7 people, never 1, 2, or 8+:
- Avoids remainder of 1 or 2 by adjusting distribution
- Flexible sizing based on total participants
- Constant cell structure across tiers

### Cross-Cell Tallying
In Tier 2+:
- All cells receive same ideas
- Each participant's vote counted individually
- Tally summed across all cells
- Natural democratic aggregation

### Winner Detection
Multiple paths to victory:
1. Only 1 cell winner in Tier 1
2. Only 1 idea wins cross-cell tally in Tier 2+
3. Clear winner emerges after tie-breaking round

## Comparison to v6-Delegation (WRONG MODEL)

| Feature | v6-Delegation | v7-STABLE |
|---------|---------------|-----------|
| Who votes in Tier 2+ | Only delegates | Everyone |
| Participants per tier | Reduces | Stays constant |
| Vote weighting | Weighted by constituency | All votes equal |
| Reduction logic | Arbitrary 80% factor | Natural (top votes only) |
| Ties | Forced minimum advancement | Automatic runoff |

## Success Criteria Met

✅ "Tiers compress ideas, not people"
✅ "People always vote"
✅ "Small groups resolving small amount of ideas"
✅ "Individual Sovereignty preserved"
✅ "Natural democratic reduction"
✅ "Works at all scales (10 to 100,290+ participants)"

## Version History

**v7-STABLE** - Final stable release
- Natural reduction (top votes only)
- Automatic tie-breaking
- No single-idea voting rounds
- Proper constraint enforcement
- Multi-tier progression validated

## Documentation

See also:
- **CONSTRAINT-ENFORCEMENT.md** - Details on constraint logic
- **V7-SCALABLE-SUMMARY.md** - Original implementation summary
- **ARCHITECTURE-COMPARISON.md** - Batch vs continuous comparison

## License

This is a demonstration/prototype system for democratic voting at scale.
