import type { MergedMatch } from "./mergeMatches";
import { expectedPoints } from "./poisson";

export interface TeamStatsSummary {
  matchesPlayed: number;
  pointsPerGame: number;
  expectedPointsPerGame?: number; // only computed over matches that have xG data
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  goalDifferencePerGame: number;
  xgForPerGame?: number;
  xgAgainstPerGame?: number;
  xgDifferencePerGame?: number;
  npxgForPerGame?: number;
  shotsForPerGame?: number;
  shotsAgainstPerGame?: number;
  shotDifferencePerGame?: number;
  shotsOnTargetForPerGame?: number;
  shotsOnTargetAgainstPerGame?: number;
  shotsOnTargetDifferencePerGame?: number;
  cornersForPerGame?: number;
  cornersAgainstPerGame?: number;
  cornerDifferencePerGame?: number;
  possessionAvg?: number;
}

// `weights` defaults to 1 per match, which makes weightedAverage a plain mean —
// this is what lets recency-weighted stats (4.1) reuse the exact same summary
// logic as the flat, unweighted stats instead of duplicating the field list.
function weightedAverage(pairs: { value: number; weight: number }[]): number | undefined {
  if (pairs.length === 0) return undefined;
  const totalWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return undefined;
  return pairs.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight;
}

function collect<K extends keyof MergedMatch>(
  matches: MergedMatch[],
  weights: number[],
  field: K
): { value: number; weight: number }[] {
  return matches
    .map((m, i) => ({ value: m[field], weight: weights[i] }))
    .filter((p) => typeof p.value === "number") as { value: number; weight: number }[];
}

function diffAvg(
  matches: MergedMatch[],
  weights: number[],
  forField: keyof MergedMatch,
  againstField: keyof MergedMatch
): number | undefined {
  const forAvg = weightedAverage(collect(matches, weights, forField));
  const againstAvg = weightedAverage(collect(matches, weights, againstField));
  if (forAvg === undefined || againstAvg === undefined) return undefined;
  return forAvg - againstAvg;
}

function pointsFor(match: MergedMatch): number {
  if (match.goalsFor > match.goalsAgainst) return 3;
  if (match.goalsFor === match.goalsAgainst) return 1;
  return 0;
}

export function summarizeMatches(matches: MergedMatch[], weights: number[] = matches.map(() => 1)): TeamStatsSummary {
  const expectedPointsPairs = matches
    .map((m, i) => ({ m, weight: weights[i] }))
    .filter(({ m }) => typeof m.xgFor === "number" && typeof m.xgAgainst === "number")
    .map(({ m, weight }) => ({ value: expectedPoints(m.xgFor as number, m.xgAgainst as number), weight }));

  return {
    matchesPlayed: matches.length,
    pointsPerGame: weightedAverage(matches.map((m, i) => ({ value: pointsFor(m), weight: weights[i] }))) ?? 0,
    expectedPointsPerGame: weightedAverage(expectedPointsPairs),
    goalsForPerGame: weightedAverage(collect(matches, weights, "goalsFor")) ?? 0,
    goalsAgainstPerGame: weightedAverage(collect(matches, weights, "goalsAgainst")) ?? 0,
    goalDifferencePerGame: diffAvg(matches, weights, "goalsFor", "goalsAgainst") ?? 0,
    xgForPerGame: weightedAverage(collect(matches, weights, "xgFor")),
    xgAgainstPerGame: weightedAverage(collect(matches, weights, "xgAgainst")),
    xgDifferencePerGame: diffAvg(matches, weights, "xgFor", "xgAgainst"),
    npxgForPerGame: weightedAverage(collect(matches, weights, "npxgFor")),
    shotsForPerGame: weightedAverage(collect(matches, weights, "shotsFor")),
    shotsAgainstPerGame: weightedAverage(collect(matches, weights, "shotsAgainst")),
    shotDifferencePerGame: diffAvg(matches, weights, "shotsFor", "shotsAgainst"),
    shotsOnTargetForPerGame: weightedAverage(collect(matches, weights, "shotsOnTargetFor")),
    shotsOnTargetAgainstPerGame: weightedAverage(collect(matches, weights, "shotsOnTargetAgainst")),
    shotsOnTargetDifferencePerGame: diffAvg(matches, weights, "shotsOnTargetFor", "shotsOnTargetAgainst"),
    cornersForPerGame: weightedAverage(collect(matches, weights, "cornersFor")),
    cornersAgainstPerGame: weightedAverage(collect(matches, weights, "cornersAgainst")),
    cornerDifferencePerGame: diffAvg(matches, weights, "cornersFor", "cornersAgainst"),
    possessionAvg: weightedAverage(collect(matches, weights, "possessionFor")),
  };
}

export interface FormWindows {
  last5: TeamStatsSummary;
  last10: TeamStatsSummary;
  last20: TeamStatsSummary;
  overall: TeamStatsSummary; // all matches fetched — bounded by what was fetched, not a guaranteed full season
}

export function computeFormWindows(matches: MergedMatch[]): FormWindows {
  const chronological = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const mostRecentFirst = [...chronological].reverse();

  return {
    last5: summarizeMatches(mostRecentFirst.slice(0, 5)),
    last10: summarizeMatches(mostRecentFirst.slice(0, 10)),
    last20: summarizeMatches(mostRecentFirst.slice(0, 20)),
    overall: summarizeMatches(chronological),
  };
}

export interface VenueSplits {
  home: TeamStatsSummary;
  away: TeamStatsSummary;
  overall: TeamStatsSummary;
}

export function computeVenueSplits(matches: MergedMatch[]): VenueSplits {
  return {
    home: summarizeMatches(matches.filter((m) => m.isHome)),
    away: summarizeMatches(matches.filter((m) => !m.isHome)),
    overall: summarizeMatches(matches),
  };
}

export interface HalfSplitSummary {
  firstHalfGoalsForPerGame?: number;
  firstHalfGoalsAgainstPerGame?: number;
  secondHalfGoalsForPerGame?: number;
  secondHalfGoalsAgainstPerGame?: number;
}

function simpleAverage(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeHalfSplits(matches: MergedMatch[]): HalfSplitSummary {
  const withHalftime = matches.filter(
    (m): m is MergedMatch & { htGoalsFor: number; htGoalsAgainst: number } =>
      typeof m.htGoalsFor === "number" && typeof m.htGoalsAgainst === "number"
  );

  return {
    firstHalfGoalsForPerGame: simpleAverage(withHalftime.map((m) => m.htGoalsFor)),
    firstHalfGoalsAgainstPerGame: simpleAverage(withHalftime.map((m) => m.htGoalsAgainst)),
    secondHalfGoalsForPerGame: simpleAverage(withHalftime.map((m) => m.goalsFor - m.htGoalsFor)),
    secondHalfGoalsAgainstPerGame: simpleAverage(withHalftime.map((m) => m.goalsAgainst - m.htGoalsAgainst)),
  };
}

// PRD §10's fixed recency buckets: last 5 matches 35%, matches 6-10 25%,
// matches 11-20 20%, everything older 20% (originally split 15% current-season /
// 5% older-season, but MergedMatch carries no season boundary to distinguish
// those two once a fetch spans multiple seasons, so they're combined here).
const RECENCY_BUCKETS: { size: number; weight: number }[] = [
  { size: 5, weight: 0.35 },
  { size: 5, weight: 0.25 },
  { size: 10, weight: 0.2 },
];
const OLDER_BUCKET_WEIGHT = 0.2;

function computeRecencyWeights(count: number): number[] {
  const weights: number[] = [];
  let remaining = count;
  for (const bucket of RECENCY_BUCKETS) {
    const n = Math.min(bucket.size, remaining);
    const perMatch = n > 0 ? bucket.weight / n : 0;
    for (let i = 0; i < n; i++) weights.push(perMatch);
    remaining -= n;
  }
  if (remaining > 0) {
    const perMatch = OLDER_BUCKET_WEIGHT / remaining;
    for (let i = 0; i < remaining; i++) weights.push(perMatch);
  }
  return weights;
}

// Same field set as summarizeMatches, just weighted so recent matches count for
// more — this is what Phase 3's expectedGoals should be fed instead of a flat
// average, per 4.1.
export function computeRecencyWeightedStats(matches: MergedMatch[]): TeamStatsSummary {
  const mostRecentFirst = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  const weights = computeRecencyWeights(mostRecentFirst.length);
  return summarizeMatches(mostRecentFirst, weights);
}
