import type { ICacheEntry } from 'places-shared/utils';

export const DEFAULT_MAX_CACHE_ENTRIES = 200;
const MAX_CONFIGURABLE_CACHE_ENTRIES = 10_000;

export function parseMaxCacheEntries(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed)) return DEFAULT_MAX_CACHE_ENTRIES;

  return Math.min(MAX_CONFIGURABLE_CACHE_ENTRIES, Math.max(1, parsed));
}

// Entries with retention 'forever' do not count toward the cap.
export function evictOrdinaryCacheEntries(cache: Record<string, ICacheEntry>, maxEntries: number): string[] {
  const ordinaryEntries = Object.entries(cache)
    .filter(([, entry]) => entry.retention !== 'forever');

  const removeCount = ordinaryEntries.length - maxEntries;

  if (removeCount <= 0) return [];

  const removed = ordinaryEntries
    .sort(([, left], [, right]) => (left.t ?? 0) - (right.t ?? 0))
    .slice(0, removeCount)
    .map(([key]) => key);

  for (const key of removed) delete cache[key];

  return removed;
}
