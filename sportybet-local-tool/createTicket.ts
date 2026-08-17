// Local-only tool: generates a new SportyBet booking code from a list of
// analysis-recommended selections (produced by the main app's
// /api/sportybet/build-ticket endpoint). Runs a REAL, visible browser and asks
// you to log into YOUR OWN account yourself — this script never sees, asks
// for, or stores your password. It only automates the mechanical parts
// (adding selections, attempting to find the share control) after you've
// logged in.
//
// CONFIRMED live (2026-08-17): adding a selection via
// /ng/lite/betslip?eventId=...&marketId=...&outcomeId=...&selected=0 works.
// UNVERIFIED: the exact share/booking-code control in the logged-in app —
// research only found it described in help articles ("tap the sharing icon"),
// never observed in the actual DOM. The auto-detection below is a best-effort
// guess; the manual fallback is the realistic primary path until this has
// actually been run and the real flow observed.
//
// Usage: npm run create-ticket -- selections.json
// (selections.json is normally the `selections` array from a build-ticket
// API response — see selections.example.json for the shape.)
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";

interface Selection {
  homeTeam: string;
  awayTeam: string;
  favoredOutcome: string;
  sportyBetSelection: { eventId: string; marketId: string; outcomeId: string; odds?: number };
}

const BASE_URL = "https://www.sportybet.com/ng/lite";
const BOOKING_CODE_PATTERN = /\b[A-Z0-9]{6,10}\b/;

function buildAddSelectionUrl(selection: Selection["sportyBetSelection"]): string {
  const params = new URLSearchParams({
    sportId: "sr:sport:1",
    eventId: selection.eventId,
    productId: "3",
    marketId: selection.marketId,
    outcomeId: selection.outcomeId,
    specifier: "",
    selected: "0",
  });
  if (selection.odds !== undefined) params.set("odds", String(selection.odds));
  return `${BASE_URL}/betslip?${params.toString()}`;
}

async function main() {
  const inputPath = process.argv[2] ?? "selections.json";
  const selections: Selection[] = JSON.parse(await readFile(inputPath, "utf-8"));

  if (!Array.isArray(selections) || selections.length === 0) {
    console.error(`No selections found in ${inputPath}. See selections.example.json for the expected shape.`);
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });

  console.log("Opening a real browser window. Log into YOUR SportyBet account there yourself —");
  console.log("this script never sees or stores your password.\n");

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/login`);
  await rl.question("Press Enter here once you're logged in and can see your account in the browser... ");

  console.log(`\nAdding ${selections.length} selection(s) to your betslip...`);
  for (const s of selections) {
    await page.goto(buildAddSelectionUrl(s.sportyBetSelection));
    console.log(`  added: ${s.homeTeam} vs ${s.awayTeam} — ${s.favoredOutcome}`);
  }

  await page.goto(`${BASE_URL}/betslip`);

  console.log("\nAttempting to find a share/booking-code control automatically (best-effort, unverified)...");
  let code: string | null = null;
  try {
    await page.getByText(/share|book(ing)? code/i).first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    const bodyText = (await page.textContent("body")) ?? "";
    code = bodyText.match(BOOKING_CODE_PATTERN)?.[0] ?? null;
  } catch {
    // expected on the first real run — this control's actual selector/flow was never confirmed live
  }

  if (code) {
    console.log(`\nFound what looks like a booking code: ${code}`);
    const correction = await rl.question("Press Enter if that's correct, or type the right code: ");
    if (correction.trim()) code = correction.trim();
  } else {
    console.log("\nCouldn't confirm a share control automatically.");
    console.log("Please generate the booking code yourself in the browser window (usually a share/booking");
    console.log("icon on the betslip), then paste it below.\n");
    code = (await rl.question("Booking code: ")).trim();
  }

  await writeFile("last-ticket-code.txt", code);
  console.log(`\nSaved to last-ticket-code.txt: ${code}`);

  rl.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
