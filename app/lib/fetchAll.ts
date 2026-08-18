import { LEAGUE_DATA_SOURCES, type LeagueName } from "./config";
import { fetchApiFootballTeamMatches } from "./sources/apiFootball";
import { fetchFootballDataMatches } from "./sources/footballData";
import { fetchFotmobTeamMatches } from "./sources/fotmob";
import { searchFotmobTeamsRobust } from "./sources/fotmobSearch";
import { fetchUnderstatTeamMatches } from "./sources/understat";
import type { FetchResult, NormalizedMatch, SourceName } from "./sources/types";
import { FOTMOB_ID_TO_LEAGUE, resolveApiFootballTeamId, resolveFotmobTeamId, resolveUnderstatSlug } from "./teamResolution";

function currentSeasonStartYear(now = new Date()): number {
  const month = now.getMonth() + 1; // 1-12
  return month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// Wraps one source's fetch so a single source failing (down, ToS-blocked,
// league not covered) never fails the whole request — PRD §27's Data Source
// Status is built from exactly these per-source results.
async function safeFetch(source: SourceName, run: () => Promise<NormalizedMatch[]>): Promise<FetchResult> {
  try {
    return { source, matches: await run() };
  } catch (error) {
    return { source, matches: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchTeamDataFromAllSources(teamName: string, league: LeagueName): Promise<FetchResult[]> {
  const sources = LEAGUE_DATA_SOURCES[league];
  const tasks: Promise<FetchResult>[] = [];

  if (sources.includes("football_data")) {
    tasks.push(safeFetch("football_data", () => fetchFootballDataMatches(teamName, league)));
  }

  if (sources.includes("api_football")) {
    tasks.push(
      safeFetch("api_football", async () => {
        const teamId = await resolveApiFootballTeamId(teamName);
        return fetchApiFootballTeamMatches(teamId);
      })
    );
  }

  if (sources.includes("understat")) {
    tasks.push(
      safeFetch("understat", () =>
        fetchUnderstatTeamMatches(resolveUnderstatSlug(teamName), currentSeasonStartYear())
      )
    );
  }

  if (sources.includes("fotmob")) {
    tasks.push(
      safeFetch("fotmob", async () => {
        const teamId = await resolveFotmobTeamId(teamName, league);
        return fetchFotmobTeamMatches(teamId);
      })
    );
  }

  return Promise.all(tasks);
}

export interface GeneralTeamResolution {
  results: FetchResult[];
  resolvedLeague?: LeagueName; // set when the team happens to be in one of our 5 enhanced leagues
  fotmobLeagueName?: string; // FotMob's own label, shown when it's NOT one of the 5 (so it's not silently blank)
}

// The "analyze any match" path (not just our 5 configured leagues). Searches
// FotMob's global team index (confirmed live 2026-08-18 to cover clubs from
// England to Egypt to Argentina to Japan) rather than requiring a
// preconfigured league. If the resolved team happens to sit in one of our 5
// enhanced leagues — detected by FotMob's numeric league ID, never by name,
// since names collide across countries (England/Scotland both have a
// "League One") — this upgrades to the full multi-source pipeline
// (football-data.co.uk + API-Football + FotMob) for free. Otherwise it's
// FotMob alone: fewer corroborating sources, but still a real analysis.
export async function fetchTeamDataByName(teamName: string): Promise<GeneralTeamResolution> {
  const candidates = await searchFotmobTeamsRobust(teamName);
  const best = candidates[0];
  if (!best) {
    return { results: [{ source: "fotmob", matches: [], error: `No FotMob match found for "${teamName}"` }] };
  }

  const knownLeague = best.leagueId !== undefined ? FOTMOB_ID_TO_LEAGUE[best.leagueId] : undefined;
  if (knownLeague) {
    const results = await fetchTeamDataFromAllSources(teamName, knownLeague);
    return { results, resolvedLeague: knownLeague, fotmobLeagueName: best.leagueName };
  }

  const results = [await safeFetch("fotmob", () => fetchFotmobTeamMatches(best.id))];
  return { results, fotmobLeagueName: best.leagueName };
}
