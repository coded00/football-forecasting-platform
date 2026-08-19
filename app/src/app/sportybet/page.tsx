"use client";

import { createContext, useContext, useState } from "react";

const LEAGUES = ["Premier League", "Championship", "League One", "La Liga", "Ligue 1"] as const;
type League = (typeof LEAGUES)[number];

interface SportyBetSelectionRef {
  eventId: string;
  marketId: string;
  outcomeId: string;
  odds?: number;
}

interface CartItem {
  homeTeam: string;
  awayTeam: string;
  favoredOutcome?: string;
  confidence?: number;
  sportyBetSelection: SportyBetSelectionRef;
}

// A single ticket shared across all three analysis flows below — you can pull
// today's board, analyze a booking code, AND hand-pick a match, and "Add to
// ticket" from any of them lands in the same place. This is the actual
// requested flow: analyze, click add, then generate one ticket from
// everything you added — not a separate download per section.
const CartContext = createContext<{
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (eventId: string) => void;
  clear: () => void;
} | null>(null);

function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within the ticket cart provider");
  return ctx;
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

function AddToTicketButton({ item }: { item: CartItem }) {
  const { items, add } = useCart();
  const added = items.some((i) => i.sportyBetSelection.eventId === item.sportyBetSelection.eventId);
  return (
    <button type="button" className={`btn btn-sm ${added ? "" : "btn-primary"}`} onClick={() => add(item)} disabled={added}>
      {added ? "Added ✓" : "Add to ticket"}
    </button>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;
  const level = confidence >= 70 ? "badge-success" : confidence >= 40 ? "" : "badge-error";
  return (
    <span className={`badge ${level}`} style={{ marginLeft: "0.5rem" }} title="How much data the model had to go on — not a probability this pick is correct">
      Assurance: {confidence}/100
    </span>
  );
}

function TicketCart() {
  const { items, remove, clear } = useCart();
  const [downloadedCount, setDownloadedCount] = useState(0);

  function generate() {
    downloadJson(
      "selections.json",
      items.map(({ homeTeam, awayTeam, favoredOutcome, sportyBetSelection }) => ({ homeTeam, awayTeam, favoredOutcome, sportyBetSelection }))
    );
    setDownloadedCount(items.length);
  }

  return (
    <div className="card" style={{ position: "sticky", top: "4.5rem", zIndex: 5 }}>
      <div className="field-row" style={{ justifyContent: "space-between", marginBottom: items.length ? "0.75rem" : 0 }}>
        <h3 style={{ margin: 0 }}>Ticket ({items.length})</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {items.length > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={clear}>
              clear
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={generate} disabled={items.length === 0}>
            Generate ticket
          </button>
        </div>
      </div>

      {items.map((item) => (
        <div key={item.sportyBetSelection.eventId} className="field-row" style={{ justifyContent: "space-between", marginBottom: "0.25rem" }}>
          <span>
            {item.homeTeam} v {item.awayTeam} — <strong>{item.favoredOutcome}</strong>
            <ConfidenceBadge confidence={item.confidence} />
          </span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => remove(item.sportyBetSelection.eventId)}>
            remove
          </button>
        </div>
      ))}

      {downloadedCount > 0 && (
        <div className="card" style={{ background: "var(--color-success-bg)", borderColor: "var(--color-success)", marginTop: "0.75rem", marginBottom: 0 }}>
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>{downloadedCount}</strong> selection(s) downloaded as <code>selections.json</code>.
          </p>
          <p className="text-muted" style={{ marginBottom: "0.5rem" }}>
            Move it into <code>sportybet-local-tool/</code>, then run this yourself (it opens a real browser for you to
            log into your own account — see that folder's README):
          </p>
          <pre className="panel" style={{ marginBottom: 0 }}>npm run create-ticket -- selections.json</pre>
        </div>
      )}
    </div>
  );
}

// marketId "1", outcomeId 1/2/3 for home/draw/away — same inferred SportyBet
// 1X2 mapping used server-side (see build-ticket's comment on where this
// came from).
const OUTCOME_ID_BY_RESULT: Record<string, string> = { Home: "1", Draw: "2", Away: "3" };

interface AnalyzedSelection {
  selection: {
    homeTeam: string;
    awayTeam: string;
    market: string;
    outcomeLabel: string;
    odds: number;
    eventId: string;
    marketId: string;
  };
  supported: boolean;
  reason?: string;
  league?: string | null;
  panelText?: string;
  explanation?: string;
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
              <div className="field-row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {r.selection.homeTeam} v {r.selection.awayTeam}
                </strong>
                {r.supported && r.favoredOutcome && r.selection.market === "1X2" && (
                  <AddToTicketButton
                    item={{
                      homeTeam: r.selection.homeTeam,
                      awayTeam: r.selection.awayTeam,
                      favoredOutcome: r.favoredOutcome,
                      confidence: r.confidence,
                      sportyBetSelection: {
                        eventId: r.selection.eventId,
                        marketId: r.selection.marketId,
                        outcomeId: OUTCOME_ID_BY_RESULT[r.favoredOutcome],
                        // Only trustworthy if our pick matches what was actually
                        // priced in the slip — for a different (disagreeing) pick,
                        // this system doesn't have fresh odds for that outcome.
                        odds: r.agreesWithSlip ? r.selection.odds : undefined,
                      },
                    }}
                  />
                )}
              </div>
              {r.selection.market}: {r.selection.outcomeLabel} @ {r.selection.odds}
              {!r.supported && <p className="text-muted">Not analyzed: {r.reason}</p>}
              {r.supported && (
                <>
                  <pre className="panel">{r.panelText}</pre>
                  {r.explanation && <p className="text-muted">{r.explanation}</p>}
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
  league?: string | null;
  supported: boolean;
  reason?: string;
  favoredOutcome?: string;
  confidence?: number;
  explanation?: string;
  homeWinProbability?: number;
  drawProbability?: number;
  awayWinProbability?: number;
  sportyBetSelection?: SportyBetSelectionRef;
}

interface AutoTicketResponse {
  league: string;
  matchCount: number;
  analyzedCount?: number;
  truncatedTo?: number | null;
  results: AutoTicketResult[];
  note?: string;
}

const ALL_LEAGUES = "All";

// The actual requested flow: analyze EVERYTHING SportyBet has posted for a
// league (no pre-filtering, no manual entry), then "Add to ticket" per match
// (or select several via checkbox and add them all at once) puts it in the
// shared cart above — Generate there produces the download.
function AutoTicket() {
  const { add } = useCart();
  const [league, setLeague] = useState<League | typeof ALL_LEAGUES>(ALL_LEAGUES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AutoTicketResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function pull() {
    setLoading(true);
    setError(null);
    setData(null);
    setSelected(new Set());
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

  function addSelectedToTicket() {
    if (!data) return;
    data.results
      .filter((_, i) => selected.has(i))
      .filter((r): r is AutoTicketResult & { sportyBetSelection: SportyBetSelectionRef; favoredOutcome: string } =>
        Boolean(r.sportyBetSelection && r.favoredOutcome)
      )
      .forEach((r) => add({ homeTeam: r.homeTeam, awayTeam: r.awayTeam, favoredOutcome: r.favoredOutcome, confidence: r.confidence, sportyBetSelection: r.sportyBetSelection }));
  }

  const supportedIndexes = data ? data.results.map((r, i) => (r.supported ? i : -1)).filter((i) => i >= 0) : [];

  return (
    <section>
      <h2>Pull today's board and analyze</h2>
      <p className="text-muted">
        No typing — this pulls every match SportyBet is actually offering for a league right now and analyzes all of
        it. Add the ones you want to the ticket above.
      </p>

      <div className="field-row">
        <select className="select" value={league} onChange={(e) => setLeague(e.target.value as League | typeof ALL_LEAGUES)}>
          <option value={ALL_LEAGUES}>All leagues (everything posted)</option>
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
          {data.truncatedTo && (
            <p className="text-muted">
              {data.matchCount} matches were on the board — only analyzed the first {data.truncatedTo} to keep this
              responsive.
            </p>
          )}
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
                <button type="button" className="btn btn-primary btn-sm" onClick={addSelectedToTicket} disabled={selected.size === 0}>
                  Add {selected.size} to ticket
                </button>
              </div>
            </div>
          )}

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
                <div className="field-row" style={{ justifyContent: "space-between" }}>
                  <strong>
                    {r.homeTeam} v {r.awayTeam}
                    {r.league && <span className="text-muted"> — {r.league}</span>}
                  </strong>
                  {r.supported && r.favoredOutcome && r.sportyBetSelection && (
                    <AddToTicketButton
                      item={{ homeTeam: r.homeTeam, awayTeam: r.awayTeam, favoredOutcome: r.favoredOutcome, confidence: r.confidence, sportyBetSelection: r.sportyBetSelection }}
                    />
                  )}
                </div>
                {!r.supported && <p className="text-muted" style={{ marginBottom: 0 }}>Not analyzed: {r.reason}</p>}
                {r.supported && (
                  <>
                    <p style={{ marginBottom: 0 }}>
                      Favored: <strong>{r.favoredOutcome}</strong> (H {((r.homeWinProbability ?? 0) * 100).toFixed(1)}% / D{" "}
                      {((r.drawProbability ?? 0) * 100).toFixed(1)}% / A {((r.awayWinProbability ?? 0) * 100).toFixed(1)}%)
                      {r.sportyBetSelection?.odds !== undefined ? ` @ ${r.sportyBetSelection.odds}` : ""}
                      <ConfidenceBadge confidence={r.confidence} />
                    </p>
                    {r.explanation && <p className="text-muted" style={{ marginBottom: 0, fontSize: "0.85rem" }}>{r.explanation}</p>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface BuiltSelection {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  error?: string;
  favoredOutcome?: string;
  confidence?: number;
  explanation?: string;
  homeWinProbability?: number;
  drawProbability?: number;
  awayWinProbability?: number;
  sportyBetSelection?: SportyBetSelectionRef;
}

function TicketBuilder() {
  const { add } = useCart();
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
              <div className="field-row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {r.homeTeam} v {r.awayTeam}
                </strong>
                {r.sportyBetSelection && r.favoredOutcome && (
                  <AddToTicketButton
                    item={{ homeTeam: r.homeTeam, awayTeam: r.awayTeam, favoredOutcome: r.favoredOutcome, confidence: r.confidence, sportyBetSelection: r.sportyBetSelection }}
                  />
                )}
              </div>
              {r.error && <p className="text-error" style={{ marginBottom: 0 }}>{r.error}</p>}
              {r.sportyBetSelection && (
                <>
                  <p style={{ marginBottom: 0 }}>
                    Favored: {r.favoredOutcome} (H {((r.homeWinProbability ?? 0) * 100).toFixed(1)}% / D{" "}
                    {((r.drawProbability ?? 0) * 100).toFixed(1)}% / A {((r.awayWinProbability ?? 0) * 100).toFixed(1)}%) — eventId{" "}
                    {r.sportyBetSelection.eventId}, market {r.sportyBetSelection.marketId}, outcome {r.sportyBetSelection.outcomeId}
                    {r.sportyBetSelection.odds !== undefined ? ` @ ${r.sportyBetSelection.odds}` : ""}
                    <ConfidenceBadge confidence={r.confidence} />
                  </p>
                  {r.explanation && <p className="text-muted" style={{ marginBottom: 0, fontSize: "0.85rem" }}>{r.explanation}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  function add(item: CartItem) {
    setItems((prev) => (prev.some((i) => i.sportyBetSelection.eventId === item.sportyBetSelection.eventId) ? prev : [...prev, item]));
  }
  function remove(eventId: string) {
    setItems((prev) => prev.filter((i) => i.sportyBetSelection.eventId !== eventId));
  }
  function clear() {
    setItems([]);
  }

  return <CartContext.Provider value={{ items, add, remove, clear }}>{children}</CartContext.Provider>;
}

export default function SportyBetPage() {
  return (
    <CartProvider>
      <h1>SportyBet Tools</h1>
      <p className="text-muted">
        Personal use only. Generating a new booking code needs your real login and happens in a separate local tool —
        see <code>sportybet-local-tool/README.md</code>.
      </p>
      <TicketCart />
      <CodeAnalyzer />
      <AutoTicket />
      <TicketBuilder />
    </CartProvider>
  );
}
