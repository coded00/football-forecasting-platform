// Every external HTTP call in this project used plain `fetch` with no
// timeout — a single slow/hanging upstream request could block a whole
// analysis indefinitely, which matters a lot more here than it looks: Netlify
// Functions have a hard execution limit (10s on the default plan), so one
// hung fetch doesn't just feel slow, it fails the entire request. This wraps
// fetch with an AbortController-based timeout so a stuck source degrades to
// a clean per-source error (already handled everywhere via safeFetch-style
// try/catch) instead of hanging the whole thing.
export async function fetchWithTimeout(url: string | URL, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request to ${String(url)} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
