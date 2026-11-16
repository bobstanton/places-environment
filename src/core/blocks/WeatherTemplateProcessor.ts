import * as _placesDom from 'places-shared/utils';
import { RenderLifetime as Component, type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { CodeBlockReader } from "places-shared/settings";
import { renderKnapTemplate } from "places-shared/services";
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { getErrorMessage, renderError } from "places-shared/utils";
import { renderUserHtmlTemplate } from 'user-template-renderer';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';
import { WeatherDataService, WeatherCodeBlockSettings, WeatherData, WeatherCodeBlockDefaultSettings } from 'places-environment/core';
import { getWeatherEmoji, getWeatherDescription, getWeatherSeverity, getWeatherSeverityClass, getWeatherInfo, isPrecipitation, isFrozenPrecipitation, isThunderstorm } from 'places-environment/core';
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

type WeatherTemplateSettings = WeatherCodeBlockSettings & { templateEngine: 'knap' | 'javascript' };

export class WeatherTemplateProcessor extends BaseEnvironmentProcessor {
  private renderDisposers = new WeakMap<HTMLElement, () => void>();
  private weatherDataService: WeatherDataService;

  constructor(plugin: EnvironmentPluginHost, weatherDataService: WeatherDataService) {
    super(plugin);
    this.weatherDataService = weatherDataService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    this.renderDisposers.get(el)?.();
    let disposed = false;
    let generation = 0;
    let component: Component | undefined;
    const dispose = (): void => {
      disposed = true;
      component?.unload();
      component = undefined;
      if (this.renderDisposers.get(el) === dispose) this.renderDisposers.delete(el);
    };

    this.renderDisposers.set(el, dispose);
    this.plugin.registerCleanup(el, ctx, dispose);

    const render = async (forceRefresh: boolean): Promise<HTMLElement> => {
      if (disposed) return el;
      const version = ++generation;
      const isCurrent = (): boolean => !disposed && generation === version;

      component?.unload();
      component = undefined;

      try {
        const { settings, settingsSource, template } = await this.parseSourceWithTemplate(source, ctx);

        if (!isCurrent()) return el;
        settings.forceRefresh = forceRefresh;
        const weatherData = await this.weatherDataService.getWeatherData(settings);

        if (!isCurrent()) return el;
        this.plugin.getHostServices?.()?.maps.disposeMapSurfaces(el);
        _placesDom.emptyElement(el);
        const container = _placesDom.createDiv(el, 'weather-template-wrapper');
        const owner = new Component();

        owner.load();
        component = owner;
        await this.renderTemplate(container, weatherData, settings, template, ctx, owner, isCurrent);
        if (!isCurrent()) return el;
        renderFreshnessIndicator(container, weatherData.metadata);
        renderSettingsTraceIfRequested(container, settingsSource, ctx, this.plugin, 'places-weather-template', WeatherCodeBlockDefaultSettings, settings);
        this.addFloatingRefreshButton(container, {
          label: 'Refresh template', loadingClass: 'weather-template-loading', ctx, source,
          errorEl: el,
          onRefresh: async () => { await render(true); },
        });

        return container;
      } catch (error) {
        if (!isCurrent()) return el;
        component?.unload();
        component = undefined;

        throw error;
      }
    };

    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'weather-template-loading', loadingText: 'Loading weather data...',
      errorMessage: 'Failed to render weather template', refreshLabel: 'Refresh template', render,
    });
  }

  private async parseSourceWithTemplate(source: string, ctx: MarkdownPostProcessorContext): Promise<{ settings: WeatherTemplateSettings; settingsSource: string; template: string }> {
    const split = splitTemplateBlockSource(source);
    const settingsSource = split.settingsSource;
    const reader = new CodeBlockReader(settingsSource);
    const templateEngine = reader.text('templateEngine') || 'javascript';

    if (templateEngine !== 'knap' && templateEngine !== 'javascript') {
      throw new Error('templateEngine must be knap or javascript.');
    }

    const settings: WeatherTemplateSettings = { ...this.weatherDataService.parseCodeBlockSettings(settingsSource, ctx), templateEngine };
    let template: string;

    if (templateEngine === 'knap') {
      const templateFile = reader.text('templateFile')?.trim();

      if (!templateFile) throw new Error('Knap weather templates require templateFile.');
      if (!this.plugin.readKnapTemplateFile) throw new Error('This host does not support Knap template files.');
      template = await this.plugin.readKnapTemplateFile(templateFile, ctx.sourcePath);
    } else template = split.template ?? this.getDefaultTemplate();

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

  private async renderTemplate(el: HTMLElement, weatherData: WeatherData, settings: WeatherTemplateSettings, template: string, ctx: MarkdownPostProcessorContext, component: Component, isCurrent: () => boolean): Promise<void> {
    _placesDom.emptyElement(el);
    _placesDom.removeClass(el, 'weather-template-loading');
    _placesDom.addClass(el, 'weather-template-container');

    const response = weatherData.responses[0];

    if (!response) throw new Error('No weather data available for this template.');
    const timezone = response.timezone;

    const h = this.createHelpers(settings, timezone);

    const current = response.current || null;
    const hourly = response.hourly || null;
    const daily = response.daily || null;
    const coordinates = response.coordinates;

    let contentDiv: HTMLElement | null = null;

    try {
      contentDiv = _placesDom.createDiv(el, 'weather-template-content');

      if (settings.templateEngine === 'knap') {
        if (!this.plugin.renderMarkdown) throw new Error('This host does not support Markdown weather templates.');
        const series = (value: typeof response.hourly | null): Record<string, unknown> | null => value
          ? Object.fromEntries(Object.entries(value).map(([key, values]) => [key, values.map((item: number | Date | null) => item instanceof Date ? item.toISOString() : item)])) : null;
        const numberFilter = (format: (value: number) => string) => (value: unknown): string =>
          value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '' : format(Number(value));
        const dateFilter = (format: (value: Date) => string) => (value: unknown): string => {
          if (typeof value !== 'string' && typeof value !== 'number') return '';
          const date = new Date(value);

          return Number.isNaN(date.getTime()) ? '' : format(date);
        };
        const markdown = await renderKnapTemplate(template, {
          current, hourly: series(hourly), daily: series(daily), minutely15: series(response.minutely15),
          coordinates, units: settings.units, timezone,
        }, {
          format_temp: numberFilter(h.formatTemp), format_speed: numberFilter(h.formatSpeed),
          format_precip: numberFilter(h.formatPrecip), weather_emoji: numberFilter(h.weatherEmoji),
          weather_description: numberFilter(h.weatherDescription),
          format_date: dateFilter(h.formatDate), format_time: dateFilter(h.formatTime), format_datetime: dateFilter(h.formatDateTime),
        });

        if (!isCurrent()) return;
        await this.plugin.renderMarkdown(markdown, contentDiv, ctx.sourcePath, component);

        if (!isCurrent()) { component.unload();

 return; }
      } else renderUserHtmlTemplate({
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
      if (!isCurrent()) { component.unload();

 return; }

      component.unload();
      contentDiv?.remove();
      renderError(el, { icon: '⚠️', title: 'Template Error', message: getErrorMessage(error) });
    }

    const attribution = _placesDom.createDiv(el, 'weather-attribution');
    const link = _placesDom.createElement(attribution, 'a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });

    _placesDom.setAttribute(link, 'target', '_blank');
    _placesDom.setAttribute(link, 'rel', 'noopener noreferrer');
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

      escape: (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;'),

      units,
      timezone,
      startTime: settings.startTime,
      endTime: settings.endTime
    };
  }
}
