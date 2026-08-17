import type { MomentumResult } from "../analytics/momentum";
import type { TeamStatsSummary } from "../analytics/teamStats";
import type { MatchForecast } from "../prediction/predictMatch";

// Deterministic, rule-based explanation (no LLM call — this runs inside a
// Netlify Function per request, and the inputs are already fully structured
// numbers, so templating is simpler and cheaper than generating prose). Mirrors
// PRD §22's example structure: lead with the favorite's strongest signal,
// counter with the underdog's best signal if there is one, always close with
// the data-quality caveat — which is a genuine caveat here (unverified
// Understat/FotMob scrapers, a simplified non-Dixon-Coles model, whatever
// sample size the fetch happened to return), not boilerplate copied from the PRD.
function describeStrength(stats: TeamStatsSummary): string | null {
  const diff = stats.xgDifferencePerGame ?? stats.goalDifferencePerGame;
  if (diff === undefined) return null;
  if (diff > 0.8) return "strong underlying attacking and defensive balance";
  if (diff > 0.3) return "solid underlying attacking profile";
  return null;
}

function describeMomentum(score: number): string | null {
  if (score > 0.8) return "clear upward trend in recent form";
  if (score > 0.3) return "modest recent improvement";
  if (score < -0.8) return "clear downward trend in recent form";
  if (score < -0.3) return "modest recent decline";
  return null;
}

function buildFavoriteClause(favorite: string, stats: TeamStatsSummary, momentum: MomentumResult): string {
  const strength = describeStrength(stats);
  const momentumPhrase = momentum.score > 0.3 ? describeMomentum(momentum.score) : null;

  if (strength && momentumPhrase) return `${favorite}'s ${strength} and ${momentumPhrase}`;
  if (strength) return `${favorite}'s ${strength}`;
  if (momentumPhrase) return `${favorite}'s ${momentumPhrase}`;
  return `${favorite} is favored on the numbers available`;
}

function buildUnderdogClause(underdog: string, momentum: MomentumResult): string | null {
  const momentumPhrase = momentum.score > 0.3 ? describeMomentum(momentum.score) : null;
  return momentumPhrase ? `${underdog}'s ${momentumPhrase}` : null;
}

export function explainForecast(
  homeTeamName: string,
  awayTeamName: string,
  homeStats: TeamStatsSummary,
  awayStats: TeamStatsSummary,
  homeMomentum: MomentumResult,
  awayMomentum: MomentumResult,
  forecast: MatchForecast
): string {
  const homeIsFavorite = forecast.homeWinProbability >= forecast.awayWinProbability;
  const favorite = homeIsFavorite ? homeTeamName : awayTeamName;
  const underdog = homeIsFavorite ? awayTeamName : homeTeamName;
  const favoriteStats = homeIsFavorite ? homeStats : awayStats;
  const favoriteMomentum = homeIsFavorite ? homeMomentum : awayMomentum;
  const underdogMomentum = homeIsFavorite ? awayMomentum : homeMomentum;

  const favoriteClause = buildFavoriteClause(favorite, favoriteStats, favoriteMomentum);
  const underdogClause = buildUnderdogClause(underdog, underdogMomentum);

  const sentence = underdogClause ? `${favoriteClause}, despite ${underdogClause}` : favoriteClause;

  return `${sentence}, subject to the quality and availability of the underlying data.`;
}
