import type { LeagueName } from "../config";
import { fetchWithTimeout } from "../httpTimeout";
import type { NormalizedMatch } from "./types";

// football-data.co.uk has no per-team endpoint — only whole-season CSVs — so a
// per-team fetch means downloading the season file(s) and filtering client-side.
// See DATA_SOURCES.md's Architecture Pivot note.
const LEAGUE_CODES: Record<LeagueName, string> = {
  "Premier League": "E0",
  Championship: "E1",
  "League One": "E2",
  "La Liga": "SP1",
  "Ligue 1": "F1",
};

function currentSeasonStartYear(now: Date): number {
  const month = now.getMonth() + 1; // 1-12
  return month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

function seasonCode(startYear: number): string {
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  const startYearShort = String(startYear % 100).padStart(2, "0");
  return `${startYearShort}${endYearShort}`;
}

function recentSeasonCodes(seasonsBack: number, now = new Date()): string[] {
  const start = currentSeasonStartYear(now);
  return Array.from({ length: seasonsBack }, (_, i) => seasonCode(start - i));
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toIsoDate(ddmmyyyy: string): string {
  // football-data.co.uk uses dd/mm/yy or dd/mm/yyyy depending on season
  const [d, m, y] = ddmmyyyy.split("/");
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function num(value: string): number | undefined {
  if (value === "" || value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

export async function fetchFootballDataMatches(
  team: string,
  league: LeagueName,
  seasonsBack = 2
): Promise<NormalizedMatch[]> {
  const code = LEAGUE_CODES[league];
  if (!code) throw new Error(`Unknown league for football-data.co.uk: ${league}`);

  const seasons = recentSeasonCodes(seasonsBack);
  const rowsPerSeason = await Promise.all(
    seasons.map(async (season) => {
      const url = `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;
      const response = await fetchWithTimeout(url);
      if (!response.ok) return []; // older/newer seasons may 404 for lower leagues — skip, don't fail the request
      return parseCsv(await response.text());
    })
  );

  const matches: NormalizedMatch[] = [];
  for (const rows of rowsPerSeason) {
    for (const row of rows) {
      const isHome = row.HomeTeam === team;
      const isAway = row.AwayTeam === team;
      if (!isHome && !isAway) continue;

      matches.push({
        source: "football_data",
        date: toIsoDate(row.Date),
        opponent: isHome ? row.AwayTeam : row.HomeTeam,
        isHome,
        goalsFor: Number(isHome ? row.FTHG : row.FTAG),
        goalsAgainst: Number(isHome ? row.FTAG : row.FTHG),
        htGoalsFor: num(isHome ? row.HTHG : row.HTAG),
        htGoalsAgainst: num(isHome ? row.HTAG : row.HTHG),
        shotsFor: num(isHome ? row.HS : row.AS),
        shotsAgainst: num(isHome ? row.AS : row.HS),
        shotsOnTargetFor: num(isHome ? row.HST : row.AST),
        shotsOnTargetAgainst: num(isHome ? row.AST : row.HST),
        cornersFor: num(isHome ? row.HC : row.AC),
        cornersAgainst: num(isHome ? row.AC : row.HC),
      });
    }
  }

  return matches.sort((a, b) => a.date.localeCompare(b.date));
}
