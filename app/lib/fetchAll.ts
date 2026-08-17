import { LEAGUE_DATA_SOURCES, type LeagueName } from "./config";
import { fetchApiFootballTeamMatches } from "./sources/apiFootball";
import { fetchFootballDataMatches } from "./sources/footballData";
import { fetchFotmobTeamMatches } from "./sources/fotmob";
import { fetchUnderstatTeamMatches } from "./sources/understat";
import type { FetchResult, NormalizedMatch, SourceName } from "./sources/types";
import { resolveApiFootballTeamId, resolveFotmobTeamId, resolveUnderstatSlug } from "./teamResolution";

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
