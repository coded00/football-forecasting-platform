import { NextRequest, NextResponse } from "next/server";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { fetchTeamDataByName } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { formatForecastPanel } from "@lib/presentation/forecastPanel";
import { computeModelConfidence } from "@lib/presentation/modelConfidence";
import { decodeBookingCode, type SportyBetSelection } from "@lib/sources/sportybet";

// General resolution (fetchAll.ts's fetchTeamDataByName) replaced the old
// football-data.co.uk-only 5-league probe here — a real SportyBet slip can
// include matches from anywhere, and general resolution already covers any
// club worldwide (confirmed live: Argentine, Egyptian, Japanese clubs), not
// just our 5 enhanced leagues. It still upgrades to the full multi-source
// pipeline automatically when a team lands in one of those 5.
async function analyzeSelection(selection: SportyBetSelection) {
  const [home, away] = await Promise.all([
    fetchTeamDataByName(selection.homeTeam),
    fetchTeamDataByName(selection.awayTeam),
  ]);
  const homeMerged = mergeMatches(home.results);
  const awayMerged = mergeMatches(away.results);

  if (homeMerged.length === 0 || awayMerged.length === 0) {
    return {
      selection,
      supported: false,
      reason: "Not enough data was found for one or both teams (name mismatch against FotMob, or genuinely no recent matches)",
    };
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
    league: home.resolvedLeague ?? home.fotmobLeagueName ?? away.resolvedLeague ?? away.fotmobLeagueName ?? null,
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
