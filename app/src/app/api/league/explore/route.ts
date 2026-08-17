import { NextRequest, NextResponse } from "next/server";
import type { LeagueName } from "@lib/config";
import { fetchLeagueFixtures, fetchLeagueTable } from "@lib/sources/fotmobLeague";

const VALID_LEAGUES: LeagueName[] = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"];

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");
  if (!league || !VALID_LEAGUES.includes(league as LeagueName)) {
    return NextResponse.json({ error: `league query param is required, one of ${VALID_LEAGUES.join(", ")}` }, { status: 400 });
  }

  try {
    const [table, fixtures] = await Promise.all([
      fetchLeagueTable(league as LeagueName),
      fetchLeagueFixtures(league as LeagueName),
    ]);

    const upcomingFixtures = fixtures
      .filter((f) => !f.finished)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .slice(0, 20);

    return NextResponse.json({ league, table: table.sort((a, b) => a.position - b.position), upcomingFixtures });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
