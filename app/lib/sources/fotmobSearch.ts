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
import { fetchWithTimeout } from "../httpTimeout";

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
  const response = await fetchWithTimeout(`${SEARCH_URL}?term=${encodeURIComponent(term)}`, { headers: HEADERS }, 5000);
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
// the fuller club-name conventions other sources use. Verified failures and
// fixes, all real (not guessed):
//   "FK Zenit Saint Petersburg" (0 results) → "Zenit" → Zenit St. Petersburg
//   "PAE PS Kalamata" (0, TWO leading tokens) → "Kalamata" → resolves
//   "Cerro Porteno SRL" (0, TRAILING token) → "Cerro Porteno" → resolves
//   "SE Palmeiras SP SRL" (0, leading AND two trailing tokens) → "Palmeiras"
// A single-token, leading-only strip (the original version of this function)
// missed the last three. Iteratively stripping generic tokens from BOTH ends
// fixed all of them. Still a bounded heuristic, not real fuzzy matching —
// "Panaitolikos" vs FotMob's "Panetolikos" (a genuine transliteration
// difference) and a couple of others stayed unresolved even after this, and
// that's an honest remaining gap, not something this approach can fix.
const GENERIC_TOKENS = new Set([
  "FK", "PFK", "RFK", "FC", "SC", "AC", "AS", "CD", "CA", "SS", "UD", "CF", "CS",
  "AE", "AO", "APS", "PAE", "PAS", "PS", "SE", "EC", "AD", "CE", "SRL", "SP",
]);

function stripGenericTokens(name: string): string {
  let tokens = name.split(" ");
  while (tokens.length > 1 && GENERIC_TOKENS.has(tokens[0].toUpperCase().replace(/\.$/, ""))) {
    tokens = tokens.slice(1);
  }
  while (tokens.length > 1 && GENERIC_TOKENS.has(tokens[tokens.length - 1].toUpperCase().replace(/\.$/, ""))) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(" ");
}

export async function searchFotmobTeamsRobust(term: string): Promise<FotmobTeamSuggestion[]> {
  const direct = await searchFotmobTeams(term);
  if (direct.length > 0) return direct;

  const stripped = stripGenericTokens(term);
  if (stripped !== term) {
    const strippedResults = await searchFotmobTeams(stripped);
    if (strippedResults.length > 0) return strippedResults;
  }

  const firstWord = stripped.split(" ")[0];
  if (firstWord && firstWord !== stripped) {
    const firstWordResults = await searchFotmobTeams(firstWord);
    if (firstWordResults.length > 0) return firstWordResults;
  }

  return [];
}
