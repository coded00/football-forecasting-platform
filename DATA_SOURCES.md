# Data Source Research (verified August 2026)

Feeds ACTIONS.md item 1.1. Ranked top 10 candidate sources for the required match/team/player data, plus a recommended combination for MVP.

**Note on the Architecture Pivot (see PRD.md):** this system fetches live, per request, for two specific teams at a time — it does not bulk-ingest full seasons into storage. That favors sources with a per-team endpoint (API-Football's `/fixtures?team={id}&last={n}`, Understat's/FotMob's per-team pages) over football-data.co.uk, which only offers full-season CSVs — fetching one of those per request means downloading and filtering the whole file down to one team every time. Still usable (the files are small), just heavier per request than the API-based sources. Nothing else in the source rankings/recommendation below changes.

**Time-sensitive flag:** FBref/Sports Reference had its Opta data-feed license terminated in January 2026 after a licensing dispute. As a result, xG, npxG, xGA, shots, shots-on-target, possession%, and passes-into-final-third have been removed sitewide, indefinitely, for every league. This kills the most commonly assumed "free xG source" and changes the sourcing plan versus most pre-2026 writeups.

**Live-verified update (Phase 6 implementation, 2026-08-16):** the research below was written before any source was actually implemented against real traffic. Building it surfaced two corrections worth flagging prominently, since they change the active sourcing plan (see config.ts):
- **Understat is now a confirmed dead end**, not just a ToS risk. A direct HTTP fetch of a real team page returns 200 OK with correct page content but embeds no match-data JSON anywhere in the response — its `robots.txt: Disallow: /` turned out to be a real technical signal (data likely requires JS execution / a headless browser now), not just a legal formality. It has been dropped from the active source list entirely.
- **FotMob's `/api/*` endpoints (what the "Access" line below describes) are also dead** — every one now returns a served 404 page instead of JSON. However, FotMob's own Next.js frontend embeds the same data directly in its pages via a standard `__NEXT_DATA__` script tag, which is what the actual implementation uses instead — verified live with real fixtures, xG, shots, corners, and possession data. Given Understat's failure, **FotMob has been extended to all 5 leagues** (was originally scoped to just Championship/League One), which was a deliberate choice to extend its already-accepted ToS risk rather than add a paid FootyStats dependency or drop xG for the other 3 leagues.

## Ranked Top 10

### 1. football-data.co.uk
- **Fields/depth:** FT/HT scores, dates, shots, SoT, corners, fouls, cards, referee, attendance, betting odds. No xG, no lineups/formations, no possession. EPL/La Liga/Ligue 1 back to 1993/94; Championship/League One back to 2000/01.
- **Access:** Plain CSV download per league/season, no auth, no API.
- **ToS/legal:** `robots.txt` fully permissive, no commercial-use restriction found. **Risk: Low.**
- **Libraries:** `soccerdata` wraps it; trivial to build a custom downloader.
- **Rate limits:** None — static files.
- **Cost:** Free. Paid sibling "TheStatsAPI" exists for programmatic access.
- **Gaps:** No xG/xGA, no lineups/formations, no possession, no final-third entries, no transfers/managers, team-level only.

### 2. API-Football (api-sports.io / RapidAPI)
- **Fields/depth:** Fixtures, results, lineups, formations, per-fixture stats (shots, SoT, corners, possession%), standings, transfers, coach/manager-change history, injuries, odds. Exact per-season depth for Championship/League One not independently confirmed — verify via `/leagues` coverage flags at integration time.
- **Access:** Documented REST API, officially licensed.
- **ToS/legal:** Licensed commercial API. **Risk: Low** within plan terms.
- **Libraries:** Official SDKs/wrappers in multiple languages.
- **Rate limits:** Free = 100 req/day. Paid from $19/mo (Pro, ~7,500 req/day) up to enterprise.
- **Cost:** Freemium → $19/mo+.
- **Gaps:** xG/xGA/npxG coverage inconsistent/unconfirmed across leagues and seasons — treat as stats+metadata source, not primary xG source, until verified per league.

### 3. FotMob (unofficial internal API)
- **Fields/depth:** Opta-sourced xG/xA (player + team), lineups, formations, live stats, possession, shots/SoT, corners. Covers all 5 target leagues.
- **Access:** Undocumented internal API (`api.fotmob.com`), clean JSON, no auth observed.
- **ToS/legal:** `robots.txt` disallows `/api/*` for general bots. ToS explicitly states scraping/reproduction/redistribution/commercial use is "strictly prohibited," bulk retrieval "expressly forbidden." **Risk: Medium** — strongest written prohibition of any source reviewed, though technical enforcement currently weak.
- **Libraries:** `soccerdata` (FotMob module), `fmscraper`, `pyfotmob`.
- **Rate limits:** None enforced today, but ToS forbids this use case outright.
- **Cost:** Free (unofficial); no licensed API offered.
- **Gaps:** No structured transfer/managerial-change data; npxG and HT scores not confirmed as clean fields.

### 4. Understat.com
- **Fields/depth:** Match- and shot-level xG/xGA/npxG with shot maps. Only EPL, La Liga, Bundesliga, Serie A, Ligue 1 + RFPL — **no Championship, no League One, ever.**
- **Access:** No API; scraped from embedded JSON in page HTML.
- **ToS/legal:** `robots.txt` = blanket `Disallow: /`. No separate ToS found. **Risk: Medium-High** — explicit machine-readable no-crawl signal.
- **Libraries:** `soccerdata`, `understatapi`, `understat` (async PyPI).
- **Rate limits:** None published; fragile to markup changes.
- **Cost:** Free.
- **Gaps:** No Championship/League One, no possession/corners/final-third, no lineups/transfers/managers.

### 5. WhoScored.com
- **Fields/depth:** Results, formations, lineups, proprietary ratings, shot data, possession, corners (Opta-fed). No native xG.
- **Access:** HTML scraping only, requires browser automation (Selenium); Cloudflare-fronted.
- **ToS/legal:** Terms explicitly prohibit copying/reproducing/republishing data without a license. Confirmed live: Cloudflare bot-challenge/403 to non-browser requests. **Risk: Medium** (explicit ToS ban + active technical blocking).
- **Libraries:** `soccerdata`, `ScraperFC`, standalone scrapers — all need Selenium/undetected-chromedriver, ongoing maintenance burden.
- **Rate limits:** Undocumented; Cloudflare challenge under volume.
- **Cost:** Free to browse; official Opta-licensed feed is paid.
- **Gaps:** No xG/xGA, no transfer/manager data.

### 6. FootyStats.org (API)
- **Fields/depth:** Team-level xG, BTTS, corners, cards, HT/FT, goal timings across 200+ selectable leagues incl. Championship and League One.
- **Access:** Documented commercial JSON API.
- **ToS/legal:** Licensed. **Risk: Low.**
- **Libraries:** None needed; official API.
- **Rate limits:** Tier-dependent.
- **Cost:** Hobby £29.99/mo (50 leagues, 1,800 req/hr) → Serious £69.99/mo (150 leagues, 3,600 req/hr) → Everything £389.99/mo (1,500+ leagues).
- **Gaps:** No npxG, no zonal possession/final-third entries, no formations field (only raw lineup arrays), no transfers, no managerial-change history — betting-market-stats oriented, not tactical/positional.

### 7. Transfermarkt
- **Fields/depth:** Transfers (with fees), market values, squad/player profiles, **managerial change history**, basic lineups/formations. No shots/xG/possession/corners.
- **Access:** No official API. Third-party community wrappers (`felipeall/transfermarkt-api`, `dcaribou/transfermarkt-scraper`) scrape it.
- **ToS/legal:** Explicit copyright/no-reproduction clause naming commercial resale specifically ("Reproduction... duplication... even in part... only permitted with prior written consent... Commercial resale of the content is prohibited"). `robots.txt` specifically blocks `wget` while allowing wildcard `*`. Confirmed active DataDome bot-mitigation causing recurring scraper breakage (open GitHub issues, 403s). No lawsuit/DMCA found, but **Risk: Medium-High** given explicit ToS + live anti-bot enforcement.
- **Libraries:** `transfermarkt-api` (felipeall, 441★), `transfermarkt-scraper` (dcaribou, 170★), `worldfootballR` (R).
- **Rate limits:** No official limit; community wrappers self-throttle (2-3s delays) to avoid DataDome blocks.
- **Cost:** Free (scraping only); no public commercial licensing offered.
- **Gaps:** No match-level shots/xG/possession/corners.

### 8. SofaScore.com
- **Fields/depth:** Proprietary xG model, lineups, formations, live stats, possession, shots. Broad coverage incl. lower divisions.
- **Access:** No public API; undocumented internal API (`api.sofascore.com`).
- **ToS/legal:** Both site and API host returned live HTTP 403 to direct requests during this research — stronger real-time blocking than WhoScored. Community maintainers report escalating anti-bot measures requiring full browser automation + rotating proxies. **Risk: Medium-High.**
- **Libraries:** `soccerdata` (Sofascore module), standalone scrapers, Apify commercial scrapers.
- **Rate limits:** Undocumented; aggressive IP-based blocking reported under volume.
- **Cost:** Free to browse; no licensed data API offered.
- **Gaps:** Clean non-penalty xG, corners/final-third fields, transfers/managerial data.

### 9. FBref.com / Sports Reference
- **Fields/depth:** **Pre-Jan-2026:** xG/npxG/xGA/shots/possession/final-third passes for Big-5 leagues from 2017/18, plus very deep basic results history (England top flight back to 1888/89). **Current state (post-Jan-2026): all advanced stats gone, sitewide, indefinitely.** Championship/League One only ever had shallow coverage and are now basic-only too.
- **Access:** HTML scraping; Cloudflare-fronted.
- **ToS/legal:** Explicit ban on "scripts, bots, scrapers, data miners"; published bot policy (10 req/min, 24h block on violation); Data Use policy forbids building competing products from scraped data. **Risk: Medium-High for commercial use.**
- **Libraries:** `soccerdata`, `ScraperFC`, `worldfootballR` — now scraping a much smaller dataset than before.
- **Rate limits:** 10 req/min hard-enforced, 24hr lockout on breach.
- **Cost:** Free to browse (reduced data); custom commercial datasets available via inquiry, pricing unpublished.
- **Gaps:** No longer a viable advanced-stats source as of Jan 2026 — xG/npxG/xGA/shots/SoT/possession/final-third all gone. Only useful for basic results/long history now.

### 10. Opta / Stats Perform (direct license) — aspirational, later phase
- **Fields/depth:** Industry gold standard — every required field at full depth across 3,900+ competitions. The upstream source most of the above sites used to repackage.
- **Access:** No self-serve API; enterprise sales engagement required.
- **ToS/legal:** Fully licensed. **Risk: None** (if affordable).
- **Libraries:** N/A — official SDKs/feeds under contract.
- **Rate limits:** Per-contract.
- **Cost:** Custom quote, no public pricing; industry anecdotes suggest costs escalate steeply with league/competition scope — likely beyond an early MVP budget, worth revisiting once the platform has revenue.
- **Gaps:** None functionally — only cost/access.

### Researched but excluded
- **StatsBomb open data** — real event-level data with shot xG/lineups, but sparse/disjointed coverage for target leagues (e.g. only 2 isolated EPL seasons, La Liga stops 2020/21, no Championship/League One ever). License explicitly **bans commercial exploitation of the data or derived analysis** — a hard blocker, not just an etiquette issue. **Risk: High for this use case.**
- **Wyscout (Hudl)** — enterprise scouting platform; individual plans (~€299-399/yr) don't include bulk stats API access; the real data-feed product is enterprise-quoted like Opta — redundant with Opta at the top of the budget ladder.
- **ClubElo.com** — free, open, zero anti-bot, deep historical Elo ratings, lowest-risk source reviewed — but Elo/win-probability only, no shots/xG/lineups/transfers. Worth adding as a cheap supplementary team-strength signal, not a core source.

## Recommended Combination for MVP

**Primary — 3 sources, legally clean, covers the core:**

1. **football-data.co.uk** — backbone for results, FT/HT scores, shots, SoT, corners across all 5 leagues, 1993/2000–2026. Free, low risk.
2. **API-Football** (paid tier, ~$19–60/mo) — lineups, formations, transfers, managerial changes, standings, possession/corners cross-check via a properly licensed API. Free tier available for prototyping.
3. **Understat** — free xG/xGA/npxG for the Big-5 portion of the target leagues (EPL, La Liga, Ligue 1). Accept and document the compliance risk (blanket robots.txt disallow); it's the cleanest free xG source left standing after FBref's collapse, and observed as low-volume/low-visibility scraping with no aggressive technical blocking.

**Remaining gap:** xG/xGA for Championship and League One isn't available from any free or low-cost licensed source right now (Understat/StatsBomb never had it; FBref no longer has it anywhere; WhoScored doesn't expose it natively). Two ways to close it:

- **Tactical/cheap:** Add **FotMob's unofficial API** as a 4th source for Championship/League One xG (Opta-sourced) and as a lineup/formation cross-check. Currently technically unblocked with clean JSON, but its ToS explicitly and strongly forbids this use — treat as a bridge to retire once revenue justifies a licensed feed; use low-volume, cached, non-redistributed pulls.
- **Clean/scalable:** Add **FootyStats API** (~£30-70/mo) instead of FotMob — documented, licensed, low-cost, broad league coverage including xG — trading some data richness for zero legal risk. Recommended if staying on the right side of every ToS from day one matters more than data depth.

**Longer term:** once the platform has traction/revenue, replace the compliance-risk pieces (Understat, and FotMob if used) with a direct Opta/Stats Perform license — closes the lower-division xG gap and removes scraping-related legal exposure entirely.

**Do not build the core, revenue-dependent pipeline on WhoScored or SofaScore** — both combine explicit ToS prohibitions with actively-enforced, escalating technical anti-bot measures (confirmed live 403s from both during this research).
