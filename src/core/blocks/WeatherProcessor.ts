import * as _placesDom from 'places-shared/utils';
import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { setIcon } from "places-shared/services";
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { logger } from "places-shared/utils";
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';
import { WeatherDataService, WeatherCodeBlockSettings, WeatherData, WeatherCodeBlockDefaultSettings } from 'places-environment/core';
import { WeatherResponse } from 'places-environment/core';
import { getWeatherEmoji, getWeatherDescription, getWeatherSeverityClass, getTimeAwareWeatherEmoji } from 'places-environment/core';
import { getDateStringInTimezone, formatTimeForDisplay, formatDateForDisplay, formatWeekday, formatMonthDay } from '../utilities/DateTimeUtilities';
import { buildTimeSeriesDaysData, findNowIndex, type TimeResolution } from './WeatherTimeSeriesViewModel';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { codeBlockText, parseCodeBlockYaml } from "places-shared/settings";

type WeatherMode = 'current' | 'minutely15' | 'hourly' | 'daily';

export class WeatherProcessor extends BaseEnvironmentProcessor {
  private weatherDataService: WeatherDataService;

  constructor(plugin: EnvironmentPluginHost, weatherDataService: WeatherDataService) {
    super(plugin);
    this.weatherDataService = weatherDataService;
  }

  private createSeasonalEstimateBadge(parent: HTMLElement, detail: string, extraClass?: string): HTMLElement {
    const badge = _placesDom.createSpan(parent, 'weather-seasonal-badge');

    if (extraClass) _placesDom.addClass(badge, extraClass);
    _placesDom.setAttribute(badge, 'title', detail);
    _placesDom.setAttribute(badge, 'aria-label', detail);
    _placesDom.setAttribute(badge, 'tabindex', '0');
    _placesDom.setText(_placesDom.createSpan(badge, 'weather-seasonal-badge-text'), 'Seasonal estimate');
    const icon = _placesDom.createSpan(badge, 'weather-seasonal-badge-icon');

    setIcon(icon, 'info');

    return badge;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const mode = this.parseMode(source);

    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: `weather-${mode}-loading`,
      loadingText: 'Loading weather data...',
      errorMessage: 'Failed to load weather data',
      refreshLabel: 'Refresh weather',
      onError: (error) => logger.scope('Weather').warn('Weather failed to load', error),
      render: async (forceRefresh) => {
        const settings = this.weatherDataService.parseCodeBlockSettings(source, ctx);

        settings.forceRefresh = forceRefresh;
        const weatherData = await this.fetchDataForMode(mode, settings);

        _placesDom.emptyElement(el);
        _placesDom.removeClass(el, `weather-${mode}-loading`);
        const container = _placesDom.createDiv(el, `weather-${mode}-wrapper`);

        this.renderForMode(container, mode, weatherData, settings, ctx, source);
        renderFreshnessIndicator(container, weatherData.metadata);
        renderSettingsTraceIfRequested(container, source, ctx, this.plugin, `places-weather (${mode})`, WeatherCodeBlockDefaultSettings, settings);

        return container;
      }
    });
  }

  private parseMode(source: string): WeatherMode {
    const value = codeBlockText(parseCodeBlockYaml(source), 'mode');

    if (value) {
      const mode = value.toLowerCase();

      if (mode === 'minutely15' || mode === '15min' || mode === '15m') return 'minutely15';
      if (mode === 'hourly' || mode === 'h') return 'hourly';
      if (mode === 'daily' || mode === 'd') return 'daily';
    }

    return 'current';
  }

  private async fetchDataForMode(mode: WeatherMode, settings: WeatherCodeBlockSettings): Promise<WeatherData> {
    const defaultCurrentVars = ['temperature_2m', 'weather_code', 'wind_speed_10m', 'relative_humidity_2m', 'precipitation', 'snowfall'];
    const defaultDailyVars = ['temperature_2m_max', 'temperature_2m_min', 'weather_code', 'precipitation_sum', 'snowfall_sum', 'precipitation_probability_max', 'sunrise', 'sunset'];

    // parseList returns [] for undefined values.
    const withDefault = <T>(arr: T[] | undefined, defaultArr: T[]): T[] =>
      arr?.length ? arr : defaultArr;

    const withSunriseSunset = (arr: string[] | undefined): string[] | undefined => {
      if (!settings.showSunriseSunset || !arr?.length) return arr;

      return [...new Set([...arr, 'sunrise', 'sunset'])];
    };

    switch (mode) {
      case 'current': {
        const currentSettings: WeatherCodeBlockSettings = {
          ...settings,
          current: withDefault(settings.current, defaultCurrentVars),
          // Request 15-minute data for trend sparkline and next-hour precipitation
          minutely15: withDefault(settings.minutely15, ['temperature_2m', 'weather_code', 'precipitation', 'snowfall']),
          hourly: undefined,
          // Request daily data for today's total precipitation and sunrise/sunset for day/night icons
          daily: ['precipitation_sum', 'snowfall_sum', 'sunrise', 'sunset'],
          days: 1
        };

        return this.weatherDataService.getWeatherData(currentSettings);
      }
      case 'minutely15': {
        const minutely15Settings: WeatherCodeBlockSettings = {
          ...settings,
          current: undefined,
          minutely15: ['temperature_2m', 'weather_code', 'precipitation_probability', 'precipitation', 'snowfall'],
          hourly: undefined,
          daily: ['sunrise', 'sunset', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'snowfall_sum']
        };

        return this.weatherDataService.getWeatherData(minutely15Settings);
      }
      case 'hourly': {
        const hourlySettings: WeatherCodeBlockSettings = {
          ...settings,
          current: undefined,
          minutely15: undefined,
          hourly: ['temperature_2m', 'weather_code', 'precipitation_probability', 'precipitation', 'snowfall'],
          daily: ['sunrise', 'sunset', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'snowfall_sum']
        };

        return this.weatherDataService.getWeatherData(hourlySettings);
      }
      case 'daily': {
        const dailySettings: WeatherCodeBlockSettings = {
          ...settings,
          current: undefined,
          minutely15: undefined,
          hourly: undefined,
          daily: withSunriseSunset(withDefault(settings.daily, defaultDailyVars))
        };

        return this.weatherDataService.getWeatherData(dailySettings);
      }
    }
  }

  private renderForMode(el: HTMLElement, mode: WeatherMode, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    switch (mode) {
      case 'current':
        this.renderCurrentMode(el, weatherData, settings, ctx, source);
        break;
      case 'minutely15':
        this.renderTimeSeriesMode(el, weatherData, settings, ctx, source, 'minutely15');
        break;
      case 'hourly':
        this.renderTimeSeriesMode(el, weatherData, settings, ctx, source, 'hourly');
        break;
      case 'daily':
        this.renderDailyMode(el, weatherData, settings, ctx, source);
        break;
    }
  }

  private renderCurrentMode(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    _placesDom.emptyElement(el);
    _placesDom.addClass(el, 'weather-current-container');

    const response = weatherData.responses[0];

    if (!response.current) {
      this.renderError(el, {
        message: 'No current weather data available',
        ctx,
        source,
        onRefresh: async () => {
          const freshData = await this.fetchDataForMode('current', { ...settings, forceRefresh: true });

          this.renderCurrentMode(el, freshData, settings, ctx, source);
        },
        refreshLabel: 'Refresh weather'
      });

      return;
    }

    const current = response.current;
    const weatherCode = typeof current.weather_code === 'number' ? current.weather_code : 0;
    const severityClass = getWeatherSeverityClass(weatherCode);

    const sunrise = (response.daily?.sunrise as (Date | null)[])?.[0] ?? null;
    const sunset = (response.daily?.sunset as (Date | null)[])?.[0] ?? null;

    const widget = _placesDom.createDiv(el, `weather-widget weather-${severityClass}`);

    const topRow = _placesDom.createDiv(widget, 'weather-widget-top-row');

    const mainSection = _placesDom.createDiv(topRow, 'weather-widget-main');
    const iconDiv = _placesDom.createDiv(mainSection, 'weather-widget-icon');

    _placesDom.setText(iconDiv, getTimeAwareWeatherEmoji(weatherCode, new Date(), sunrise, sunset));

    const tempDiv = _placesDom.createDiv(mainSection, 'weather-widget-temp');
    const temperature = current.temperature_2m;

    if (typeof temperature === 'number') {
      const tempUnit = settings.units === 'imperial' ? '°F' : '°C';

      _placesDom.setText(tempDiv, `${Math.round(temperature)}${tempUnit}`);
    }

    const conditionDiv = _placesDom.createDiv(mainSection, 'weather-widget-condition');

    _placesDom.setText(conditionDiv, getWeatherDescription(weatherCode));

    this.renderTrendSparkline(topRow, response, settings);

    const detailsSection = _placesDom.createDiv(widget, 'weather-widget-details');

    if (current.wind_speed_10m !== undefined) {
      const windDiv = _placesDom.createDiv(detailsSection, 'weather-widget-detail');

      _placesDom.setText(_placesDom.createSpan(windDiv, 'weather-detail-icon'), '💨');
      const windUnit = settings.units === 'imperial' ? 'mph' : 'km/h';

      _placesDom.setText(_placesDom.createSpan(windDiv, 'weather-detail-value'), `${Math.round(current.wind_speed_10m as number)} ${windUnit}`);
    }

    if (current.relative_humidity_2m !== undefined) {
      const humidityDiv = _placesDom.createDiv(detailsSection, 'weather-widget-detail');

      _placesDom.setText(_placesDom.createSpan(humidityDiv, 'weather-detail-label'), 'Humidity');
      _placesDom.setText(_placesDom.createSpan(humidityDiv, 'weather-detail-value'), `${Math.round(current.relative_humidity_2m as number)}%`);
    }

    const precipUnit = settings.units === 'imperial' ? '"' : 'mm';

    let nextHourPrecip = 0;
    let nextHourSnowfall = 0;
    const minutely15 = response.minutely15;

    if (minutely15?.time) {
      const now = Date.now();
      const times = minutely15.time;
      const precips = minutely15.precipitation as (number | null)[];
      const snowfalls = minutely15.snowfall as (number | null)[];

      for (let i = 0; i < times.length && i < times.length; i++) {
        const timeMs = times[i].getTime();

        if (timeMs >= now && timeMs < now + 60 * 60 * 1000) {
          nextHourPrecip += precips?.[i] ?? 0;
          nextHourSnowfall += snowfalls?.[i] ?? 0;
        }
      }
    }

    const nextHourAmount = Math.max(nextHourPrecip, nextHourSnowfall);

    const daily = response.daily;
    const dailyPrecipSum = daily ? ((daily.precipitation_sum as (number | null)[])?.[0] ?? 0) : 0;
    const dailySnowfallSum = daily ? ((daily.snowfall_sum as (number | null)[])?.[0] ?? 0) : 0;
    const todayTotal = Math.max(dailyPrecipSum, dailySnowfallSum);
    const isSnow = dailySnowfallSum > dailyPrecipSum || nextHourSnowfall > nextHourPrecip;
    const precipIcon = isSnow ? '❄️' : '🌧️';

    if (nextHourAmount > 0 || todayTotal > 0) {
      const precipDiv = _placesDom.createDiv(detailsSection, 'weather-widget-detail');

      _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-detail-icon'), precipIcon);

      const parts: string[] = [];

      if (nextHourAmount > 0) {
        parts.push(`${nextHourAmount.toFixed(1)}${precipUnit} next hr`);
      }

      if (todayTotal > 0) {
        parts.push(`${todayTotal.toFixed(1)}${precipUnit} today`);
      }

      _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-detail-value'), parts.join(' · '));
    }

    const precipProbability = daily ? ((daily.precipitation_probability_max as (number | null)[])?.[0] ?? null) : null;

    if (precipProbability !== null && precipProbability > 0) {
      const probDiv = _placesDom.createDiv(detailsSection, 'weather-widget-detail');

      _placesDom.setText(_placesDom.createSpan(probDiv, 'weather-detail-icon'), '☂️');
      _placesDom.setText(_placesDom.createSpan(probDiv, 'weather-detail-value'), `${Math.round(precipProbability)}%`);
    }

    if (current.apparent_temperature !== undefined) {
      const feelsLikeDiv = _placesDom.createDiv(detailsSection, 'weather-widget-detail');

      _placesDom.setText(_placesDom.createSpan(feelsLikeDiv, 'weather-detail-icon'), '🌡️');
      const tempUnit = settings.units === 'imperial' ? '°F' : '°C';

      _placesDom.setText(_placesDom.createSpan(feelsLikeDiv, 'weather-detail-value'), `Feels ${Math.round(current.apparent_temperature as number)}${tempUnit}`);
    }

    const attributionDiv = _placesDom.createDiv(detailsSection, 'weather-attribution');
    const link = _placesDom.createElement(attributionDiv, 'a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });

    _placesDom.setAttribute(link, 'target', '_blank');
    _placesDom.setAttribute(link, 'rel', 'noopener noreferrer');

    this.addRefreshButton(el, 'current', ctx, source, settings);
  }

  private renderTimeSeriesMode(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string, resolution: TimeResolution): void {
    _placesDom.emptyElement(el);
    _placesDom.addClass(el, 'weather-hourly-container');

    const response = weatherData.responses[0];
    const dataSource = resolution === 'minutely15' ? response.minutely15 : response.hourly;

    if (!dataSource || !dataSource.time) {
      const errorMsg = resolution === 'minutely15'
        ? 'No 15-minute forecast data available for this region'
        : 'No hourly weather data available';

      this.renderError(el, {
        message: errorMsg,
        ctx,
        source,
        onRefresh: async () => {
          const freshData = await this.fetchDataForMode(resolution, { ...settings, forceRefresh: true });

          this.renderTimeSeriesMode(el, freshData, settings, ctx, source, resolution);
        },
        refreshLabel: 'Refresh weather'
      });

      return;
    }

    const timezone = response.timezone;
    const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
    const precipUnit = settings.units === 'imperial' ? '"' : 'mm';
    const isSeasonal = weatherData.metadata.isSeasonalForecast === true;
    const seasonalDetail = 'Long-range seasonal data is a 6-hourly ensemble model average. Precipitation probability is not available for this range.';

    const days = buildTimeSeriesDaysData(weatherData, settings, resolution);

    if (days.length === 0) {
      this.renderError(el, {
        message: 'No weather data available for the specified time range',
        ctx,
        source,
        onRefresh: async () => {
          const freshData = await this.fetchDataForMode(resolution, { ...settings, forceRefresh: true });

          this.renderTimeSeriesMode(el, freshData, settings, ctx, source, resolution);
        },
        refreshLabel: 'Refresh weather'
      });

      return;
    }

    days.forEach((day, index) => {
      const dayCard = _placesDom.createDiv(el, 'weather-day-card');

      if (index === days.length - 1) {
        _placesDom.addClass(dayCard, 'weather-day-card-last');
      }

      const header = _placesDom.createDiv(dayCard, 'weather-day-header');

      const dateSpan = _placesDom.createSpan(header, 'weather-day-date');

      if (day.isToday) {
        _placesDom.setText(_placesDom.createSpan(dateSpan, 'weather-day-today'), 'Today');
      } else {
        _placesDom.setText(dateSpan, formatDateForDisplay(day.date, timezone));
      }

      if (settings.showSunriseSunset && (day.sunrise || day.sunset)) {
        const sunSpan = _placesDom.createSpan(header, 'weather-day-sun');

        if (day.sunrise instanceof Date) {
          _placesDom.setText(_placesDom.createSpan(sunSpan), `🌅 ${formatTimeForDisplay(day.sunrise, timezone)}`);
        }

        if (day.sunset instanceof Date) {
          _placesDom.setText(_placesDom.createSpan(sunSpan), `🌇 ${formatTimeForDisplay(day.sunset, timezone)}`);
        }
      }

      if (day.tempMax !== null || day.tempMin !== null || day.precipSum !== null) {
        const summarySpan = _placesDom.createSpan(header, 'weather-day-summary');

        if (day.tempMax !== null && day.tempMin !== null) {
          _placesDom.setText(_placesDom.createSpan(summarySpan, 'weather-day-highlow'), `↓${Math.round(day.tempMin)}° ↑${Math.round(day.tempMax)}°`);
        }

        if (day.precipSum !== null && day.precipSum > 0) {
          _placesDom.setText(_placesDom.createSpan(summarySpan, 'weather-day-precip-total'), `💧${day.precipSum.toFixed(1)}${precipUnit}`);
        }
      }

      const slotsRow = _placesDom.createDiv(dayCard, 'weather-day-hours-row');
      const totalPrecipAmount = day.slots.reduce((sum, s) => sum + (s.precipAmount ?? 0), 0);

      const timeFormat: Intl.DateTimeFormatOptions = resolution === 'minutely15'
        ? { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }
        : { hour: 'numeric', hour12: true, timeZone: timezone };

      for (const slot of day.slots) {
        const severityClass = getWeatherSeverityClass(slot.weatherCode);
        const slotCard = _placesDom.createDiv(slotsRow, `weather-day-hour weather-${severityClass}`);

        if (slot.isNow) {
          _placesDom.addClass(slotCard, 'weather-day-hour-now');
        }

        if (slot.precipAmount !== null && slot.precipAmount > 0 && totalPrecipAmount > 0) {
          const precipRatio = slot.precipAmount / totalPrecipAmount;
          const precipPercent = Math.round(precipRatio * 100);

          _placesDom.setCssProperties(slotCard, {
            '--precip-height': `${precipPercent}%`
          });
          _placesDom.addClass(slotCard, 'weather-day-hour-has-precip');
        }

        _placesDom.setText(_placesDom.createSpan(slotCard, 'weather-day-hour-time'), slot.time.toLocaleTimeString('en-US', timeFormat));

        _placesDom.setText(_placesDom.createSpan(slotCard, 'weather-day-hour-icon'), getTimeAwareWeatherEmoji(slot.weatherCode, slot.time, day.sunrise, day.sunset));

        if (slot.temperature !== null) {
          _placesDom.setText(_placesDom.createSpan(slotCard, 'weather-day-hour-temp'), `${Math.round(slot.temperature)}${tempUnit}`);
        }

        const hasPrecipProb = slot.precipProbability !== null && slot.precipProbability > 0;
        const hasPrecipAmt = slot.precipAmount !== null && slot.precipAmount > 0;

        if (hasPrecipProb || hasPrecipAmt) {
          const precipDiv = _placesDom.createDiv(slotCard, 'weather-day-hour-precip');

          if (hasPrecipAmt) {
            _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-precip-amount'), `${slot.precipAmount!.toFixed(2)}${precipUnit}`);
          }

          _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-precip-icon'), '💧');

          if (hasPrecipProb) {
            _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-precip-probability'), `${Math.round(slot.precipProbability!)}%`);
          }
        }
      }
    });

    const attribution = _placesDom.createDiv(el, 'weather-attribution');

    if (isSeasonal) {
      this.createSeasonalEstimateBadge(attribution, seasonalDetail, 'weather-seasonal-attribution-badge');
    }

    const link = _placesDom.createElement(attribution, 'a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });

    _placesDom.setAttribute(link, 'target', '_blank');
    _placesDom.setAttribute(link, 'rel', 'noopener noreferrer');

    this.addRefreshButton(el, resolution, ctx, source, settings);
  }

  private renderDailyMode(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    _placesDom.emptyElement(el);
    _placesDom.addClass(el, 'weather-forecast-container');

    const response = weatherData.responses[0];

    if (!response.daily || !response.daily.time) {
      this.renderError(el, {
        message: 'No forecast data available',
        ctx,
        source,
        onRefresh: async () => {
          const freshData = await this.fetchDataForMode('daily', { ...settings, forceRefresh: true });

          this.renderDailyMode(el, freshData, settings, ctx, source);
        },
        refreshLabel: 'Refresh weather'
      });

      return;
    }

    const isSeasonal = weatherData.metadata.isSeasonalForecast === true;
    const seasonalDetail = 'Long-range seasonal data is an ensemble model average. Weather conditions and precipitation probability are not available for this range.';

    const daily = response.daily;
    const times = daily.time;
    const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
    const precipUnit = settings.units === 'imperial' ? '"' : 'mm';
    const timezone = response.timezone;

    const todayStr = getDateStringInTimezone(new Date(), timezone);
    const grid = _placesDom.createDiv(el, 'weather-forecast-grid');

    for (let i = 0; i < times.length; i++) {
      const date = times[i];
      const rawWeatherCode = (daily.weather_code as (number | null)[] | undefined)?.[i];
      const weatherCode = rawWeatherCode ?? 0;
      const tempMax = (daily.temperature_2m_max as (number | null)[])?.[i];
      const tempMin = (daily.temperature_2m_min as (number | null)[])?.[i];
      const precipitationSum = (daily.precipitation_sum as (number | null)[])?.[i] ?? 0;
      const snowfallSum = (daily.snowfall_sum as (number | null)[])?.[i] ?? 0;
      const precipAmount = Math.max(precipitationSum, snowfallSum);
      const precipProbability = (daily.precipitation_probability_max as (number | null)[])?.[i];
      const sunrise = (daily.sunrise as (Date | null)[])?.[i];
      const sunset = (daily.sunset as (Date | null)[])?.[i];

      const severityClass = isSeasonal ? 'mild' : getWeatherSeverityClass(weatherCode);
      const card = _placesDom.createDiv(grid, `weather-forecast-card weather-${severityClass}`);

      const dateHeader = _placesDom.createDiv(card, 'weather-forecast-date');
      const dayName = formatWeekday(date, timezone);
      const dateStr = formatMonthDay(date, timezone);

      const isToday = getDateStringInTimezone(date, timezone) === todayStr;

      if (isToday) {
        _placesDom.addClass(dateHeader, 'weather-forecast-today');
        _placesDom.setText(_placesDom.createSpan(dateHeader, 'weather-forecast-day'), 'Today');
      } else {
        _placesDom.setText(_placesDom.createSpan(dateHeader, 'weather-forecast-day'), dayName);
      }

      _placesDom.setText(_placesDom.createSpan(dateHeader, 'weather-forecast-date-str'), dateStr);

      if (!isSeasonal) {
        const iconDiv = _placesDom.createDiv(card, 'weather-forecast-icon');

        _placesDom.setText(iconDiv, isToday
          ? getTimeAwareWeatherEmoji(weatherCode, new Date(), sunrise ?? null, sunset ?? null)
          : getWeatherEmoji(weatherCode));

        const conditionDiv = _placesDom.createDiv(card, 'weather-forecast-condition');

        _placesDom.setText(conditionDiv, getWeatherDescription(weatherCode));
      }

      const tempDiv = _placesDom.createDiv(card, 'weather-forecast-temps');

      if (tempMin !== null && tempMin !== undefined) {
        _placesDom.setText(_placesDom.createSpan(tempDiv, 'weather-forecast-low'), `${Math.round(tempMin)}${tempUnit}`);
      }

      if (tempMax !== null && tempMax !== undefined) {
        _placesDom.setText(_placesDom.createSpan(tempDiv, 'weather-forecast-high'), `${Math.round(tempMax)}${tempUnit}`);
      }

      const hasPrecipProbability = precipProbability !== null && precipProbability !== undefined && precipProbability > 0;
      const hasPrecipAmount = precipAmount > 0;

      if (hasPrecipProbability || hasPrecipAmount) {
        const precipDiv = _placesDom.createDiv(card, 'weather-forecast-precip');

        if (hasPrecipAmount) {
          _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-precip-amount'), `${precipAmount.toFixed(1)}${precipUnit}`);
        }

        const precipIcon = snowfallSum > precipitationSum ? '❄️' : '💧';

        _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-precip-icon'), precipIcon);

        if (hasPrecipProbability) {
          _placesDom.setText(_placesDom.createSpan(precipDiv, 'weather-precip-probability'), `${Math.round(precipProbability)}%`);
        }
      }

      if (settings.showSunriseSunset && (sunrise || sunset)) {
        const solarDiv = _placesDom.createDiv(card, 'weather-forecast-solar');

        if (sunrise instanceof Date) {
          _placesDom.setText(_placesDom.createSpan(solarDiv, 'weather-sunrise'), formatTimeForDisplay(sunrise, timezone));
        }

        if (sunset instanceof Date) {
          _placesDom.setText(_placesDom.createSpan(solarDiv, 'weather-sunset'), formatTimeForDisplay(sunset, timezone));
        }
      }
    }

    const attribution = _placesDom.createDiv(el, 'weather-attribution');

    if (isSeasonal) {
      this.createSeasonalEstimateBadge(attribution, seasonalDetail, 'weather-seasonal-attribution-badge');
    }

    const link = _placesDom.createElement(attribution, 'a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });

    _placesDom.setAttribute(link, 'target', '_blank');
    _placesDom.setAttribute(link, 'rel', 'noopener noreferrer');

    this.addRefreshButton(el, 'daily', ctx, source, settings);
  }

  private addRefreshButton(el: HTMLElement, mode: WeatherMode, ctx: MarkdownPostProcessorContext, source: string, settings: WeatherCodeBlockSettings): void {
    this.addFloatingRefreshButton(el, {
      label: 'Refresh weather',
      loadingClass: `weather-${mode}-loading`,
      loadingText: 'Loading weather data...',
      ctx,
      source,
      onError: (error) => logger.scope('Weather').warn('Weather refresh failed', error),
      onRefresh: async () => {
        const refreshSettings = { ...settings, forceRefresh: true };
        const weatherData = await this.fetchDataForMode(mode, refreshSettings);

        this.renderForMode(el, mode, weatherData, refreshSettings, ctx, source);
        renderFreshnessIndicator(el, weatherData.metadata);
      }
    });
  }

  private renderTrendSparkline(container: HTMLElement, response: WeatherResponse, settings: WeatherCodeBlockSettings): void {
    const minutely15 = response.minutely15;

    if (!minutely15 || !minutely15.time || !minutely15.temperature_2m) {
      return;
    }

    const times = minutely15.time;
    const temps = minutely15.temperature_2m as (number | null)[];
    const timezone = response.timezone;

    if (times.length < 2) return;

    const nowIndex = findNowIndex(times);

    const windowBefore = 8;
    const windowAfter = 16;
    const startIdx = Math.max(0, nowIndex - windowBefore);
    const endIdx = Math.min(times.length - 1, nowIndex + windowAfter);

    const windowTimes = times.slice(startIdx, endIdx + 1);
    const windowTemps = temps.slice(startIdx, endIdx + 1);
    const nowPositionInWindow = nowIndex - startIdx;

    const validTemps = windowTemps.filter((t): t is number => t !== null);

    if (validTemps.length < 2) return;

    const minTemp = Math.min(...validTemps);
    const maxTemp = Math.max(...validTemps);
    const tempRange = maxTemp - minTemp || 1;

    const width = 240;
    const height = 56;
    const paddingX = 2;
    const paddingTop = 4;
    const paddingBottom = 16;  
    const plotWidth = width - paddingX * 2;
    const plotHeight = height - paddingTop - paddingBottom;

    const points: { x: number; y: number; temp: number | null }[] = [];

    for (let i = 0; i < windowTemps.length; i++) {
      const x = paddingX + (i / (windowTemps.length - 1)) * plotWidth;
      const temp = windowTemps[i];
      const y = temp !== null
        ? paddingTop + plotHeight - ((temp - minTemp) / tempRange) * plotHeight
        : null;

      points.push({ x, y: y ?? 0, temp });
    }

    const validPoints = points.filter(p => p.temp !== null);

    if (validPoints.length < 2) return;

    let pathD = `M ${validPoints[0].x} ${validPoints[0].y}`;

    for (let i = 1; i < validPoints.length; i++) {
      pathD += ` L ${validPoints[i].x} ${validPoints[i].y}`;
    }

    const sparklineDiv = _placesDom.createDiv(container, 'weather-widget-sparkline');

    const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
    const yAxisDiv = _placesDom.createDiv(sparklineDiv, 'weather-sparkline-yaxis');

    _placesDom.setText(_placesDom.createSpan(yAxisDiv, 'weather-sparkline-max'), `${Math.round(maxTemp)}${tempUnit}`);
    _placesDom.setText(_placesDom.createSpan(yAxisDiv, 'weather-sparkline-min'), `${Math.round(minTemp)}${tempUnit}`);

    const chartArea = _placesDom.createDiv(sparklineDiv, 'weather-sparkline-chart-area');

    const gradientId = `sparkline-gradient-${Date.now()}-${(Math.random()).toString(36).slice(2, 9)}`;

    const svg = _placesDom.createSvg(chartArea, 'svg');

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    _placesDom.addClass(svg, 'weather-sparkline-svg');

    const defs = _placesDom.createSvg(svg, 'defs');
    const gradient = _placesDom.createSvg(defs, 'linearGradient');

    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '100%');

    const stop1 = _placesDom.createSvg(gradient, 'stop');

    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', 'var(--interactive-accent)');
    stop1.setAttribute('stop-opacity', '0.3');

    const stop2 = _placesDom.createSvg(gradient, 'stop');

    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', 'var(--interactive-accent)');
    stop2.setAttribute('stop-opacity', '0.05');

    const plotBottom = paddingTop + plotHeight;
    const areaPathD = pathD + ` L ${validPoints[validPoints.length - 1].x} ${plotBottom} L ${validPoints[0].x} ${plotBottom} Z`;
    const areaPath = _placesDom.createSvg(svg, 'path');

    areaPath.setAttribute('d', areaPathD);
    areaPath.setAttribute('fill', `url(#${gradientId})`);
    const linePath = _placesDom.createSvg(svg, 'path');

    linePath.setAttribute('d', pathD);
    linePath.setAttribute('stroke', 'var(--interactive-accent)');
    linePath.setAttribute('stroke-width', '2');
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke-linecap', 'round');
    linePath.setAttribute('stroke-linejoin', 'round');
    const nowPoint = points[nowPositionInWindow];

    if (nowPoint && nowPoint.temp !== null) {
      const circle = _placesDom.createSvg(svg, 'circle');

      circle.setAttribute('cx', `${nowPoint.x}`);
      circle.setAttribute('cy', `${nowPoint.y}`);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', 'var(--interactive-accent)');
      circle.setAttribute('stroke', 'var(--background-primary)');
      circle.setAttribute('stroke-width', '2');
    }

    const startTime = windowTimes[0];
    const endTime = windowTimes[windowTimes.length - 1];
    const textY = height - 3;
    const fontSize = 9;

    const startText = _placesDom.createSvg(svg, 'text');

    startText.setAttribute('x', `${paddingX}`);
    startText.setAttribute('y', `${textY}`);
    startText.setAttribute('font-size', `${fontSize}`);
    startText.setAttribute('fill', 'var(--text-faint)');
    startText.setAttribute('text-anchor', 'start');
    startText.textContent = formatTimeForDisplay(startTime, timezone);
    const nowText = _placesDom.createSvg(svg, 'text');

    nowText.setAttribute('x', `${nowPoint.x}`);
    nowText.setAttribute('y', `${textY}`);
    nowText.setAttribute('font-size', `${fontSize}`);
    nowText.setAttribute('font-weight', '600');
    nowText.setAttribute('fill', 'var(--interactive-accent)');
    nowText.setAttribute('text-anchor', 'middle');
    nowText.textContent = 'Now';
    const endText = _placesDom.createSvg(svg, 'text');

    endText.setAttribute('x', `${width - paddingX}`);
    endText.setAttribute('y', `${textY}`);
    endText.setAttribute('font-size', `${fontSize}`);
    endText.setAttribute('fill', 'var(--text-faint)');
    endText.setAttribute('text-anchor', 'end');
    endText.textContent = formatTimeForDisplay(endTime, timezone);
  }
}
