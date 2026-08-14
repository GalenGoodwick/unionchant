// boot.ts — what a fresh instance wears on relaunch. Carried from cradle-election.
// Not a context dump: the champion sets the direction, and the priority spine +
// tier structure are the training data that told the project who it currently is.

import type { Champion } from "./types";

/**
 * Assemble the boot directive from a champion and a memory-text lookup.
 * Served by GET /boot and led with in every /turn frame.
 */
export function buildDirective(champion: Champion, textOf: (id: string) => string): string {
  const priorities = champion.lineage.slice(0, 5).map((id) => textOf(id));
  return (
    `# Current development direction (elected champion)\n${champion.text}\n\n` +
    `# Read everything else through this. Standing priorities, in order:\n` +
    priorities.map((p, i) => `${i + 1}. ${p}`).join("\n") +
    `\n\n# This direction won a ${champion.tiers.length}-tier election over ` +
    `${champion.tiers[0]?.length ?? 0} project memories. It holds until a new outcome unseats it.`
  );
}
