import { WEATHER_UNITS } from './WeatherUnits';
import { getErrorMessage } from "places-shared/utils";
import { fetchWeatherApi } from 'openmeteo';
import { UnitsSystem } from "places-shared/units";
import type { NamedCoordinate } from "places-shared/geo";
import { conditionalProps } from "places-shared/settings";
import { trackApiUsage, type ApiUsageOrigin, type ApiUsageRecorder } from "places-shared/services";

const OPEN_METEO_USAGE = { provider: 'open-meteo', service: 'weather' } as const;

export type { NamedCoordinate };

export type CellSelection = 'land' | 'sea' | 'nearest';

export interface WeatherRequest {
  coordinates: NamedCoordinate[];
  current: string[];           
  minutely15: string[];        
  hourly: string[];            
  daily: string[];             
  startDate: string | null;    
  endDate: string | null;      
  startHour: string | null;    
  endHour: string | null;      
  forecastDays: number;        
  pastDays: number;            
  pastMinutely15: number;      
  forecastMinutely15: number;  
  units: UnitsSystem;
  cellSelection: CellSelection;  
  origin?: ApiUsageOrigin;
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

export class OpenMeteoApiService {
  private readonly API_URL = 'https://api.open-meteo.com/v1/forecast';

  constructor(private usage?: ApiUsageRecorder) {}

  async getWeather(request: WeatherRequest): Promise<WeatherResponse[]> {
    if (request.coordinates.length === 0) {
      return [];
    }

    const unitParams = (WEATHER_UNITS[request.units] ?? WEATHER_UNITS.metric).request;
    const hasDateRange = request.startDate || request.endDate;
    const hasMinutely15 = request.minutely15.length > 0;

    const params: Record<string, string | string[] | number | number[] | boolean> = {
      latitude: request.coordinates.map(c => c.latitude),
      longitude: request.coordinates.map(c => c.longitude),
      timezone: request.coordinates.map(() => 'auto'),
      ...unitParams,
      cell_selection: request.cellSelection,
      ...conditionalProps({
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
      const apiResponses = await trackApiUsage(this.usage, { ...OPEN_METEO_USAGE, ...(request.origin ? { origin: request.origin } : {}) }, () => fetchWeatherApi(this.API_URL, params));

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

  // Open-Meteo supplies one UTC offset for the whole response, including dates
  // across DST transitions.
  private buildTimeArray(startSeconds: bigint, endSeconds: bigint, intervalSeconds: number, utcOffsetSeconds: number, timezone: string): Date[] {
    const times: Date[] = [];
    const start = Number(startSeconds);
    const end = Number(endSeconds);

    const startOffset = this.getTimezoneOffsetSeconds(new Date(start * 1000), timezone);
    const lastTs = end - intervalSeconds;
    const endOffset = lastTs > start ? this.getTimezoneOffsetSeconds(new Date(lastTs * 1000), timezone) : startOffset;

    if (startOffset === utcOffsetSeconds && endOffset === utcOffsetSeconds) {
      for (let t = start; t < end; t += intervalSeconds) {
        times.push(new Date(t * 1000));
      }
    } else {
      for (let t = start; t < end; t += intervalSeconds) {
        times.push(this.correctTimestamp(t, utcOffsetSeconds, timezone));
      }
    }

    return times;
  }

  private correctTimestamp(utcSeconds: number, utcOffsetSeconds: number, timezone: string): Date {
    const localSeconds = utcSeconds + utcOffsetSeconds;
    const actualOffset = this.getTimezoneOffsetSeconds(new Date(utcSeconds * 1000), timezone);

    return new Date((localSeconds - actualOffset) * 1000);
  }

  private getTimezoneOffsetSeconds(date: Date, timezone: string): number {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = date.toLocaleString('en-US', { timeZone: timezone });

    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 1000;
  }
}
