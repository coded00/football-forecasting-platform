import { matchOutcomeProbabilities } from "../analytics/poisson";
import { computeHalfSplits, computeRecencyWeightedStats, type TeamStatsSummary } from "../analytics/teamStats";
import type { MergedMatch } from "../analytics/mergeMatches";
import { estimateExpectedGoals } from "./expectedGoals";
import { scorelineProbabilities, type ScorelineProbability } from "./scoreline";

export interface MatchForecast {
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  scorelineProbabilities: ScorelineProbability[];
  expectedFirstHalfGoals: { home?: number; away?: number };
  expectedSecondHalfGoals: { home?: number; away?: number };
  expectedCorners: { home?: number; away?: number; total?: number };
  // The recency-weighted venue-specific stats the forecast was built from —
  // exposed so callers (the API route, presentation layer) don't need to
  // recompute the exact same thing to feed confidence/explanation generation.
  homeStats: TeamStatsSummary;
  awayStats: TeamStatsSummary;
}

function averageOfDefined(a?: number, b?: number): number | undefined {
  if (a === undefined || b === undefined) return undefined;
  return (a + b) / 2;
}

export function predictMatch(homeTeamMatches: MergedMatch[], awayTeamMatches: MergedMatch[]): MatchForecast {
  // Recency-weighted per 4.1, applied within each venue split — e.g. the home
  // team's last 5 HOME matches count for more than their 15th-most-recent HOME
  // match, rather than a flat average across whatever was fetched.
  const homeHomeStats = computeRecencyWeightedStats(homeTeamMatches.filter((m) => m.isHome));
  const awayAwayStats = computeRecencyWeightedStats(awayTeamMatches.filter((m) => !m.isHome));

  const { home: homeExpectedGoals, away: awayExpectedGoals } = estimateExpectedGoals(homeHomeStats, awayAwayStats);
  const { win: homeWinProbability, draw: drawProbability, loss: awayWinProbability } = matchOutcomeProbabilities(
    homeExpectedGoals,
    awayExpectedGoals
  );

  const homeHalfSplits = computeHalfSplits(homeTeamMatches.filter((m) => m.isHome));
  const awayHalfSplits = computeHalfSplits(awayTeamMatches.filter((m) => !m.isHome));

  const expectedCornersHome = averageOfDefined(homeHomeStats.cornersForPerGame, awayAwayStats.cornersAgainstPerGame);
  const expectedCornersAway = averageOfDefined(awayAwayStats.cornersForPerGame, homeHomeStats.cornersAgainstPerGame);

  return {
    homeExpectedGoals,
    awayExpectedGoals,
    homeWinProbability,
    drawProbability,
    awayWinProbability,
    scorelineProbabilities: scorelineProbabilities(homeExpectedGoals, awayExpectedGoals),
    expectedFirstHalfGoals: {
      home: homeHalfSplits.firstHalfGoalsForPerGame,
      away: awayHalfSplits.firstHalfGoalsForPerGame,
    },
    expectedSecondHalfGoals: {
      home: homeHalfSplits.secondHalfGoalsForPerGame,
      away: awayHalfSplits.secondHalfGoalsForPerGame,
    },
    expectedCorners: {
      home: expectedCornersHome,
      away: expectedCornersAway,
      total: averageOfDefined(expectedCornersHome, expectedCornersAway) !== undefined
        ? (expectedCornersHome ?? 0) + (expectedCornersAway ?? 0)
        : undefined,
    },
    homeStats: homeHomeStats,
    awayStats: awayAwayStats,
  };
}
