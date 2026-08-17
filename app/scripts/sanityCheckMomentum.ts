// Phase 4.2 spot-check: a team on a hot streak (recent form well above season
// baseline) should produce a positive momentum score.
import type { MergedMatch } from "../lib/analytics/mergeMatches";
import { computeMomentum } from "../lib/analytics/momentum";
import { computeFormWindows } from "../lib/analytics/teamStats";
import { summarizeFormations } from "../lib/analytics/formations";

function makeMatch(overrides: Partial<MergedMatch> & { date: string }): MergedMatch {
  return {
    opponent: "Opponent",
    isHome: true,
    goalsFor: 1,
    goalsAgainst: 1,
    sources: ["football_data"],
    ...overrides,
  };
}

// Poor form for matches 1-10 (oldest), red-hot for the last 5 (most recent).
const matches: MergedMatch[] = [
  makeMatch({ date: "2025-10-01", goalsFor: 0, goalsAgainst: 2, xgFor: 0.6, xgAgainst: 1.7, shotsFor: 8, shotsAgainst: 14, shotsOnTargetFor: 2, shotsOnTargetAgainst: 6 }),
  makeMatch({ date: "2025-10-08", goalsFor: 1, goalsAgainst: 1, xgFor: 0.9, xgAgainst: 1.3, shotsFor: 9, shotsAgainst: 12, shotsOnTargetFor: 3, shotsOnTargetAgainst: 5 }),
  makeMatch({ date: "2025-10-15", goalsFor: 0, goalsAgainst: 1, xgFor: 0.7, xgAgainst: 1.5, shotsFor: 7, shotsAgainst: 13, shotsOnTargetFor: 2, shotsOnTargetAgainst: 5, formation: "4-4-2" }),
  makeMatch({ date: "2025-10-22", goalsFor: 1, goalsAgainst: 2, xgFor: 0.8, xgAgainst: 1.6, shotsFor: 8, shotsAgainst: 13, shotsOnTargetFor: 3, shotsOnTargetAgainst: 6, formation: "4-4-2" }),
  makeMatch({ date: "2025-10-29", goalsFor: 0, goalsAgainst: 0, xgFor: 0.6, xgAgainst: 1.1, shotsFor: 7, shotsAgainst: 11, shotsOnTargetFor: 2, shotsOnTargetAgainst: 4, formation: "4-4-2" }),
  // hot streak
  makeMatch({ date: "2026-02-04", goalsFor: 3, goalsAgainst: 0, xgFor: 2.4, xgAgainst: 0.6, shotsFor: 16, shotsAgainst: 6, shotsOnTargetFor: 7, shotsOnTargetAgainst: 2, formation: "4-3-3" }),
  makeMatch({ date: "2026-02-11", goalsFor: 2, goalsAgainst: 1, xgFor: 2.1, xgAgainst: 0.9, shotsFor: 15, shotsAgainst: 8, shotsOnTargetFor: 6, shotsOnTargetAgainst: 3, formation: "4-3-3" }),
  makeMatch({ date: "2026-02-18", goalsFor: 4, goalsAgainst: 1, xgFor: 2.8, xgAgainst: 1.0, shotsFor: 18, shotsAgainst: 7, shotsOnTargetFor: 8, shotsOnTargetAgainst: 3, formation: "4-3-3" }),
  makeMatch({ date: "2026-02-25", goalsFor: 2, goalsAgainst: 0, xgFor: 2.0, xgAgainst: 0.7, shotsFor: 14, shotsAgainst: 6, shotsOnTargetFor: 6, shotsOnTargetAgainst: 2, formation: "4-3-3" }),
  makeMatch({ date: "2026-03-04", goalsFor: 3, goalsAgainst: 1, xgFor: 2.5, xgAgainst: 1.1, shotsFor: 17, shotsAgainst: 9, shotsOnTargetFor: 7, shotsOnTargetAgainst: 4, formation: "4-3-3" }),
];

const formWindows = computeFormWindows(matches);
const momentum = computeMomentum(formWindows.last5, formWindows.overall);
const formations = summarizeFormations(matches);

console.log(JSON.stringify({ momentum, formations }, null, 2));

const checks: [string, boolean][] = [
  ["momentum score is positive (hot streak vs season baseline)", momentum.score > 0],
  ["points-per-game delta is positive", (momentum.components.pointsPerGameDelta ?? -1) > 0],
  ["xG-difference delta is positive", (momentum.components.xgDifferenceDelta ?? -1) > 0],
  ["primary formation detected as 4-3-3 (more recent, more frequent)", formations.primaryFormation === "4-3-3"],
];

console.log("\nSanity checks:");
let allPassed = true;
for (const [label, passed] of checks) {
  console.log(`  ${passed ? "PASS" : "FAIL"} - ${label}`);
  if (!passed) allPassed = false;
}
if (!allPassed) process.exit(1);
