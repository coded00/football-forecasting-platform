import type { FetchResult, NormalizedMatch, SourceName } from "../sources/types";

// Teams in these leagues play at most one match per day, so matching purely by
// date (no opponent-name fuzzy matching needed) is reliable for merging the same
// real-world match across sources.
export interface MergedMatch {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  htGoalsFor?: number;
  htGoalsAgainst?: number;
  xgFor?: number;
  xgAgainst?: number;
  npxgFor?: number;
  shotsFor?: number;
  shotsAgainst?: number;
  shotsOnTargetFor?: number;
  shotsOnTargetAgainst?: number;
  cornersFor?: number;
  cornersAgainst?: number;
  possessionFor?: number;
  formation?: string;
  sources: SourceName[];
}

// Precedence updated after Phase 6 live testing confirmed FotMob actually
// provides shots/SOT/corners/possession too (not just xG, as originally
// scoped), and that Understat is a confirmed dead end (kept last in case
// headless-browser fetching revives it later) — see DATA_SOURCES.md's
// Live-verified update. football-data.co.uk remains most stable for
// goals/shots/corners since it's a static file, not a scraped live page.
const GOALS_PRECEDENCE: SourceName[] = ["football_data", "api_football", "fotmob", "understat"];
const XG_PRECEDENCE: SourceName[] = ["fotmob", "understat", "api_football"];
const SHOTS_PRECEDENCE: SourceName[] = ["football_data", "api_football", "fotmob"];
const POSSESSION_PRECEDENCE: SourceName[] = ["api_football", "fotmob"];
const FORMATION_PRECEDENCE: SourceName[] = ["api_football"];

function pick<K extends keyof NormalizedMatch>(
  bySource: Partial<Record<SourceName, NormalizedMatch>>,
  field: K,
  order: SourceName[]
): NormalizedMatch[K] | undefined {
  for (const source of order) {
    const value = bySource[source]?.[field];
    if (value !== undefined) return value;
  }
  return undefined;
}

export function mergeMatches(results: FetchResult[]): MergedMatch[] {
  const byDate = new Map<string, Partial<Record<SourceName, NormalizedMatch>>>();

  for (const result of results) {
    for (const match of result.matches) {
      if (!match.date) continue; // FotMob's date can be empty per its unverified caveat
      const entry = byDate.get(match.date) ?? {};
      entry[result.source] = match;
      byDate.set(match.date, entry);
    }
  }

  const merged: MergedMatch[] = [];
  for (const [date, bySource] of byDate) {
    const sources = Object.keys(bySource) as SourceName[];
    const anyMatch = bySource[sources[0]]!;

    const goalsFor = pick(bySource, "goalsFor", GOALS_PRECEDENCE) ?? anyMatch.goalsFor;
    const goalsAgainst = pick(bySource, "goalsAgainst", GOALS_PRECEDENCE) ?? anyMatch.goalsAgainst;

    merged.push({
      date,
      opponent: anyMatch.opponent,
      isHome: anyMatch.isHome,
      goalsFor,
      goalsAgainst,
      htGoalsFor: pick(bySource, "htGoalsFor", GOALS_PRECEDENCE),
      htGoalsAgainst: pick(bySource, "htGoalsAgainst", GOALS_PRECEDENCE),
      xgFor: pick(bySource, "xgFor", XG_PRECEDENCE),
      xgAgainst: pick(bySource, "xgAgainst", XG_PRECEDENCE),
      npxgFor: pick(bySource, "npxgFor", XG_PRECEDENCE),
      shotsFor: pick(bySource, "shotsFor", SHOTS_PRECEDENCE),
      shotsAgainst: pick(bySource, "shotsAgainst", SHOTS_PRECEDENCE),
      shotsOnTargetFor: pick(bySource, "shotsOnTargetFor", SHOTS_PRECEDENCE),
      shotsOnTargetAgainst: pick(bySource, "shotsOnTargetAgainst", SHOTS_PRECEDENCE),
      cornersFor: pick(bySource, "cornersFor", SHOTS_PRECEDENCE),
      cornersAgainst: pick(bySource, "cornersAgainst", SHOTS_PRECEDENCE),
      possessionFor: pick(bySource, "possessionFor", POSSESSION_PRECEDENCE),
      formation: pick(bySource, "formation", FORMATION_PRECEDENCE),
      sources,
    });
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date));
}
