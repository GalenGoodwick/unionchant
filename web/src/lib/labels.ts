export function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    SUBMISSION: 'Submission',
    VOTING: 'Voting',
    COMPLETED: 'Completed',
    ACCUMULATING: 'Accepting New Ideas',
  }
  return map[phase] || phase
}
