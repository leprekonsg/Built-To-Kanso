// Tiny in-process LRU-by-time cache. One Map keyed by url, value is the
// fetched payload plus expiresAt epoch ms. Cross-request lifetime: ~10 minutes.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string, now: number = Date.now()): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, now: number = Date.now()): void {
  store.set(key, { value, expiresAt: now + ttlMs });
}

export function cacheClear(): void {
  store.clear();
}
