import { fetchWithTimeout } from "../httpTimeout";

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" };

// FotMob's `/api/*` endpoints (what earlier versions of this file targeted) were
// confirmed dead during live Phase 6 testing — every one now returns a served
// 404 HTML page, not JSON. FotMob's own frontend is a Next.js app, though, and
// its pages embed the exact server-fetched data in a standard
// `<script id="__NEXT_DATA__">` tag — verified live against real team, league,
// and match pages (see config.ts's league ID map and fotmob.ts for what's in
// each). Parsing that is more robust than guessing internal API paths, since
// it's the same mechanism Next.js itself uses, not FotMob-specific.
export async function fetchFotmobNextData(path: string): Promise<any> {
  const response = await fetchWithTimeout(`https://www.fotmob.com${path}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`FotMob fetch failed: ${response.status} ${path}`);
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) throw new Error(`Could not find __NEXT_DATA__ in FotMob page: ${path}`);
  return JSON.parse(match[1]);
}
