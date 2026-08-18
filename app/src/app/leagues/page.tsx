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
    <>
      <h1>League Explorer</h1>

      <div className="field-row">
        {LEAGUES.map((l) => (
          <button key={l} onClick={() => load(l)} className={`btn ${l === league ? "btn-primary" : ""}`}>
            {l}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "100%", height: "8rem" }} />
        </div>
      )}
      {error && <p className="text-error">{error}</p>}
      {!loading && !error && !data && (
        <div className="empty-state">Pick a league above to see its table and upcoming fixtures.</div>
      )}

      {data && (
        <>
          <h2>Table</h2>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th className="text-center">P</th>
                  <th className="text-center">W</th>
                  <th className="text-center">D</th>
                  <th className="text-center">L</th>
                  <th className="text-center">GD</th>
                  <th className="text-center">Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.table.map((row) => (
                  <tr key={row.id}>
                    <td>{row.position}</td>
                    <td>
                      <a href={teamLink(row.name)}>{row.name}</a>
                    </td>
                    <td className="text-center">{row.played}</td>
                    <td className="text-center">{row.wins}</td>
                    <td className="text-center">{row.draws}</td>
                    <td className="text-center">{row.losses}</td>
                    <td className="text-center">{row.goalConDiff}</td>
                    <td className="text-center" style={{ fontWeight: 600 }}>
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Upcoming fixtures</h2>
          {data.upcomingFixtures.length === 0 && <div className="empty-state">No upcoming fixtures found.</div>}
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
              <a href={analyzeLink(f.homeTeam, f.awayTeam)} className="btn btn-sm">
                Analyze →
              </a>
            </div>
          ))}
        </>
      )}
    </>
  );
}
