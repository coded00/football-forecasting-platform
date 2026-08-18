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

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function LocalToolHandoff({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="card" style={{ background: "var(--color-success-bg)", borderColor: "var(--color-success)" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <strong>{count}</strong> selection(s) downloaded as <code>selections.json</code>.
      </p>
      <p className="text-muted" style={{ marginBottom: "0.5rem" }}>
        Move it into <code>sportybet-local-tool/</code>, then run this yourself (it opens a real browser for you to log
        into your own account — see that folder's README):
      </p>
      <pre className="panel" style={{ marginBottom: 0 }}>npm run create-ticket -- selections.json</pre>
    </div>
  );
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
    <section>
      <h2>Analyze a booking code</h2>
      <p className="text-muted">
        Paste an existing SportyBet booking code — we'll decode the selections and run our own analysis on whichever
        ones fall in a league we cover.
      </p>
      <form onSubmit={handleSubmit} className="field-row">
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Booking code"
          required
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {error && <p className="text-error">{error}</p>}

      {result && (
        <div>
          <p className="text-muted">
            {result.selectionCount} selection(s) found, {result.analyzedCount} in a league we cover.
          </p>
          {result.results.map((r, i) => (
            <div key={i} className="card">
              <strong>
                {r.selection.homeTeam} v {r.selection.awayTeam}
              </strong>{" "}
              — {r.selection.market}: {r.selection.outcomeLabel} @ {r.selection.odds}
              {!r.supported && <p className="text-muted">Not analyzed: {r.reason}</p>}
              {r.supported && (
                <>
                  <pre className="panel">{r.panelText}</pre>
                  <p className={r.agreesWithSlip ? "text-success" : "text-error"} style={{ fontWeight: 600, marginBottom: 0 }}>
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

interface AutoTicketResult {
  homeTeam: string;
  awayTeam: string;
  supported: boolean;
  reason?: string;
  favoredOutcome?: string;
  homeWinProbability?: number;
  drawProbability?: number;
  awayWinProbability?: number;
  sportyBetSelection?: { eventId: string; marketId: string; outcomeId: string; odds?: number };
}

interface AutoTicketResponse {
  league: string;
  matchCount: number;
  analyzedCount?: number;
  results: AutoTicketResult[];
  note?: string;
}

// The actual requested flow: analyze EVERYTHING SportyBet has posted for a
// league (no pre-filtering, no manual entry), let the user pick which
// analyzed matches they actually want via checkboxes, then generate a ticket
// from only those. "Generate" downloads selections.json rather than a real
// booking code directly — minting an actual code needs an authenticated
// SportyBet session, which only sportybet-local-tool (running on the user's
// own machine, with their own login) can do; this is the handoff point.
function AutoTicket() {
  const [league, setLeague] = useState<League>("Premier League");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AutoTicketResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloadedCount, setDownloadedCount] = useState(0);

  async function pull() {
    setLoading(true);
    setError(null);
    setData(null);
    setSelected(new Set());
    setDownloadedCount(0);
    try {
      const response = await fetch(`/api/sportybet/auto-ticket?league=${encodeURIComponent(league)}`);
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Something went wrong.");
      else setData(body);
    } catch {
      setError("Request failed — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  }

  function generateTicket() {
    if (!data) return;
    const chosen = data.results.filter((_, i) => selected.has(i));
    const payload = chosen
      .filter((r): r is AutoTicketResult & { sportyBetSelection: NonNullable<AutoTicketResult["sportyBetSelection"]> } =>
        Boolean(r.sportyBetSelection)
      )
      .map((r) => ({ homeTeam: r.homeTeam, awayTeam: r.awayTeam, favoredOutcome: r.favoredOutcome, sportyBetSelection: r.sportyBetSelection }));
    downloadJson("selections.json", payload);
    setDownloadedCount(payload.length);
  }

  const supportedIndexes = data ? data.results.map((r, i) => (r.supported ? i : -1)).filter((i) => i >= 0) : [];

  return (
    <section>
      <h2>Pull today's board and analyze</h2>
      <p className="text-muted">
        No typing — this pulls every match SportyBet is actually offering for a league right now and analyzes all of
        it. Pick the ones you want, then generate a ticket from just those.
      </p>

      <div className="field-row">
        <select className="select" value={league} onChange={(e) => setLeague(e.target.value as League)}>
          {LEAGUES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={pull} disabled={loading}>
          {loading ? "Pulling…" : "Pull & analyze"}
        </button>
      </div>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "100%", height: "6rem" }} />
        </div>
      )}
      {error && <p className="text-error">{error}</p>}

      {data && (
        <div>
          {data.note && <p className="text-muted">{data.note}</p>}
          {data.matchCount > 0 && (
            <div className="field-row" style={{ justifyContent: "space-between" }}>
              <p className="text-muted" style={{ margin: 0 }}>
                {data.matchCount} match(es) listed, {data.analyzedCount} analyzed, {selected.size} selected.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSelected(new Set(supportedIndexes))}
                  disabled={supportedIndexes.length === 0}
                >
                  Select all analyzed
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={generateTicket} disabled={selected.size === 0}>
                  Generate ticket ({selected.size})
                </button>
              </div>
            </div>
          )}

          <LocalToolHandoff count={downloadedCount} />

          {data.results.map((r, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              {r.supported && (
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  style={{ marginTop: "0.3rem" }}
                  aria-label={`Select ${r.homeTeam} vs ${r.awayTeam}`}
                />
              )}
              <div style={{ flex: 1 }}>
                <strong>
                  {r.homeTeam} v {r.awayTeam}
                </strong>
                {!r.supported && <p className="text-muted" style={{ marginBottom: 0 }}>Not analyzed: {r.reason}</p>}
                {r.supported && (
                  <p style={{ marginBottom: 0 }}>
                    Favored: <strong>{r.favoredOutcome}</strong> (H {((r.homeWinProbability ?? 0) * 100).toFixed(1)}% / D{" "}
                    {((r.drawProbability ?? 0) * 100).toFixed(1)}% / A {((r.awayWinProbability ?? 0) * 100).toFixed(1)}%)
                    {r.sportyBetSelection?.odds !== undefined ? ` @ ${r.sportyBetSelection.odds}` : ""}
                  </p>
                )}
              </div>
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
  const [downloadedCount, setDownloadedCount] = useState(0);

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
    setDownloadedCount(0);
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

  function download() {
    const resolved = (results ?? [])
      .filter((r): r is Required<Pick<BuiltSelection, "sportyBetSelection">> & BuiltSelection => Boolean(r.sportyBetSelection))
      .map((r) => ({ homeTeam: r.homeTeam, awayTeam: r.awayTeam, favoredOutcome: r.favoredOutcome, sportyBetSelection: r.sportyBetSelection }));
    downloadJson("selections.json", resolved);
    setDownloadedCount(resolved.length);
  }

  const resolvedCount = (results ?? []).filter((r) => r.sportyBetSelection).length;

  return (
    <section>
      <h2>Build a ticket from a hand-picked match</h2>
      <p className="text-muted">
        For a specific matchup you already have in mind. For "just show me what's good today," use the board-pull
        above instead.
      </p>

      <form onSubmit={addMatch} className="field-row">
        <input className="input" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Home team" />
        <input className="input" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Away team" />
        <select className="select" value={league} onChange={(e) => setLeague(e.target.value as League)}>
          {LEAGUES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Add match
        </button>
      </form>

      {matches.length > 0 && (
        <div className="card">
          {matches.map((m, i) => (
            <div key={i} className="field-row" style={{ marginBottom: "0.25rem", justifyContent: "space-between" }}>
              <span>
                {m.homeTeam} vs {m.awayTeam} ({m.league})
              </span>
              <button type="button" className="btn-ghost" onClick={() => removeMatch(i)}>
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-primary" onClick={buildTicket} disabled={loading || matches.length === 0}>
        {loading ? "Building…" : "Build ticket"}
      </button>

      {error && <p className="text-error">{error}</p>}

      {results && (
        <div>
          {results.map((r, i) => (
            <div key={i} className="card">
              <strong>
                {r.homeTeam} v {r.awayTeam}
              </strong>
              {r.error && <p className="text-error" style={{ marginBottom: 0 }}>{r.error}</p>}
              {r.sportyBetSelection && (
                <p style={{ marginBottom: 0 }}>
                  Favored: {r.favoredOutcome} (H {((r.homeWinProbability ?? 0) * 100).toFixed(1)}% / D{" "}
                  {((r.drawProbability ?? 0) * 100).toFixed(1)}% / A {((r.awayWinProbability ?? 0) * 100).toFixed(1)}%) — eventId{" "}
                  {r.sportyBetSelection.eventId}, market {r.sportyBetSelection.marketId}, outcome {r.sportyBetSelection.outcomeId}
                  {r.sportyBetSelection.odds !== undefined ? ` @ ${r.sportyBetSelection.odds}` : ""}
                </p>
              )}
            </div>
          ))}

          {resolvedCount > 0 && (
            <>
              <button type="button" className="btn btn-primary" onClick={download}>
                Download selections.json ({resolvedCount})
              </button>
              <LocalToolHandoff count={downloadedCount} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function SportyBetPage() {
  return (
    <>
      <h1>SportyBet Tools</h1>
      <p className="text-muted">
        Personal use only. Generating a new booking code needs your real login and happens in a separate local tool —
        see <code>sportybet-local-tool/README.md</code>.
      </p>
      <CodeAnalyzer />
      <AutoTicket />
      <TicketBuilder />
    </>
  );
}
