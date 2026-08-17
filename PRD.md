# Football Forecasting & Research Platform

Project Concept, Product Requirements & System Architecture

Status: draft (revised for a stateless, on-demand architecture — see "Architecture Pivot" below)

## Architecture Pivot (supersedes earlier persistent-storage design)

The system stores **no football data between runs**. Each analysis fetches what it needs live from the data sources, computes everything in memory, returns a forecast, and discards the fetched data. There is no database, no data warehouse, and no ingestion pipeline.

This is a deliberate trade-off, not an oversight — it directly removes three capabilities that a persistent design would otherwise support:
- **Backtesting** — evaluating model accuracy across historical windows requires storing predictions and comparing them to outcomes later; with nothing persisted, there's no historical prediction record to test.
- **Post-match evaluation / forecast history** — a forecast can't be checked against a real result days later if it isn't kept around until the match is played.
- **Model performance tracking over time** (calibration, Brier score, accuracy trends) — these are aggregates over a persisted forecast history that no longer exists.

Sections below that describe these capabilities (originally §23-26) are kept for context but marked **out of scope**. What remains in scope: live expected-goals/outcome/scoreline forecasting for a requested matchup, computed fresh from recent data each time it's asked for.

## 1. Project Overview

The Football Forecasting Platform is a stateless, on-demand tool that fetches recent football match data live, calculates team-performance metrics, compares two competing teams, and generates a probabilistic forecast for their upcoming match — computed fresh for each request, nothing stored afterward.

## 2. Research Objective

Core question: based on recent performance, current form, and available tactical/contextual factors, what is the statistically expected outcome of an upcoming football match?

The system forecasts expected goals for both teams, win/draw/loss probabilities, and likely scorelines, computed live per request from a Poisson/Dixon-Coles-style statistical model — not a persisted, separately-trained ML model.

## 3. Initial League Coverage

- English Premier League (EPL)
- English Football League Championship (EFL)
- English League One
- Spanish La Liga
- French Ligue 1
- Additional top European leagues as data availability permits

Potential future expansion: Bundesliga, Serie A, Eredivisie, Primeira Liga, Scottish Premiership, UEFA Champions League, UEFA Europa League.

League coverage should be **configurable, not hard-coded**, so competitions can be activated or deactivated from an administration interface.

## 4. Historical Data Requirement

No historical data is stored — each request fetches only as much recent history as the requested two teams' feature computation needs (e.g. last 5/10/20 matches, current-season data), pulled live at request time and discarded afterward. "5-6 seasons" no longer applies as a storage target; it's a ceiling on how far back a single request may look for a given team's baseline stats.

Fields fetched per match (in memory, per request, not persisted):
- Results and dates
- Home and away teams
- Full-time and half-time scores
- Expected goals (xG) and expected goals against (xGA)
- Non-penalty xG
- Shots and shots on target
- Corners
- Possession
- Final-third entries
- Formations and lineups
- Team and player information
- Transfers
- Managerial changes
- Other reliable contextual variables

## 5. Data Architecture

Stateless request pipeline — nothing is written to disk at any stage:

```
User requests a matchup → Live fetch from data sources (per team)
  → In-memory cleaning/normalization → In-memory feature computation
  → Prediction Engine (computed fresh) → Forecast response → discarded
```

- Forecasts must still use only information available before the match — **no future-data leakage** — this constraint doesn't go away just because nothing is stored; it means the fetch step must not pull in data from after the match being analyzed (relevant mainly for re-analyzing past matches for demo/testing purposes).

## 6. Core Data Objects (in-memory only — not database entities)

League, Season, Team, Player, Manager, Match, Match Statistics, Lineup, Formation, Team Form, Transfer, Manager Change — all fetched and held in memory for the duration of one request, then discarded. No Predictions/Prediction Results/Model Versions/Research Forecast Tickets tables exist, since nothing persists past a single request-response cycle.

## 7. Match-Level Data Fields

`match_id`, `league_id`, `season_id`, `match_date`, `home_team_id`, `away_team_id`, `home_goals`/`away_goals`, `home_half_time_goals`/`away_half_time_goals`, `home_xg`/`away_xg`, `home_non_penalty_xg`/`away_non_penalty_xg`, `home_shots`/`away_shots`, `home_shots_on_target`/`away_shots_on_target`, `home_corners`/`away_corners`, `home_possession`/`away_possession`, `home_final_third_entries`/`away_final_third_entries`, `home_formation`/`away_formation`, `home_momentum`/`away_momentum`.

## 8. Core Team Metrics

The feature-engineering layer calculates team performance at overall, home, away, and recent-form levels.

## 9. Required Core Metrics

- Expected Points / Game
- xG Difference / Game
- Shot Difference / Game
- Non-Penalty xG Difference / Game
- Shot-on-Target Difference / Game
- Momentum Difference
- Goal Difference / Game
- Points / Game
- Momentum
- Possession
- Final Third Entries
- Formation / Lineup

## 10. Time and Recency Weighting

Historical matches should not all receive equal influence. Recent matches carry greater weight; older matches retain some influence.

Recommended starting structure: last 5 matches 35%, matches 6–10 25%, matches 11–20 20%, current-season historical data 15%, older seasons 5%. For production, test an exponential decay function against fixed buckets.

The model should also calculate overall, season-level, last-20, last-10, and last-5 performance so the dashboard can explain how recent form differs from long-term strength.

## 11. Home and Away Advantage

Distinguish home and away performance. For each team, calculate separate attacking and defensive strengths for home and away fixtures:

- Home/away goals per game, xG/game, xGA/game, points/game, shots, SOT
- League-wide home advantage baseline

## 12. Momentum Model

Momentum is a **composite feature**, not a simple win/loss sequence:

- Recent points performance
- Recent xG difference
- Recent goal difference
- Recent shot difference
- Recent shot-on-target difference
- Recent trend versus season baseline

Inputs must be normalized before combining so no single metric dominates due to scale.

## 13. Formation and Tactical Features

Treated as supporting/contextual information (sample sizes can be small):

- Primary formation, formation frequency, results under formation
- Goals/xG/xGA per game under formation
- Possession and shot profile
- Potential formation matchup effects

Formation should not become a dominant predictor unless backtesting demonstrates statistically meaningful predictive value.

## 14. Transfers and Squad Changes

Converted into measurable squad-strength adjustments, not simple categorical events:

- Incoming/outgoing player, position, expected minutes
- Previous xG/xA or relevant performance contribution
- Defensive contribution where applicable
- League/team strength adjustment, estimated net squad impact

Where player-level data is incomplete, treat transfer impact as an **uncertainty factor**, not a precise score.

## 15. Managerial Changes

- Manager change date
- Previous/new manager performance, matches under new manager
- Points/game, xG difference, goal difference under new manager
- Performance change relative to previous baseline

Maintain distinct pre-change and post-change periods to avoid blending materially different team states.

## 16. Prediction Engine

Multiple specialized calculations rather than one opaque formula, all computed live from the request's freshly-fetched data — no separately trained/persisted model file:

- Expected Goals Model
- Home/Draw/Away Outcome Model
- Scoreline Distribution Model
- First-Half Goals Model
- Second-Half Goals Model
- Corners Model

Approach: a **Poisson/Dixon-Coles model** — team attack/defense strengths computed directly from the fetched recent-form window, home/draw/away and scoreline probabilities derived from the resulting bivariate Poisson distribution. This is a closed-form statistical calculation, not a trained ML model, which fits the stateless design: gradient boosting or multinomial logistic regression would need pre-trained, persisted weights that this architecture has nowhere to store.

## 17. Expected Goals Forecast

Estimate expected goals per team using attacking strength, defensive strength, home/away context, xG, xGA, shots, SOT, recent form, momentum, and other validated features.

Example output: Home xG 1.84 / Away xG 1.07 / Expected total goals 2.91.

## 18. Win / Draw / Loss Probability

Output a **calibrated probability distribution**, not a single deterministic prediction. Example: Home win 58.7%, Draw 23.1%, Away win 18.2%. Probabilities must sum to 100% after rounding tolerance.

## 19. Scoreline Distribution

Using expected-goals outputs and/or a dedicated scoreline model, calculate probabilities for plausible scorelines (0-0, 1-0, 1-1, 2-0, 2-1, 2-2, 3-0, 3-1, other). Dashboard should show the most probable scorelines with probabilities, not present one score as certain.

## 20. First-Half and Second-Half Forecasting

- Average first-half goals scored/conceded
- Average second-half goals scored/conceded
- Expected first-half, second-half, and full-match goals

Enables investigating whether teams have materially different first-half vs. second-half scoring profiles.

## 21. Corners Model

- Corners for/against per game, home/away corner strength, recent corner trend
- Expected home/away/total corners

## 22. Match Analysis Screen

Primary screen, showing: teams and requested date, home vs. away comparison, overall and home/away statistics, last 5/10/20 form, xG/xGA comparison (where the leagues involved have it), shots/SOT comparison, corners, possession, formation and lineup info where available, momentum, transfers/managerial context where available, the live forecast, and an explanation of key positive/negative factors — all fetched and computed at request time.

### Example Forecast Panel

```
ARSENAL vs CHELSEA
Expected Arsenal goals: 1.84    Expected Chelsea goals: 1.07
Arsenal win: 58.7%   Draw: 23.1%   Chelsea win: 18.2%
```

Explanation example: "Arsenal's stronger home attacking profile and superior recent chance creation outweigh Chelsea's recent improvement, subject to the quality and availability of the underlying data."

## 23. Forecast Output (no persistence) — *revised from "Research Forecast Ticket"*

**Out of scope under the Architecture Pivot.** There is no stored Research Forecast ID, no locked data snapshot, and no forecast history — the forecast above is the complete output of a request; once returned to the user, nothing about it is retained anywhere. If the user re-runs the same matchup later, it's fetched and computed fresh again, and may differ slightly if the underlying source data has changed since (e.g. more recent matches now count toward form).

## 24. Post-Match Evaluation

**Out of scope under the Architecture Pivot** — there's no stored forecast to compare a later result against.

## 25. Model Performance Dashboard

**Out of scope under the Architecture Pivot** — accuracy/calibration tracking requires a persisted forecast history, which this design doesn't have.

## 26. Backtesting Methodology

**Out of scope as a product feature under the Architecture Pivot.** Ad hoc, one-off validation is still possible during development (e.g. manually pulling a past matchup and checking the forecast against what actually happened), but it isn't a persisted, repeatable pipeline feature.

## 27. Dashboard Pages

Overview, Upcoming Matches (fetched live per league), Match Analysis, Team Profile, League Explorer, Historical Form (computed live per request), Data Source Status (whether each live source responded for the current request), Settings.

## 28. System Workflow

1. User selects two teams (or picks an upcoming fixture) to analyze
2. Fetch recent team data live from the relevant sources for both teams
3. Clean and normalize the fetched data in memory
4. Calculate team features (in memory)
5. Apply recency weighting
6. Apply home/away adjustments
7. Incorporate whatever squad/manager data the sources returned
8. Run the prediction calculation
9. Generate expected goals and probabilities
10. Return the forecast to the user — nothing is stored afterward

## 29. Recommended Development Phases

**Phase 1 — Live Data Fetchers**
Per-source fetch functions (football-data.co.uk, API-Football, Understat, FotMob) that return recent match/team data for a requested team, in memory, on demand — no ingestion pipeline, no database.

**Phase 2 — Analytics Engine**
Team averages; home/away splits; last 5/10/20 form; xG difference; shot/SOT difference; corners; points/game — all computed in memory from what Phase 1 just fetched.

**Phase 3 — Prediction Engine**
Poisson/Dixon-Coles expected-goals calculation; derived 1X2 and scoreline probabilities; corners estimate.

**Phase 4 — Advanced Features**
Recency weighting; momentum; formation context; transfer/manager context where the fetched data includes it.

**Phase 5 — Output & Presentation**
Forecast panel formatting; plain-language explanation of key factors driving the forecast.

**Phase 6 — Netlify Dashboard**
Next.js frontend + Netlify Functions: team/matchup picker, calls the fetch→compute→forecast pipeline per request, renders the Match Analysis screen.

## 30. Key Research Principle

Still worth holding onto as a development habit even without a formal backtesting pipeline: don't assume more statistics automatically improves the forecast. When adding a feature (formation, momentum, transfers), spot-check it against a handful of known past matchups before trusting it, rather than assuming more inputs is strictly better.

## 31. MVP Definition

- The 5 initial leagues, live-fetched (no bulk historical ingestion)
- Goals, xG (where available), shots, SOT, corners, possession for the two requested teams' recent matches
- Home/away splits; last 5/10/20 form, computed live
- Expected goals forecast; home/draw/away probabilities; scoreline probabilities
- Netlify-hosted UI: pick two teams (or an upcoming fixture), get a forecast panel back

## 32. Final Product Vision

A lightweight, on-demand football matchup analyzer: pick two teams, and the system live-fetches their recent form, computes comparable team-performance features, and returns an explainable probabilistic forecast for how they're expected to perform against each other — computed fresh every time, nothing stored, nothing to maintain beyond the live data-source integrations themselves.

## 33. Deployment Architecture

Entirely on Netlify, TypeScript throughout:

- **Next.js frontend + Netlify Functions** — one deployable. Functions handle the live fetch → compute → forecast pipeline per request (Phases 1-5); the frontend is the Match Analysis screen (Phase 6).
- **No database, no separate backend service.** Each request is self-contained: fetch what's needed from the four data sources, compute in memory, respond, discard.

Data sources (see DATA_SOURCES.md): football-data.co.uk, API-Football, Understat, and FotMob's unofficial API (flagged risk — its ToS forbids this use; treat as a bridge source, used lightly and not redistributed, until a licensed replacement is affordable).

## Appendix: Metric Reference

| Category | Metrics | Purpose |
|---|---|---|
| Attacking | Goals/game, xG/game, non-penalty xG/game, shots/game, shots-on-target/game | Measure chance creation and scoring strength |
| Defensive | Goals conceded/game, xGA/game, non-penalty xGA, shots conceded, SOT conceded | Measure defensive resistance |
| Results | Points/game, expected points/game, goal difference/game | Measure performance and results |
| Chance Quality | xG difference/game, non-penalty xG difference/game | Measure underlying performance |
| Possession & Territory | Possession %, final-third entries/game | Measure territorial control |
| Set Pieces | Corners for/against and corner difference | Measure set-piece and attacking pressure |
| Momentum | Recent points, xG difference, goal difference, shot/SOT trends | Measure current trajectory |
| Tactical | Formation, formation frequency and performance | Capture tactical context |
