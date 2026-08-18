import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { fetchTeamDataFromAllSources } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { listSportyBetMatchesForLeague } from "@lib/sources/sportybet";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

// Same inferred 1X2 mapping as build-ticket — see that file's comment.
const MARKET_1X2 = "1";
const OUTCOME_ID_BY_RESULT: Record<"Home" | "Draw" | "Away", string> = { Home: "1", Draw: "2", Away: "3" };

// The point of this endpoint: nobody types a team name. It pulls whatever
// SportyBet is actually offering for a league right now, and analyzes all of
// it — the "Build a ticket" route still exists for a specific hand-picked
// match, this is for "just tell me what's good on the board today."
export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");
  if (!league || !VALID_LEAGUES.includes(league as LeagueName)) {
    return NextResponse.json({ error: `league query param is required, one of ${VALID_LEAGUES.join(", ")}` }, { status: 400 });
  }

  let liveMatches;
  try {
    liveMatches = await listSportyBetMatchesForLeague(league);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }

  if (liveMatches.length === 0) {
    return NextResponse.json({ league, matchCount: 0, results: [], note: "SportyBet isn't currently listing this league (checked live just now)." });
  }

  const results = await Promise.all(
    liveMatches.map(async (sportyMatch) => {
      try {
        const [homeResults, awayResults] = await Promise.all([
          fetchTeamDataFromAllSources(sportyMatch.homeTeam, league as LeagueName),
          fetchTeamDataFromAllSources(sportyMatch.awayTeam, league as LeagueName),
        ]);

        const homeMerged = mergeMatches(homeResults);
        const awayMerged = mergeMatches(awayResults);
        if (homeMerged.length === 0 || awayMerged.length === 0) {
          return {
            homeTeam: sportyMatch.homeTeam,
            awayTeam: sportyMatch.awayTeam,
            supported: false,
            reason: "Not enough data was found for one or both teams (name mismatch against our sources, or genuinely no recent matches)",
          };
        }

        const forecast = predictMatch(homeMerged, awayMerged);
        const favoredOutcome: "Home" | "Draw" | "Away" =
          forecast.homeWinProbability >= forecast.drawProbability && forecast.homeWinProbability >= forecast.awayWinProbability
            ? "Home"
            : forecast.awayWinProbability >= forecast.drawProbability
              ? "Away"
              : "Draw";

        return {
          homeTeam: sportyMatch.homeTeam,
          awayTeam: sportyMatch.awayTeam,
          supported: true,
          favoredOutcome,
          homeWinProbability: forecast.homeWinProbability,
          drawProbability: forecast.drawProbability,
          awayWinProbability: forecast.awayWinProbability,
          sportyBetSelection: {
            eventId: sportyMatch.eventId,
            marketId: MARKET_1X2,
            outcomeId: OUTCOME_ID_BY_RESULT[favoredOutcome],
            odds: sportyMatch.odds1X2[favoredOutcome.toLowerCase() as "home" | "draw" | "away"],
          },
        };
      } catch (error) {
        return {
          homeTeam: sportyMatch.homeTeam,
          awayTeam: sportyMatch.awayTeam,
          supported: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return NextResponse.json({
    league,
    matchCount: liveMatches.length,
    analyzedCount: results.filter((r) => r.supported).length,
    results,
  });
}
