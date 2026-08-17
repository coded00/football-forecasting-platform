import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { computeMomentum } from "@lib/analytics/momentum";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { computeFormWindows } from "@lib/analytics/teamStats";
import { fetchTeamDataFromAllSources } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { explainForecast } from "@lib/presentation/explanation";
import { formatForecastPanel } from "@lib/presentation/forecastPanel";
import { computeModelConfidence } from "@lib/presentation/modelConfidence";
import type { FetchResult } from "@lib/sources/types";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

function isValidLeague(value: unknown): value is LeagueName {
  return typeof value === "string" && (VALID_LEAGUES as string[]).includes(value);
}

// PRD §27's Data Source Status — which of the (up to 4) sources actually
// returned data for this request, and what went wrong for the ones that didn't.
function dataSourceStatus(results: FetchResult[]) {
  return results.map((r) => ({
    source: r.source,
    matchesFound: r.matches.length,
    error: r.error ?? null,
  }));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const homeTeam = body?.homeTeam;
  const awayTeam = body?.awayTeam;
  const league = body?.league;

  if (
    typeof homeTeam !== "string" ||
    !homeTeam.trim() ||
    typeof awayTeam !== "string" ||
    !awayTeam.trim() ||
    !isValidLeague(league)
  ) {
    return NextResponse.json(
      { error: `homeTeam, awayTeam (non-empty strings), and league (one of ${VALID_LEAGUES.join(", ")}) are required` },
      { status: 400 }
    );
  }

  const [homeResults, awayResults] = await Promise.all([
    fetchTeamDataFromAllSources(homeTeam, league),
    fetchTeamDataFromAllSources(awayTeam, league),
  ]);

  const homeMerged = mergeMatches(homeResults);
  const awayMerged = mergeMatches(awayResults);
  const sourceStatus = { home: dataSourceStatus(homeResults), away: dataSourceStatus(awayResults) };

  if (homeMerged.length === 0 || awayMerged.length === 0) {
    return NextResponse.json(
      { error: "Not enough data was found for one or both teams to produce a forecast.", dataSourceStatus: sourceStatus },
      { status: 422 }
    );
  }

  const forecast = predictMatch(homeMerged, awayMerged);

  const homeFormWindows = computeFormWindows(homeMerged);
  const awayFormWindows = computeFormWindows(awayMerged);
  const homeMomentum = computeMomentum(homeFormWindows.last5, homeFormWindows.overall);
  const awayMomentum = computeMomentum(awayFormWindows.last5, awayFormWindows.overall);

  const confidence = computeModelConfidence(forecast.homeStats, forecast.awayStats, forecast);
  const explanation = explainForecast(
    homeTeam,
    awayTeam,
    forecast.homeStats,
    forecast.awayStats,
    homeMomentum,
    awayMomentum,
    forecast
  );
  const panelText = formatForecastPanel(homeTeam, awayTeam, forecast, confidence);

  return NextResponse.json({
    homeTeam,
    awayTeam,
    league,
    forecast,
    confidence,
    explanation,
    panelText,
    momentum: { home: homeMomentum, away: awayMomentum },
    dataSourceStatus: sourceStatus,
  });
}
