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
      <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee" }}>{label}</td>
      <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{stats.matchesPlayed}</td>
      <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{stats.pointsPerGame.toFixed(2)}</td>
      <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{stats.goalsForPerGame.toFixed(2)}</td>
      <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{stats.goalsAgainstPerGame.toFixed(2)}</td>
      <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>
        {stats.xgForPerGame !== undefined ? stats.xgForPerGame.toFixed(2) : "—"}
      </td>
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
      <p>
        <a href="/leagues">← League Explorer</a>
      </p>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {data && (
        <>
          <h2>Form</h2>
          <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "2rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}></th>
                <th style={{ padding: "0.25rem 0.5rem" }}>MP</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>Pts/G</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>GF/G</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>GA/G</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>xG/G</th>
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

          <p>
            Momentum: <strong>{data.momentum.score.toFixed(2)}</strong> (positive = trending above season baseline)
          </p>

          <h2>Upcoming fixtures</h2>
          <ul>
            {data.upcomingFixtures.map((f) => (
              <li key={f.id} style={{ marginBottom: "0.4rem" }}>
                {new Date(f.kickoff).toLocaleString()} — {f.homeTeam} vs {f.awayTeam}{" "}
                <a
                  href={`/?homeTeam=${encodeURIComponent(f.homeTeam)}&awayTeam=${encodeURIComponent(f.awayTeam)}&league=${encodeURIComponent(league)}`}
                >
                  Analyze →
                </a>
              </li>
            ))}
            {data.upcomingFixtures.length === 0 && <li>No upcoming fixtures found for this team.</li>}
          </ul>

          <h2>Data source status</h2>
          <ul>
            {data.dataSourceStatus.map((s) => (
              <li key={s.source} style={{ color: s.error ? "crimson" : "green" }}>
                {s.source}: {s.matchesFound} matches {s.error ? `(${s.error})` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function TeamProfilePage() {
  return (
    <main>
      <Suspense fallback={<p>Loading…</p>}>
        <TeamProfileContent />
      </Suspense>
    </main>
  );
}
