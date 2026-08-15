// CMIC-Public-Swarm engine — core types.
// A memory is BOTH a candidate in the tournament AND a lens an evaluator can wear.
// Carried from cradle-election (13/13 green) and adapted for dock/undock evaluator
// multiplexing: evaluators are not cell members; lenses come from OUTSIDE the cell.

export type MemoryKind = "code" | "lesson" | "outcome" | "question";

export interface Outcome {
  /** What was pursued when this memory shaped a direction. */
  pursued: string;
  /** Free-text result of pursuing it. */
  result: string;
  /**
   * Grounding at intake, in [0,1]:
   *   1   = acting on this clearly worked
   *   0.5 = neutral / unknown
   *   0   = acting on this failed
   * This is reality's only entry point. Multiplicity handles the rest.
   */
  score: number;
}

export interface Memory {
  id: string;
  kind: MemoryKind;
  /** The text an evaluator reads, and the lens an evaluator wears. */
  text: string;
  /** Optional provenance for code memories. */
  source?: string;
  /** Present when this memory has been grounded by a real action. */
  outcome?: Outcome;
}

/**
 * One evaluator's ranked vote within a cell (best first).
 * The lens is drawn from OUTSIDE the cell, so it can never appear in the ranking —
 * recusal is structural. The tally still asserts it (defense in depth).
 */
export interface Ballot {
  /** The AI user that cast this ballot. */
  evaluatorId: string;
  /** The memory this evaluator wore as its lens (never a cell candidate). */
  lensId: string;
  /** Candidate ids, best-first — exactly the cell's candidate set. */
  ranking: string[];
  /** Optional one-line rationale (public once the cell completes). */
  note?: string;
}

export interface Standing {
  memoryId: string;
  /** (bordaPoints + 1) * outcomeWeight — see voting.ts for the +1 smoothing. */
  score: number;
  /** Raw Borda points before grounding, for transparency. */
  bordaPoints: number;
  outcomeWeight: number;
}

export interface CellResult {
  candidateIds: string[];
  ballots: Ballot[];
  standings: Standing[];
  winnerId: string;
}

export interface Champion {
  memoryId: string;
  text: string;
  crownedAt: string;
  /** The final cell's standings order — the priority spine. */
  lineage: string[];
  /** Full tier structure of the electing tournament. */
  tiers: string[][];
}

/** A live dock as the scheduler sees it (a strict, TTL-leased claim on a cell seat). */
export interface DockStub {
  evaluatorId: string;
}

/** A cast ballot as the scheduler sees it (who has already voted in a cell). */
export interface BallotStub {
  evaluatorId: string;
}

/** One cell as the scheduler sees it — a snapshot, not a live handle. */
export interface CellSnapshot {
  id: string;
  /** Creation order within the tier — the "oldest first" tie-break. */
  seq: number;
  candidateIds: string[];
  ballots: BallotStub[];
  activeDocks: DockStub[];
}

export interface SwarmConfig {
  cellSize: number; // default 5
  quorum: number; // target ballots per cell, default 5
  dockTtlSec: number; // default 600
  maxBallotsPerAiPerCell: number; // default 3 — one AI, several lenses
  maxMemoriesPerAi: number; // default 500
}

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  cellSize: 5,
  quorum: 5,
  dockTtlSec: 600,
  maxBallotsPerAiPerCell: 3,
  maxMemoriesPerAi: 500,
};
