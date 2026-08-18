import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { fetchTeamDataByName } from "@lib/fetchAll";
import { predictMatch } from "@lib/prediction/predictMatch";
import { listSportyBetMatchesForLeague } from "@lib/sources/sportybet";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];
const ALL_LEAGUES = "All";

// Same inferred 1X2 mapping as build-ticket — see that file's comment.
const MARKET_1X2 = "1";
const OUTCOME_ID_BY_RESULT: Record<"Home" | "Draw" | "Away", string> = { Home: "1", Draw: "2", Away: "3" };

// Cap when pulling every league at once — SportyBet's board can have 100+
// live matches at a time, and each one costs two FotMob search+fetch round
// trips to analyze. Uncapped, that risks a slow response or a Netlify
// Function timeout. Reported explicitly below, never silently dropped.
const MAX_MATCHES_WHEN_ALL = 30;

// The point of this endpoint: nobody types a team name. It pulls whatever
// SportyBet is actually offering — a specific league, or literally everything
// on the board — and analyzes all of it via general resolution (fetchAll.ts's
// fetchTeamDataByName), which covers any club worldwide, not just our 5
// enhanced leagues. The "Build a ticket" route still exists for a specific
// hand-picked match; this is for "just tell me what's good today."
export async function GET(request: NextRequest) {
  const requestedLeague = request.nextUrl.searchParams.get("league") ?? ALL_LEAGUES;
  const pullingAll = requestedLeague === ALL_LEAGUES;

  if (!pullingAll && !VALID_LEAGUES.includes(requestedLeague as LeagueName)) {
    return NextResponse.json(
      { error: `league query param must be "${ALL_LEAGUES}" or one of ${VALID_LEAGUES.join(", ")}` },
      { status: 400 }
    );
  }

  let liveMatches;
  try {
    liveMatches = await listSportyBetMatchesForLeague(pullingAll ? undefined : requestedLeague);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }

  if (liveMatches.length === 0) {
    return NextResponse.json({
      league: requestedLeague,
      matchCount: 0,
      results: [],
      note: pullingAll ? "SportyBet's board is empty right now (checked live just now)." : "SportyBet isn't currently listing this league (checked live just now).",
    });
  }

  const truncated = pullingAll && liveMatches.length > MAX_MATCHES_WHEN_ALL;
  const matchesToAnalyze = truncated ? liveMatches.slice(0, MAX_MATCHES_WHEN_ALL) : liveMatches;

  const results = await Promise.all(
    matchesToAnalyze.map(async (sportyMatch) => {
      try {
        const [home, away] = await Promise.all([
          fetchTeamDataByName(sportyMatch.homeTeam),
          fetchTeamDataByName(sportyMatch.awayTeam),
        ]);

        const homeMerged = mergeMatches(home.results);
        const awayMerged = mergeMatches(away.results);
        if (homeMerged.length === 0 || awayMerged.length === 0) {
          return {
            homeTeam: sportyMatch.homeTeam,
            awayTeam: sportyMatch.awayTeam,
            supported: false,
            reason: "Not enough data was found for one or both teams (name mismatch against FotMob, or genuinely no recent matches)",
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
          league: home.resolvedLeague ?? home.fotmobLeagueName ?? away.resolvedLeague ?? away.fotmobLeagueName ?? null,
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
    league: requestedLeague,
    matchCount: liveMatches.length,
    analyzedCount: results.filter((r) => r.supported).length,
    truncatedTo: truncated ? MAX_MATCHES_WHEN_ALL : null,
    results,
  });
}
