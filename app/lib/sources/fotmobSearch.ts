// General team/league search, confirmed live 2026-08-18 — this is what makes
// "any match, not just our 5 leagues" possible. `www.fotmob.com/api/searchapi`
// 404s (that's a different host); the real endpoint is on FotMob's API
// gateway subdomain and needs no auth. Verified against Arsenal (England),
// Al Ahly (Egypt), River Plate (Argentina), and Yokohama F.Marinos (Japan) —
// genuinely global, not just major European clubs.
//
// IMPORTANT: league names collide across countries ("League One" exists for
// both England and Scotland, "Ligue 1" for France and Algeria) — never match
// on name alone. Match on the numeric `leagueId` FotMob returns instead.
const SEARCH_URL = "https://apigw.fotmob.com/searchapi/suggest";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

export interface FotmobTeamSuggestion {
  id: number;
  name: string;
  leagueId?: number;
  leagueName?: string;
}

export interface FotmobLeagueSuggestion {
  id: number;
  name: string;
  countryCode?: string;
}

async function suggest(term: string): Promise<any> {
  const response = await fetch(`${SEARCH_URL}?term=${encodeURIComponent(term)}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`FotMob search failed: ${response.status}`);
  return response.json();
}

export async function searchFotmobTeams(term: string): Promise<FotmobTeamSuggestion[]> {
  const body = await suggest(term);
  const options: any[] = body?.teamSuggest?.[0]?.options ?? [];
  return options.map((o) => ({
    id: Number(o.payload.id),
    name: String(o.text).split("|")[0],
    leagueId: o.payload.leagueId !== undefined ? Number(o.payload.leagueId) : undefined,
    leagueName: o.payload.leagueName,
  }));
}

export async function searchFotmobLeagues(term: string): Promise<FotmobLeagueSuggestion[]> {
  const body = await suggest(term);
  const options: any[] = body?.leagueSuggest?.[0]?.options ?? [];
  return options.map((o) => ({
    id: Number(o.payload.id),
    name: String(o.text).split("|")[0],
    countryCode: o.payload.countryCode,
  }));
}

// CONFIRMED live (2026-08-18): FotMob's search is fairly literal and misses on
// the fuller club-name conventions other sources use — "FK Zenit Saint
// Petersburg" (SportyBet's naming) returns zero results, but "Zenit" alone
// finds "Zenit St. Petersburg" immediately. This cost real, well-covered
// clubs (Zenit, Spartak Moscow, Krasnodar) analysis when pulling SportyBet's
// full board — not a data gap, a name-matching gap. This fallback chain
// (full name → strip a generic prefix token → first word of what's left)
// recovered all 7 real failures tested. It won't catch everything — this is
// a bounded heuristic, not a real fuzzy-matching system — but it's a
// meaningful, verified improvement over a single literal search.
const GENERIC_PREFIXES = new Set(["FK", "PFK", "RFK", "FC", "SC", "AC", "AS", "CD", "CA", "SS", "UD", "CF", "CS"]);

function stripLeadingPrefix(name: string): string | undefined {
  const tokens = name.split(" ");
  if (tokens.length <= 1) return undefined;
  const first = tokens[0].toUpperCase().replace(/\.$/, "");
  return GENERIC_PREFIXES.has(first) ? tokens.slice(1).join(" ") : undefined;
}

export async function searchFotmobTeamsRobust(term: string): Promise<FotmobTeamSuggestion[]> {
  const direct = await searchFotmobTeams(term);
  if (direct.length > 0) return direct;

  const stripped = stripLeadingPrefix(term);
  if (stripped) {
    const strippedResults = await searchFotmobTeams(stripped);
    if (strippedResults.length > 0) return strippedResults;
  }

  const base = stripped ?? term;
  const firstWord = base.split(" ")[0];
  if (firstWord && firstWord !== base) {
    return searchFotmobTeams(firstWord);
  }
  return [];
}
