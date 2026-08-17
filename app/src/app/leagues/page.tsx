"use client";

import { useState } from "react";

const LEAGUES = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"] as const;
type League = (typeof LEAGUES)[number];

interface TableRow {
  id: number;
  name: string;
  shortName?: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalConDiff: number;
}

interface Fixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
}

interface ExploreResponse {
  league: string;
  table: TableRow[];
  upcomingFixtures: Fixture[];
}

export default function LeagueExplorerPage() {
  const [league, setLeague] = useState<League>("Premier League");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExploreResponse | null>(null);

  async function load(selected: League) {
    setLeague(selected);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`/api/league/explore?league=${encodeURIComponent(selected)}`);
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Something went wrong.");
      else setData(body);
    } catch {
      setError("Request failed — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function analyzeLink(home: string, away: string) {
    return `/?homeTeam=${encodeURIComponent(home)}&awayTeam=${encodeURIComponent(away)}&league=${encodeURIComponent(league)}`;
  }

  function teamLink(name: string) {
    return `/team?name=${encodeURIComponent(name)}&league=${encodeURIComponent(league)}`;
  }

  return (
    <main>
      <h1>League Explorer</h1>
      <p>
        <a href="/">← Match Analysis</a>
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {LEAGUES.map((l) => (
          <button
            key={l}
            onClick={() => load(l)}
            style={{ padding: "0.4rem 0.8rem", fontWeight: l === league ? 700 : 400 }}
          >
            {l}
          </button>
        ))}
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {data && (
        <>
          <h2>Table</h2>
          <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "2rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>#</th>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Team</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>P</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>W</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>D</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>L</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>GD</th>
                <th style={{ padding: "0.25rem 0.5rem" }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {data.table.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee" }}>{row.position}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee" }}>
                    <a href={teamLink(row.name)}>{row.name}</a>
                  </td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{row.played}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{row.wins}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{row.draws}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{row.losses}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center" }}>{row.goalConDiff}</td>
                  <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid #eee", textAlign: "center", fontWeight: 600 }}>
                    {row.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Upcoming fixtures</h2>
          <ul>
            {data.upcomingFixtures.map((f) => (
              <li key={f.id} style={{ marginBottom: "0.4rem" }}>
                {new Date(f.kickoff).toLocaleString()} — {f.homeTeam} vs {f.awayTeam}{" "}
                <a href={analyzeLink(f.homeTeam, f.awayTeam)}>Analyze →</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
