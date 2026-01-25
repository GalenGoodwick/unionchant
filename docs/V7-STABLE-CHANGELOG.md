# Union Chant v7-STABLE - Changelog

## Path to Stability

### v7-initial → v7-STABLE

This documents all fixes applied to reach the stable version.

---

## Issue #1: Constraint Violations
**Problem:** Cells could have more ideas than participants (e.g., 3 participants voting on 8 ideas)

**Fix:**
- Tier 1: Calculate max ideas per cell as `min(cellSize, 7)`
- Distribute ideas respecting per-cell constraints
- Tier completion: Check next tier's min cell size before advancing ideas

**Code:** `formTier1Cells()` and `completeTier()` in server-v7-stable.js

**Validation:** test-constraints.js now passes

---

## Issue #2: Ideas Not Progressing Beyond Tier 2
**Problem:** System declared winner too early at Tier 2, never reaching Tier 3+

**Root Cause:** Code checked `if (numAdvancing === 1)` instead of `if (sortedIdeas.length === 1)`

**Fix:**
- Only declare winner if input is already 1 idea
- Allow reduction to 1 idea, then continue to next tier
- Declare winner when that 1 idea is the sole remaining option

**Impact:** Multi-tier progression now works (3, 4, 5+ tiers)

---

## Issue #3: Arbitrary 80% Reduction Factor
**Problem:** System used `REDUCTION_FACTOR = 5` forcing ideas to reduce by 80%

**User Feedback:** "80%? where did that come from?"

**Fix:** Removed reduction factor entirely. New logic:
- Find highest vote count in cross-cell tally
- Advance ALL ideas with that top vote count
- If 1 idea wins clearly → advance 1
- If 2+ ideas tie for top → advance all tied (automatic runoff)

**Philosophy:** Natural democratic reduction based on actual votes, not arbitrary math

---

## Issue #4: Single-Idea Voting Rounds
**Problem:** Created Tier 3 with only 1 idea where everyone votes on the same single option

**User Feedback:** "There is only 1 idea" - voting is pointless

**Fix:** When only 1 idea advances from cross-cell tally, declare it winner immediately

**Code:** Added check in Tier 2+ completion: `if (topIdeas.length === 1) { declare winner }`

---

## Issue #5: UI Shows "Only delegates vote"
**Problem:** UI text said "Tier X - Only delegates vote (115 of 117 = 98.29%)"

**Root Cause:** Copied from v6-delegation, never updated for v7 model

**Fix:** Updated delegation info display:
- "Scalable Model - Everyone Votes"
- Shows actual tier, participants, and ideas
- Removed misleading delegation percentage

**Also fixed:** Typo "Everyone Votesl" → "Everyone Votes"

---

## Issue #6: "undefined delegates advance"
**Problem:** Alert showed "undefined delegates advance to Tier 2"

**Root Cause:** UI looked for `result.delegateCount` but server returned `result.advancingIdeas`

**Fix:** Updated UI to use correct property and say "idea(s)" not "delegates"

---

## Issue #7: Complete Tier Button Always Disabled
**Problem:** Button disabled even when all cells completed

**Root Cause:** Only checked `phase === 'voting'`, didn't verify cells completed

**Fix:** Added check:
```javascript
const allCurrentTierCellsCompleted = currentTierCells.every(c => c.status === 'completed');
```

---

## Issue #8: Infinite Loop with 2 Ideas
**Problem:** When 2 ideas tied, system kept advancing both, never declaring winner

**Root Cause:** Code forced minimum 2 ideas advancing when >= 2 ideas present

**Fix:** Only force minimum when >= 5 ideas. With 2 ideas, allow natural reduction to 1.

**Later replaced** by natural reduction logic (see Issue #3)

---

## Final Architecture

### Constraint Enforcement
✅ Max 7 ideas per cell
✅ Ideas ≤ participants in every cell
✅ Validated at formation and completion

### Natural Reduction
✅ No arbitrary factors
✅ Only top vote-getter(s) advance
✅ Ties trigger automatic runoffs

### Multi-Tier Progression
✅ Continues through 3, 4, 5+ tiers
✅ Winner declared only when appropriate:
  - 1 cell winner in Tier 1
  - 1 idea after cross-cell tally
  - Never with single-idea voting round

### Everyone Votes
✅ 100% participation in every tier
✅ No delegation or weighting
✅ Cell structure constant across tiers

---

## Testing Validation

All tests now pass:

**test-v7-scalable.js:**
- 100 participants
- Multi-tier progression
- Everyone votes in each tier
- Winner correctly declared

**test-constraints.js:**
- 38 participants (edge case: cell with 3 people)
- Tier 1: Max 3 ideas in 3-person cell
- Tier 2: Only 3 ideas advance (respects constraint)
- All cells satisfy constraints

**test-multi-tier.js:**
- Verifies progression through Tier 3+
- No infinite loops
- No premature winner declarations

---

## Code Quality Improvements

### Removed
- Arbitrary reduction factors
- Forced minimum advancement logic
- Delegation-related terminology
- Complex tie-breaking heuristics

### Added
- Natural democratic vote counting
- Clear winner detection
- Automatic runoff handling
- Comprehensive constraint validation

### Simplified
- Reduction logic (just count votes)
- Winner declaration (check if 1 idea)
- Tier advancement (top votes only)

---

## Version Comparison

| Aspect | v7-initial | v7-STABLE |
|--------|-----------|-----------|
| Reduction | 80% factor | Natural (top votes) |
| Ties | Forced min 2 | Automatic runoff |
| Single idea | Forms tier | Declares winner |
| Constraints | Partial | Fully enforced |
| Multi-tier | Broken | Working |
| UI text | Delegation | Everyone votes |

---

## Status: STABLE ✅

All known issues resolved. System ready for production use.

**Date:** 2026-01-24
**Version:** v7-STABLE
**Port:** 3008
