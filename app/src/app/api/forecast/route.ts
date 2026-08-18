import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { computeMomentum } from "@lib/analytics/momentum";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { computeFormWindows } from "@lib/analytics/teamStats";
import { fetchTeamDataByName, fetchTeamDataFromAllSources } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { explainForecast } from "@lib/presentation/explanation";
import { formatForecastPanel } from "@lib/presentation/forecastPanel";
import { computeModelConfidence } from "@lib/presentation/modelConfidence";
import type { FetchResult } from "@lib/sources/types";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

function isValidLeague(value: unknown): value is LeagueName {
  return typeof value === "string" && (VALID_LEAGUES as string[]).includes(value);
}

// "General" (no league, or a league string we don't have a fixed config for)
// resolves via FotMob's global team search instead of requiring one of the 5
// configured leagues — see fetchAll.ts's fetchTeamDataByName. Covers any real
// club (confirmed live against Argentine, Egyptian, Japanese clubs), just with
// fewer corroborating sources unless the team happens to land in one of the 5
// enhanced leagues.
async function resolveTeam(teamName: string, requestedLeague: unknown) {
  if (isValidLeague(requestedLeague)) {
    return { results: await fetchTeamDataFromAllSources(teamName, requestedLeague), resolvedLeague: requestedLeague };
  }
  const general = await fetchTeamDataByName(teamName);
  return { results: general.results, resolvedLeague: general.resolvedLeague, fotmobLeagueName: general.fotmobLeagueName };
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

  if (typeof homeTeam !== "string" || !homeTeam.trim() || typeof awayTeam !== "string" || !awayTeam.trim()) {
    return NextResponse.json({ error: "homeTeam and awayTeam (non-empty strings) are required" }, { status: 400 });
  }

  const [home, away] = await Promise.all([resolveTeam(homeTeam, league), resolveTeam(awayTeam, league)]);
  const homeResults = home.results;
  const awayResults = away.results;

  const homeMerged = mergeMatches(homeResults);
  const awayMerged = mergeMatches(awayResults);
  const sourceStatus = { home: dataSourceStatus(homeResults), away: dataSourceStatus(awayResults) };
  const resolution = {
    home: { league: home.resolvedLeague ?? null, fotmobLeagueName: home.fotmobLeagueName ?? null },
    away: { league: away.resolvedLeague ?? null, fotmobLeagueName: away.fotmobLeagueName ?? null },
  };

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
    resolution,
    forecast,
    confidence,
    explanation,
    panelText,
    momentum: { home: homeMomentum, away: awayMomentum },
    dataSourceStatus: sourceStatus,
  });
}
