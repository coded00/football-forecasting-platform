// Phase 5 spot-check: run the full pipeline (Phase 2 stats -> Phase 3 forecast
// -> Phase 4 momentum -> Phase 5 panel/explanation) end-to-end on the same
// synthetic strong-vs-weak fixture set used in sanityCheckPrediction.ts, and
// read the output like a human would.
import type { MergedMatch } from "../lib/analytics/mergeMatches";
import { computeMomentum } from "../lib/analytics/momentum";
import { computeFormWindows, computeRecencyWeightedStats } from "../lib/analytics/teamStats";
import { predictMatch } from "../lib/prediction/predictMatch";
import { explainForecast } from "../lib/presentation/explanation";
import { formatForecastPanel } from "../lib/presentation/forecastPanel";
import { computeModelConfidence } from "../lib/presentation/modelConfidence";

function makeMatch(overrides: Partial<MergedMatch> & { date: string }): MergedMatch {
  return { opponent: "Opponent", isHome: true, goalsFor: 1, goalsAgainst: 1, sources: ["football_data"], ...overrides };
}

const strongTeamHomeMatches: MergedMatch[] = [
  makeMatch({ date: "2026-01-04", goalsFor: 3, goalsAgainst: 0, xgFor: 2.3, xgAgainst: 0.7, cornersFor: 7, cornersAgainst: 2 }),
  makeMatch({ date: "2026-01-11", goalsFor: 2, goalsAgainst: 1, xgFor: 2.0, xgAgainst: 1.0, cornersFor: 6, cornersAgainst: 3 }),
  makeMatch({ date: "2026-01-18", goalsFor: 1, goalsAgainst: 1, xgFor: 1.8, xgAgainst: 0.9, cornersFor: 5, cornersAgainst: 4 }),
  makeMatch({ date: "2026-01-25", goalsFor: 4, goalsAgainst: 0, xgFor: 2.6, xgAgainst: 0.6, cornersFor: 8, cornersAgainst: 1 }),
  makeMatch({ date: "2026-02-01", goalsFor: 2, goalsAgainst: 0, xgFor: 2.1, xgAgainst: 0.8, cornersFor: 6, cornersAgainst: 2 }),
  makeMatch({ date: "2026-02-08", goalsFor: 2, goalsAgainst: 2, xgFor: 1.9, xgAgainst: 1.4, cornersFor: 5, cornersAgainst: 5 }),
  makeMatch({ date: "2026-02-15", goalsFor: 3, goalsAgainst: 1, xgFor: 2.4, xgAgainst: 1.0, cornersFor: 7, cornersAgainst: 3 }),
  makeMatch({ date: "2026-02-22", goalsFor: 1, goalsAgainst: 0, xgFor: 1.7, xgAgainst: 0.7, cornersFor: 5, cornersAgainst: 2 }),
  makeMatch({ date: "2026-03-01", goalsFor: 2, goalsAgainst: 1, xgFor: 2.0, xgAgainst: 0.9, cornersFor: 6, cornersAgainst: 3 }),
  makeMatch({ date: "2026-03-08", goalsFor: 3, goalsAgainst: 0, xgFor: 2.5, xgAgainst: 0.8, cornersFor: 7, cornersAgainst: 2 }),
];

const weakTeamAwayMatches: MergedMatch[] = [
  makeMatch({ date: "2026-01-04", isHome: false, goalsFor: 0, goalsAgainst: 2, xgFor: 0.7, xgAgainst: 1.8, cornersFor: 3, cornersAgainst: 6 }),
  makeMatch({ date: "2026-01-11", isHome: false, goalsFor: 1, goalsAgainst: 2, xgFor: 0.9, xgAgainst: 1.7, cornersFor: 2, cornersAgainst: 7 }),
  makeMatch({ date: "2026-01-18", isHome: false, goalsFor: 1, goalsAgainst: 1, xgFor: 1.0, xgAgainst: 1.5, cornersFor: 4, cornersAgainst: 5 }),
  makeMatch({ date: "2026-01-25", isHome: false, goalsFor: 0, goalsAgainst: 3, xgFor: 0.6, xgAgainst: 2.1, cornersFor: 2, cornersAgainst: 8 }),
  makeMatch({ date: "2026-02-01", isHome: false, goalsFor: 1, goalsAgainst: 1, xgFor: 0.8, xgAgainst: 1.6, cornersFor: 3, cornersAgainst: 6 }),
  makeMatch({ date: "2026-02-08", isHome: false, goalsFor: 2, goalsAgainst: 2, xgFor: 1.1, xgAgainst: 1.5, cornersFor: 4, cornersAgainst: 5 }),
  makeMatch({ date: "2026-02-15", isHome: false, goalsFor: 0, goalsAgainst: 1, xgFor: 0.7, xgAgainst: 1.4, cornersFor: 3, cornersAgainst: 6 }),
  makeMatch({ date: "2026-02-22", isHome: false, goalsFor: 1, goalsAgainst: 2, xgFor: 0.9, xgAgainst: 1.8, cornersFor: 3, cornersAgainst: 7 }),
  makeMatch({ date: "2026-03-01", isHome: false, goalsFor: 0, goalsAgainst: 1, xgFor: 0.6, xgAgainst: 1.6, cornersFor: 2, cornersAgainst: 6 }),
  makeMatch({ date: "2026-03-08", isHome: false, goalsFor: 1, goalsAgainst: 2, xgFor: 0.8, xgAgainst: 1.7, cornersFor: 3, cornersAgainst: 6 }),
];

const HOME = "Strongside FC";
const AWAY = "Weakside United";

const forecast = predictMatch(strongTeamHomeMatches, weakTeamAwayMatches);
const homeHomeStats = computeRecencyWeightedStats(strongTeamHomeMatches.filter((m) => m.isHome));
const awayAwayStats = computeRecencyWeightedStats(weakTeamAwayMatches.filter((m) => !m.isHome));
const homeMomentum = computeMomentum(computeFormWindows(strongTeamHomeMatches).last5, computeFormWindows(strongTeamHomeMatches).overall);
const awayMomentum = computeMomentum(computeFormWindows(weakTeamAwayMatches).last5, computeFormWindows(weakTeamAwayMatches).overall);
const confidence = computeModelConfidence(homeHomeStats, awayAwayStats, forecast);

console.log(formatForecastPanel(HOME, AWAY, forecast, confidence));
console.log();
console.log(explainForecast(HOME, AWAY, homeHomeStats, awayAwayStats, homeMomentum, awayMomentum, forecast));
