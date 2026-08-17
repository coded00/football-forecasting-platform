import type { SourceName } from "./sources/types";

export type LeagueName = "Premier League" | "Championship" | "League One" | "La Liga" | "Ligue 1";

// Understat was originally the xG source for EPL/La Liga/Ligue 1, with FotMob
// covering Championship/League One. Live testing during Phase 6 confirmed
// Understat no longer embeds match data in a direct HTTP response (its
// `robots.txt: Disallow: /` was a real signal, not just legal boilerplate) —
// see the confirmed-dead-end note in sources/understat.ts. FotMob now covers
// xG for all 5 leagues instead, extending its already-accepted ToS risk
// (see DATA_SOURCES.md) rather than introducing a new dependency.
export const LEAGUE_DATA_SOURCES: Record<LeagueName, SourceName[]> = {
  "Premier League": ["football_data", "api_football", "fotmob"],
  Championship: ["football_data", "api_football", "fotmob"],
  "League One": ["football_data", "api_football", "fotmob"],
  "La Liga": ["football_data", "api_football", "fotmob"],
  "Ligue 1": ["football_data", "api_football", "fotmob"],
};
