# Action Plan

Sequential build order, derived from PRD.md §29 (Development Phases). Rewritten after the Architecture Pivot (see PRD.md) to a stateless, on-demand design: no database, no ingestion pipeline, everything fetched live and computed in memory per request, deployed entirely on Netlify in TypeScript.

Work through top to bottom. Nothing here is code yet unless marked built — each action gets scoped/decided immediately before it's built.

## Superseded by the Architecture Pivot (kept for history, not being built)

These were completed under the earlier persistent-storage design and are no longer part of the plan. The files they produced (`schema.sql`, `SCHEMA.md`, `engine/`) have been deleted.

- ~~Decide runtime stack: hybrid Python engine + Postgres~~ → replaced by 1.2 below
- ~~Design DB schema (ref/raw/core/features/research)~~ → no database exists in this design
- ~~Build league/season/team reference-data ingestion into Postgres~~ → replaced by 1.4 below (live fetch, no ingestion)

## Phase 1 — Live Data Fetchers

- [x] **1.1** Decide data source(s) — **DECIDED**, see DATA_SOURCES.md for full research. Stack: **football-data.co.uk** (results/shots/corners/odds, free) + **API-Football** (lineups/formations/transfers/managerial changes, ~$19-60/mo) + **Understat** (xG/xGA/npxG for EPL/La Liga/Ligue 1, free, scraped) + **FotMob unofficial API** (xG for Championship/League One, free, scraped — its ToS explicitly forbids this use; use lightly, cache per-request only, never redistribute, and revisit for a licensed replacement once revenue justifies it)
- [x] **1.2** Decide runtime stack — **DECIDED**: TypeScript throughout, Next.js + Netlify Functions, entirely on Netlify. No database, no separate backend service — each request fetches, computes, and responds in one pass.
- [x] **1.3** Build a fetch function per source — **BUILT**, type-checks clean. See `app/lib/sources/`:
  - `footballData.ts` — `fetchFootballDataMatches(team, league, seasonsBack)`, downloads/parses the relevant season CSV(s), filters to the team
  - `apiFootball.ts` — `fetchApiFootballTeamMatches(teamId, last)` (fixtures + merged per-fixture stats), plus `fetchApiFootballLineups`, `fetchApiFootballTransfers`, `fetchApiFootballManagerHistory` for Phase 4
  - `understat.ts` — `fetchUnderstatTeamMatches(teamSlug, seasonStartYear)`, EPL/La Liga/Ligue 1 only. **Unverified against a live response** (no test run yet) — flagged in-file, may need small fixes once actually exercised
  - `fotmob.ts` — `fetchFotmobTeamMatches(teamId, limit)`, Championship/League One xG bridge source. **Unverified against a live response** — same caveat, isolated to one `extractXg` helper for easy correction
- [x] **1.5** Normalize each source's response into one common in-memory shape — **DONE** as part of 1.3, see `app/lib/sources/types.ts` (`NormalizedMatch`) — every fetcher already returns this shape directly, so there's no separate normalization step to build
- [x] **1.4** Build team/league name resolution — **BUILT**, see `app/lib/teamResolution.ts`. Deliberately *not* a static ID table — API-Football/FotMob team IDs are arbitrary and provider-assigned, so hardcoding guessed numbers would silently return wrong teams' data. Instead: `resolveApiFootballTeamId`/`resolveFotmobTeamId` search each source live by name (both **unverified against a live response**, same caveat as their fetchers), and `resolveUnderstatSlug` derives the slug directly (name → underscores, with an override map for known exceptions) since Understat has no search endpoint.
- [x] **1.6** Handle partial failures gracefully — **BUILT**, see `app/lib/fetchAll.ts`. `fetchTeamDataFromAllSources(teamName, league)` calls only the sources configured for that league (`config.ts`'s `LEAGUE_DATA_SOURCES`), wraps each in a try/catch that returns `{source, matches: [], error}` instead of throwing, and returns all results together — one source failing never blocks the others.

## Phase 2 — Analytics Engine (in-memory, per request)

- [x] **Merge step (new, not in the original phase list)** — **BUILT**, see `app/lib/analytics/mergeMatches.ts`. `fetchTeamDataFromAllSources` returns one array per source; before any stats can be computed, matches for the same real-world fixture need combining into one record per match, since goals/xG/shots/possession are split across different sources. Matches by date (teams in these leagues play at most one match/day, so no fuzzy opponent-name matching needed) and resolves field-level conflicts by source precedence (football-data.co.uk wins for goals/shots/corners, Understat/FotMob win for xG, API-Football wins for possession/formation) — the same precedence rule flagged as an open item back when this was still a DB design.
- [x] **2.1** Compute team overall/home/away averages — **BUILT**, see `app/lib/analytics/teamStats.ts` (`computeVenueSplits`)
- [x] **2.2** Compute last-5/10/20 form windows per team — **BUILT**, `computeFormWindows` (adds an `overall` window = everything fetched, not a guaranteed full season)
- [x] **2.3** Compute derived differentials (xG diff, shot diff, SOT diff, goal diff, points/game, expected points/game) — **BUILT**, inside `summarizeMatches`, which both of the above call. Expected points/game uses a shared Poisson helper (`app/lib/analytics/poisson.ts`) applied retrospectively to each match's own xG — this Poisson module is also what Phase 3's forecast will reuse.
- [x] **2.4** Compute first-half/second-half split metrics — **BUILT**, `computeHalfSplits`

## Phase 3 — Prediction Engine

- [x] **3.1** Implement the expected-goals calculation from the two teams' computed attack/defense strengths — **BUILT**, see `app/lib/prediction/expectedGoals.ts`. This is a **simplified attack-vs-defense average, not full Dixon-Coles** — true Dixon-Coles fits attack/defense parameters via MLE across a whole league, which needs bulk data this stateless design never fetches (only the two requested teams). Flagged in-file as a deliberate simplification versus PRD §16's "Dixon-Coles-style" phrasing.
- [x] **3.2** Derive home/draw/away probabilities — **BUILT**, reuses `matchOutcomeProbabilities` from Phase 2's `poisson.ts` (independent-Poisson over the two xG values)
- [x] **3.3** Derive scoreline probabilities — **BUILT**, see `app/lib/prediction/scoreline.ts`. Top-8 most likely scorelines plus an "other" bucket (`1 - sum(top 8)`, an approximation not an exact tail integral)
- [x] **3.4** Derive first-half/second-half and corners estimates — **BUILT**, inside `app/lib/prediction/predictMatch.ts`, reusing Phase 2's `computeHalfSplits` and the venue-split corner averages
- [x] **3.5** Sanity-check against known-shape matchups — **DONE**, see `app/scripts/sanityCheckPrediction.ts`. Not a real backtest (no live credentials yet, and backtesting is out of scope post-pivot anyway) — synthetic strong-home-team-vs-weak-away-team data run through the full pipeline. All 6 checks passed: home xG (1.9) > away xG (0.85), home win 62% > draw 22% > away win 16%, outcome and scoreline probabilities each sum to ~1, home corners (6.2) > away corners (2.8).

## Phase 4 — Advanced Features

- [x] **4.1** Implement recency weighting — **BUILT**, `computeRecencyWeightedStats` in `app/lib/analytics/teamStats.ts`, using PRD §10's fixed buckets (35/25/20/20, the last two originally 15/5 by season but combined since MergedMatch carries no season boundary). Wired directly into `predictMatch.ts`, replacing the flat venue-split averages Phase 3 originally used — so this isn't inert, it actually changes the live forecast. Exponential decay (the "test against fixed buckets" refinement PRD §10 mentions) is deferred, not needed for MVP.
- [x] **4.2** Implement normalized momentum composite — **BUILT**, `app/lib/analytics/momentum.ts` (`computeMomentum`, comparing `computeFormWindows`' `last5` against `overall`). Normalization is fixed-scale division, not a real population z-score — flagged in-file, since there's no league-wide dataset here to compute one against. Verified with a synthetic hot-streak-after-poor-form fixture set (`scripts/sanityCheckMomentum.ts`): momentum score and all 4 available component deltas came back positive as expected.
- [x] **4.3** Add formation context — **BUILT**, `app/lib/analytics/formations.ts` (`summarizeFormations`). Required extending `fetchApiFootballTeamMatches` with an opt-in `includeFormations` flag (one more request per fixture via `fetchApiFootballLineups`) since formation was never actually populated on `NormalizedMatch` before now — off by default to avoid tripling the request count for every caller that doesn't need it. Informational only, not fed into the Poisson model, per PRD §13. Same sanity script confirmed the 4-3-3 formation (used in the more recent, larger bucket of synthetic matches) was correctly identified as primary.
- [x] **4.4** Add transfer/manager-change context — **BUILT**, `app/lib/analytics/teamContext.ts` (`fetchTeamContext`), reusing Phase 1's `fetchApiFootballTransfers`/`fetchApiFootballManagerHistory`. Informational only — PRD §14/§26 gate promoting these to real model inputs on backtesting evidence, and backtesting is out of scope entirely post-pivot, so this stays permanently display-only rather than "informational for now."

## Phase 5 — Output & Presentation

- [x] **5.1** Format the forecast panel — **BUILT**, `app/lib/presentation/forecastPanel.ts` (`formatForecastPanel`) + `modelConfidence.ts` (`computeModelConfidence`, a heuristic 0-100 "how much data the model had," explicitly **not** a calibrated statistical confidence — calibration needs backtesting, which is out of scope post-pivot).
- [x] **5.2** Generate a plain-language explanation — **BUILT**, `app/lib/presentation/explanation.ts` (`explainForecast`), rule-based templating (no LLM call needed — inputs are already structured numbers). Verified end-to-end with `scripts/sanityCheckPresentation.ts`, output matches PRD §22's example format and tone:
  ```
  STRONGSIDE FC vs WEAKSIDE UNITED
  Expected Strongside FC goals: 1.89    Expected Weakside United goals: 0.85
  Strongside FC win: 61.8%   Draw: 21.8%   Weakside United win: 16.3%
  Model confidence: 83/100

  Strongside FC's strong underlying attacking and defensive balance, subject to the quality and availability of the underlying data.
  ```

## Phase 6 — Netlify Dashboard

- [x] **6.2** Netlify Function wiring fetch → analyze → predict → present into one request handler — **BUILT**, `src/app/api/forecast/route.ts` (Next.js App Router route — Netlify's Next.js runtime deploys these as functions automatically, no hand-written `netlify/functions` needed). Scaffolding this required setting up the actual Next.js project (`package.json` next/react deps, `next.config.mjs`, `tsconfig.json` reworked for Next's `bundler` module resolution, a `@lib/*` path alias into the existing `lib/` code) under `src/app/`, kept separate from `lib/` so the project root didn't become a confusing nested `app/app/`.
- [x] **6.1** Next.js frontend: matchup picker → calls the function → renders the Match Analysis screen — **BUILT**, `src/app/page.tsx` + `src/app/layout.tsx`. Verified for real: `next build` succeeds, `next dev` serves the page (HTTP 200, correct title/heading), and a live POST to `/api/forecast` for Arsenal vs Chelsea returned a complete, sane forecast.
- [x] **6.3** Data Source Status display — **BUILT**, included directly in the API response (`dataSourceStatus.home`/`.away`, one row per source with match count + error) and rendered as tables on the page.
- [x] **6.4** Team Profile / League Explorer pages — **BUILT**. The missing capabilities (league roster, upcoming fixtures) turned out to already exist, unused, in FotMob's league overview page — the same `__NEXT_DATA__` page already used for team-ID resolution also has `pageProps.table` (full standings) and `pageProps.fixtures.allMatches` (the whole season, 380 matches for a 20-team league, confirmed live, `status.finished` distinguishing past/future). Extracted into `app/lib/sources/fotmobLeague.ts` (`fetchLeagueTable`, `fetchLeagueFixtures`).
  - `/api/league/explore?league=X` and `/api/team/profile?team=X&league=Y` routes, both live-tested against real Premier League data (20 table rows, real upcoming fixtures with correct IDs/kickoff times; Arsenal's profile correctly returned 44 matches played, momentum score, and 10 upcoming fixtures).
  - `/leagues` (table + upcoming fixtures, click a team → profile, click a fixture → prefilled analyzer) and `/team` (form windows, venue splits, momentum, upcoming fixtures, data source status) pages, both live-rendered.
  - The main page (`/`) now reads `?homeTeam=&awayTeam=&league=` to prefill from these links — required wrapping it in a `Suspense` boundary since `useSearchParams` needs one in the App Router.
- [x] **6.5** Netlify deployment config — **BUILT**. `netlify.toml` at the repo root (`base = "app"`, since this repo has multiple top-level projects and only `app/` deploys to Netlify — `sportybet-local-tool/` never does), `@netlify/plugin-nextjs` added as a dev dependency, plus `.gitignore`/`.env.example` for `app/` (only `API_FOOTBALL_KEY` is actually read anywhere in the codebase — confirmed by grepping for `process.env.*`, so that's the complete env var list). Verified the build still passes with the new dependency added. **Not done**: no git repo exists yet, so nothing is actually pushed/connected to Netlify — that's the next real step whenever you're ready to go live, not something to do silently.

### Live-testing findings during Phase 6 (real network access, not synthetic data)

- **Understat is a confirmed dead end**, not just an unverified assumption. A direct HTTP fetch of a real team page returns 200 OK with correct page content but *no* embedded match-data JSON anywhere in the response — consistent with its `robots.txt: Disallow: /` being a real technical signal. Fixing this would need a headless browser (Playwright/Puppeteer), which is a real option but wasn't pursued given the added dependency weight and cold-start cost in a serverless function. See the confirmed-dead-end note in `sources/understat.ts`.
- **FotMob's originally-guessed `/api/*` endpoints are also dead** (every one now serves a 404 page, not JSON) — but its actual Next.js frontend embeds the same data via a standard `__NEXT_DATA__` script tag on team/league/match pages, which is what `fotmob.ts`/`fotmobShared.ts`/`teamResolution.ts` were rewritten to parse instead. Verified live: real fixtures, real xG/shots/corners/possession stats, and a working name→ID resolver (via each league's table page, IDs confirmed live: Premier League 47, Championship 48, League One 108, La Liga 87, Ligue 1 53).
- Given Understat's confirmed failure, **FotMob was extended from Championship/League-One-only to all 5 leagues** (config.ts) — this was a user decision (extending its already-accepted ToS risk rather than adding FootyStats as a paid dependency or dropping xG for 3 leagues).
- **API-Football could not be live-tested** (no API key configured) — confirmed it fails gracefully (per-source error, not a crashed request) rather than confirmed working.

---

**Status: MVP feature-complete for the core matchup-analysis flow (Phases 1-6.3).** Remaining before this is genuinely usable: get an API-Football key and test with it live (currently unverified), and decide whether 6.4 (browsing/exploration pages) is worth building next or whether real-world use of the matchup analyzer should come first.

## Phase 7 — SportyBet Integration (personal use only)

Added after the fact — not in the original PRD, and a deliberate reversal of PRD §23's original design principle (internal Research Forecast ID instead of a bookmaker-specific code), made consciously for personal use. Two directions, with very different feasibility:

- **Read direction (booking code → matches → our analysis)**: stateless, no login needed, fits the existing Netlify app.
- **Write direction (our analysis → new booking code)**: confirmed to require an authenticated SportyBet session — no public or guest-accessible way to generate a share code exists. This **cannot** run as a Netlify Function (needs a real browser + your real login) — it's a separate local-only tool, see below.

Feasibility research (`sportybet-research`, live-tested 2026-08-17): confirmed via direct `curl`/HTML inspection, not guessed —
- `sportybet.com/ng/lite/betslip` is a plain HTML form, no login/JS, that validates booking codes server-side (confirmed the invalid-code response; the successful-load response shape is *inferred* from the same template's confirmed guest-slip markup, not directly observed — every test code was expired).
- SportyBet has a public "Code Hub" feature explicitly for sharing/discovering booking codes — this is a sanctioned public feature, not an internal API being reverse-engineered against the site's wishes, which meaningfully lowers the risk framing for the read side specifically.
- Building a guest betslip (adding selections) works via plain links with `eventId`/`marketId`/`outcomeId`/`odds` params, no login required — confirmed live.
- Generating a *new* share code was not found exposed anywhere without login, and no public/leaked endpoint exists for it (checked GitHub — existing SportyBet automation projects all use full browser automation, not an API).
- Only verified for the **Nigeria** site (`/ng/`) — Ghana redirects to a different JS-heavy flow, Kenya/Tanzania don't have this URL pattern at all.
- SportyBet's actual ToS text could not be fetched (client-rendered, failed to load) — genuinely unverified, not assumed clean.

- [x] **7.1** Decode a booking code into its selections — **BUILT**, `app/lib/sources/sportybet.ts` (`decodeBookingCode`). Live-tested against the confirmed invalid-code error path; the success-path HTML parser is written against the same template's confirmed structure but not yet exercised against a real, current code.
- [x] **7.2** Map "Team A vs Team B" to SportyBet's own match ID — **BUILT**, `findSportyBetMatch`, scoped to the right competition ("England - Premier League" etc.) before matching team names — this scoping was added after live testing caught the unscoped version matching across the wrong country's league entirely (a real "Malta - Premier League" fixture would have been eligible to match). The exact label text for our 5 leagues specifically is inferred from the confirmed `"{Country} - {League}"` pattern seen on other leagues, not directly observed (none of our 5 leagues had fixtures in the tested window).
- [x] **7.3** Netlify route: decode a code, run our existing forecast pipeline on each decoded match (skipping any match outside our 5 supported leagues), and report whether our analysis agrees with the slip's chosen outcome — **BUILT**, `src/app/api/sportybet/analyze-code/route.ts`. Live-tested end to end for the error path (invalid code → clean 422).
- [x] **7.4** Netlify route: given a list of matches, run our analysis, find each on SportyBet's public listing, and return ready-to-use `{eventId, marketId, outcomeId}` selections for the favored outcome — **BUILT**, `src/app/api/sportybet/build-ticket/route.ts`. Live-tested end to end: correctly returns "not found" for a match not currently listed, and the underlying competition-scoped lookup was separately verified against real data to find the right match when one exists (the 1X2 market/outcome ID mapping — marketId "1", outcomeId 1/2/3 for home/draw/away — is inferred from an observed odds pattern, not an explicitly labeled fact, and is worth double-checking before trusting it for something you'll act on).
- [x] **7.5** Frontend UI for both flows — **BUILT**, `src/app/sportybet/page.tsx`. Code-analyzer form (decodes a code, shows our forecast + agree/disagree per supported selection) and a ticket-builder (add matches → run analysis → get SportyBet selections, with a "copy as JSON" box in exactly the shape `sportybet-local-tool` expects as input, closing the loop between the web UI and the local script). Linked from the main page. Verified live: page renders (`HTTP 200`, both section headings present), and the analyze-code flow's error handling works end to end through the real page route.
- [x] **7.6** Local-only write-side tool — **BUILT**, `sportybet-local-tool/` (separate Node project, not deployed to Netlify — needs a real browser + your real login, neither of which fit a serverless function). `createTicket.ts`: opens a real visible browser, you log in yourself (your password never touches the script), it adds each selection via the confirmed-working add-to-slip URLs, then attempts to find a share/booking-code control automatically — **this last part is unverified**, since research only found the share feature described in help docs, never observed in the actual logged-in DOM. Falls back to asking you to click it yourself and paste the code back if auto-detection fails. Type-checks clean; not run end-to-end (needs a real account + GUI browser, neither available here) — see `sportybet-local-tool/README.md` for setup and honestly-stated limitations.
