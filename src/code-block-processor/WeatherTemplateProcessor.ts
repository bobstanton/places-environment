// User templates with JavaScript iteration, in the `places-weather-template` block.
// ```places-weather-template
// coordinates: 41.408, -75.662
// hourly: temperature_2m, weather_code
// ---
// <div class="my-weather">
//   ${hourly.time.map((t, i) => `
//     <div class="hour">
//       <span>${h.formatTime(t)}</span>
//       <span>${h.weatherEmoji(hourly.weather_code[i])}</span>
//       <span>${hourly.temperature_2m[i]}°</span>
//     </div>
//   `).join('')}
// </div>
// ```

import { MarkdownPostProcessorContext } from 'obsidian';
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { getErrorMessage, renderError } from "places-shared/utils";
import { renderUserHtmlTemplate } from 'user-template-renderer';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { WeatherDataService, WeatherCodeBlockSettings, WeatherData, WeatherCodeBlockDefaultSettings } from '../services/WeatherDataService';
import {
  getWeatherEmoji,
  getWeatherDescription,
  getWeatherSeverity,
  getWeatherSeverityClass,
  getWeatherInfo,
  isPrecipitation,
  isFrozenPrecipitation,
  isThunderstorm
} from '../utilities/WeatherCodeUtilities';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { UnitsSystem } from "places-shared/units";
import { splitTemplateBlockSource } from './TemplateBlockSource';

interface TemplateHelpers {
  formatDate: (d: Date) => string;
  formatTime: (d: Date) => string;
  formatDateTime: (d: Date) => string;
  formatTemp: (v: number, u?: UnitsSystem) => string;
  formatSpeed: (v: number, u?: UnitsSystem) => string;
  formatPrecip: (v: number, u?: UnitsSystem) => string;

  weatherEmoji: (code: number) => string;
  weatherDescription: (code: number) => string;
  weatherInfo: (code: number) => { emoji: string; description: string };
  weatherSeverity: (code: number) => number;
  weatherSeverityClass: (code: number) => string;
  isPrecipitation: (code: number) => boolean;
  isFrozenPrecipitation: (code: number) => boolean;
  isThunderstorm: (code: number) => boolean;

  range: (start: number, end: number) => number[];
  zip: (...arrays: unknown[][]) => unknown[][];

  filterByHour: (times: Date[], startHour?: number, endHour?: number) => number[];
  getHour: (d: Date) => number;

  escape: (s: string) => string;

  units: UnitsSystem;
  timezone: string;
  startTime?: number;
  endTime?: number;
}

export class WeatherTemplateProcessor extends BaseEnvironmentProcessor {
  private weatherDataService: WeatherDataService;

  constructor(plugin: PlacesEnvironmentPlugin, weatherDataService: WeatherDataService) {
    super(plugin);
    this.weatherDataService = weatherDataService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'weather-template-loading',
      loadingText: 'Loading weather data...',
      errorMessage: 'Failed to render weather template',
      refreshLabel: 'Refresh template',
      render: async (forceRefresh) => {
        const { settings, settingsSource, template } = this.parseSourceWithTemplate(source, ctx);
        settings.forceRefresh = forceRefresh;
        const weatherData = await this.weatherDataService.getWeatherData(settings);

        el.empty();
        el.removeClass('weather-template-loading');
        const container = el.createDiv('weather-template-wrapper');
        this.renderTemplate(container, weatherData, settings, template, ctx, source);
        renderFreshnessIndicator(container, weatherData.metadata);
        renderSettingsTraceIfRequested(container, settingsSource, ctx, this.plugin, 'places-weather-template', WeatherCodeBlockDefaultSettings, settings);
        return container;
      }
    });
  }

  private parseSourceWithTemplate(source: string, ctx: MarkdownPostProcessorContext): { settings: WeatherCodeBlockSettings; settingsSource: string; template: string } {
    const split = splitTemplateBlockSource(source);
    const settingsSource = split.settingsSource;
    const template = split.template ?? this.getDefaultTemplate();

    const settings = this.weatherDataService.parseCodeBlockSettings(settingsSource, ctx);
    return { settings, settingsSource, template };
  }

  private getDefaultTemplate(): string {
    return `<div class="weather-template-default">
  <div class="weather-template-current">
    \${current ? \`
      <span class="weather-icon">\${h.weatherEmoji(current.weather_code)}</span>
      <span class="weather-temp">\${h.formatTemp(current.temperature_2m)}</span>
      <span class="weather-desc">\${h.weatherDescription(current.weather_code)}</span>
    \` : 'No current data'}
  </div>
</div>`;
  }

  private renderTemplate(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, template: string, ctx: MarkdownPostProcessorContext, source: string): void {
    el.empty();
    el.removeClass('weather-template-loading');
    el.addClass('weather-template-container');

    const response = weatherData.responses[0];
    const timezone = response.timezone;

    const h = this.createHelpers(settings, timezone);

    const current = response.current || null;
    const hourly = response.hourly || null;
    const daily = response.daily || null;
    const coordinates = response.coordinates;

    let contentDiv: HTMLElement | null = null;
    try {
      contentDiv = el.createDiv('weather-template-content');
      renderUserHtmlTemplate({
        template,
        mode: 'template-literal',
        args: [
          { name: 'current', value: current },
          { name: 'hourly', value: hourly },
          { name: 'daily', value: daily },
          { name: 'coordinates', value: coordinates },
          { name: 'h', value: h },
        ],
        container: contentDiv,
      });
    } catch (error) {
      contentDiv?.remove();
      renderError(el, { icon: '⚠️', title: 'Template Error', message: getErrorMessage(error) });
    }

    // Open-Meteo attribution (required by CC BY 4.0 license)
    const attribution = el.createDiv('weather-attribution');
    const link = attribution.createEl('a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });
    link.setAttr('target', '_blank');
    link.setAttr('rel', 'noopener noreferrer');

    this.addRefreshButton(el, ctx, source, settings, template);
  }

  private createHelpers(settings: WeatherCodeBlockSettings, timezone: string): TemplateHelpers {
    const units = settings.units;

    const getHourInTimezone = (d: Date): number => {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone
      });
      const hour = parseInt(formatter.format(d), 10);
      return hour === 24 ? 0 : hour;
    };

    return {
      // Uses the forecast timezone for DST-correct display.
      formatDate: (d: Date) => {
        if (!(d instanceof Date)) d = new Date(d);
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          timeZone: timezone
        });
      },

      formatTime: (d: Date) => {
        if (!(d instanceof Date)) d = new Date(d);
        return d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timezone
        });
      },

      formatDateTime: (d: Date) => {
        if (!(d instanceof Date)) d = new Date(d);
        return d.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timezone
        });
      },

      formatTemp: (v: number, u?: UnitsSystem) => {
        const unit = u || units;
        const symbol = unit === 'imperial' ? '°F' : '°C';
        return `${Math.round(v)}${symbol}`;
      },

      formatSpeed: (v: number, u?: UnitsSystem) => {
        const unit = u || units;
        const symbol = unit === 'imperial' ? 'mph' : 'km/h';
        return `${Math.round(v)} ${symbol}`;
      },

      formatPrecip: (v: number, u?: UnitsSystem) => {
        const unit = u || units;
        const symbol = unit === 'imperial' ? 'in' : 'mm';
        return `${v.toFixed(1)} ${symbol}`;
      },

      weatherEmoji: getWeatherEmoji,
      weatherDescription: getWeatherDescription,
      weatherInfo: getWeatherInfo,
      weatherSeverity: getWeatherSeverity,
      weatherSeverityClass: getWeatherSeverityClass,
      isPrecipitation: isPrecipitation,
      isFrozenPrecipitation: isFrozenPrecipitation,
      isThunderstorm: isThunderstorm,

      range: (start: number, end: number) => {
        const arr: number[] = [];
        for (let i = start; i < end; i++) arr.push(i);
        return arr;
      },

      zip: (...arrays: unknown[][]) => {
        const length = Math.min(...arrays.map(a => a.length));
        const result: unknown[][] = [];
        for (let i = 0; i < length; i++) {
          result.push(arrays.map(a => a[i]));
        }
        return result;
      },

      filterByHour: (times: Date[], startHour?: number, endHour?: number): number[] => {
        const start = startHour ?? settings.startTime;
        const end = endHour ?? settings.endTime;
        if (start === undefined && end === undefined) {
          return times.map((_, i) => i);
        }
        return times
          .map((time, index) => ({ time, index }))
          .filter(({ time }) => {
            const hour = getHourInTimezone(time);
            if (start !== undefined && end !== undefined) {
              if (start <= end) {
                return hour >= start && hour <= end;
              } else {
                return hour >= start || hour <= end;
              }
            } else if (start !== undefined) {
              return hour >= start;
            } else if (end !== undefined) {
              return hour <= end;
            }
            return true;
          })
          .map(({ index }) => index);
      },

      getHour: (d: Date): number => {
        if (!(d instanceof Date)) d = new Date(d);
        return getHourInTimezone(d);
      },

      // Use the active window, for pop-out window compatibility.
      escape: (s: string) => {
        const div = createDiv();
        div.textContent = s;
        return div.innerHTML;
      },

      units,
      timezone,
      startTime: settings.startTime,
      endTime: settings.endTime
    };
  }

  private addRefreshButton(el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, settings: WeatherCodeBlockSettings, template: string): void {
    this.addFloatingRefreshButton(el, {
      label: 'Refresh template',
      loadingClass: 'weather-template-loading',
      loadingText: 'Loading weather data...',
      ctx,
      source,
      onRefresh: async () => {
        const refreshSettings = { ...settings, forceRefresh: true };
        const weatherData = await this.weatherDataService.getWeatherData(refreshSettings);
        this.renderTemplate(el, weatherData, refreshSettings, template, ctx, source);
        renderFreshnessIndicator(el, weatherData.metadata);
      }
    });
  }
}
