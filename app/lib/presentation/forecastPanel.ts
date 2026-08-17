import type { MatchForecast } from "../prediction/predictMatch";

// PRD §22's example panel format.
export function formatForecastPanel(homeTeamName: string, awayTeamName: string, forecast: MatchForecast, confidence: number): string {
  const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

  return [
    `${homeTeamName.toUpperCase()} vs ${awayTeamName.toUpperCase()}`,
    `Expected ${homeTeamName} goals: ${forecast.homeExpectedGoals.toFixed(2)}    Expected ${awayTeamName} goals: ${forecast.awayExpectedGoals.toFixed(2)}`,
    `${homeTeamName} win: ${pct(forecast.homeWinProbability)}   Draw: ${pct(forecast.drawProbability)}   ${awayTeamName} win: ${pct(forecast.awayWinProbability)}`,
    `Model confidence: ${confidence}/100`,
  ].join("\n");
}
