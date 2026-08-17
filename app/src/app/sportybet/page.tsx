"use client";

import { useState } from "react";

const LEAGUES = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"] as const;
type League = (typeof LEAGUES)[number];

interface AnalyzedSelection {
  selection: {
    homeTeam: string;
    awayTeam: string;
    market: string;
    outcomeLabel: string;
    odds: number;
  };
  supported: boolean;
  reason?: string;
  league?: string;
  panelText?: string;
  confidence?: number;
  favoredOutcome?: string;
  agreesWithSlip?: boolean;
}

interface AnalyzeCodeResponse {
  code: string;
  selectionCount: number;
  analyzedCount: number;
  results: AnalyzedSelection[];
}

interface BuiltSelection {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  error?: string;
  favoredOutcome?: string;
  homeWinProbability?: number;
  drawProbability?: number;
  awayWinProbability?: number;
  sportyBetSelection?: { eventId: string; marketId: string; outcomeId: string; odds?: number };
}

function CodeAnalyzer() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeCodeResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/sportybet/analyze-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Something went wrong.");
      else setResult(body);
    } catch {
      setError("Request failed — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2>Analyze a booking code</h2>
      <p>Paste an existing SportyBet booking code — we'll decode the selections and run our own analysis on whichever ones fall in a league we cover.</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", maxWidth: 400 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Booking code"
          required
          style={{ flex: 1, padding: "0.4rem" }}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: "1.5rem" }}>
          <p>
            {result.selectionCount} selection(s) found, {result.analyzedCount} in a league we cover.
          </p>
          {result.results.map((r, i) => (
            <div key={i} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "1rem", marginBottom: "1rem" }}>
              <strong>
                {r.selection.homeTeam} v {r.selection.awayTeam}
              </strong>{" "}
              — {r.selection.market}: {r.selection.outcomeLabel} @ {r.selection.odds}
              {!r.supported && <p style={{ color: "#888" }}>Not analyzed: {r.reason}</p>}
              {r.supported && (
                <>
                  <pre style={{ background: "#f4f4f4", padding: "0.75rem", borderRadius: 6, whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
                    {r.panelText}
                  </pre>
                  <p style={{ fontWeight: 600, color: r.agreesWithSlip ? "green" : "crimson" }}>
                    {r.agreesWithSlip
                      ? `Our analysis agrees — favors ${r.favoredOutcome}`
                      : `Our analysis disagrees — favors ${r.favoredOutcome}, slip picked ${r.selection.outcomeLabel}`}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TicketBuilder() {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [league, setLeague] = useState<League>("Premier League");
  const [matches, setMatches] = useState<{ homeTeam: string; awayTeam: string; league: League }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BuiltSelection[] | null>(null);

  function addMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!homeTeam.trim() || !awayTeam.trim()) return;
    setMatches([...matches, { homeTeam: homeTeam.trim(), awayTeam: awayTeam.trim(), league }]);
    setHomeTeam("");
    setAwayTeam("");
  }

  function removeMatch(i: number) {
    setMatches(matches.filter((_, idx) => idx !== i));
  }

  async function buildTicket() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch("/api/sportybet/build-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Something went wrong.");
      else setResults(body.selections);
    } catch {
      setError("Request failed — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const resolvedForLocalTool = (results ?? [])
    .filter((r): r is Required<Pick<BuiltSelection, "sportyBetSelection">> & BuiltSelection => Boolean(r.sportyBetSelection))
    .map((r) => ({
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      favoredOutcome: r.favoredOutcome,
      sportyBetSelection: r.sportyBetSelection,
    }));

  return (
    <section>
      <h2>Build a ticket from analysis</h2>
      <p>Add matches, run our analysis on each, and get SportyBet selections ready for the local ticket tool.</p>

      <form onSubmit={addMatch} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", maxWidth: 500 }}>
        <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Home team" style={{ padding: "0.4rem" }} />
        <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Away team" style={{ padding: "0.4rem" }} />
        <select value={league} onChange={(e) => setLeague(e.target.value as League)} style={{ padding: "0.4rem" }}>
          {LEAGUES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button type="submit">Add match</button>
      </form>

      {matches.length > 0 && (
        <ul>
          {matches.map((m, i) => (
            <li key={i}>
              {m.homeTeam} vs {m.awayTeam} ({m.league}){" "}
              <button type="button" onClick={() => removeMatch(i)}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={buildTicket} disabled={loading || matches.length === 0} style={{ marginTop: "0.5rem", padding: "0.5rem 1rem" }}>
        {loading ? "Building…" : "Build ticket"}
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {results && (
        <div style={{ marginTop: "1.5rem" }}>
          {results.map((r, i) => (
            <div key={i} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "1rem", marginBottom: "1rem" }}>
              <strong>
                {r.homeTeam} v {r.awayTeam}
              </strong>
              {r.error && <p style={{ color: "crimson" }}>{r.error}</p>}
              {r.sportyBetSelection && (
                <p>
                  Favored: {r.favoredOutcome} (H {((r.homeWinProbability ?? 0) * 100).toFixed(1)}% / D{" "}
                  {((r.drawProbability ?? 0) * 100).toFixed(1)}% / A {((r.awayWinProbability ?? 0) * 100).toFixed(1)}%) — eventId{" "}
                  {r.sportyBetSelection.eventId}, market {r.sportyBetSelection.marketId}, outcome {r.sportyBetSelection.outcomeId}
                  {r.sportyBetSelection.odds !== undefined ? ` @ ${r.sportyBetSelection.odds}` : ""}
                </p>
              )}
            </div>
          ))}

          {resolvedForLocalTool.length > 0 && (
            <>
              <h3>selections.json for the local ticket tool</h3>
              <p>Copy this into a local file and run it with `sportybet-local-tool` (see its README) to generate a new booking code.</p>
              <textarea
                readOnly
                value={JSON.stringify(resolvedForLocalTool, null, 2)}
                style={{ width: "100%", height: 200, fontFamily: "monospace", fontSize: "0.85rem" }}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function SportyBetPage() {
  return (
    <main>
      <h1>SportyBet Tools</h1>
      <p>
        <a href="/">← Match Analysis</a>
      </p>
      <p style={{ color: "#888" }}>
        Personal use only. Generating a new booking code needs your real login and happens in a separate local tool —
        see <code>sportybet-local-tool/README.md</code>.
      </p>
      <CodeAnalyzer />
      <TicketBuilder />
    </main>
  );
}
