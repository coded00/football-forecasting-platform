import type { LeagueName } from "../config";
import { FOTMOB_LEAGUE_IDS } from "../teamResolution";
import { fetchFotmobNextData } from "./fotmobShared";

// League-wide browsing (6.4) — table/roster and full-season fixtures, both
// confirmed live from the same FotMob league overview page already used for
// team-ID resolution (teamResolution.ts). One extra fetch reused for two
// purposes: `pageProps.table` for standings/roster, `pageProps.fixtures` for
// the full season's matches (past and upcoming, distinguished by
// `status.finished`) — verified live 2026-08-17 for Premier League (380
// matches = 20 teams × 19 rounds × 2, as expected).
export interface LeagueTableRow {
  id: number;
  name: string;
  shortName?: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalConDiff: number;
}

export interface LeagueFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  finished: boolean;
  homeScore?: number;
  awayScore?: number;
}

export async function fetchLeagueTable(league: LeagueName): Promise<LeagueTableRow[]> {
  const data = await fetchFotmobNextData(`/leagues/${FOTMOB_LEAGUE_IDS[league]}/overview`);
  const rows: any[] = data?.props?.pageProps?.table?.[0]?.data?.table?.all ?? [];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.shortName,
    position: r.idx,
    played: r.played,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    points: r.pts,
    goalConDiff: r.goalConDiff,
  }));
}

export async function fetchLeagueFixtures(league: LeagueName): Promise<LeagueFixture[]> {
  const data = await fetchFotmobNextData(`/leagues/${FOTMOB_LEAGUE_IDS[league]}/overview`);
  const matches: any[] = data?.props?.pageProps?.fixtures?.allMatches ?? [];

  return matches.map((m) => ({
    id: m.id,
    homeTeam: m.home.name,
    awayTeam: m.away.name,
    homeTeamId: m.home.id,
    awayTeamId: m.away.id,
    kickoff: m.status.utcTime,
    finished: m.status.finished,
    homeScore: m.home.score,
    awayScore: m.away.score,
  }));
}
