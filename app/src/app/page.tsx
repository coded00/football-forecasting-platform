"use client";

import { useState } from "react";

const LEAGUES = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"] as const;

interface ForecastResponse {
  homeTeam: string;
  awayTeam: string;
  panelText: string;
  explanation: string;
  confidence: number;
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

export default function MatchAnalysisPage() {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [league, setLeague] = useState<(typeof LEAGUES)[number]>("Premier League");
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
        body: JSON.stringify({ homeTeam, awayTeam, league }),
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
    <main>
      <h1>Match Analysis</h1>
      <p>Live, on-demand statistical forecast — nothing is stored between requests.</p>
      <p>
        <a href="/sportybet">SportyBet tools →</a>
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 360 }}>
        <label>
          Home team
          <input
            value={homeTeam}
            onChange={(e) => setHomeTeam(e.target.value)}
            placeholder="e.g. Arsenal"
            required
            style={{ display: "block", width: "100%", padding: "0.4rem" }}
          />
        </label>
        <label>
          Away team
          <input
            value={awayTeam}
            onChange={(e) => setAwayTeam(e.target.value)}
            placeholder="e.g. Chelsea"
            required
            style={{ display: "block", width: "100%", padding: "0.4rem" }}
          />
        </label>
        <label>
          League
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value as (typeof LEAGUES)[number])}
            style={{ display: "block", width: "100%", padding: "0.4rem" }}
          >
            {LEAGUES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading} style={{ padding: "0.6rem", fontWeight: 600 }}>
          {loading ? "Fetching and analyzing…" : "Analyze matchup"}
        </button>
      </form>

      {error && (
        <p style={{ color: "crimson", marginTop: "1.5rem" }}>
          {error}
        </p>
      )}

      {result && result.panelText && (
        <section style={{ marginTop: "2rem" }}>
          <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: 6, whiteSpace: "pre-wrap" }}>
            {result.panelText}
          </pre>
          <p>{result.explanation}</p>

          <h2>Most likely scorelines</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {result.forecast.scorelineProbabilities.map((s) => (
                <tr key={s.scoreline}>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #ddd" }}>{s.scoreline}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #ddd" }}>
                    {(s.probability * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Corners &amp; half-goals</h2>
          <ul>
            <li>
              Expected corners — {result.homeTeam}: {result.forecast.expectedCorners.home?.toFixed(1) ?? "n/a"}, {result.awayTeam}:{" "}
              {result.forecast.expectedCorners.away?.toFixed(1) ?? "n/a"} (total {result.forecast.expectedCorners.total?.toFixed(1) ?? "n/a"})
            </li>
            <li>
              Expected 1st-half goals — {result.homeTeam}: {result.forecast.expectedFirstHalfGoals.home?.toFixed(2) ?? "n/a"},{" "}
              {result.awayTeam}: {result.forecast.expectedFirstHalfGoals.away?.toFixed(2) ?? "n/a"}
            </li>
            <li>
              Expected 2nd-half goals — {result.homeTeam}: {result.forecast.expectedSecondHalfGoals.home?.toFixed(2) ?? "n/a"},{" "}
              {result.awayTeam}: {result.forecast.expectedSecondHalfGoals.away?.toFixed(2) ?? "n/a"}
            </li>
          </ul>
        </section>
      )}

      {result && (
        <section style={{ marginTop: "2rem" }}>
          <h2>Data source status</h2>
          <DataSourceStatusTable label={result.homeTeam} rows={result.dataSourceStatus.home} />
          <DataSourceStatusTable label={result.awayTeam} rows={result.dataSourceStatus.away} />
        </section>
      )}
    </main>
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
    <div style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>{label}</h3>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Source</th>
            <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Matches found</th>
            <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source}>
              <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee" }}>{r.source}</td>
              <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee" }}>{r.matchesFound}</td>
              <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", color: r.error ? "crimson" : "green" }}>
                {r.error ?? "ok"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
