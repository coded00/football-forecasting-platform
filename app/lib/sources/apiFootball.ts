import { fetchWithTimeout } from "../httpTimeout";
import type { NormalizedMatch } from "./types";

const BASE_URL = "https://v3.football.api-sports.io";

function apiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");
  return key;
}

async function apiFootballGet<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const url = new URL(`${BASE_URL}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetchWithTimeout(url, { headers: { "x-apisports-key": apiKey() } });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`API-Football ${path} failed: ${response.status}`);
    const body = (await response.json()) as { response: T[]; errors: unknown };
    if (Array.isArray(body.errors) ? body.errors.length > 0 : Boolean(body.errors && Object.keys(body.errors).length)) {
      throw new Error(`API-Football error for ${path}: ${JSON.stringify(body.errors)}`);
    }
    return body.response;
  }
  throw new Error(`API-Football rate limit exceeded after retries: ${path}`);
}

interface ApiFootballFixture {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
}

interface ApiFootballStatEntry {
  team: { id: number };
  statistics: { type: string; value: number | string | null }[];
}

function statValue(stats: ApiFootballStatEntry[], teamId: number, type: string): number | undefined {
  const entry = stats.find((s) => s.team.id === teamId);
  const stat = entry?.statistics.find((s) => s.type === type);
  if (stat?.value === null || stat?.value === undefined) return undefined;
  if (typeof stat.value === "number") return stat.value;
  const parsed = Number(String(stat.value).replace("%", ""));
  return Number.isNaN(parsed) ? undefined : parsed;
}

// NOTE: this issues one extra request per fixture to fetch match statistics —
// on the free tier (100 req/day) fetching stats for `last=20` burns 21 requests
// for one team. Fine for occasional use, but don't loop this over many teams
// without checking your remaining quota. `includeFormations` (4.3) adds a
// second extra request per fixture (lineups) on top of that — opt-in, since
// most callers (Phase 2/3's core stats) don't need it and it's purely
// informational context, not fed into the prediction model.
export async function fetchApiFootballTeamMatches(
  teamId: number,
  last = 20,
  options: { includeFormations?: boolean } = {}
): Promise<NormalizedMatch[]> {
  const fixtures = await apiFootballGet<ApiFootballFixture>("fixtures", { team: teamId, last });

  const matches = await Promise.all(
    fixtures.map(async (fixture) => {
      const isHome = fixture.teams.home.id === teamId;
      const opponent = isHome ? fixture.teams.away.name : fixture.teams.home.name;
      const goalsFor = (isHome ? fixture.goals.home : fixture.goals.away) ?? 0;
      const goalsAgainst = (isHome ? fixture.goals.away : fixture.goals.home) ?? 0;

      let stats: ApiFootballStatEntry[] = [];
      try {
        stats = await apiFootballGet<ApiFootballStatEntry>("fixtures/statistics", { fixture: fixture.fixture.id });
      } catch {
        // statistics can be genuinely absent for older/lower-tier fixtures — proceed without them
      }

      let formation: string | undefined;
      if (options.includeFormations) {
        try {
          const lineups = await fetchApiFootballLineups(fixture.fixture.id);
          formation = lineups.find((l) => l.teamId === teamId)?.formation;
        } catch {
          // lineups can be missing for the same reasons statistics can be — proceed without it
        }
      }

      const match: NormalizedMatch = {
        source: "api_football",
        date: fixture.fixture.date.slice(0, 10),
        opponent,
        isHome,
        goalsFor,
        goalsAgainst,
        htGoalsFor: (isHome ? fixture.score.halftime.home : fixture.score.halftime.away) ?? undefined,
        htGoalsAgainst: (isHome ? fixture.score.halftime.away : fixture.score.halftime.home) ?? undefined,
        shotsFor: statValue(stats, teamId, "Total Shots"),
        shotsOnTargetFor: statValue(stats, teamId, "Shots on Goal"),
        cornersFor: statValue(stats, teamId, "Corner Kicks"),
        possessionFor: statValue(stats, teamId, "Ball Possession"),
        formation,
      };
      return match;
    })
  );

  return matches.sort((a, b) => a.date.localeCompare(b.date));
}

export interface ApiFootballLineup {
  teamId: number;
  formation: string;
}

export async function fetchApiFootballLineups(fixtureId: number): Promise<ApiFootballLineup[]> {
  const lineups = await apiFootballGet<{ team: { id: number }; formation: string }>("fixtures/lineups", {
    fixture: fixtureId,
  });
  return lineups.map((l) => ({ teamId: l.team.id, formation: l.formation }));
}

export interface ApiFootballTransfer {
  playerName: string;
  date: string;
  teamInId: number;
  teamOutId: number;
  type: string | null;
}

export async function fetchApiFootballTransfers(teamId: number): Promise<ApiFootballTransfer[]> {
  const response = await apiFootballGet<{
    player: { name: string };
    transfers: { date: string; type: string | null; teams: { in: { id: number }; out: { id: number } } }[];
  }>("transfers", { team: teamId });

  return response.flatMap((entry) =>
    entry.transfers.map((t) => ({
      playerName: entry.player.name,
      date: t.date,
      teamInId: t.teams.in.id,
      teamOutId: t.teams.out.id,
      type: t.type,
    }))
  );
}

export interface ApiFootballManagerTenure {
  managerName: string;
  teamId: number;
  start: string;
  end: string | null;
}

export async function fetchApiFootballManagerHistory(teamId: number): Promise<ApiFootballManagerTenure[]> {
  const coaches = await apiFootballGet<{
    name: string;
    career: { team: { id: number }; start: string; end: string | null }[];
  }>("coachs", { team: teamId });

  return coaches.flatMap((coach) =>
    coach.career
      .filter((c) => c.team.id === teamId)
      .map((c) => ({ managerName: coach.name, teamId: c.team.id, start: c.start, end: c.end }))
  );
}
