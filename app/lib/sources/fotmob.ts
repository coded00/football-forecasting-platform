import type { NormalizedMatch } from "./types";
import { fetchFotmobNextData } from "./fotmobShared";

// Its ToS explicitly forbids this (see DATA_SOURCES.md) — use lightly, don't
// cache long-term or redistribute, and revisit for a licensed replacement once
// revenue justifies it. Every field path below was verified against live
// responses during Phase 6 testing (2026-08-16), not guessed — see
// fotmobShared.ts for why __NEXT_DATA__ parsing is used instead of the old
// (now-dead) `/api/*` endpoints.
interface FotmobFixture {
  id: number;
  pageUrl: string;
  home: { id: number; name: string; score?: number };
  away: { id: number; name: string; score?: number };
  status: { finished: boolean; utcTime?: string };
}

function extractStatPair(statGroups: any[], statTitle: string): [string, string] | undefined {
  for (const group of statGroups ?? []) {
    const stat = group?.stats?.find((s: any) => s.title === statTitle);
    if (stat?.stats && stat.stats[0] !== undefined) return stat.stats;
  }
  return undefined;
}

function parseStatNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isNaN(parsed) ? undefined : parsed;
}

interface RawMatchStats {
  xgHome?: number;
  xgAway?: number;
  shotsHome?: number;
  shotsAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  cornersHome?: number;
  cornersAway?: number;
  possessionHome?: number;
  possessionAway?: number;
}

// Named home/away rather than for/against here — this is the raw page's
// perspective, not the requested team's. fetchFotmobTeamMatches maps these to
// for/against based on which side the team actually played on.
async function fetchMatchStats(pageUrl: string): Promise<RawMatchStats> {
  const path = pageUrl.split("#")[0]; // the #fragment is a client-side anchor, not needed server-side
  const data = await fetchFotmobNextData(path);
  const statGroups = data?.props?.pageProps?.content?.stats?.Periods?.All?.stats;

  const xg = extractStatPair(statGroups, "Expected goals (xG)");
  const shots = extractStatPair(statGroups, "Total shots");
  const shotsOnTarget = extractStatPair(statGroups, "Shots on target");
  const corners = extractStatPair(statGroups, "Corners");
  const possession = extractStatPair(statGroups, "Ball possession");

  return {
    xgHome: parseStatNumber(xg?.[0]),
    xgAway: parseStatNumber(xg?.[1]),
    shotsHome: parseStatNumber(shots?.[0]),
    shotsAway: parseStatNumber(shots?.[1]),
    shotsOnTargetHome: parseStatNumber(shotsOnTarget?.[0]),
    shotsOnTargetAway: parseStatNumber(shotsOnTarget?.[1]),
    cornersHome: parseStatNumber(corners?.[0]),
    cornersAway: parseStatNumber(corners?.[1]),
    possessionHome: parseStatNumber(possession?.[0]),
    possessionAway: parseStatNumber(possession?.[1]),
  };
}

export async function fetchFotmobTeamMatches(teamId: number, limit = 20): Promise<NormalizedMatch[]> {
  const data = await fetchFotmobNextData(`/teams/${teamId}/overview`);
  const team = data?.props?.pageProps?.fallback?.[`team-${teamId}`];
  const fixtures: FotmobFixture[] = team?.fixtures?.allFixtures?.fixtures ?? [];
  const finished = fixtures.filter((f) => f.status?.finished).slice(-limit);

  const matches = await Promise.all(
    finished.map(async (fixture) => {
      const isHome = fixture.home.id === teamId;
      const opponent = isHome ? fixture.away.name : fixture.home.name;
      const goalsFor = (isHome ? fixture.home.score : fixture.away.score) ?? 0;
      const goalsAgainst = (isHome ? fixture.away.score : fixture.home.score) ?? 0;

      let matchStats: Partial<NormalizedMatch> = {};
      try {
        const raw = await fetchMatchStats(fixture.pageUrl);
        matchStats = {
          xgFor: isHome ? raw.xgHome : raw.xgAway,
          xgAgainst: isHome ? raw.xgAway : raw.xgHome,
          shotsFor: isHome ? raw.shotsHome : raw.shotsAway,
          shotsAgainst: isHome ? raw.shotsAway : raw.shotsHome,
          shotsOnTargetFor: isHome ? raw.shotsOnTargetHome : raw.shotsOnTargetAway,
          shotsOnTargetAgainst: isHome ? raw.shotsOnTargetAway : raw.shotsOnTargetHome,
          cornersFor: isHome ? raw.cornersHome : raw.cornersAway,
          cornersAgainst: isHome ? raw.cornersAway : raw.cornersHome,
          possessionFor: isHome ? raw.possessionHome : raw.possessionAway,
        };
      } catch {
        // per-match stats page can fail independently of the fixture list — proceed with just the scoreline
      }

      const match: NormalizedMatch = {
        source: "fotmob",
        date: fixture.status.utcTime?.slice(0, 10) ?? "",
        opponent,
        isHome,
        goalsFor,
        goalsAgainst,
        ...matchStats,
      };
      return match;
    })
  );

  return matches.filter((m) => m.date).sort((a, b) => a.date.localeCompare(b.date));
}
