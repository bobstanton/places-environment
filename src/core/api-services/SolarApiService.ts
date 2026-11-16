import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { Coordinate } from "places-shared/geo";
import { CACHE_DEFAULT, cachePolicyRetention, isCacheEntryStale, type CachePolicy } from "places-shared/settings";
import { DateParser, conditionalProps } from "places-shared/settings";
import { logger } from "places-shared/utils";
import { trackApiUsage, type ApiUsageOrigin, type ApiUsageRecorder } from "places-shared/services";

const SOLAR_USAGE = { provider: 'sunrise-sunset', service: 'solar' } as const;

import type { SolarEvent } from '../types';

export interface SolarRequestOptions {
  timezone?: string;
  cachePolicy?: CachePolicy;
  origin?: ApiUsageOrigin;
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

  private cache: Map<string, CachedSolarEvent> = new Map();
  private persistedLoaded = false;
  private readonly inFlight = new Map<string, Promise<SolarEvent>>();
  private persistScheduled: Promise<void> | null = null;

  constructor(private store?: SolarEventStore, private usage?: ApiUsageRecorder) {}

  private loadPersisted(): void {
    if (this.persistedLoaded || !this.store) return;
    this.persistedLoaded = true;
    const entry = this.store.get(SOLAR_STORE_KEY);

    if (!entry || !Array.isArray(entry.d)) return;

    for (const persisted of entry.d as PersistedSolarEntry[]) {
      const [key, event] = persisted;
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
    if (!this.store) return Promise.resolve();
    if (this.persistScheduled !== null) return this.persistScheduled;
    const scheduled = new Promise<void>(resolve => globalThis.setTimeout(resolve, 50))
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
    return this.requestDays(location, [DateParser.formatDateISO(date)], options)[0];
  }

  private requestDays(location: Coordinate, dates: string[], options: SolarRequestOptions): Promise<SolarEvent>[] {
    this.loadPersisted();
    const policy = options.cachePolicy ?? CACHE_DEFAULT;
    const requests = new Map<string, Promise<SolarEvent>>();

    for (let offset = 0; offset < dates.length; offset += 366) {
      const missing: Array<{ date: string; key: string }> = [];

      for (const date of dates.slice(offset, offset + 366)) {
        const key = this.getCacheKey(location, date, options.timezone);
        const cached = policy.enabled ? this.cache.get(key) : undefined;

        if (cached && !isCacheEntryStale(policy, cached.cachedAt, SOLAR_DEFAULT_MAX_AGE_MS)) {
          requests.set(date, Promise.resolve(cached.event));
        } else {
          const active = this.inFlight.get(key);

          if (active) requests.set(date, active);
          else missing.push({ date, key });
        }
      }

      if (missing.length === 0) continue;
      const batch = this.fetchSolarEvents(location, missing[0].date, missing[missing.length - 1].date, options);

      for (const { date, key } of missing) {
        const request = batch.then(events => {
          const event = events.get(date);

          if (!event) throw new Error(`Solar API returned no event for ${date}`);
          if (policy.enabled) this.cache.set(key, { event, cachedAt: Date.now() });

          return event;
        }).finally(() => {
          if (this.inFlight.get(key) === request) this.inFlight.delete(key);
        });

        this.inFlight.set(key, request);
        requests.set(date, request);
      }
    }

    return dates.map(date => requests.get(date)!);
  }

  private async fetchSolarEvents(location: Coordinate, first: string, last: string, options: SolarRequestOptions): Promise<Map<string, SolarEvent>> {
    const single = first === last;
    const params = new URLSearchParams({
      lat: location.latitude.toString(),
      lng: location.longitude.toString(),
      ...(single ? { date: first } : { date_start: first, date_end: last }),
      ...conditionalProps({ tz: options.timezone }),
    });
    const url = `${SolarApiService.BASE_URL}?${String(params)}`;
    const response = await trackApiUsage(this.usage, { ...SOLAR_USAGE, ...(options.origin ? { origin: options.origin } : {}) }, () => requestUrl({ url, throw: false }));

    if (response.status >= 400) {
      throw this.parseApiError(response.json, response.status, `${first}–${last}`);
    }

    const data = response.json as SolarApiResponse | { days?: SolarApiResponse[] } | null;
    const days = single ? [data as SolarApiResponse] : (data as { days?: SolarApiResponse[] } | null)?.days;

    if (!Array.isArray(days) || days.some(day => !day || typeof day.date !== 'string')) {
      throw new Error('Solar API returned an invalid response');
    }

    return new Map(days.map(day => [day.date, this.toSolarEvent(day)]));
  }

  private toSolarEvent(event: SolarApiResponse): SolarEvent {
    return {
      date: event.date,
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
  }

  async getSolarEvents(location: Coordinate, startDate: Date, endDate: Date, options: SolarRequestOptions = {}): Promise<SolarEvent[]> {
    const dates: string[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dates.push(DateParser.formatDateISO(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const settled = await Promise.allSettled(this.requestDays(location, dates, options));
    const results: SolarEvent[] = [];
    const errors: string[] = [];

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') results.push(result.value);
      else errors.push(`${dates[index]}: ${String(result.reason)}`);
    });
    if (errors.length > 0) logger.scope('Places').warn(`[Solar API] ${errors.length} day(s) failed:`, errors);
    const policy = options.cachePolicy ?? CACHE_DEFAULT;

    if (policy.enabled) await this.schedulePersist(cachePolicyRetention(policy));

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  clearCache(): void {
    this.cache.clear();
  }
}
