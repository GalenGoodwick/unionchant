// lens.ts — the assigned perspective.
//
// Every dock is assigned one memory from OUTSIDE the cell to wear as its lens.
// Multiplicity comes from lenses, not headcount: one AI casting several of a cell's
// ballots does so under several distinct perspectives. Per-(AI, cell) exclusion
// guarantees a fresh lens on every re-dock.
//
// Fallback order (DESIGN.md §10.2 — at tier 1 every alive memory may be inside a cell):
//   1. alive memories not in ANY current-tier cell
//   2. members of OTHER cells in the same tier
//   3. the predecessor run's pool
// Recusal stays structural in every branch: this cell's candidates are never eligible.

/** Deterministic PRNG (mulberry32) — inject for reproducible elections and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LensPools {
  /** Alive memory ids not in any current-tier cell. */
  outsidePool: string[];
  /** Ids sitting in OTHER cells of the same tier. */
  sameTierOtherCells: string[];
  /** The previous run's memory pool (may be empty on the first run). */
  predecessorPool: string[];
}

/**
 * Draw a lens for one dock. Pure and deterministic given `rand`.
 * Returns null only when every pool is exhausted after exclusions — the caller
 * should then relax the used-lens exclusion (a repeat lens beats no ballot).
 */
export function drawLens(
  pools: LensPools,
  cellCandidateIds: string[],
  usedLensIds: string[],
  rand: () => number,
): string | null {
  const forbidden = new Set([...cellCandidateIds, ...usedLensIds]);
  for (const pool of [pools.outsidePool, pools.sameTierOtherCells, pools.predecessorPool]) {
    const eligible = pool.filter((id) => !forbidden.has(id));
    if (eligible.length > 0) {
      // Sort before drawing so the draw depends only on (rand, set membership),
      // not on caller-supplied array order.
      eligible.sort();
      return eligible[Math.floor(rand() * eligible.length)]!;
    }
  }
  return null;
}

export interface LensAssignment {
  lensId: string;
  /**
   * True when the degenerate floor was hit: the lens is a CELL MEMBER (cradle mode).
   * The ballot must then rank only the OTHER candidates — recusal by omission,
   * which the tally's guard already enforces.
   */
  inCell: boolean;
}

/**
 * The full fallback ladder. An election whose first tier is a single cell (tiny
 * pools: nothing eliminated yet, no other cells, no predecessor) has NO out-of-cell
 * memory anywhere — the floor is cradle-election's original mode: an in-cell recused
 * lens. Order:
 *   1-3. drawLens pools (outside -> same-tier peers -> predecessor)
 *   4.   drawLens pools with used-lens exclusion relaxed (repeat beats no ballot)
 *   5.   in-cell member not yet used as a lens
 *   6.   any in-cell member (relaxed)
 */
export function assignLens(
  pools: LensPools,
  cellCandidateIds: string[],
  usedLensIds: string[],
  rand: () => number,
): LensAssignment {
  const outside = drawLens(pools, cellCandidateIds, usedLensIds, rand) ?? drawLens(pools, cellCandidateIds, [], rand);
  if (outside) return { lensId: outside, inCell: false };

  const used = new Set(usedLensIds);
  const fresh = cellCandidateIds.filter((id) => !used.has(id));
  const inCellPool = (fresh.length > 0 ? fresh : [...cellCandidateIds]).sort();
  if (inCellPool.length === 0) throw new Error("cannot assign a lens for an empty cell");
  return { lensId: inCellPool[Math.floor(rand() * inCellPool.length)]!, inCell: true };
}
