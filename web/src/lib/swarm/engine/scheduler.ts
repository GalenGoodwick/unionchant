// scheduler.ts — the dock dispatcher.
//
// The capacity inversion: evaluators are NOT bound one-per-cell like human users.
// An AI docks the neediest incomplete cell, works it to a ballot, undocks, and is
// dispatched onward — so K evaluators can elect over N >> K memories.
//
// Pure functions over snapshots; the Prisma glue (atomic dock creation with
// SELECT ... FOR UPDATE) lives in the web app. These functions decide; they never write.

import type { CellSnapshot, SwarmConfig } from "./types";

/**
 * The quorum a cell can actually reach with the evaluators present:
 * min(configured quorum, evaluators x maxBallotsPerAiPerCell).
 * A single dogfood AI with maxBallotsPerAiPerCell=3 yields 3-ballot cells
 * under 3 different lenses — multiplicity survives scarcity.
 */
export function effectiveQuorum(cfg: SwarmConfig, evaluatorCount: number): number {
  return Math.max(1, Math.min(cfg.quorum, evaluatorCount * cfg.maxBallotsPerAiPerCell));
}

/** A cell is complete when quorum ballots are in. */
export function cellComplete(cell: CellSnapshot, quorum: number): boolean {
  return cell.ballots.length >= quorum;
}

export type ScheduleDecision =
  | { kind: "dock"; cellId: string }
  | { kind: "resume"; cellId: string } // evaluator already holds an active dock
  | { kind: "waiting"; reason: string };

/**
 * Decide which cell this evaluator works next.
 *   - If it already holds an ACTIVE dock, resume that cell (idempotent turns).
 *   - Skip complete cells; skip cells already saturated by ballots + active docks;
 *     skip cells where this evaluator has hit maxBallotsPerAiPerCell.
 *   - Order: fewest ballots first (neediest), then oldest (seq).
 */
export function scheduleNextCell(
  evaluatorId: string,
  cells: CellSnapshot[],
  cfg: SwarmConfig,
  evaluatorCount: number,
): ScheduleDecision {
  const held = cells.find((c) => c.activeDocks.some((d) => d.evaluatorId === evaluatorId));
  if (held) return { kind: "resume", cellId: held.id };

  const quorum = effectiveQuorum(cfg, evaluatorCount);

  const mineIn = (c: CellSnapshot) =>
    c.ballots.filter((b) => b.evaluatorId === evaluatorId).length +
    c.activeDocks.filter((d) => d.evaluatorId === evaluatorId).length;

  const eligible = cells.filter((c) => {
    if (cellComplete(c, quorum)) return false;
    // Saturated: enough ballots-in-flight to reach quorum without me.
    if (c.ballots.length + c.activeDocks.length >= quorum) return false;
    return mineIn(c) < cfg.maxBallotsPerAiPerCell;
  });

  if (eligible.length === 0) {
    const open = cells.some((c) => !cellComplete(c, quorum));
    return {
      kind: "waiting",
      reason: open ? "all open cells saturated or at your per-cell ballot cap" : "tier complete",
    };
  }

  // ONE IDENTITY VOTE FIRST: an evaluator casts its own (corpus) ballot in every
  // cell it can reach before it repeats ANYWHERE. Repeats — always under an
  // assigned lens identity, never the corpus again — exist only when no cell
  // remains that lacks its first vote.
  const fresh = eligible.filter((c) => mineIn(c) === 0);
  const pick = (fresh.length ? fresh : eligible).sort(
    (a, b) => a.ballots.length - b.ballots.length || a.seq - b.seq,
  );
  return { kind: "dock", cellId: pick[0]!.id };
}

/**
 * Chunk survivors into cells for a tier. Remainder absorption mirrors the live
 * engine's calculateCellSizes ethos: never strand 1-2 candidates in their own cell —
 * absorb them into the last full cell (sizes may reach cellSize + 2).
 * A single survivor means the tournament is over; callers crown instead of chunking.
 */
export function chunkCells(ids: string[], cellSize: number): string[][] {
  if (ids.length <= cellSize) return ids.length ? [ids] : [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += cellSize) out.push(ids.slice(i, i + cellSize));
  const last = out[out.length - 1]!;
  if (last.length <= 2 && out.length > 1) {
    out.pop();
    out[out.length - 1] = [...out[out.length - 1]!, ...last];
  }
  return out;
}
