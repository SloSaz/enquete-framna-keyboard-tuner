const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

// Process-local: on serverless this resets per cold start and is not shared across
// instances, so it slows down casual abuse rather than preventing it.
const hits = new Map<string, number[]>();

export function rateLimit(key: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    hits.set(key, recent);
    return { ok: false, retryAfterSec };
  }

  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return { ok: true, retryAfterSec: 0 };
}
