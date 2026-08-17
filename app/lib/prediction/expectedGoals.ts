import type { TeamStatsSummary } from "../analytics/teamStats";

export interface ExpectedGoals {
  home: number;
  away: number;
}

// Simplified attack-vs-defense average — NOT full Dixon-Coles. True Dixon-Coles
// fits attack/defense strength parameters via MLE across every team in a league,
// which needs whole-league data; this system only ever fetches the two requested
// teams (Architecture Pivot — no bulk ingestion), so there's no league to fit
// against. This blends each team's own observed venue-specific attack/defense
// rate instead — a legitimate, commonly-used simpler model, just less rigorous
// than what PRD §16's "Dixon-Coles-style" phrasing implies. Revisit if a future
// version adds league-wide baselines.
export function estimateExpectedGoals(
  homeTeamHomeStats: TeamStatsSummary,
  awayTeamAwayStats: TeamStatsSummary
): ExpectedGoals {
  const homeAttack = homeTeamHomeStats.xgForPerGame ?? homeTeamHomeStats.goalsForPerGame;
  const awayDefense = awayTeamAwayStats.xgAgainstPerGame ?? awayTeamAwayStats.goalsAgainstPerGame;
  const awayAttack = awayTeamAwayStats.xgForPerGame ?? awayTeamAwayStats.goalsForPerGame;
  const homeDefense = homeTeamHomeStats.xgAgainstPerGame ?? homeTeamHomeStats.goalsAgainstPerGame;

  return {
    home: (homeAttack + awayDefense) / 2,
    away: (awayAttack + homeDefense) / 2,
  };
}
