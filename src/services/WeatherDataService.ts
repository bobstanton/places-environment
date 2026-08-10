 
import { MarkdownPostProcessorContext } from 'obsidian';
import type PlacesEnvironmentPlugin from '../main';
import { OpenMeteoApiService, WeatherResponse, WeatherRequest, NamedCoordinate, CellSelection } from '../api-services/OpenMeteoApiService';
import { SeasonalApiService } from '../api-services/SeasonalApiService';
import { UnitsSystem } from "places-shared/units";
import { CACHE_DEFAULT, CodeBlockReader, cachePolicyExpiresAt, cachePolicyRetention, isCacheEntryStale, parseBoolean, parseCacheSetting, parseEnumWithDefault, parseIntWithBounds, parseList, parseCoordinateList, parseTime, DateParser, type CachePolicy } from "places-shared/settings";
import { getErrorMessage, CacheTTL, getTTLForDateRange, formatCoordinates, buildCacheKey, logger } from "places-shared/utils";
import { getLocationStringFromFrontmatter } from '../utilities/FrontmatterUtilities';


export interface WeatherCodeBlockSettings {
  coordinates: NamedCoordinate[];
  current?: string[];
  minutely15?: string[];
  hourly?: string[];
  daily?: string[];
  startDate?: Date;
  endDate?: Date;
  startTime?: number;  // Hour of day (0-23) to start filtering hourly data
  endTime?: number;    // Hour of day (0-23) to stop filtering hourly data
  startTimeOffset?: number;  // Hour offset from now (only set for relative times like "-1", "+24")
  endTimeOffset?: number;    // Hour offset from now (only set for relative times like "-1", "+24")
  startHour?: string;  // ISO8601 datetime for API-level hour filtering (e.g., 2024-01-17T16:00)
  endHour?: string;    // ISO8601 datetime for API-level hour filtering (e.g., 2024-01-17T22:00)
  units: UnitsSystem;
  cachePolicy: CachePolicy;
  forceRefresh?: boolean;  // Bypass cache read but still write fresh data to cache
  cellSelection?: CellSelection;
  showSunriseSunset?: boolean;
  // Always set by parseCodeBlockSettings (block value or default)
  height: string;
  width: string;
  days?: number;
}

// Units intentionally absent: the default comes from the main plugin settings
// via getDefaultUnits().
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
    // Epoch ms when the data was fetched from the API.
    retrievedAt?: number;
    // True when a fetch failed and cached data was served instead.
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

// Open-Meteo forecast API hard limit: 16 days from today
const FORECAST_WINDOW_DAYS = 16;
const ECMWF_SEASONAL_DAILY_WINDOW_DAYS = 46;

export class WeatherDataService {
  private openMeteoService: OpenMeteoApiService;
  private seasonalApiService: SeasonalApiService;
  private plugin: PlacesEnvironmentPlugin;
  private inFlightRequests = new Map<string, Promise<WeatherData>>();

  constructor(plugin: PlacesEnvironmentPlugin) {
    this.openMeteoService = new OpenMeteoApiService();
    this.seasonalApiService = new SeasonalApiService();
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

  parseCodeBlockSettings(source: string, ctx: MarkdownPostProcessorContext): WeatherCodeBlockSettings {
    const block = new CodeBlockReader(source, { colonTextKeys: ['coordinates', 'location'] });
    const defaults = WeatherCodeBlockDefaultSettings;

    const days = parseIntWithBounds(block.raw('days'), defaults.days, 1, 16);

    const locationString = block.text('coordinates') || block.text('location') || getLocationStringFromFrontmatter(this.plugin.app, ctx.sourcePath);
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
      coordinates,
      startDate,
      endDate,
      days,
      units: parseEnumWithDefault(block.raw('units'), ['imperial', 'metric'] as const, this.plugin.getDefaultUnits()),
      cachePolicy,
      showSunriseSunset: parseBoolean(block.raw('showSunriseSunset'), defaults.showSunriseSunset),
      height: block.text('height') || defaults.height,
      width: block.text('width') || defaults.width,
      // The API validates variable names.
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

  // Historical data (endDate in the past) uses a longer TTL. An explicit
  // duration or expiration date on the block overrides this in isCacheEntryStale.
  //
  // The hourly TTL tracks how often Open-Meteo's models publish: HRRR (the
  // minutely_15 source) and GFS hourly, DWD ICON every 3 hours, ECMWF every 6.
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

  // Seasonal data has two freshness tiers:
  // - EC46-style near seasonal guidance (roughly 16-46 days) updates daily
  // - Longer seasonal guidance beyond that changes much more slowly
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

  // Shared by reference; consumers treat WeatherData as read-only.
  private decodedCache = new Map<string, { t: number; data: WeatherData }>();
  private static readonly DECODED_CACHE_MAX = 20;

  private decodeCachedWeatherData(cacheKey: string, entry: { t: number; d: unknown }): WeatherData {
    const memo = this.decodedCache.get(cacheKey);
    if (memo && memo.t === entry.t) {
      return memo.data;
    }
    const data = this.decompressWeatherData(entry.d as CompressedWeatherData);
    this.decodedCache.set(cacheKey, { t: entry.t, data });
    if (this.decodedCache.size > WeatherDataService.DECODED_CACHE_MAX) {
      const oldest = this.decodedCache.keys().next().value;
      if (oldest !== undefined) this.decodedCache.delete(oldest);
    }
    return data;
  }

  private isCacheStale(cachedTimestamp: number, settings: WeatherCodeBlockSettings): boolean {
    return isCacheEntryStale(settings.cachePolicy, cachedTimestamp, this.getDefaultMaxAgeMs(settings));
  }

  getCacheExpiresAt(settings: WeatherCodeBlockSettings, asOf: number): number | undefined {
    return cachePolicyExpiresAt(settings.cachePolicy, asOf, this.getDefaultMaxAgeMs(settings));
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
      pastDays: 0,  // Not currently exposed in code block settings
      pastMinutely15: 0,
      forecastMinutely15: 0,
      units: settings.units,
      cellSelection: settings.cellSelection || 'land'
    };
  }

  async getWeatherData(settings: WeatherCodeBlockSettings): Promise<WeatherData> {
    const cacheKey = this.generateCacheKey(settings);
    let staleCachedEntry: ReturnType<PlacesEnvironmentPlugin['get']> = null;

    if (settings.cachePolicy.enabled) {
      const cachedEntry = this.plugin.get(cacheKey, cachePolicyRetention(settings.cachePolicy));
      if (!settings.forceRefresh && cachedEntry !== null && !this.isCacheStale(cachedEntry.t, settings)) {
        return this.withFreshness(this.decodeCachedWeatherData(cacheKey, cachedEntry), cachedEntry.t, false);
      }
      // Kept even for forceRefresh: a failed refresh serves this instead of an error.
      staleCachedEntry = cachedEntry;
    }

    const inFlightRequest = this.inFlightRequests.get(cacheKey);
    if (inFlightRequest !== undefined) {
      return inFlightRequest;
    }

    const requestPromise = this.fetchAndCacheWeatherData(settings, cacheKey, staleCachedEntry);
    this.inFlightRequests.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      if (this.inFlightRequests.get(cacheKey) === requestPromise) this.inFlightRequests.delete(cacheKey);
    }
  }

  private async fetchAndCacheWeatherData(settings: WeatherCodeBlockSettings, cacheKey: string, staleCachedEntry: ReturnType<PlacesEnvironmentPlugin['get']>): Promise<WeatherData> {
    // Seasonal hourly data is 6-hourly ensemble-mean guidance, not a short-range deterministic forecast.
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
        logger.scope('Weather').warn('Weather fetch failed; using stale cached data', {
          cacheKey,
          cachedAt: new Date(staleCachedEntry.t).toISOString(),
          error: getErrorMessage(error)
        });
        return this.withFreshness(this.decodeCachedWeatherData(cacheKey, staleCachedEntry), staleCachedEntry.t, true);
      }
      throw error;
    }

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
    // 4 decimals is about 11m buckets; open-meteo's forecast grid is kilometre-scale.
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
