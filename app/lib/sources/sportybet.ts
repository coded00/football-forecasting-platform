// SportyBet (Nigeria) integration. Confirmed live during research (2026-08-17):
// - `/ng/lite/betslip` is a plain server-rendered HTML page, no login, no JS —
//   verified both the empty form and the error-on-invalid-code response.
// - The populated-slip markup (`.m-betslip-list-row` etc.) was confirmed from a
//   guest session after manually adding a selection — NOT from a successful
//   booking-code load specifically (every test code was expired). Since both
//   cases render through the same `/ng/lite/betslip` template, this is a
//   reasonable inference, not a directly observed fact — verify against a real
//   current code before trusting this in a decision that matters.
// - Adding a selection to a guest slip works via a plain link with
//   eventId/marketId/outcomeId/odds query params, no auth required.
// - Generating a NEW share code requires an authenticated session and has no
//   confirmed plain-HTTP path — see the separate local automation tool.
const BASE_URL = "https://www.sportybet.com/ng/lite";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

export interface SportyBetSelection {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  outcomeLabel: string;
  odds: number;
  eventId: string;
  marketId: string;
  outcomeId: string;
}

function decodeSelections(html: string): SportyBetSelection[] {
  const rows = html.split('class="m-betslip-list-row"').slice(1);
  const selections: SportyBetSelection[] = [];

  for (const row of rows) {
    const textMatch = row.match(/m-outcome-text-wrap">([^<]+)</);
    const marketMatch = row.match(/m-market-desc">([^<]+)</);
    const outcomeLabelMatch = row.match(/m-outcome-desc-left">[\s\S]*?<span>([^<]+)<\/span>/);
    const oddsMatch = row.match(/m-outcome-desc-right">[\s\S]*?<span>([^<]+)<\/span>/);
    const idsMatch = row.match(/eventId=([^&]+)&(?:amp;)?[\s\S]*?marketId=([^&]+)&(?:amp;)?[\s\S]*?outcomeId=([^&"]+)/);

    if (!textMatch || !marketMatch || !idsMatch) continue;

    // Observed format: "{gameId} {homeTeam} <span>v</span> {awayTeam}" — the
    // `v` is inside a nested span the regex above doesn't capture, so parse it
    // out of the surrounding row text instead of the already-matched group.
    const vMatch = row.match(/m-outcome-text-wrap">(\d+)\s+(.+?)\s*<span>v<\/span>\s*(.+?)<\/div>/);
    if (!vMatch) continue;

    selections.push({
      gameId: vMatch[1],
      homeTeam: vMatch[2].trim(),
      awayTeam: vMatch[3].trim(),
      market: marketMatch[1].trim(),
      outcomeLabel: outcomeLabelMatch?.[1]?.trim() ?? "",
      odds: Number(oddsMatch?.[1] ?? 0),
      eventId: decodeURIComponent(idsMatch[1]),
      marketId: decodeURIComponent(idsMatch[2]),
      outcomeId: decodeURIComponent(idsMatch[3]),
    });
  }

  return selections;
}

export async function decodeBookingCode(code: string): Promise<SportyBetSelection[]> {
  const response = await fetch(`${BASE_URL}/betslip`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: `shareCode=1&shareCodeContent=${encodeURIComponent(code)}`,
  });
  if (!response.ok) throw new Error(`SportyBet betslip request failed: ${response.status}`);

  const html = await response.text();
  if (html.includes('class="m-error"') && html.includes("The code is invalid")) {
    throw new Error(`SportyBet booking code "${code}" is invalid or expired`);
  }

  const selections = decodeSelections(html);
  if (selections.length === 0) {
    throw new Error(`Could not parse any selections from booking code "${code}" — page structure may differ from what was verified`);
  }
  return selections;
}

interface PublicMatchListing {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  odds1X2: { home?: number; draw?: number; away?: number };
}

// Confirmed live: `/ng/lite/preMatch?sportId=sr:sport:1&timeId=1` is a public,
// unauthenticated page listing upcoming football matches (a broad window —
// observed spanning 17/08 through 02/09 in one response, not just "today")
// with real `sr:match:...` event IDs in plain HTML. Used here to map "Arsenal
// vs Chelsea" (our system's team names) to SportyBet's own match ID for Flow 1
// (analysis → new ticket).
//
// Competitions are grouped under a header like "England - Premier League"
// (confirmed pattern from real headers seen live: "Malta - Premier League",
// "Turkiye - Super Lig", etc. — the exact label text for our 5 leagues
// specifically was NOT observed, since none had matches in the window tested;
// this assumes the same "{Country} - {League}" convention holds). Matching is
// scoped to the right competition block first, THEN by team name within it —
// without that scoping, a blind whole-page text search risks matching a
// same-named team in the wrong country's league entirely (this was caught
// live: the unscoped version would have searched across "Malta - Premier
// League" too).
const SPORTYBET_COMPETITION_LABELS: Record<string, string> = {
  "Premier League": "England - Premier League",
  Championship: "England - Championship",
  "League One": "England - League One",
  "La Liga": "Spain - LaLiga",
  "Ligue 1": "France - Ligue 1",
};

function parseOddsBlock(block: string): { home?: number; draw?: number; away?: number } {
  const oddsByOutcome: Record<string, number> = {};
  const oddsMatches = block.matchAll(/marketId=1&(?:amp;)?outcomeId=([123])&(?:amp;)?selected=\d&(?:amp;)?odds=([\d.]+)/g);
  for (const m of oddsMatches) oddsByOutcome[m[1]] = Number(m[2]);
  return { home: oddsByOutcome["1"], draw: oddsByOutcome["2"], away: oddsByOutcome["3"] };
}

function parseTeamsFromBlock(block: string): { homeTeam: string; awayTeam: string } | undefined {
  const teams = block.match(/m-team-name m-left-text">([^<]+)<\/div>\s*<\/div>\s*<div class="m-away-team[^>]*>\s*<div class="m-team-name m-left-text">([^<]+)</);
  if (teams) return { homeTeam: teams[1].trim(), awayTeam: teams[2].trim() };
  // Fallback: simpler two-name extraction if the away-team wrapper markup differs slightly.
  const names = [...block.matchAll(/m-team-name m-left-text">([^<]+)</g)].map((m) => m[1].trim());
  if (names.length >= 2) return { homeTeam: names[0], awayTeam: names[1] };
  return undefined;
}

async function fetchScopedListingHtml(league?: string): Promise<string | undefined> {
  const response = await fetch(`${BASE_URL}/preMatch?sportId=sr:sport:1&timeId=1`, { headers: HEADERS });
  if (!response.ok) throw new Error(`SportyBet match listing request failed: ${response.status}`);
  const html = await response.text();

  const competitionLabel = league ? SPORTYBET_COMPETITION_LABELS[league] : undefined;
  if (!competitionLabel) return html;

  const competitionBlocks = html.split(/(?=m-item-title">)/);
  return competitionBlocks.find((b) => b.startsWith(`m-item-title">${competitionLabel}`));
}

export async function findSportyBetMatch(
  homeTeam: string,
  awayTeam: string,
  league?: string
): Promise<PublicMatchListing | undefined> {
  const scopedHtml = await fetchScopedListingHtml(league);
  if (!scopedHtml) return undefined; // that competition has no matches in this window

  const blocks = scopedHtml.split(/(?=eventId=sr:match:\d+)/).filter((b) => b.includes("eventId=sr:match:"));
  for (const block of blocks) {
    const idMatch = block.match(/eventId=(sr:match:\d+)/);
    if (!idMatch) continue;
    const lowerBlock = block.toLowerCase();
    if (lowerBlock.includes(homeTeam.toLowerCase()) && lowerBlock.includes(awayTeam.toLowerCase())) {
      return { eventId: idMatch[1], homeTeam, awayTeam, odds1X2: parseOddsBlock(block) };
    }
  }
  return undefined;
}

// Lists every match SportyBet currently offers for a league, with real team
// names as SportyBet spells them — the point being nobody has to type a team
// name in first. Feeds directly into an "auto ticket" flow: pull what's live,
// analyze all of it, no manual entry.
export async function listSportyBetMatchesForLeague(league: string): Promise<PublicMatchListing[]> {
  const scopedHtml = await fetchScopedListingHtml(league);
  if (!scopedHtml) return [];

  const blocks = scopedHtml.split(/(?=eventId=sr:match:\d+)/).filter((b) => b.includes("eventId=sr:match:"));
  const matches: PublicMatchListing[] = [];
  const seenEventIds = new Set<string>();

  for (const block of blocks) {
    const idMatch = block.match(/eventId=(sr:match:\d+)/);
    const teams = parseTeamsFromBlock(block);
    if (!idMatch || !teams || seenEventIds.has(idMatch[1])) continue;
    seenEventIds.add(idMatch[1]);
    matches.push({ eventId: idMatch[1], homeTeam: teams.homeTeam, awayTeam: teams.awayTeam, odds1X2: parseOddsBlock(block) });
  }

  return matches;
}
