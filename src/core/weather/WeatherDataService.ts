import { DecodedDataCache } from '../services/DecodedDataCache';
import type { EnvironmentHost, EnvironmentCacheEntry } from '../services/EnvironmentHost';
import { OpenMeteoApiService, WeatherResponse, WeatherRequest, NamedCoordinate, CellSelection } from './OpenMeteoApiService';
import { providerExpiresAt } from './VaultQueryProviderShared';
import { SeasonalApiService, type SeasonalJsonFetcher } from './SeasonalApiService';
import { UnitsSystem } from "places-shared/units";
import { CACHE_DEFAULT, CodeBlockReader, cachePolicyRetention, describeCachePolicy, isCacheEntryStale, parseBoolean, parseCacheSetting, parseEnumWithDefault, parseIntWithBounds, parseList, parseCoordinateList, parseTime, DateParser, type CachePolicy } from "places-shared/settings";
import { getErrorMessage, CacheTTL, getTTLForDateRange, formatCoordinates, buildCacheKey, logger } from "places-shared/utils";

function weatherLog(outcome: string, cacheKey: string, settings: { cachePolicy: CachePolicy; forceRefresh?: boolean }, detail: Record<string, unknown> = {}): void {
  logger.scope('Weather').debug(`weather ${outcome}`, {
    cacheKey, forced: Boolean(settings.forceRefresh), cache: describeCachePolicy(settings.cachePolicy), ...detail,
  });
}

export interface WeatherHost extends EnvironmentHost {
  fetchJson: SeasonalJsonFetcher;
}

export interface WeatherBlockContext {
  sourcePath?: string;
}

export interface WeatherCodeBlockSettings {
  sourcePath?: string;
  coordinates: NamedCoordinate[];
  current?: string[];
  minutely15?: string[];
  hourly?: string[];
  daily?: string[];
  startDate?: Date;
  endDate?: Date;
  startTime?: number;   
  endTime?: number;     
  startTimeOffset?: number;   
  endTimeOffset?: number;     
  startHour?: string;   
  endHour?: string;     
  units: UnitsSystem;
  cachePolicy: CachePolicy;
  forceRefresh?: boolean;   
  cellSelection?: CellSelection;
  showSunriseSunset?: boolean;
  height: string;
  width: string;
  days?: number;
}

export const WeatherCodeBlockDefaultSettings = {
  cachePolicy: CACHE_DEFAULT,
  height: '400px',
  width: '100%',
  days: 7,
  showSunriseSunset: false
} as const;

export interface WeatherData {
  responses: WeatherResponse[];
  metadata: {
    requestDate: string;
    startDate?: string;
    endDate?: string;
    units: UnitsSystem;
    isSeasonalForecast?: boolean;
    retrievedAt?: number;
    servedStale?: boolean;
  };
}

type CompressedWeatherSeries = { t: number[] } & Record<string, (number | null)[]>;

interface CompressedWeatherResponse {
  c: { lat: number; lon: number; n?: string };
  tz: string;
  tza: string;
  utc: number;
  cur?: Record<string, number | string>;
  m15?: CompressedWeatherSeries;
  hr?: CompressedWeatherSeries;
  dy?: CompressedWeatherSeries;
}

interface CompressedWeatherData {
  r: CompressedWeatherResponse[];
  m: {
    rd: string;
    sd?: string;
    ed?: string;
    u: UnitsSystem;
    sf?: boolean;
  };
}

const FORECAST_WINDOW_DAYS = 16;
const ECMWF_SEASONAL_DAILY_WINDOW_DAYS = 46;
const FAILED_REFRESH_RETRY_MS = 30_000;
const FAILED_REFRESH_MAX_RETRY_MS = 15 * 60_000;
const MAX_FAILED_REFRESHES = 100;

export class WeatherDataService {
  private openMeteoService: OpenMeteoApiService;
  private seasonalApiService: SeasonalApiService;
  private plugin: WeatherHost;
  private inFlightRequests = new Map<string, Promise<WeatherData>>();
  private failedRefreshes = new Map<string, { cachedAt: number; attempts: number; retryAt: number }>();

  constructor(plugin: WeatherHost) {
    this.openMeteoService = new OpenMeteoApiService(plugin.apiUsage);
    this.seasonalApiService = new SeasonalApiService(plugin.fetchJson, plugin.apiUsage);
    this.plugin = plugin;
  }

  private isSeasonalRequired(endDate: Date | undefined): boolean {
    if (!endDate) return false;
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    const maxForecastDate = new Date(today);

    maxForecastDate.setDate(maxForecastDate.getDate() + FORECAST_WINDOW_DAYS);

    return endDate > maxForecastDate;
  }

  parseCodeBlockSettings(source: string, ctx: WeatherBlockContext): WeatherCodeBlockSettings {
    const block = new CodeBlockReader(source, { colonTextKeys: ['coordinates', 'location'] });
    const defaults = WeatherCodeBlockDefaultSettings;

    const days = parseIntWithBounds(block.raw('days'), defaults.days, 1, 16);

    const locationString = block.text('coordinates') || block.text('location') || this.plugin.locationFromNote(ctx.sourcePath);

    if (!locationString) {
      throw new Error('No location found. Requires "coordinates: lat, lon" in the code block or a Location frontmatter property.');
    }

    const coordinates = parseCoordinateList(locationString);

    if (coordinates.length === 0) {
      throw new Error('Invalid coordinates format. Expected "lat, lon" or "lat, lon; lat2, lon2"');
    }

    const [startDate, endDate] = DateParser.parseDateRange({
      startDate: block.text('startDate') || 'today',
      endDate: block.text('endDate') || DateParser.relativeEndDateForCalendarDays(days)
    });

    const parsedStartTime = parseTime(block.raw('startTime'));
    const parsedEndTime = parseTime(block.raw('endTime'));

    const cachePolicy = parseCacheSetting(block.text('cache'), defaults.cachePolicy);

    return {
      ...(ctx.sourcePath ? { sourcePath: ctx.sourcePath } : {}),
      coordinates,
      startDate,
      endDate,
      days,
      units: parseEnumWithDefault(block.raw('units'), ['imperial', 'metric'] as const, this.plugin.getDefaultUnits()),
      cachePolicy,
      showSunriseSunset: parseBoolean(block.raw('showSunriseSunset'), defaults.showSunriseSunset),
      height: block.text('height') || defaults.height,
      width: block.text('width') || defaults.width,
      current: parseList(block.raw('current')),
      minutely15: parseList(block.raw('minutely15')),
      hourly: parseList(block.raw('hourly')),
      daily: parseList(block.raw('daily')),
      cellSelection: parseEnumWithDefault(block.raw('cellSelection'), ['land', 'sea', 'nearest'] as const, 'land'),
      startTime: parsedStartTime?.hour,
      endTime: parsedEndTime?.hour,
      startTimeOffset: parsedStartTime?.isRelative ? parsedStartTime.offset : undefined,
      endTimeOffset: parsedEndTime?.isRelative ? parsedEndTime.offset : undefined
    };
  }

  private getDefaultMaxAgeMs(settings: WeatherCodeBlockSettings): number {
    if (this.isSeasonalRequired(settings.endDate)) {
      return this.getSeasonalDefaultTTL(settings.endDate);
    }

    let baseTTL: number;

    if (settings.minutely15?.length || settings.current?.length) {
      baseTTL = CacheTTL.MINUTES_15;
    } else if (settings.hourly?.length) {
      baseTTL = CacheTTL.HOUR_1;
    } else if (settings.daily?.length) {
      baseTTL = CacheTTL.HOURS_2;
    } else {
      baseTTL = CacheTTL.HOUR_1;
    }

    return getTTLForDateRange(baseTTL, settings.endDate);
  }

  private getSeasonalDefaultTTL(endDate: Date | undefined): number {
    if (!endDate) {
      return CacheTTL.HOURS_24;
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const ecmwfDailyWindowEnd = new Date(today);

    ecmwfDailyWindowEnd.setDate(ecmwfDailyWindowEnd.getDate() + ECMWF_SEASONAL_DAILY_WINDOW_DAYS);

    return endDate <= ecmwfDailyWindowEnd
      ? CacheTTL.HOURS_24
      : CacheTTL.DAYS_7;
  }

  private withFreshness(data: WeatherData, retrievedAt: number, servedStale: boolean): WeatherData {
    data.metadata.retrievedAt = retrievedAt;
    data.metadata.servedStale = servedStale;

    return data;
  }

  private decodedCache = new DecodedDataCache<WeatherData>(data => this.decompressWeatherData(data as CompressedWeatherData));

  private isCacheStale(cachedTimestamp: number, settings: WeatherCodeBlockSettings): boolean {
    return isCacheEntryStale(settings.cachePolicy, cachedTimestamp, this.getDefaultMaxAgeMs(settings));
  }

  getCacheExpiresAt(settings: WeatherCodeBlockSettings, asOf: number): number | undefined {
    return providerExpiresAt(settings.cachePolicy, asOf, this.getDefaultMaxAgeMs(settings));
  }

  private normalizeRequest(settings: WeatherCodeBlockSettings): WeatherRequest {
    return {
      coordinates: settings.coordinates,
      current: settings.current || [],
      minutely15: settings.minutely15 || [],
      hourly: settings.hourly || [],
      daily: settings.daily || [],
      startDate: settings.startDate ? DateParser.formatDateISO(settings.startDate) : null,
      endDate: settings.endDate ? DateParser.formatDateISO(settings.endDate) : null,
      startHour: settings.startHour || null,
      endHour: settings.endHour || null,
      forecastDays: Math.min(Math.max(settings.days || 7, 1), 16),
      pastDays: 0,   
      pastMinutely15: 0,
      forecastMinutely15: 0,
      units: settings.units,
      cellSelection: settings.cellSelection || 'land',
      origin: { ...(settings.sourcePath ? { sourcePath: settings.sourcePath } : {}), blockType: 'weather' },
    };
  }

  async getWeatherData(settings: WeatherCodeBlockSettings): Promise<WeatherData> {
    const cacheKey = this.generateCacheKey(settings);
    let staleCachedEntry: EnvironmentCacheEntry | null = null;

    if (settings.cachePolicy.enabled) {
      const cachedEntry = this.plugin.get(cacheKey, cachePolicyRetention(settings.cachePolicy));

      if (!settings.forceRefresh && cachedEntry !== null && !this.isCacheStale(cachedEntry.t, settings)) {
        this.failedRefreshes.delete(cacheKey);
        weatherLog('served from cache', cacheKey, settings, { cachedAt: new Date(cachedEntry.t).toISOString() });

        return this.withFreshness(this.decodedCache.read(cacheKey, cachedEntry), cachedEntry.t, false);
      }

      const failed = this.failedRefreshes.get(cacheKey);

      if (!settings.forceRefresh && cachedEntry !== null && failed?.cachedAt === cachedEntry.t && Date.now() < failed.retryAt) {
        weatherLog('served stale during retry backoff', cacheKey, settings, {
          cachedAt: new Date(cachedEntry.t).toISOString(), retryAt: new Date(failed.retryAt).toISOString(),
        });

        return this.withFreshness(this.decodedCache.read(cacheKey, cachedEntry), cachedEntry.t, true);
      }

      staleCachedEntry = cachedEntry;
    }

    const inFlightRequest = this.inFlightRequests.get(cacheKey);

    if (inFlightRequest !== undefined) {
      weatherLog('joining in-flight request', cacheKey, settings);

      return inFlightRequest;
    }

    weatherLog('fetching', cacheKey, settings, {
      ...(staleCachedEntry ? { replacing: new Date(staleCachedEntry.t).toISOString() } : {}),
    });

    const requestPromise = this.fetchAndCacheWeatherData(settings, cacheKey, staleCachedEntry);

    this.inFlightRequests.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      if (this.inFlightRequests.get(cacheKey) === requestPromise) this.inFlightRequests.delete(cacheKey);
    }
  }

  private async fetchAndCacheWeatherData(settings: WeatherCodeBlockSettings, cacheKey: string, staleCachedEntry: EnvironmentCacheEntry | null): Promise<WeatherData> {
    const useSeasonalApi =
      this.isSeasonalRequired(settings.endDate) &&
      ((settings.daily?.length ?? 0) > 0 || (settings.hourly?.length ?? 0) > 0) &&
      !settings.current?.length &&
      !settings.minutely15?.length;

    const request = this.normalizeRequest(settings);
    let responses: WeatherResponse[];
    let isSeasonalForecast = false;

    try {
      if (useSeasonalApi) {
        responses = await this.seasonalApiService.getSeasonal({
          ...(request.origin ? { origin: request.origin } : {}),
          coordinates: request.coordinates,
          hourly: request.hourly,
          daily: request.daily,
          startDate: request.startDate,
          endDate: request.endDate,
          units: request.units,
          cellSelection: request.cellSelection,
        });
        isSeasonalForecast = true;
      } else {
        responses = await this.openMeteoService.getWeather(request);
      }
    } catch (error) {
      if (staleCachedEntry !== null) {
        const previous = this.failedRefreshes.get(cacheKey);
        const attempts = previous?.cachedAt === staleCachedEntry.t ? Math.min(previous.attempts + 1, 6) : 1;
        const retryAt = Date.now() + Math.min(FAILED_REFRESH_RETRY_MS * 2 ** (attempts - 1), FAILED_REFRESH_MAX_RETRY_MS);

        this.failedRefreshes.delete(cacheKey);
        this.failedRefreshes.set(cacheKey, { cachedAt: staleCachedEntry.t, attempts, retryAt });
        if (this.failedRefreshes.size > MAX_FAILED_REFRESHES) this.failedRefreshes.delete(this.failedRefreshes.keys().next().value!);
        logger.scope('Weather').warn('Weather fetch failed; using stale cached data', {
          cacheKey,
          cachedAt: new Date(staleCachedEntry.t).toISOString(),
          retryAt: new Date(retryAt).toISOString(),
          error: getErrorMessage(error)
        });

        return this.withFreshness(this.decodedCache.read(cacheKey, staleCachedEntry), staleCachedEntry.t, true);
      }

      throw error;
    }

    this.failedRefreshes.delete(cacheKey);
    const weatherData: WeatherData = {
      responses,
      metadata: {
        requestDate: new Date().toISOString(),
        startDate: request.startDate ?? undefined,
        endDate: request.endDate ?? undefined,
        units: settings.units,
        isSeasonalForecast,
        retrievedAt: Date.now(),
      }
    };

    if (settings.cachePolicy.enabled) {
      const compressedData = this.compressWeatherData(weatherData);

      await this.plugin.set(cacheKey, compressedData, cachePolicyRetention(settings.cachePolicy));
      weatherLog('cached', cacheKey, settings, { replaced: staleCachedEntry !== null });
    }

    return weatherData;
  }

  async getHourlyForecast(settings: WeatherCodeBlockSettings): Promise<WeatherData> {
    const hourlySettings = {
      ...settings,
      current: undefined,
      minutely15: settings.minutely15,
      hourly: settings.hourly || ['temperature_2m', 'precipitation', 'weather_code'],
      daily: undefined
    };

    return this.getWeatherData(hourlySettings);
  }

  private generateCacheKey(settings: WeatherCodeBlockSettings): string {
    const coordsKey = formatCoordinates(settings.coordinates, 4);

    const startDate = settings.startDate ? DateParser.formatDateISO(settings.startDate) : 'today';
    const endDate = settings.endDate ? DateParser.formatDateISO(settings.endDate) : '';

    const variables = [
      ...(settings.current || []).map(v => `c:${v}`),
      ...(settings.minutely15 || []).map(v => `m15:${v}`),
      ...(settings.hourly || []).map(v => `h:${v}`),
      ...(settings.daily || []).map(v => `d:${v}`)
    ].sort().join(',');

    const hourFilter = settings.startHour || settings.endHour
      ? `${settings.startHour || ''}~${settings.endHour || ''}`
      : null;

    return buildCacheKey(
      'weather',
      coordsKey,
      `${startDate}-${endDate}`,
      variables,
      settings.units,
      `d${settings.days || 7}`,
      hourFilter
    );
  }

  private compressWeatherData(data: WeatherData): CompressedWeatherData {
    return {
      r: data.responses.map(resp => ({
        c: {
          lat: resp.coordinates.latitude,
          lon: resp.coordinates.longitude,
          n: resp.coordinates.name
        },
        tz: resp.timezone,
        tza: resp.timezoneAbbreviation,
        utc: resp.utcOffsetSeconds,
        cur: resp.current,
        m15: resp.minutely15 ? {
          t: resp.minutely15.time.map(d => d.getTime()),
          ...Object.fromEntries(
            Object.entries(resp.minutely15)
              .filter(([k]) => k !== 'time')
              .map(([k, v]) => [k, (v as (number | null)[]).map(n => n !== null ? Math.round(n * 100) / 100 : null)])
          )
        } : undefined,
        hr: resp.hourly ? {
          t: resp.hourly.time.map(d => d.getTime()),
          ...Object.fromEntries(
            Object.entries(resp.hourly)
              .filter(([k]) => k !== 'time')
              .map(([k, v]) => [k, (v as (number | null)[]).map(n => n !== null ? Math.round(n * 100) / 100 : null)])
          )
        } : undefined,
        dy: resp.daily ? {
          t: resp.daily.time.map(d => d.getTime()),
          ...Object.fromEntries(
            Object.entries(resp.daily)
              .filter(([k]) => k !== 'time')
              .map(([k, v]) => {
                const arr = v as (number | Date | null)[];

                return [k, arr.map(n => {
                  if (n === null) return null;
                  if (n instanceof Date) return n.getTime();

                  return Math.round(n * 100) / 100;
                })];
              })
          )
        } : undefined
      })),
      m: {
        rd: data.metadata.requestDate,
        sd: data.metadata.startDate,
        ed: data.metadata.endDate,
        u: data.metadata.units,
        sf: data.metadata.isSeasonalForecast
      }
    };
  }

  private decompressWeatherData(compressed: CompressedWeatherData): WeatherData {
    return {
      responses: compressed.r.map((resp) => {
        const result: WeatherResponse = {
          coordinates: {
            latitude: resp.c.lat,
            longitude: resp.c.lon,
            name: resp.c.n
          },
          timezone: resp.tz,
          timezoneAbbreviation: resp.tza,
          utcOffsetSeconds: resp.utc,
          current: resp.cur
        };

        if (resp.m15) {
          result.minutely15 = {
            time: resp.m15.t.map((t: number) => new Date(t)),
            ...Object.fromEntries(
              Object.entries(resp.m15)
                .filter(([k]) => k !== 't')
                .map(([k, v]) => [k, v])
            )
          };
        }

        if (resp.hr) {
          result.hourly = {
            time: resp.hr.t.map((t: number) => new Date(t)),
            ...Object.fromEntries(
              Object.entries(resp.hr)
                .filter(([k]) => k !== 't')
                .map(([k, v]) => [k, v])
            )
          };
        }

        if (resp.dy) {
          const daily: NonNullable<WeatherResponse['daily']> = {
            time: resp.dy.t.map(t => new Date(t)),
          };

          for (const [key, values] of Object.entries(resp.dy)) {
            if (key === 't') continue;
            const firstValue = values.find(value => value !== null);

            daily[key] = firstValue !== undefined && firstValue !== null && firstValue > 1_000_000_000_000
              ? values.map(value => value !== null ? new Date(value) : null)
              : values;
          }

          result.daily = daily;
        }

        return result;
      }),
      metadata: {
        requestDate: compressed.m.rd,
        startDate: compressed.m.sd,
        endDate: compressed.m.ed,
        units: compressed.m.u,
        isSeasonalForecast: compressed.m.sf
      }
    };
  }
  }
