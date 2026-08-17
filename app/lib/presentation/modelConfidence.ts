import type { TeamStatsSummary } from "../analytics/teamStats";
import type { MatchForecast } from "../prediction/predictMatch";

// This is a heuristic display number, NOT a calibrated statistical confidence —
// calibration (PRD §25-26) requires backtesting against known outcomes, which
// is out of scope entirely under the Architecture Pivot (nothing is persisted
// to backtest against). Treat this as "how much the model had to go on,"
// not "P(this forecast is correct)".
export function computeModelConfidence(
  homeStats: TeamStatsSummary,
  awayStats: TeamStatsSummary,
  forecast: MatchForecast
): number {
  const sampleFactor = Math.min((homeStats.matchesPlayed + awayStats.matchesPlayed) / 20, 1);

  const dataCompletenessFactor =
    [homeStats.xgForPerGame, awayStats.xgForPerGame].filter((v) => v !== undefined).length / 2;

  const topProbability = Math.max(forecast.homeWinProbability, forecast.drawProbability, forecast.awayWinProbability);
  const decisivenessFactor = Math.max((topProbability - 1 / 3) / (1 - 1 / 3), 0);

  const raw = 0.4 * sampleFactor + 0.3 * dataCompletenessFactor + 0.3 * decisivenessFactor;
  return Math.round(raw * 100);
}
