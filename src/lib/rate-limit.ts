// Simple in-memory per-key rate limiter (single Zeabur instance; resets on restart).
// Used to bound cost/abuse on authenticated API routes.
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const e = buckets.get(key);
  if (!e || now > e.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  e.count += 1;
  return e.count > limit;
}

// Periodically drop expired buckets so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 5 * 60_000).unref?.();
