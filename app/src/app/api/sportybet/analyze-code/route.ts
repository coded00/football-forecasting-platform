import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { fetchTeamDataFromAllSources } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { formatForecastPanel } from "@lib/presentation/forecastPanel";
import { computeModelConfidence } from "@lib/presentation/modelConfidence";
import { decodeBookingCode, type SportyBetSelection } from "@lib/sources/sportybet";
import { fetchFootballDataMatches } from "@lib/sources/footballData";

const SUPPORTED_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

// Our system only covers 5 leagues; a real SportyBet slip can include matches
// from anywhere. This is a best-effort, cheap detector (football-data.co.uk
// only — no API-Football/FotMob calls) used purely to figure out which
// selections we can actually run our pipeline against, not a general-purpose
// league classifier.
async function detectSupportedLeague(homeTeam: string, awayTeam: string): Promise<LeagueName | undefined> {
  const results = await Promise.all(
    SUPPORTED_LEAGUES.map(async (league) => {
      try {
        const homeMatches = await fetchFootballDataMatches(homeTeam, league, 1);
        if (homeMatches.length === 0) return undefined;
        const awayMatches = await fetchFootballDataMatches(awayTeam, league, 1);
        return awayMatches.length > 0 ? league : undefined;
      } catch {
        return undefined;
      }
    })
  );
  return results.find((l): l is LeagueName => l !== undefined);
}

async function analyzeSelection(selection: SportyBetSelection) {
  const league = await detectSupportedLeague(selection.homeTeam, selection.awayTeam);
  if (!league) {
    return {
      selection,
      supported: false,
      reason: "Match isn't in one of the 5 leagues this system covers (Premier League, Championship, League One, La Liga, Ligue 1)",
    };
  }

  const [homeResults, awayResults] = await Promise.all([
    fetchTeamDataFromAllSources(selection.homeTeam, league),
    fetchTeamDataFromAllSources(selection.awayTeam, league),
  ]);
  const homeMerged = mergeMatches(homeResults);
  const awayMerged = mergeMatches(awayResults);

  if (homeMerged.length === 0 || awayMerged.length === 0) {
    return { selection, supported: false, reason: "Not enough data was found for one or both teams" };
  }

  const forecast = predictMatch(homeMerged, awayMerged);
  const confidence = computeModelConfidence(forecast.homeStats, forecast.awayStats, forecast);
  const panelText = formatForecastPanel(selection.homeTeam, selection.awayTeam, forecast, confidence);

  const favoredOutcome =
    forecast.homeWinProbability >= forecast.drawProbability && forecast.homeWinProbability >= forecast.awayWinProbability
      ? "Home"
      : forecast.awayWinProbability >= forecast.drawProbability
        ? "Away"
        : "Draw";

  return {
    selection,
    supported: true,
    league,
    forecast,
    confidence,
    panelText,
    agreesWithSlip: selection.outcomeLabel.toLowerCase().includes(favoredOutcome.toLowerCase()),
    favoredOutcome,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "A SportyBet booking code (string) is required" }, { status: 400 });
  }

  let selections;
  try {
    selections = await decodeBookingCode(code.trim());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }

  const results = await Promise.all(selections.map(analyzeSelection));

  return NextResponse.json({
    code,
    selectionCount: selections.length,
    analyzedCount: results.filter((r) => r.supported).length,
    results,
  });
}
