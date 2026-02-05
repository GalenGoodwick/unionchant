# Quick Start - Unity Chant v7-STABLE

## Installation

No installation required - just Node.js.

## Run in 30 Seconds

```bash
# 1. Start the server
node server-v7-stable.js

# 2. Open your browser
open http://localhost:3008

# 3. Add participants and vote!
```

## Simple Test

1. Click **"Add 15"** button
2. Click **"Start Voting"**
3. Click **"Auto-Vote All Cells"**
4. Click **"Complete Current Tier"**
5. Repeat steps 3-4 until winner declared

## What You'll See

### Tier 1
- 15 participants divided into 3 cells
- Each cell votes on different ideas
- 3 cell winners advance

### Tier 2
- All 15 participants vote on same 3 ideas
- Cross-cell tally determines winner
- If tie, both advance to Tier 3

### Tier 3 (if needed)
- All 15 participants vote on tied ideas
- Winner declared

## Try Different Scales

- **Small:** 10-20 participants (2-3 tiers)
- **Medium:** 50-100 participants (3-4 tiers)
- **Large:** Click "Add 100" multiple times (5+ tiers)

## Understanding the UI

### Phase Indicator
- **SUBMISSION** - Add participants
- **VOTING** - Cells are voting
- **COMPLETED** - Winner declared

### Scalable Model Info
Shows: "Tier X - All Y participants vote on Z idea(s)"

### Cell Display
- **Tier 1:** Different ideas per cell
- **Tier 2+:** Same ideas across all cells
- **Completed cells:** Green background
- **Vote tally:** Shows vote counts

## Manual Voting (Optional)

Instead of auto-vote:
1. Select a participant (click their button)
2. Click an idea to cast their vote
3. Repeat until all participants voted
4. Complete the tier

## Key Behaviors

### Natural Reduction
Only top vote-getter(s) advance:
- Clear winner → declares winner
- Tie for top → both advance (runoff)

### Everyone Votes
Check "Participants voting" - always 100% of population

### Constraint Enforcement
- Max 7 ideas per cell
- Ideas ≤ participants in each cell

## Troubleshooting

**Can't click buttons?**
- Phase is "COMPLETED" - click Reset

**Says "undefined ideas advance"?**
- Refresh browser (UI update applied)

**Stuck in infinite loop?**
- This shouldn't happen in v7-STABLE
- If it does, click Reset and report the issue

## Advanced Testing

Run automated tests:

```bash
# Test 100 participants through multiple tiers
node test-v7-scalable.js

# Verify constraint enforcement
node test-constraints.js

# Test multi-tier progression
node test-multi-tier.js
```

## What Makes This "Stable"?

✅ No arbitrary reduction factors
✅ Natural democratic voting
✅ Automatic tie-breaking
✅ Proper constraint enforcement
✅ Multi-tier progression validated
✅ Everyone votes in every tier
✅ No single-idea voting rounds

## Next Steps

Read **V7-STABLE-README.md** for:
- Detailed architecture
- Scaling examples
- Comparison to other versions
- Theory and principles
