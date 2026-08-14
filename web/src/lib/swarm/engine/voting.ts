// voting.ts — the heart of the swarm. CARRIED VERBATIM from cradle-election
// (13/13 green there; the +1 smoothing was found by those tests, do not remove).
//
// A cell's winner is decided by recused, outcome-grounded Borda count:
//   1. Each ballot is a best-first ranking of the cell's candidates.
//   2. A ranking of n candidates awards Borda points: first = n-1, ... last = 0.
//   3. A candidate's raw points are summed across every ballot that ranked it.
//   4. Points are multiplied by the candidate's outcome weight — reality's only lever.
//
// Multiplicity (many independent lenses) defeats individual gaming; the outcome weight
// keeps a robust consensus from drifting into a confident echo. Both live here, in the open.

import type { Ballot, Memory, Standing, CellResult } from "./types";

/** Map an outcome score in [0,1] to a multiplier in [0.5, 1.5]. No outcome => neutral 1.0. */
export function outcomeWeight(mem: Memory): number {
  const s = mem.outcome?.score;
  if (s === undefined) return 1.0;
  const clamped = Math.max(0, Math.min(1, s));
  return 0.5 + clamped; // 0 -> 0.5, 0.5 -> 1.0, 1 -> 1.5
}

/** Borda points a single ranking confers on each candidate it lists. */
export function bordaPoints(ranking: string[]): Map<string, number> {
  const n = ranking.length;
  const pts = new Map<string, number>();
  ranking.forEach((id, i) => pts.set(id, n - 1 - i));
  return pts;
}

/**
 * Tally a cell. `candidates` is every memory competing; `ballots` are the recused rankings.
 * Returns standings (best first) and the winner. Deterministic and pure.
 */
export function tallyCell(candidates: Memory[], ballots: Ballot[]): CellResult {
  const byId = new Map(candidates.map((m) => [m.id, m]));

  // Guard: a ballot must never rank its own lens (recusal is structural — the lens
  // comes from outside the cell — but assert it anyway; defense in depth).
  for (const b of ballots) {
    if (b.ranking.includes(b.lensId)) {
      throw new Error(`recusal violated: evaluator wearing ${b.lensId} ranked its own lens`);
    }
    for (const id of b.ranking) {
      if (!byId.has(id)) throw new Error(`ballot ranked unknown candidate ${id}`);
    }
  }

  const raw = new Map<string, number>();
  for (const b of ballots) {
    for (const [id, p] of bordaPoints(b.ranking)) {
      raw.set(id, (raw.get(id) ?? 0) + p);
    }
  }

  const standings: Standing[] = candidates.map((m) => {
    const bordaPts = raw.get(m.id) ?? 0;
    const w = outcomeWeight(m);
    // +1 smoothing: at zero Borda, `0 * w` would erase the outcome signal entirely —
    // reality must keep grip on every candidate, including last place in a small cell.
    return { memoryId: m.id, bordaPoints: bordaPts, outcomeWeight: w, score: (bordaPts + 1) * w };
  });

  // Best first. Tie-break by raw Borda, then by id for full determinism.
  standings.sort(
    (a, b) => b.score - a.score || b.bordaPoints - a.bordaPoints || a.memoryId.localeCompare(b.memoryId),
  );

  const winner = standings[0];
  if (!winner) throw new Error("cannot tally an empty cell");

  return {
    candidateIds: candidates.map((m) => m.id),
    ballots,
    standings,
    winnerId: winner.memoryId,
  };
}
