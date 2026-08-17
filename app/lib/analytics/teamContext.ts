import { fetchApiFootballManagerHistory, fetchApiFootballTransfers } from "../sources/apiFootball";

// PRD §14-15: informational context only, same as formations — not fed into
// the Poisson model. Squad-strength/manager-change adjustments would need
// backtesting to justify weighting them numerically (PRD §14, §26), and
// backtesting is out of scope under the Architecture Pivot (no persisted
// history to backtest against). So this stays display-only, for Phase 5's
// "key factors" explanation and the dashboard.
const RECENT_TRANSFER_WINDOW_DAYS = 60;

export interface TeamContext {
  recentTransfersCount: number;
  currentManagerName?: string;
  daysSinceManagerChange?: number;
}

export async function fetchTeamContext(teamId: number): Promise<TeamContext> {
  const [transfers, managerHistory] = await Promise.all([
    fetchApiFootballTransfers(teamId).catch(() => []),
    fetchApiFootballManagerHistory(teamId).catch(() => []),
  ]);

  const cutoff = Date.now() - RECENT_TRANSFER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentTransfersCount = transfers.filter((t) => new Date(t.date).getTime() >= cutoff).length;

  const currentManager =
    managerHistory.find((m) => m.end === null) ??
    [...managerHistory].sort((a, b) => b.start.localeCompare(a.start))[0];

  const daysSinceManagerChange = currentManager
    ? Math.floor((Date.now() - new Date(currentManager.start).getTime()) / (24 * 60 * 60 * 1000))
    : undefined;

  return {
    recentTransfersCount,
    currentManagerName: currentManager?.managerName,
    daysSinceManagerChange,
  };
}
