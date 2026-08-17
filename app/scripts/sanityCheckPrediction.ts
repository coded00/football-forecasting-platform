// Phase 3, action 3.5: not a persisted backtest (out of scope under the
// Architecture Pivot) — just a hand-checkable spot-check that the model behaves
// sensibly, using synthetic-but-realistic match data instead of live credentials
// (no API-Football key configured yet). Run with: npx tsx scripts/sanityCheckPrediction.ts
import type { MergedMatch } from "../lib/analytics/mergeMatches";
import { predictMatch } from "../lib/prediction/predictMatch";

function makeMatch(overrides: Partial<MergedMatch> & { date: string }): MergedMatch {
  return {
    opponent: "Opponent",
    isHome: true,
    goalsFor: 1,
    goalsAgainst: 1,
    sources: ["football_data"],
    ...overrides,
  };
}

// A strong team's last 10 home matches: high scoring, tight defense.
const strongTeamHomeMatches: MergedMatch[] = [
  makeMatch({ date: "2026-01-04", goalsFor: 3, goalsAgainst: 0, xgFor: 2.3, xgAgainst: 0.7, htGoalsFor: 2, htGoalsAgainst: 0, cornersFor: 7, cornersAgainst: 2 }),
  makeMatch({ date: "2026-01-11", goalsFor: 2, goalsAgainst: 1, xgFor: 2.0, xgAgainst: 1.0, htGoalsFor: 1, htGoalsAgainst: 0, cornersFor: 6, cornersAgainst: 3 }),
  makeMatch({ date: "2026-01-18", goalsFor: 1, goalsAgainst: 1, xgFor: 1.8, xgAgainst: 0.9, htGoalsFor: 0, htGoalsAgainst: 1, cornersFor: 5, cornersAgainst: 4 }),
  makeMatch({ date: "2026-01-25", goalsFor: 4, goalsAgainst: 0, xgFor: 2.6, xgAgainst: 0.6, htGoalsFor: 2, htGoalsAgainst: 0, cornersFor: 8, cornersAgainst: 1 }),
  makeMatch({ date: "2026-02-01", goalsFor: 2, goalsAgainst: 0, xgFor: 2.1, xgAgainst: 0.8, htGoalsFor: 1, htGoalsAgainst: 0, cornersFor: 6, cornersAgainst: 2 }),
  makeMatch({ date: "2026-02-08", goalsFor: 2, goalsAgainst: 2, xgFor: 1.9, xgAgainst: 1.4, htGoalsFor: 1, htGoalsAgainst: 1, cornersFor: 5, cornersAgainst: 5 }),
  makeMatch({ date: "2026-02-15", goalsFor: 3, goalsAgainst: 1, xgFor: 2.4, xgAgainst: 1.0, htGoalsFor: 2, htGoalsAgainst: 0, cornersFor: 7, cornersAgainst: 3 }),
  makeMatch({ date: "2026-02-22", goalsFor: 1, goalsAgainst: 0, xgFor: 1.7, xgAgainst: 0.7, htGoalsFor: 1, htGoalsAgainst: 0, cornersFor: 5, cornersAgainst: 2 }),
  makeMatch({ date: "2026-03-01", goalsFor: 2, goalsAgainst: 1, xgFor: 2.0, xgAgainst: 0.9, htGoalsFor: 1, htGoalsAgainst: 1, cornersFor: 6, cornersAgainst: 3 }),
  makeMatch({ date: "2026-03-08", goalsFor: 3, goalsAgainst: 0, xgFor: 2.5, xgAgainst: 0.8, htGoalsFor: 1, htGoalsAgainst: 0, cornersFor: 7, cornersAgainst: 2 }),
];

// A weak team's last 10 away matches: low scoring, leaky defense.
const weakTeamAwayMatches: MergedMatch[] = [
  makeMatch({ date: "2026-01-04", isHome: false, goalsFor: 0, goalsAgainst: 2, xgFor: 0.7, xgAgainst: 1.8, htGoalsFor: 0, htGoalsAgainst: 1, cornersFor: 3, cornersAgainst: 6 }),
  makeMatch({ date: "2026-01-11", isHome: false, goalsFor: 1, goalsAgainst: 2, xgFor: 0.9, xgAgainst: 1.7, htGoalsFor: 0, htGoalsAgainst: 1, cornersFor: 2, cornersAgainst: 7 }),
  makeMatch({ date: "2026-01-18", isHome: false, goalsFor: 1, goalsAgainst: 1, xgFor: 1.0, xgAgainst: 1.5, htGoalsFor: 1, htGoalsAgainst: 0, cornersFor: 4, cornersAgainst: 5 }),
  makeMatch({ date: "2026-01-25", isHome: false, goalsFor: 0, goalsAgainst: 3, xgFor: 0.6, xgAgainst: 2.1, htGoalsFor: 0, htGoalsAgainst: 2, cornersFor: 2, cornersAgainst: 8 }),
  makeMatch({ date: "2026-02-01", isHome: false, goalsFor: 1, goalsAgainst: 1, xgFor: 0.8, xgAgainst: 1.6, htGoalsFor: 0, htGoalsAgainst: 1, cornersFor: 3, cornersAgainst: 6 }),
  makeMatch({ date: "2026-02-08", isHome: false, goalsFor: 2, goalsAgainst: 2, xgFor: 1.1, xgAgainst: 1.5, htGoalsFor: 1, htGoalsAgainst: 1, cornersFor: 4, cornersAgainst: 5 }),
  makeMatch({ date: "2026-02-15", isHome: false, goalsFor: 0, goalsAgainst: 1, xgFor: 0.7, xgAgainst: 1.4, htGoalsFor: 0, htGoalsAgainst: 0, cornersFor: 3, cornersAgainst: 6 }),
  makeMatch({ date: "2026-02-22", isHome: false, goalsFor: 1, goalsAgainst: 2, xgFor: 0.9, xgAgainst: 1.8, htGoalsFor: 1, htGoalsAgainst: 1, cornersFor: 3, cornersAgainst: 7 }),
  makeMatch({ date: "2026-03-01", isHome: false, goalsFor: 0, goalsAgainst: 1, xgFor: 0.6, xgAgainst: 1.6, htGoalsFor: 0, htGoalsAgainst: 0, cornersFor: 2, cornersAgainst: 6 }),
  makeMatch({ date: "2026-03-08", isHome: false, goalsFor: 1, goalsAgainst: 2, xgFor: 0.8, xgAgainst: 1.7, htGoalsFor: 0, htGoalsAgainst: 1, cornersFor: 3, cornersAgainst: 6 }),
];

const forecast = predictMatch(strongTeamHomeMatches, weakTeamAwayMatches);

console.log(JSON.stringify(forecast, null, 2));

const outcomeSum = forecast.homeWinProbability + forecast.drawProbability + forecast.awayWinProbability;
const scorelineSum = forecast.scorelineProbabilities.reduce((sum, s) => sum + s.probability, 0);

const checks = [
  ["home xG > away xG", forecast.homeExpectedGoals > forecast.awayExpectedGoals],
  ["home win probability > away win probability", forecast.homeWinProbability > forecast.awayWinProbability],
  ["home win probability is the largest of the three outcomes", forecast.homeWinProbability > forecast.drawProbability && forecast.homeWinProbability > forecast.awayWinProbability],
  ["outcome probabilities sum to ~1", Math.abs(outcomeSum - 1) < 0.01],
  ["scoreline probabilities sum to ~1", Math.abs(scorelineSum - 1) < 0.05],
  ["home corners > away corners", (forecast.expectedCorners.home ?? 0) > (forecast.expectedCorners.away ?? 0)],
];

console.log("\nSanity checks:");
let allPassed = true;
for (const [label, passed] of checks) {
  console.log(`  ${passed ? "PASS" : "FAIL"} - ${label}`);
  if (!passed) allPassed = false;
}

if (!allPassed) process.exit(1);
