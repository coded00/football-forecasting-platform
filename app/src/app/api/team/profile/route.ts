import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { computeMomentum } from "@lib/analytics/momentum";
import { mergeMatches } from "@lib/analytics/mergeMatches";
import { computeFormWindows, computeVenueSplits } from "@lib/analytics/teamStats";
import { fetchTeamDataFromAllSources } from "@lib/fetchAll";
import { fetchLeagueFixtures } from "@lib/sources/fotmobLeague";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

export async function GET(request: NextRequest) {
  const team = request.nextUrl.searchParams.get("team");
  const league = request.nextUrl.searchParams.get("league");

  if (!team || !league || !VALID_LEAGUES.includes(league as LeagueName)) {
    return NextResponse.json(
      { error: `team and league query params are required, league one of ${VALID_LEAGUES.join(", ")}` },
      { status: 400 }
    );
  }

  const [results, fixtures] = await Promise.all([
    fetchTeamDataFromAllSources(team, league as LeagueName),
    fetchLeagueFixtures(league as LeagueName).catch(() => []),
  ]);

  const merged = mergeMatches(results);
  if (merged.length === 0) {
    return NextResponse.json(
      { error: `Not enough data was found for "${team}" in ${league}`, dataSourceStatus: results.map((r) => ({ source: r.source, matchesFound: r.matches.length, error: r.error ?? null })) },
      { status: 422 }
    );
  }

  const venueSplits = computeVenueSplits(merged);
  const formWindows = computeFormWindows(merged);
  const momentum = computeMomentum(formWindows.last5, formWindows.overall);

  // Name matching against FotMob's fixture list is substring-based, same
  // entity-resolution caveat as everywhere else — a team name that doesn't
  // closely match FotMob's spelling just won't show upcoming fixtures.
  const upcomingFixtures = fixtures
    .filter((f) => !f.finished && (f.homeTeam.toLowerCase().includes(team.toLowerCase()) || f.awayTeam.toLowerCase().includes(team.toLowerCase())))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 10);

  return NextResponse.json({
    team,
    league,
    venueSplits,
    formWindows,
    momentum,
    upcomingFixtures,
    dataSourceStatus: results.map((r) => ({ source: r.source, matchesFound: r.matches.length, error: r.error ?? null })),
  });
}
