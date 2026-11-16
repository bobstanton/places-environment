export type SeasonalJsonFetcher = (url: string) => Promise<{ status: number; json: unknown }>;
import { UnitsSystem } from "places-shared/units";
import { logger } from "places-shared/utils";
import { trackApiUsage, type ApiUsageOrigin, type ApiUsageRecorder } from "places-shared/services";

const SEASONAL_USAGE = { provider: 'open-meteo', service: 'weather' } as const;

import { NamedCoordinate, WeatherResponse } from './OpenMeteoApiService';

export interface SeasonalRequest {
  coordinates: NamedCoordinate[];
  hourly: string[];
  daily: string[];
  startDate: string | null;
  endDate: string | null;
  units: UnitsSystem;
  cellSelection?: 'land' | 'sea' | 'nearest';
  origin?: ApiUsageOrigin;
}

const SEASONAL_MODEL = 'ecmwf_seasonal_ensemble_mean_seamless';

const SUPPORTED_HOURLY_VARS = new Set([
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'weather_code',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'sea_level_pressure',
  'surface_pressure',
]);

const SUPPORTED_DAILY_VARS = new Set([
  'temperature_2m_max',
  'temperature_2m_mean',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_mean',
  'apparent_temperature_min',
  'relative_humidity_2m_max',
  'relative_humidity_2m_mean',
  'relative_humidity_2m_min',
  'dew_point_2m_max',
  'dew_point_2m_mean',
  'dew_point_2m_min',
  'precipitation_sum',
  'rain_sum',
  'showers_sum',
  'snowfall_sum',
  'weather_code',
  'sunrise',
  'sunset',
  'cloud_cover_max',
  'cloud_cover_mean',
  'cloud_cover_min',
  'wind_speed_10m_max',
  'wind_speed_10m_mean',
  'wind_speed_10m_min',
  'wind_direction_10m_dominant',
]);

const DATE_VARIABLES = new Set(['sunrise', 'sunset']);

export class SeasonalApiService {
  constructor(private readonly fetchJson: SeasonalJsonFetcher, private readonly usage?: ApiUsageRecorder) {}

  private readonly URL = 'https://seasonal-api.open-meteo.com/v1/seasonal';

  async getSeasonal(request: SeasonalRequest): Promise<WeatherResponse[]> {
    const responses: WeatherResponse[] = [];

    const hourlyVars = this.filterSupportedVariables('hourly', request.hourly, SUPPORTED_HOURLY_VARS);
    const dailyVars = this.filterSupportedVariables('daily', request.daily, SUPPORTED_DAILY_VARS);

    if (hourlyVars.length === 0 && dailyVars.length === 0) {
      throw new Error('Seasonal weather requires at least one supported hourly or daily variable.');
    }

    for (const coord of request.coordinates) {
      const params = new URLSearchParams({
        latitude: String(coord.latitude),
        longitude: String(coord.longitude),
        timezone: 'auto',
        models: SEASONAL_MODEL,
      });

      if (hourlyVars.length > 0) params.set('hourly', hourlyVars.join(','));
      if (dailyVars.length > 0) params.set('daily', dailyVars.join(','));
      if (request.startDate) params.set('start_date', request.startDate);
      if (request.endDate) params.set('end_date', request.endDate);
      if (request.cellSelection) params.set('cell_selection', request.cellSelection);

      if (request.units === 'imperial') {
        params.set('temperature_unit', 'fahrenheit');
        params.set('precipitation_unit', 'inch');
      }

      const response = await trackApiUsage(this.usage, { ...SEASONAL_USAGE, ...(request.origin ? { origin: request.origin } : {}) }, () => this.fetchJson(`${this.URL}?${String(params)}`));

      if (response.status < 200 || response.status >= 300) {
        let errorMsg = `HTTP ${response.status}`;
        const errorData = response.json as Record<string, unknown> | undefined;

        if (errorData) {
          const detail = errorData.reason ?? errorData.error;

          if (typeof detail === 'string' || typeof detail === 'number' || typeof detail === 'boolean') {
            errorMsg = String(detail);
          }
        }

        const coordLabel = coord.name || `${coord.latitude}, ${coord.longitude}`;

        throw new Error(`Failed to fetch seasonal forecast for ${coordLabel}: ${errorMsg}`);
      }

      const data = response.json as Record<string, unknown>;
      const hourly = data.hourly as Record<string, unknown> | undefined;
      const daily = data.daily as Record<string, unknown> | undefined;
      const utcOffsetSeconds = (data.utc_offset_seconds as number) || 0;
      const timezone = (data.timezone as string) || 'UTC';
      const timezoneAbbreviation = (data.timezone_abbreviation as string) || 'UTC';

      const weatherResponse: WeatherResponse = {
        coordinates: coord,
        timezone,
        timezoneAbbreviation,
        utcOffsetSeconds,
      };

      if (hourly?.time) {
        const times = (hourly.time as string[]).map(dateTimeStr =>
          this.localDateTimeStringToDate(dateTimeStr, utcOffsetSeconds)
        );

        weatherResponse.hourly = { time: times };

        for (const variable of hourlyVars) {
          const values = hourly[variable];

          if (Array.isArray(values)) {
            weatherResponse.hourly[variable] = values.map(value => this.toSeriesValue(value, variable, utcOffsetSeconds));
          }
        }
      }

      if (daily?.time) {
        const times = (daily.time as string[]).map(dateStr =>
          this.localDateTimeStringToDate(`${dateStr}T00:00:00`, utcOffsetSeconds)
        );

        weatherResponse.daily = { time: times };

        for (const variable of dailyVars) {
          const values = daily[variable];

          if (Array.isArray(values)) {
            weatherResponse.daily[variable] = values.map(value => this.toSeriesValue(value, variable, utcOffsetSeconds));
          }
        }
      }

      responses.push(weatherResponse);
    }

    return responses;
  }

  private filterSupportedVariables(resolution: 'hourly' | 'daily', variables: string[], supported: Set<string>): string[] {
    const unique = Array.from(new Set(variables));
    const accepted = unique.filter(variable => supported.has(variable));
    const rejected = unique.filter(variable => !supported.has(variable));

    if (rejected.length > 0) {
      logger.scope('Places').warn(`[Weather] Seasonal ${resolution} forecast does not support: ${rejected.join(', ')}. Omitting unsupported variable(s).`
      );
    }

    return accepted;
  }

  private toSeriesValue(value: unknown, variable: string, utcOffsetSeconds: number): number | Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (DATE_VARIABLES.has(variable) && typeof value === 'string') {
      return this.localDateTimeStringToDate(value, utcOffsetSeconds);
    }

    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value;
    }

    return null;
  }

  private localDateTimeStringToDate(value: string, utcOffsetSeconds: number): Date {
    const normalized = value.length === 16 ? `${value}:00` : value;
    const localAsUtcMs = new Date(`${normalized}Z`).getTime();

    return new Date(localAsUtcMs - utcOffsetSeconds * 1000);
  }
}
