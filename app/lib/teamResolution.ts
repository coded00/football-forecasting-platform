import type { LeagueName } from "./config";
import { fetchFotmobNextData } from "./sources/fotmobShared";

// Resolves a canonical team name (whatever the user types/selects) to each
// source's own identifier, live, rather than a static ID table. A hand-maintained
// table of API-Football/FotMob numeric IDs would be guesswork without querying
// their APIs directly to confirm each one — those IDs are arbitrary and assigned
// by each provider, not derivable from the name. Understat is the one exception:
// it has no search endpoint, so its slug is derived from the name directly.

function apiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");
  return key;
}

// ASSUMPTION, unverified live in this session: API-Football's /teams endpoint
// accepts a `search` query param that matches on team name. This is the standard
// pattern for their other endpoints but the docs were unreachable (Cloudflare)
// during DATA_SOURCES.md's research pass — confirm on first real call.
export async function resolveApiFootballTeamId(teamName: string): Promise<number> {
  const url = new URL("https://v3.football.api-sports.io/teams");
  url.searchParams.set("search", teamName);

  const response = await fetch(url, { headers: { "x-apisports-key": apiKey() } });
  if (!response.ok) throw new Error(`API-Football team search failed: ${response.status}`);

  const body = (await response.json()) as { response: { team: { id: number; name: string } }[] };
  const match = body.response.find((entry) => entry.team.name.toLowerCase() === teamName.toLowerCase());
  if (!match) throw new Error(`No API-Football team match for "${teamName}"`);
  return match.team.id;
}

// Understat slugs are the team's display name with spaces replaced by underscores.
// This override map covers the cases known to differ from that simple rule;
// it is not exhaustive — verify a given team's slug against a live page if a
// fetch for it 404s.
const UNDERSTAT_SLUG_OVERRIDES: Record<string, string> = {
  "Manchester United": "Manchester_United",
  "Manchester City": "Manchester_City",
  "Newcastle United": "Newcastle_United",
  "Nottingham Forest": "Nottingham_Forest",
  "West Ham United": "West_Ham",
  "Wolverhampton Wanderers": "Wolverhampton_Wanderers",
};

export function resolveUnderstatSlug(teamName: string): string {
  return UNDERSTAT_SLUG_OVERRIDES[teamName] ?? teamName.replace(/ /g, "_");
}

// FotMob's site search is client-side only (confirmed live: the /search page's
// __NEXT_DATA__ has no embedded results, so the actual lookup happens via a JS
// fetch this implementation can't see). The league table page turned out to be
// a better resolution mechanism anyway — it's scoped to the right competition
// (no cross-league name collisions) and, like the team/match pages, embeds its
// data directly via __NEXT_DATA__. League IDs below were each verified live
// against fotmob.com (2026-08-16), not guessed from memory.
const FOTMOB_LEAGUE_IDS: Record<LeagueName, number> = {
  "Premier League": 47,
  Championship: 48,
  "League One": 108,
  "La Liga": 87,
  "Ligue 1": 53,
};

export async function resolveFotmobTeamId(teamName: string, league: LeagueName): Promise<number> {
  const data = await fetchFotmobNextData(`/leagues/${FOTMOB_LEAGUE_IDS[league]}/overview`);
  const teams: { id: number; name: string; shortName?: string }[] = data?.props?.pageProps?.table?.[0]?.data?.table?.all ?? [];

  const match = teams.find(
    (t) => t.name.toLowerCase() === teamName.toLowerCase() || t.shortName?.toLowerCase() === teamName.toLowerCase()
  );
  if (!match) throw new Error(`No FotMob team match for "${teamName}" in ${league}`);
  return match.id;
}
