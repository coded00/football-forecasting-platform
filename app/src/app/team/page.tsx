"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface TeamStatsSummary {
  matchesPlayed: number;
  pointsPerGame: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  xgForPerGame?: number;
  xgAgainstPerGame?: number;
}

interface ProfileResponse {
  team: string;
  league: string;
  venueSplits: { home: TeamStatsSummary; away: TeamStatsSummary; overall: TeamStatsSummary };
  formWindows: { last5: TeamStatsSummary; last10: TeamStatsSummary; overall: TeamStatsSummary };
  momentum: { score: number };
  upcomingFixtures: { id: string; homeTeam: string; awayTeam: string; kickoff: string }[];
  dataSourceStatus: { source: string; matchesFound: number; error: string | null }[];
}

function StatsRow({ label, stats }: { label: string; stats: TeamStatsSummary }) {
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td className="text-center">{stats.matchesPlayed}</td>
      <td className="text-center">{stats.pointsPerGame.toFixed(2)}</td>
      <td className="text-center">{stats.goalsForPerGame.toFixed(2)}</td>
      <td className="text-center">{stats.goalsAgainstPerGame.toFixed(2)}</td>
      <td className="text-center">{stats.xgForPerGame !== undefined ? stats.xgForPerGame.toFixed(2) : "—"}</td>
    </tr>
  );
}

function TeamProfileContent() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const league = params.get("league") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);

  useEffect(() => {
    if (!name || !league) {
      setError("Missing team/league in URL");
      setLoading(false);
      return;
    }
    fetch(`/api/team/profile?team=${encodeURIComponent(name)}&league=${encodeURIComponent(league)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) setError(body.error ?? "Something went wrong.");
        else setData(body);
      })
      .catch(() => setError("Request failed — check your connection and try again."))
      .finally(() => setLoading(false));
  }, [name, league]);

  return (
    <>
      <h1>{name || "Team Profile"}</h1>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "100%", height: "8rem" }} />
        </div>
      )}
      {error && <p className="text-error">{error}</p>}

      {data && (
        <>
          <h2>Form</h2>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th className="text-center">MP</th>
                  <th className="text-center">Pts/G</th>
                  <th className="text-center">GF/G</th>
                  <th className="text-center">GA/G</th>
                  <th className="text-center">xG/G</th>
                </tr>
              </thead>
              <tbody>
                <StatsRow label="Last 5" stats={data.formWindows.last5} />
                <StatsRow label="Last 10" stats={data.formWindows.last10} />
                <StatsRow label="Overall" stats={data.formWindows.overall} />
                <StatsRow label="Home" stats={data.venueSplits.home} />
                <StatsRow label="Away" stats={data.venueSplits.away} />
              </tbody>
            </table>
          </div>

          <div className="card">
            Momentum:{" "}
            <strong className={data.momentum.score >= 0 ? "text-success" : "text-error"}>{data.momentum.score.toFixed(2)}</strong>
            <span className="text-muted"> (positive = trending above season baseline)</span>
          </div>

          <h2>Upcoming fixtures</h2>
          {data.upcomingFixtures.length === 0 && <div className="empty-state">No upcoming fixtures found for this team.</div>}
          {data.upcomingFixtures.map((f) => (
            <div key={f.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {f.homeTeam} vs {f.awayTeam}
                </div>
                <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                  {new Date(f.kickoff).toLocaleString()}
                </div>
              </div>
              <a
                href={`/?homeTeam=${encodeURIComponent(f.homeTeam)}&awayTeam=${encodeURIComponent(f.awayTeam)}&league=${encodeURIComponent(league)}`}
                className="btn btn-sm"
              >
                Analyze →
              </a>
            </div>
          ))}

          <h2>Data source status</h2>
          <div className="card">
            {data.dataSourceStatus.map((s) => (
              <div key={s.source} style={{ marginBottom: "0.4rem" }}>
                {s.source}: {s.matchesFound} matches{" "}
                <span className={`badge ${s.error ? "badge-error" : "badge-success"}`}>{s.error ?? "ok"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function TeamProfilePage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <TeamProfileContent />
    </Suspense>
  );
}
