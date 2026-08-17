import type { MergedMatch } from "./mergeMatches";

// PRD §13: informational context only — formation is NOT fed into the Poisson
// model (predictMatch.ts). Only populated when the fetch was run with
// `includeFormations: true` (API-Football's lineups endpoint); most matches
// will have no formation data, which is fine, this is display-only.
export interface FormationSummary {
  primaryFormation?: string;
  frequency?: number; // share of formation-tagged matches using primaryFormation
  matchesWithFormationData: number;
}

export function summarizeFormations(matches: MergedMatch[]): FormationSummary {
  const withFormation = matches.filter((m): m is MergedMatch & { formation: string } => Boolean(m.formation));
  if (withFormation.length === 0) return { matchesWithFormationData: 0 };

  const counts = new Map<string, number>();
  for (const match of withFormation) {
    counts.set(match.formation, (counts.get(match.formation) ?? 0) + 1);
  }

  const [primaryFormation, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    primaryFormation,
    frequency: count / withFormation.length,
    matchesWithFormationData: withFormation.length,
  };
}
