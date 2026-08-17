function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

export function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

// Independent-Poisson approximation (no Dixon-Coles low-score correlation
// adjustment yet — that refinement belongs to Phase 3's actual forecast model).
// Good enough here for retrospective "what would this match's points have been
// given its own xG" estimates.
export function matchOutcomeProbabilities(
  goalsFor: number,
  goalsAgainst: number,
  maxGoals = 10
): { win: number; draw: number; loss: number } {
  let win = 0;
  let draw = 0;
  let loss = 0;
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = poissonPmf(i, goalsFor) * poissonPmf(j, goalsAgainst);
      if (i > j) win += p;
      else if (i === j) draw += p;
      else loss += p;
    }
  }
  return { win, draw, loss };
}

export function expectedPoints(goalsFor: number, goalsAgainst: number): number {
  const { win, draw } = matchOutcomeProbabilities(goalsFor, goalsAgainst);
  return 3 * win + draw;
}
