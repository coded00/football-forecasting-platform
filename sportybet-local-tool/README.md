# SportyBet Local Ticket Tool

Personal-use only. Generates a new SportyBet booking code from analysis-recommended selections. Deliberately **not** part of the Netlify-deployed app — it needs a real browser and your real login, neither of which fit in a serverless function, and your credentials should never leave your own machine.

## Setup

```
npm install
npm run install-browser   # downloads a Chromium binary for Playwright, one-time
```

## Usage

1. Get selections from the main app's `/api/sportybet/build-ticket` endpoint (pick matches → it runs the forecast → returns SportyBet `{eventId, marketId, outcomeId}` for the favored outcome on each). Save the `selections` array to a local JSON file — see `selections.example.json` for the shape.
2. Run:
   ```
   npm run create-ticket -- selections.json
   ```
3. A real, visible Chromium window opens to SportyBet's login page. **Log in yourself** — this script never sees or stores your password, it just waits for you to press Enter in the terminal once you're logged in.
4. It adds each selection to your betslip, then tries to find and click a share/booking-code control automatically.
5. **This last step is unverified** — research confirmed adding selections works, but never observed the actual share-button flow in the logged-in app (only found it described in help docs). If automatic detection fails, the script tells you to click it yourself in the browser and paste the resulting code back into the terminal.
6. The final code is printed and saved to `last-ticket-code.txt`.

## Known limitations, honestly

- Only tested against the **Nigeria** site (`sportybet.com/ng`). Other countries use different flows.
- The 1X2 market/outcome-ID mapping (home=1, draw=2, away=3) is inferred from an observed odds pattern, not an explicitly labeled fact — worth a sanity check against what actually gets added to your slip before trusting it.
- Odds passed when adding a selection are whatever was current when `/api/sportybet/build-ticket` ran — they may have drifted by the time this script actually submits them.
- SportyBet's actual Terms of Service on automation could not be fetched during research (client-rendered page, failed to load) — read them yourself before relying on this regularly. Real-money betting platforms tend to enforce anti-automation more aggressively than sports-stats sites; the realistic worst case is account limiting/closure.
- This is a best-effort personal tool, not a maintained product — SportyBet changing their site layout will break it, possibly silently.
