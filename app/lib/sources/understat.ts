import type { NormalizedMatch } from "./types";

// CONFIRMED DEAD END (Phase 6 live test, 2026-08-16): a direct HTTP fetch of
// https://understat.com/team/Arsenal/2025 returns a real 200 OK page (correct
// title, correct team dropdown) but contains NO `datesData`/`statisticsData`
// JSON.parse('...') block anywhere in the response — only an ad-related
// JSON.parse for an unrelated "PROMOTION" variable. The hex-escape decoding
// below is correct (verified against that unrelated block), but there's simply
// no match data to decode via plain HTTP anymore. This is consistent with
// Understat's `robots.txt: Disallow: /` being a real technical signal, not just
// legal boilerplate — the data likely now requires JS execution (headless
// browser) or is being withheld from non-browser requests specifically.
// Not currently used by config.ts's LEAGUE_DATA_SOURCES (see its comment) —
// kept here in case headless-browser fetching (Playwright/Puppeteer) is added
// later, which is a real option but was not pursued now given the added
// dependency weight and cold-start cost in a serverless function.
interface UnderstatRawMatch {
  isResult: boolean;
  side: "h" | "a";
  goals: { h: string; a: string };
  xG: { h: string; a: string };
  datetime: string;
  a: { title: string };
  h: { title: string };
}

function decodeHexEscapedJson(raw: string): unknown {
  const decoded = raw.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return JSON.parse(decoded);
}

function extractVariable(html: string, variableName: string): unknown {
  const pattern = new RegExp(`var\\s+${variableName}\\s*=\\s*JSON\\.parse\\('(.+?)'\\);`);
  const match = html.match(pattern);
  if (!match) throw new Error(`Could not find ${variableName} in Understat page`);
  return decodeHexEscapedJson(match[1]);
}

// `teamSlug` is Understat's URL slug for the team (e.g. "Manchester_United") —
// resolving canonical team name -> slug is 1.4's job, not this fetcher's.
export async function fetchUnderstatTeamMatches(teamSlug: string, seasonStartYear: number): Promise<NormalizedMatch[]> {
  const url = `https://understat.com/team/${teamSlug}/${seasonStartYear}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Understat fetch failed: ${response.status}`);
  const html = await response.text();

  const rawMatches = extractVariable(html, "datesData") as UnderstatRawMatch[];

  return rawMatches
    .filter((m) => m.isResult)
    .map((m) => {
      const isHome = m.side === "h";
      return {
        source: "understat" as const,
        date: m.datetime.slice(0, 10),
        opponent: isHome ? m.a.title : m.h.title,
        isHome,
        goalsFor: Number(isHome ? m.goals.h : m.goals.a),
        goalsAgainst: Number(isHome ? m.goals.a : m.goals.h),
        xgFor: Number(isHome ? m.xG.h : m.xG.a),
        xgAgainst: Number(isHome ? m.xG.a : m.xG.h),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
