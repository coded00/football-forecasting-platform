"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const LEAGUES = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"] as const;
const GENERAL = "General (any team, worldwide)";

interface TeamResolution {
  league: string | null;
  fotmobLeagueName: string | null;
}

interface ForecastResponse {
  homeTeam: string;
  awayTeam: string;
  panelText: string;
  explanation: string;
  confidence: number;
  resolution: { home: TeamResolution; away: TeamResolution };
  forecast: {
    scorelineProbabilities: { scoreline: string; probability: number }[];
    expectedCorners: { home?: number; away?: number; total?: number };
    expectedFirstHalfGoals: { home?: number; away?: number };
    expectedSecondHalfGoals: { home?: number; away?: number };
  };
  dataSourceStatus: {
    home: { source: string; matchesFound: number; error: string | null }[];
    away: { source: string; matchesFound: number; error: string | null }[];
  };
}

function describeResolution(r: TeamResolution): string {
  if (r.league) return r.league;
  if (r.fotmobLeagueName) return `${r.fotmobLeagueName} (general search)`;
  return "unresolved";
}

function isLeague(value: string | null): value is (typeof LEAGUES)[number] {
  return LEAGUES.includes(value as (typeof LEAGUES)[number]);
}

function MatchAnalysisForm() {
  // Prefilled from League Explorer's "Analyze this match" links
  // (/?homeTeam=X&awayTeam=Y&league=Z) — not auto-submitted, just prefilled.
  const params = useSearchParams();
  const [homeTeam, setHomeTeam] = useState(params.get("homeTeam") ?? "");
  const [awayTeam, setAwayTeam] = useState(params.get("awayTeam") ?? "");
  const leagueParam = params.get("league");
  const [league, setLeague] = useState<(typeof LEAGUES)[number] | typeof GENERAL>(isLeague(leagueParam) ? leagueParam : GENERAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForecastResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(league === GENERAL ? { homeTeam, awayTeam } : { homeTeam, awayTeam, league }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Something went wrong.");
        if (body.dataSourceStatus) setResult({ ...body, panelText: "", explanation: "", confidence: 0 } as ForecastResponse);
      } else {
        setResult(body);
      }
    } catch {
      setError("Request failed — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Match Analysis</h1>
      <p className="text-muted">Live, on-demand statistical forecast — nothing is stored between requests.</p>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 420 }}>
        <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label>
            Home team
            <input className="input" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="e.g. Arsenal" required />
          </label>
          <label>
            Away team
            <input className="input" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="e.g. Chelsea" required />
          </label>
          <label>
            League
            <select
              className="select"
              value={league}
              onChange={(e) => setLeague(e.target.value as (typeof LEAGUES)[number] | typeof GENERAL)}
            >
              <option value={GENERAL}>{GENERAL}</option>
              {LEAGUES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <span className="text-muted" style={{ fontSize: "0.8rem" }}>
              "General" searches worldwide (any club, any league) — pick a specific league only for the extra
              corroborating data sources it unlocks.
            </span>
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
          {loading ? "Fetching and analyzing…" : "Analyze matchup"}
        </button>
      </form>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "60%", marginBottom: "0.75rem" }} />
          <div className="skeleton" style={{ width: "90%", marginBottom: "0.5rem" }} />
          <div className="skeleton" style={{ width: "40%" }} />
        </div>
      )}

      {error && <p className="text-error">{error}</p>}

      {result && result.panelText && (
        <section>
          <div className="card">
            <pre className="panel" style={{ margin: 0, border: "none", padding: 0, background: "none" }}>
              {result.panelText}
            </pre>
          </div>
          <p>{result.explanation}</p>
          <p className="text-muted" style={{ fontSize: "0.85rem" }}>
            {result.homeTeam}: {describeResolution(result.resolution.home)} · {result.awayTeam}:{" "}
            {describeResolution(result.resolution.away)}
          </p>

          <h2>Most likely scorelines</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <tbody>
                {result.forecast.scorelineProbabilities.map((s) => (
                  <tr key={s.scoreline}>
                    <td>{s.scoreline}</td>
                    <td>{(s.probability * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Corners &amp; half-goals</h2>
          <div className="card">
            <p>
              Expected corners — {result.homeTeam}: {result.forecast.expectedCorners.home?.toFixed(1) ?? "n/a"}, {result.awayTeam}:{" "}
              {result.forecast.expectedCorners.away?.toFixed(1) ?? "n/a"} (total {result.forecast.expectedCorners.total?.toFixed(1) ?? "n/a"})
            </p>
            <p>
              Expected 1st-half goals — {result.homeTeam}: {result.forecast.expectedFirstHalfGoals.home?.toFixed(2) ?? "n/a"},{" "}
              {result.awayTeam}: {result.forecast.expectedFirstHalfGoals.away?.toFixed(2) ?? "n/a"}
            </p>
            <p style={{ marginBottom: 0 }}>
              Expected 2nd-half goals — {result.homeTeam}: {result.forecast.expectedSecondHalfGoals.home?.toFixed(2) ?? "n/a"},{" "}
              {result.awayTeam}: {result.forecast.expectedSecondHalfGoals.away?.toFixed(2) ?? "n/a"}
            </p>
          </div>
        </section>
      )}

      {result && (
        <section>
          <h2>Data source status</h2>
          <DataSourceStatusTable label={result.homeTeam} rows={result.dataSourceStatus.home} />
          <DataSourceStatusTable label={result.awayTeam} rows={result.dataSourceStatus.away} />
        </section>
      )}
    </>
  );
}

export default function MatchAnalysisPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <MatchAnalysisForm />
    </Suspense>
  );
}

function DataSourceStatusTable({
  label,
  rows,
}: {
  label: string;
  rows: { source: string; matchesFound: number; error: string | null }[];
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <h3 style={{ padding: "0.75rem 0.75rem 0" }}>{label}</h3>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Matches found</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source}>
              <td>{r.source}</td>
              <td>{r.matchesFound}</td>
              <td>
                <span className={`badge ${r.error ? "badge-error" : "badge-success"}`}>{r.error ?? "ok"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
