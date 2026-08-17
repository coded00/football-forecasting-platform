import { poissonPmf } from "../analytics/poisson";

export interface ScorelineProbability {
  scoreline: string;
  probability: number;
}

// Grid over 0..maxGoals for both teams under independent Poisson, keep the top N,
// and bucket everything else (higher scorelines + long-tail combinations) into
// "other". `1 - sum(top N)` is an approximation of that bucket, not an exact
// integral over the truncated tail — fine given how small that tail is for
// realistic football scorelines (maxGoals=6 already covers the vast majority of
// mass), but don't treat it as precise to many decimal places.
export function scorelineProbabilities(
  homeXg: number,
  awayXg: number,
  maxGoals = 6,
  topN = 8
): ScorelineProbability[] {
  const grid: ScorelineProbability[] = [];
  for (let home = 0; home <= maxGoals; home++) {
    for (let away = 0; away <= maxGoals; away++) {
      grid.push({
        scoreline: `${home}-${away}`,
        probability: poissonPmf(home, homeXg) * poissonPmf(away, awayXg),
      });
    }
  }

  const top = grid.sort((a, b) => b.probability - a.probability).slice(0, topN);
  const topTotal = top.reduce((sum, s) => sum + s.probability, 0);

  return [...top, { scoreline: "other", probability: Math.max(1 - topTotal, 0) }];
}
