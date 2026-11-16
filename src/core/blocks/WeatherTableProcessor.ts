import * as _placesDom from 'places-shared/utils';
import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';
import { WeatherDataService, WeatherCodeBlockSettings, WeatherData, WeatherCodeBlockDefaultSettings } from 'places-environment/core';
import { getWeatherEmoji, getWeatherSeverityClass, getPrecipitationType } from 'places-environment/core';
import { getHourInTimezone, formatWeekday, formatDateForDisplay, formatTimeForDisplay } from '../utilities/DateTimeUtilities';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { codeBlockText, parseCodeBlockYaml } from "places-shared/settings";

interface ColumnDefinition {
  id: string;
  header: string;
  hourlyVar?: string;  // Open-Meteo hourly variable name
  dailyVar?: string;   // Open-Meteo daily variable name
  format: (value: unknown, settings: WeatherCodeBlockSettings, timezone: string, row?: Record<string, unknown>) => string;
}

const COLUMN_DEFINITIONS: Record<string, ColumnDefinition> = {
  time: {
    id: 'time',
    header: 'Time',
    hourlyVar: 'time',
    format: (v, _s, tz) => {
      if (!(v instanceof Date)) return String(v);
      const hour = getHourInTimezone(v, tz);

      if (hour === 0) {
        const day = formatWeekday(v, tz);

        return `${day} 12 AM`;
      }

      return v.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: tz });
    }
  },
  date: {
    id: 'date',
    header: 'Date',
    dailyVar: 'time',
    format: (v, _s, tz) => v instanceof Date ? formatDateForDisplay(v, tz) : String(v)
  },

  weather: {
    id: 'weather',
    header: 'Weather',
    hourlyVar: 'weather_code',
    dailyVar: 'weather_code',
    format: (v) => typeof v === 'number' ? getWeatherEmoji(v) : ''
  },

  temp: {
    id: 'temp',
    header: 'Temp',
    hourlyVar: 'temperature_2m',
    format: (v, s) => typeof v === 'number' ? `${Math.round(v)}${s.units === 'imperial' ? '°F' : '°C'}` : '-'
  },
  high: {
    id: 'high',
    header: 'High',
    dailyVar: 'temperature_2m_max',
    format: (v, s) => typeof v === 'number' ? `${Math.round(v)}${s.units === 'imperial' ? '°F' : '°C'}` : '-'
  },
  low: {
    id: 'low',
    header: 'Low',
    dailyVar: 'temperature_2m_min',
    format: (v, s) => typeof v === 'number' ? `${Math.round(v)}${s.units === 'imperial' ? '°F' : '°C'}` : '-'
  },
  high_low: {
    id: 'high_low',
    header: 'Low/High',
    dailyVar: 'temperature_2m_max',
    format: (v, s, _tz, row) => {
      const high = typeof v === 'number' ? Math.round(v) : null;
      const low = row?.temperature_2m_min;
      const lowVal = typeof low === 'number' ? Math.round(low) : null;
      const unit = s.units === 'imperial' ? '°F' : '°C';

      if (high !== null && lowVal !== null) return `${lowVal}°/${high}${unit}`;
      if (high !== null) return `${high}${unit}`;

      return '-';
    }
  },
  feels_like: {
    id: 'feels_like',
    header: 'Feels Like',
    hourlyVar: 'apparent_temperature',
    format: (v, s) => typeof v === 'number' ? `${Math.round(v)}${s.units === 'imperial' ? '°F' : '°C'}` : '-'
  },

  precip_prob: {
    id: 'precip_prob',
    header: 'Precip %',
    hourlyVar: 'precipitation_probability',
    dailyVar: 'precipitation_probability_max',
    format: (v) => typeof v === 'number' ? `${Math.round(v)}%` : '-'
  },
  precip_amt: {
    id: 'precip_amt',
    header: 'Precip',
    hourlyVar: 'precipitation',
    dailyVar: 'precipitation_sum',
    format: (v, s) => {
      if (typeof v !== 'number') return '-';
      if (v === 0) return '-';
      const unit = s.units === 'imperial' ? 'in' : 'mm';

      return `${v.toFixed(1)}${unit}`;
    }
  },
  precip_type: {
    id: 'precip_type',
    header: 'Type',
    hourlyVar: 'weather_code',
    dailyVar: 'weather_code',
    format: (v) => {
      if (typeof v !== 'number') return '-';

      return getPrecipitationType(v) ?? '-';
    }
  },

  wind: {
    id: 'wind',
    header: 'Wind',
    hourlyVar: 'wind_speed_10m',
    dailyVar: 'wind_speed_10m_max',
    format: (v, s) => {
      if (typeof v !== 'number') return '-';
      const unit = s.units === 'imperial' ? 'mph' : 'km/h';

      return `${Math.round(v)} ${unit}`;
    }
  },
  wind_gusts: {
    id: 'wind_gusts',
    header: 'Gusts',
    hourlyVar: 'wind_gusts_10m',
    dailyVar: 'wind_gusts_10m_max',
    format: (v, s) => {
      if (typeof v !== 'number') return '-';
      const unit = s.units === 'imperial' ? 'mph' : 'km/h';

      return `${Math.round(v)} ${unit}`;
    }
  },
  wind_dir: {
    id: 'wind_dir',
    header: 'Wind Dir',
    hourlyVar: 'wind_direction_10m',
    dailyVar: 'wind_direction_10m_dominant',
    format: (v) => {
      if (typeof v !== 'number') return '-';
      const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const idx = Math.round(v / 22.5) % 16;

      return dirs[idx];
    }
  },

  humidity: {
    id: 'humidity',
    header: 'Humidity',
    hourlyVar: 'relative_humidity_2m',
    format: (v) => typeof v === 'number' ? `${Math.round(v)}%` : '-'
  },
  cloud: {
    id: 'cloud',
    header: 'Cloud',
    hourlyVar: 'cloud_cover',
    format: (v) => typeof v === 'number' ? `${Math.round(v)}%` : '-'
  },
  pressure: {
    id: 'pressure',
    header: 'Pressure',
    hourlyVar: 'surface_pressure',
    format: (v) => typeof v === 'number' ? `${Math.round(v)} hPa` : '-'
  },
  visibility: {
    id: 'visibility',
    header: 'Visibility',
    hourlyVar: 'visibility',
    format: (v, s) => {
      if (typeof v !== 'number') return '-';

      // visibility is in meters from API
      if (s.units === 'imperial') {
        const miles = v / 1609.34;

        return miles >= 10 ? '10+ mi' : `${miles.toFixed(1)} mi`;
      }

      const km = v / 1000;

      return km >= 10 ? '10+ km' : `${km.toFixed(1)} km`;
    }
  },
  dew_point: {
    id: 'dew_point',
    header: 'Dew Point',
    hourlyVar: 'dew_point_2m',
    format: (v, s) => typeof v === 'number' ? `${Math.round(v)}${s.units === 'imperial' ? '°F' : '°C'}` : '-'
  },

  // Solar columns (daily only)
  sunrise: {
    id: 'sunrise',
    header: 'Sunrise',
    dailyVar: 'sunrise',
    format: (v, _s, tz) => v instanceof Date ? formatTimeForDisplay(v, tz) : '-'
  },
  sunset: {
    id: 'sunset',
    header: 'Sunset',
    dailyVar: 'sunset',
    format: (v, _s, tz) => v instanceof Date ? formatTimeForDisplay(v, tz) : '-'
  },
  daylight: {
    id: 'daylight',
    header: 'Daylight',
    dailyVar: 'daylight_duration',
    format: (v) => {
      if (typeof v !== 'number') return '-';
      const hours = Math.floor(v / 3600);
      const mins = Math.round((v % 3600) / 60);

      return `${hours}h ${mins}m`;
    }
  },
  uv: {
    id: 'uv',
    header: 'UV',
    dailyVar: 'uv_index_max',
    format: (v) => typeof v === 'number' ? String(Math.round(v)) : '-'
  }
};

const DEFAULT_HOURLY_COLUMNS = ['time', 'weather', 'temp', 'precip_prob', 'precip_type', 'precip_amt', 'wind'];
const DEFAULT_DAILY_COLUMNS = ['date', 'weather', 'high_low', 'precip_prob', 'precip_type', 'precip_amt', 'sunrise', 'sunset'];

const COLUMN_ALIASES: Record<string, string> = {
  temperature: 'temp',
  apparent: 'feels_like',
  precip_probability: 'precip_prob',
  precip_amount: 'precip_amt',
  precipitation: 'precip_amt',
  precipitation_type: 'precip_type',
  wind_speed: 'wind',
  wind_direction: 'wind_dir',
  cloud_cover: 'cloud',
  uv_index: 'uv'
};

export class WeatherTableProcessor extends BaseEnvironmentProcessor {
  private weatherDataService: WeatherDataService;

  constructor(plugin: EnvironmentPluginHost, weatherDataService: WeatherDataService) {
    super(plugin);
    this.weatherDataService = weatherDataService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'weather-table-loading',
      loadingText: 'Loading weather data...',
      errorMessage: 'Failed to load weather data',
      refreshLabel: 'Refresh table',
      render: (forceRefresh) => this.loadAndRenderCachedTable(el, source, ctx, forceRefresh)
    });
  }

  private parseMode(source: string): 'hourly' | 'daily' {
    const value = codeBlockText(parseCodeBlockYaml(source), 'mode');

    if (value) {
      const mode = value.toLowerCase();

      if (mode === 'daily' || mode === 'd') return 'daily';
    }

    return 'hourly';
  }

  private async loadAndRenderCachedTable(el: HTMLElement, source: string, ctx: MarkdownPostProcessorContext, forceRefresh: boolean): Promise<HTMLElement> {
    _placesDom.addClass(el, 'weather-table-loading');
    this.renderLoadingState(el, 'Loading weather data...');

    const settings = this.weatherDataService.parseCodeBlockSettings(source, ctx);

    settings.forceRefresh = forceRefresh;
    const mode = this.parseMode(source);
    const columns = this.parseColumns(source, mode);
    const weatherData = await this.getWeatherDataForTable(settings, mode, columns);

    _placesDom.emptyElement(el);
    _placesDom.removeClass(el, 'weather-table-loading');
    const container = _placesDom.createDiv(el, 'weather-table-wrapper');

    this.renderTable(container, weatherData, settings, mode, columns, ctx, source);
    renderFreshnessIndicator(container, weatherData.metadata);
    renderSettingsTraceIfRequested(container, source, ctx, this.plugin, 'places-weather-table', WeatherCodeBlockDefaultSettings, settings);

    return container;
  }

  private async getWeatherDataForTable(settings: WeatherCodeBlockSettings, mode: 'hourly' | 'daily', columns: string[]): Promise<WeatherData> {
    const requiredVars = this.getRequiredVariables(columns, mode);
    const dataSettings: WeatherCodeBlockSettings = {
      ...settings,
      hourly: mode === 'hourly' ? requiredVars.hourly : undefined,
      daily: mode === 'daily' ? requiredVars.daily : undefined
    };

    return this.weatherDataService.getWeatherData(dataSettings);
  }

  private parseColumns(source: string, mode: 'hourly' | 'daily'): string[] {
    const parsed = parseCodeBlockYaml(source);
    const rawColumns = parsed.columns;

    if (rawColumns !== undefined) {
      const columnList = (Array.isArray(rawColumns)
        ? rawColumns.map(String)
        : (codeBlockText(parsed, 'columns') ?? '').split(/[,\s]+/))
        .map(c => c.trim().toLowerCase()).filter(Boolean);

      return columnList.map(c => COLUMN_ALIASES[c] || c).filter(c => {
        const def = COLUMN_DEFINITIONS[c];

        if (!def) return false;
        if (mode === 'hourly' && def.hourlyVar) return true;
        if (mode === 'daily' && def.dailyVar) return true;
        // Special case: high_low needs both max and min
        if (mode === 'daily' && c === 'high_low') return true;

        return false;
      });
    }

    return mode === 'hourly' ? DEFAULT_HOURLY_COLUMNS : DEFAULT_DAILY_COLUMNS;
  }

  private getRequiredVariables(columns: string[], mode: 'hourly' | 'daily'): { hourly: string[]; daily: string[] } {
    const hourly: string[] = [];
    const daily: string[] = [];

    for (const colId of columns) {
      const def = COLUMN_DEFINITIONS[colId];

      if (!def) continue;

      if (mode === 'hourly' && def.hourlyVar && def.hourlyVar !== 'time') {
        hourly.push(def.hourlyVar);
      }

      if (mode === 'daily' && def.dailyVar && def.dailyVar !== 'time') {
        daily.push(def.dailyVar);
      }

      // Special case: high_low needs both temperature vars
      if (colId === 'high_low' && mode === 'daily') {
        if (!daily.includes('temperature_2m_max')) daily.push('temperature_2m_max');
        if (!daily.includes('temperature_2m_min')) daily.push('temperature_2m_min');
      }
    }

    return { hourly, daily };
  }

  private renderTable(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, mode: 'hourly' | 'daily', columns: string[], ctx: MarkdownPostProcessorContext, source: string): void {
    _placesDom.emptyElement(el);
    _placesDom.removeClass(el, 'weather-table-loading');
    _placesDom.addClass(el, 'weather-table-container');

    const response = weatherData.responses[0];
    const data = mode === 'hourly' ? response.hourly : response.daily;

    if (!data || !data.time || data.time.length === 0) {
      this.renderError(el, {
        message: `No ${mode} weather data available`,
        ctx,
        source,
        onRefresh: async () => {
          await this.refreshCurrentTable(el, source, ctx, settings, mode, columns);
        },
        refreshLabel: 'Refresh table'
      });

      return;
    }

    const timezone = response.timezone;
    const times = data.time;

    const tableWrapper = _placesDom.createDiv(el, 'weather-table-scroll');
    const table = _placesDom.createElement(tableWrapper, 'table', { cls: 'weather-table' });

    const thead = _placesDom.createElement(table, 'thead');
    const headerRow = _placesDom.createElement(thead, 'tr');

    for (const colId of columns) {
      const def = COLUMN_DEFINITIONS[colId];

      if (def) {
        _placesDom.createElement(headerRow, 'th', { text: def.header });
      }
    }

    const tbody = _placesDom.createElement(table, 'tbody');

    for (let i = 0; i < times.length; i++) {
      const row = _placesDom.createElement(tbody, 'tr');

      if (mode === 'hourly') {
        const hour = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(times[i]), 10);

        if (hour === 0 || hour === 24) {
          _placesDom.addClass(row, 'weather-table-new-day');
        }
      }

      const weatherCode = data.weather_code ? (data.weather_code as (number | null)[])[i] : null;

      if (typeof weatherCode === 'number') {
        _placesDom.addClass(row, `weather-${getWeatherSeverityClass(weatherCode)}`);
      }

      const rowData: Record<string, unknown> = {};

      for (const key of Object.keys(data)) {
        const arr = data[key] as unknown[];

        if (arr && i < arr.length) {
          rowData[key] = arr[i];
        }
      }

      for (const colId of columns) {
        const def = COLUMN_DEFINITIONS[colId];

        if (!def) continue;

        const cell = _placesDom.createElement(row, 'td');

        let value: unknown;

        if (colId === 'time' || colId === 'date') {
          value = times[i];
        } else {
          const varName = mode === 'hourly' ? def.hourlyVar : def.dailyVar;

          if (varName && data[varName]) {
            value = (data[varName] as unknown[])[i];
          }
        }

        const formatted = def.format(value, settings, timezone, rowData);

        _placesDom.setText(cell, formatted);

        if (colId === 'weather') {
          _placesDom.addClass(cell, 'weather-table-emoji');
        }
      }
    }

    const attribution = _placesDom.createDiv(el, 'weather-attribution');
    const link = _placesDom.createElement(attribution, 'a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });

    _placesDom.setAttribute(link, 'target', '_blank');
    _placesDom.setAttribute(link, 'rel', 'noopener noreferrer');

    this.addRefreshButton(el, ctx, source, settings, mode, columns);
  }

  private addRefreshButton(el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, settings: WeatherCodeBlockSettings, mode: 'hourly' | 'daily', columns: string[]): void {
    this.addFloatingRefreshButton(el, {
      label: 'Refresh table',
      ctx,
      source,
      onRefresh: () => this.refreshCurrentTable(el, source, ctx, settings, mode, columns)
    });
  }

  private async refreshCurrentTable(el: HTMLElement, source: string, ctx: MarkdownPostProcessorContext, settings: WeatherCodeBlockSettings, mode: 'hourly' | 'daily', columns: string[]): Promise<void> {
    _placesDom.addClass(el, 'weather-table-loading');
    const refreshSettings = { ...settings, forceRefresh: true };
    const weatherData = await this.getWeatherDataForTable(refreshSettings, mode, columns);

    this.renderTable(el, weatherData, refreshSettings, mode, columns, ctx, source);
    renderFreshnessIndicator(el, weatherData.metadata);
  }
}
