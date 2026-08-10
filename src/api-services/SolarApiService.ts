import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { Coordinate } from "places-shared/geo";
import { CACHE_DEFAULT, cachePolicyRetention, isCacheEntryStale, type CachePolicy } from "places-shared/settings";
import { DateParser, conditionalProps } from "places-shared/settings";
import { logger } from "places-shared/utils";
import type { SolarEvent } from '../types';
import { processBatches } from '../utilities/BatchProcessing';

export interface SolarRequestOptions {
  timezone?: string;
  cachePolicy?: CachePolicy;
}

interface SolarApiResponse {
  date: string;
  sunrise: string | null;
  sunset: string | null;
  solar_noon: string | null;
  day_length: number | null;
  civil_twilight_begin: string | null;
  civil_twilight_end: string | null;
  nautical_twilight_begin: string | null;
  nautical_twilight_end: string | null;
  astronomical_twilight_begin: string | null;
  astronomical_twilight_end: string | null;
  tzid: string;
}

interface SolarApiErrorResponse {
  error?: string;
  message?: string;
}

export interface SolarEventStore {
  get(key: string): { t: number; d: unknown } | null;
  set(key: string, data: unknown, retention?: 'forever'): Promise<void>;
}

const SOLAR_STORE_KEY = 'solar-events';
const SOLAR_STORE_MAX_ENTRIES = 1000;
const SOLAR_DEFAULT_MAX_AGE_MS = Infinity;

interface CachedSolarEvent {
  readonly event: SolarEvent;
  readonly cachedAt: number;
}

type PersistedSolarEntry = [string, SolarEvent, number] | [string, SolarEvent];

export class SolarApiService {
  private static readonly BASE_URL = 'https://api.sunrise-sunset.org/v2';

  // cachedAt lets a block's cache: duration or expiration date apply, in memory
  // and, when a store is provided, across sessions.
  private cache: Map<string, CachedSolarEvent> = new Map();
  private persistedLoaded = false;
  private readonly inFlight = new Map<string, Promise<SolarEvent>>();
  private persistScheduled: Promise<void> | null = null;

  constructor(private store?: SolarEventStore) {}

  private loadPersisted(): void {
    if (this.persistedLoaded || !this.store) return;
    this.persistedLoaded = true;
    const entry = this.store.get(SOLAR_STORE_KEY);
    if (!entry || !Array.isArray(entry.d)) return;
    for (const persisted of entry.d as PersistedSolarEntry[]) {
      const [key, event] = persisted;
      // Entries written before per-entry timestamps existed inherit the store
      // entry's own write time.
      const cachedAt = persisted.length === 3 ? persisted[2] : entry.t;
      if (!this.cache.has(key)) this.cache.set(key, { event, cachedAt });
    }
  }

  private async persist(retention: 'forever' | undefined): Promise<void> {
    if (!this.store) return;
    const entries: PersistedSolarEntry[] = Array.from(this.cache.entries(), ([key, cached]) => [key, cached.event, cached.cachedAt]);
    await this.store.set(SOLAR_STORE_KEY, entries.slice(Math.max(0, entries.length - SOLAR_STORE_MAX_ENTRIES)), retention);
  }

  private schedulePersist(retention: 'forever' | undefined): Promise<void> {
    if (this.persistScheduled !== null) return this.persistScheduled;
    const scheduled = new Promise<void>(resolve => window.setTimeout(resolve, 50))
      .then(() => this.persist(retention))
      .finally(() => {
        if (this.persistScheduled === scheduled) this.persistScheduled = null;
      });
    this.persistScheduled = scheduled;
    return scheduled;
  }

  private getCacheKey(location: Coordinate, date: string, timezone?: string): string {
    return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)},${date},${timezone || 'local'}`;
  }

  private parseApiError(response: unknown, status: number, context: string): Error {
    const errorResponse = response as SolarApiErrorResponse | undefined;
    const message = errorResponse?.message || errorResponse?.error || `HTTP error: ${status}`;
    return new Error(`[Solar API ${context}] ${message}`);
  }

  private nonNullTimestamp(value: string | null | undefined): string {
    return typeof value === 'string' ? value : '';
  }

  async getSolarEvent(location: Coordinate, date: Date, options: SolarRequestOptions = {}): Promise<SolarEvent> {
    const dateStr = DateParser.formatDateISO(date);
    const cacheKey = this.getCacheKey(location, dateStr, options.timezone);
    const policy = options.cachePolicy ?? CACHE_DEFAULT;

    this.loadPersisted();
    const cached = policy.enabled ? this.cache.get(cacheKey) : undefined;
    if (cached && !isCacheEntryStale(policy, cached.cachedAt, SOLAR_DEFAULT_MAX_AGE_MS)) {
      return cached.event;
    }

    const active = this.inFlight.get(cacheKey);
    if (active !== undefined) return active;
    const request = this.fetchSolarEvent(location, dateStr, options, cacheKey);
    this.inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (this.inFlight.get(cacheKey) === request) this.inFlight.delete(cacheKey);
    }
  }

  private async fetchSolarEvent(location: Coordinate, dateStr: string, options: SolarRequestOptions, cacheKey: string): Promise<SolarEvent> {

    const params = new URLSearchParams({
      lat: location.latitude.toString(),
      lng: location.longitude.toString(),
      date: dateStr,
      ...conditionalProps({ tz: options.timezone })
    });

    const url = `${SolarApiService.BASE_URL}?${String(params)}`;
    const response = await requestUrl({ url });
    const data = response.json as SolarApiResponse | SolarApiErrorResponse;

    if (response.status >= 400) {
      throw this.parseApiError(data, response.status, dateStr);
    }

    const event = data as SolarApiResponse;
    const result: SolarEvent = {
      date: event.date || dateStr,
      sunrise: this.nonNullTimestamp(event.sunrise),
      sunset: this.nonNullTimestamp(event.sunset),
      solar_noon: this.nonNullTimestamp(event.solar_noon),
      day_length: event.day_length ?? 0,
      civil_twilight_begin: this.nonNullTimestamp(event.civil_twilight_begin),
      civil_twilight_end: this.nonNullTimestamp(event.civil_twilight_end),
      nautical_twilight_begin: this.nonNullTimestamp(event.nautical_twilight_begin),
      nautical_twilight_end: this.nonNullTimestamp(event.nautical_twilight_end),
      astronomical_twilight_begin: this.nonNullTimestamp(event.astronomical_twilight_begin),
      astronomical_twilight_end: this.nonNullTimestamp(event.astronomical_twilight_end)
    };

    this.cache.set(cacheKey, { event: result, cachedAt: Date.now() });

    return result;
  }

  async getSolarEvents(location: Coordinate, startDate: Date, endDate: Date, options: SolarRequestOptions = {}): Promise<SolarEvent[]> {
    const dates: Date[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const { results, errors } = await processBatches(
      dates,
      (date, _index) => this.getSolarEvent(location, date, options),
      { batchSize: 3, delayBetweenBatchesMs: 100 }
    );

    if (errors.length > 0) {
      logger.scope('Places').warn(`[Solar API] ${errors.length} day(s) failed:`, errors.map(e => {
        const failedDate = dates[e.index];
        return `${DateParser.formatDateISO(failedDate)}: ${e.error.message}`;
      }));
    }

    const policy = options.cachePolicy ?? CACHE_DEFAULT;
    if (policy.enabled) {
      await this.schedulePersist(cachePolicyRetention(policy));
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  clearCache(): void {
    this.cache.clear();
  }
}
