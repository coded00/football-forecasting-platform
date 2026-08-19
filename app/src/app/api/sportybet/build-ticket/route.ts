import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { computeMomentum } from "@lib/analytics/momentum";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { computeFormWindows } from "@lib/analytics/teamStats";
import { fetchTeamDataFromAllSources } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { explainForecast } from "@lib/presentation/explanation";
import { computeModelConfidence } from "@lib/presentation/modelConfidence";
import { findSportyBetMatch } from "@lib/sources/sportybet";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

// 1X2 market: marketId "1", outcomeId 1/2/3 for home/draw/away. Inferred from
// the observed pattern in a real public listing (three consecutive outcome
// links for one match, odds shaped like a home-favorite/draw/away-underdog
// spread) — the HTML doesn't explicitly label which outcomeId means what, so
// this mapping should be double-checked against the real page before trusting
// it for something you'll act on.
const MARKET_1X2 = "1";
const OUTCOME_ID_BY_RESULT: Record<"Home" | "Draw" | "Away", string> = { Home: "1", Draw: "2", Away: "3" };

interface RequestedMatch {
  homeTeam: string;
  awayTeam: string;
  league: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const matches: RequestedMatch[] = body?.matches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return NextResponse.json({ error: "matches (non-empty array of {homeTeam, awayTeam, league}) is required" }, { status: 400 });
  }

  const results = await Promise.all(
    matches.map(async (m) => {
      if (!VALID_LEAGUES.includes(m.league as LeagueName)) {
        return { ...m, error: `Unsupported league: ${m.league}` };
      }
      const league = m.league as LeagueName;

      try {
        const [homeResults, awayResults, sportyMatch] = await Promise.all([
          fetchTeamDataFromAllSources(m.homeTeam, league),
          fetchTeamDataFromAllSources(m.awayTeam, league),
          findSportyBetMatch(m.homeTeam, m.awayTeam, league),
        ]);

        if (!sportyMatch) {
          return { ...m, error: "Could not find this match on SportyBet's public listing (name mismatch, or not currently listed)" };
        }

        const homeMerged = mergeMatches(homeResults);
        const awayMerged = mergeMatches(awayResults);
        if (homeMerged.length === 0 || awayMerged.length === 0) {
          return { ...m, error: "Not enough data was found for one or both teams" };
        }

        const forecast = predictMatch(homeMerged, awayMerged);
        const confidence = computeModelConfidence(forecast.homeStats, forecast.awayStats, forecast);
        const homeFormWindows = computeFormWindows(homeMerged);
        const awayFormWindows = computeFormWindows(awayMerged);
        const homeMomentum = computeMomentum(homeFormWindows.last5, homeFormWindows.overall);
        const awayMomentum = computeMomentum(awayFormWindows.last5, awayFormWindows.overall);
        const explanation = explainForecast(
          m.homeTeam,
          m.awayTeam,
          forecast.homeStats,
          forecast.awayStats,
          homeMomentum,
          awayMomentum,
          forecast
        );

        const favoredOutcome: "Home" | "Draw" | "Away" =
          forecast.homeWinProbability >= forecast.drawProbability && forecast.homeWinProbability >= forecast.awayWinProbability
            ? "Home"
            : forecast.awayWinProbability >= forecast.drawProbability
              ? "Away"
              : "Draw";

        return {
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          league,
          favoredOutcome,
          confidence,
          explanation,
          homeWinProbability: forecast.homeWinProbability,
          drawProbability: forecast.drawProbability,
          awayWinProbability: forecast.awayWinProbability,
          sportyBetSelection: {
            eventId: sportyMatch.eventId,
            marketId: MARKET_1X2,
            outcomeId: OUTCOME_ID_BY_RESULT[favoredOutcome],
            // Odds as observed at analysis time — likely to drift before the
            // local write-tool actually submits this, since prices move.
            odds: sportyMatch.odds1X2[favoredOutcome.toLowerCase() as "home" | "draw" | "away"],
          },
        };
      } catch (error) {
        return { ...m, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );

  return NextResponse.json({ selections: results });
}
