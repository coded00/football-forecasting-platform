import type { TeamStatsSummary } from "./teamStats";

// PRD §12: momentum as a normalized composite (recent points/xG-diff/goal-diff/
// shot-diff/SOT-diff trend vs season baseline), inputs normalized so no single
// metric dominates by scale.
//
// There's no league-wide dataset here to compute a real z-score against (this
// system only ever fetches the two requested teams), so "normalized" means
// dividing each delta by a fixed typical-scale constant rather than a population
// standard deviation. That keeps the composite roughly comparable across teams
// without overclaiming statistical rigor it can't actually deliver.
const TYPICAL_SCALES = {
  points: 1.0,
  xg: 0.8,
  goals: 0.8,
  shots: 4,
  shotsOnTarget: 2,
};

export interface MomentumComponents {
  pointsPerGameDelta?: number;
  xgDifferenceDelta?: number;
  goalDifferenceDelta?: number;
  shotDifferenceDelta?: number;
  shotsOnTargetDifferenceDelta?: number;
}

export interface MomentumResult {
  score: number; // roughly -2..+2; positive = trending above season baseline
  components: MomentumComponents;
}

function normalizedDelta(recent: number | undefined, baseline: number | undefined, scale: number): number | undefined {
  if (recent === undefined || baseline === undefined) return undefined;
  return (recent - baseline) / scale;
}

export function computeMomentum(recentForm: TeamStatsSummary, seasonBaseline: TeamStatsSummary): MomentumResult {
  const components: MomentumComponents = {
    pointsPerGameDelta: normalizedDelta(recentForm.pointsPerGame, seasonBaseline.pointsPerGame, TYPICAL_SCALES.points),
    xgDifferenceDelta: normalizedDelta(recentForm.xgDifferencePerGame, seasonBaseline.xgDifferencePerGame, TYPICAL_SCALES.xg),
    goalDifferenceDelta: normalizedDelta(
      recentForm.goalDifferencePerGame,
      seasonBaseline.goalDifferencePerGame,
      TYPICAL_SCALES.goals
    ),
    shotDifferenceDelta: normalizedDelta(
      recentForm.shotDifferencePerGame,
      seasonBaseline.shotDifferencePerGame,
      TYPICAL_SCALES.shots
    ),
    shotsOnTargetDifferenceDelta: normalizedDelta(
      recentForm.shotsOnTargetDifferencePerGame,
      seasonBaseline.shotsOnTargetDifferencePerGame,
      TYPICAL_SCALES.shotsOnTarget
    ),
  };

  const definedDeltas = Object.values(components).filter((v): v is number => v !== undefined);
  const score = definedDeltas.length > 0 ? definedDeltas.reduce((a, b) => a + b, 0) / definedDeltas.length : 0;

  return { score, components };
}
