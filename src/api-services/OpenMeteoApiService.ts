import { getErrorMessage } from "places-shared/utils";
import { fetchWeatherApi } from 'openmeteo';
import { UnitsSystem } from "places-shared/units";
import { Coordinate } from "places-shared/geo";
import { conditionalProps } from "places-shared/settings";

export interface NamedCoordinate extends Coordinate {
  name?: string;
}

export type CellSelection = 'land' | 'sea' | 'nearest';

// Normalized weather request - all fields have guaranteed values.
export interface WeatherRequest {
  coordinates: NamedCoordinate[];
  current: string[];          // Always array, empty if not specified
  minutely15: string[];       // Always array, empty if not specified
  hourly: string[];           // Always array, empty if not specified
  daily: string[];            // Always array, empty if not specified
  startDate: string | null;   // YYYY-MM-DD format or null
  endDate: string | null;     // YYYY-MM-DD format or null
  startHour: string | null;   // ISO8601 datetime or null
  endHour: string | null;     // ISO8601 datetime or null
  forecastDays: number;       // Default 7, clamped 1-16
  pastDays: number;           // Default 0, clamped 0-92
  pastMinutely15: number;     // Default 0, clamped 0-92
  forecastMinutely15: number; // Default 0, clamped 0-2
  units: UnitsSystem;
  cellSelection: CellSelection; // Default 'land'
}

export interface WeatherResponse {
  coordinates: NamedCoordinate;
  timezone: string;
  timezoneAbbreviation: string;
  utcOffsetSeconds: number;
  current?: Record<string, number | string>;
  minutely15?: {
    time: Date[];
    [variable: string]: (number | Date | null)[] | Date[];
  };
  hourly?: {
    time: Date[];
    [variable: string]: (number | Date | null)[] | Date[];
  };
  daily?: {
    time: Date[];
    [variable: string]: (number | Date | null)[] | Date[];
  };
}

const UNIT_PARAMS: Record<UnitsSystem, Record<string, string>> = {
  imperial: {
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch'
  },
  metric: {
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  }
};

export class OpenMeteoApiService {
  private readonly API_URL = 'https://api.open-meteo.com/v1/forecast';

  async getWeather(request: WeatherRequest): Promise<WeatherResponse[]> {
    if (request.coordinates.length === 0) {
      return [];
    }

    const unitParams = UNIT_PARAMS[request.units] || UNIT_PARAMS.metric;
    const hasDateRange = request.startDate || request.endDate;
    const hasMinutely15 = request.minutely15.length > 0;

    const params: Record<string, string | string[] | number | number[] | boolean> = {
      latitude: request.coordinates.map(c => c.latitude),
      longitude: request.coordinates.map(c => c.longitude),
      timezone: request.coordinates.map(() => 'auto'),
      ...unitParams,
      cell_selection: request.cellSelection,
      ...conditionalProps({
        // Date range: explicit dates take precedence over forecastDays
        start_date: hasDateRange ? request.startDate : null,
        end_date: hasDateRange ? request.endDate : null,
        forecast_days: [!hasDateRange, request.forecastDays],
        past_days: [request.pastDays > 0, request.pastDays],
        current: [request.current.length > 0, request.current],
        minutely_15: [hasMinutely15, request.minutely15],
        forecast_minutely_15: [hasMinutely15 && request.forecastMinutely15 > 0, request.forecastMinutely15],
        past_minutely_15: [hasMinutely15 && request.pastMinutely15 > 0, request.pastMinutely15],
        hourly: [request.hourly.length > 0, request.hourly],
        daily: [request.daily.length > 0, request.daily],
        start_hour: request.startHour,
        end_hour: request.endHour,
      })
    };

    try {
      const apiResponses = await fetchWeatherApi(this.API_URL, params);

      if (apiResponses.length === 0) {
        throw new Error('No response from Open-Meteo API');
      }

      const weatherResponses: WeatherResponse[] = [];

      for (let i = 0; i < apiResponses.length; i++) {
        const response = apiResponses[i];
        const coord = request.coordinates[i];

        const weatherResponse: WeatherResponse = {
          coordinates: coord, 
          timezone: response.timezone() || 'UTC',
          timezoneAbbreviation: response.timezoneAbbreviation() || 'UTC',
          utcOffsetSeconds: response.utcOffsetSeconds() || 0
        };

        const { utcOffsetSeconds, timezone } = weatherResponse;

        if (request.current.length > 0) {
          const current = response.current();
          if (current) {
            weatherResponse.current = {
              time: this.correctTimestamp(Number(current.time()), utcOffsetSeconds, timezone).toISOString()
            };
            request.current.forEach((variable, index) => {
              const value = current.variables(index)?.value();
              if (value !== undefined) {
                weatherResponse.current![variable] = value;
              }
            });
          }
        }

        if (request.minutely15.length > 0) {
          const minutely15 = response.minutely15();
          if (minutely15) {
            const times = this.buildTimeArray(minutely15.time(), minutely15.timeEnd(), minutely15.interval(), utcOffsetSeconds, timezone);
            weatherResponse.minutely15 = { time: times };
            request.minutely15.forEach((variable, index) => {
              const values = minutely15.variables(index)?.valuesArray();
              if (values) {
                weatherResponse.minutely15![variable] = Array.from(values).map(v => Number.isNaN(v) ? null : v);
              }
            });
          }
        }

        if (request.hourly.length > 0) {
          const hourly = response.hourly();
          if (hourly) {
            const times = this.buildTimeArray(hourly.time(), hourly.timeEnd(), hourly.interval(), utcOffsetSeconds, timezone);
            weatherResponse.hourly = { time: times };
            request.hourly.forEach((variable, index) => {
              const values = hourly.variables(index)?.valuesArray();
              if (values) {
                weatherResponse.hourly![variable] = Array.from(values).map(v => Number.isNaN(v) ? null : v);
              }
            });
          }
        }

        if (request.daily.length > 0) {
          const daily = response.daily();
          if (daily) {
            const times = this.buildTimeArray(daily.time(), daily.timeEnd(), daily.interval(), utcOffsetSeconds, timezone);
            weatherResponse.daily = { time: times };
            request.daily.forEach((variable, index) => {
              const dailyVar = daily.variables(index);
              if (!dailyVar) return;

              // Sunrise/sunset are stored as int64 Unix timestamps in flatbuffers, not float values
              if (variable === 'sunrise' || variable === 'sunset') {
                const length = dailyVar.valuesInt64Length();
                const dates: (Date | null)[] = [];
                for (let j = 0; j < length; j++) {
                  const ts = dailyVar.valuesInt64(j);
                  dates.push(ts !== null ? this.correctTimestamp(Number(ts), utcOffsetSeconds, timezone) : null);
                }
                weatherResponse.daily![variable] = dates;
              } else {
                const values = dailyVar.valuesArray();
                if (values) {
                  weatherResponse.daily![variable] = Array.from(values).map(v => Number.isNaN(v) ? null : v);
                }
              }
            });
          }
        }

        weatherResponses.push(weatherResponse);
      }

      return weatherResponses;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const coordsStr = request.coordinates.map(c =>
        c.name || `${c.latitude}, ${c.longitude}`
      ).join('; ');
      throw new Error(`Failed to fetch weather data for ${coordsStr}: ${errorMessage}`);
    }
  }

  // Open-Meteo flatbuffers use a single utcOffsetSeconds for the entire response,
  // which can be incorrect when a date range spans a DST transition (e.g., the API
  // returns an EDT/-4 offset for dates that are still in EST/-5). This causes
  // timestamps to be off by the offset difference (typically 1 hour).
  private buildTimeArray(startSeconds: bigint, endSeconds: bigint, intervalSeconds: number, utcOffsetSeconds: number, timezone: string): Date[] {
    const times: Date[] = [];
    const start = Number(startSeconds);
    const end = Number(endSeconds);

    const startOffset = this.getTimezoneOffsetSeconds(new Date(start * 1000), timezone);
    const lastTs = end - intervalSeconds;
    const endOffset = lastTs > start ? this.getTimezoneOffsetSeconds(new Date(lastTs * 1000), timezone) : startOffset;

    if (startOffset === utcOffsetSeconds && endOffset === utcOffsetSeconds) {
      // Fast path: timestamps are correct as-is
      for (let t = start; t < end; t += intervalSeconds) {
        times.push(new Date(t * 1000));
      }
    } else {
      // DST correction needed: recover local time and convert to true UTC
      for (let t = start; t < end; t += intervalSeconds) {
        times.push(this.correctTimestamp(t, utcOffsetSeconds, timezone));
      }
    }
    return times;
  }

  private correctTimestamp(utcSeconds: number, utcOffsetSeconds: number, timezone: string): Date {
    // Recover local time: the API computed UTC as (local - apiOffset),
    // local = UTC + apiOffset
    const localSeconds = utcSeconds + utcOffsetSeconds;
    const actualOffset = this.getTimezoneOffsetSeconds(new Date(utcSeconds * 1000), timezone);
    return new Date((localSeconds - actualOffset) * 1000);
  }

  // Returns a negative value for west-of-UTC timezones (e.g., -18000 for EST).
  private getTimezoneOffsetSeconds(date: Date, timezone: string): number {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = date.toLocaleString('en-US', { timeZone: timezone });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 1000;
  }
}

