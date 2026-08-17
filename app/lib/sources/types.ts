export type SourceName = "football_data" | "api_football" | "understat" | "fotmob";

// One match from the perspective of the team that was requested — "for"/"against"
// rather than "home"/"away", since the analytics layer (Phase 2) always wants
// "this team's" numbers regardless of which side of the fixture they were on.
export interface NormalizedMatch {
  source: SourceName;
  date: string; // ISO date, e.g. "2026-03-14"
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
}

export interface FetchResult {
  source: SourceName;
  matches: NormalizedMatch[];
  error?: string; // populated instead of throwing, so Phase 1.6's partial-failure handling can inspect this
}
