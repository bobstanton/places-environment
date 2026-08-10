// Weather display modes:
// - current: compact widget with a trend sparkline
// - minutely15: day-by-day rows of 15-minute interval cards
// - hourly: day-by-day rows of horizontally scrolling hour cards
// - daily: forecast card grid

import { MarkdownPostProcessorContext, setIcon } from 'obsidian';
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { logger } from "places-shared/utils";
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { WeatherDataService, WeatherCodeBlockSettings, WeatherData, WeatherCodeBlockDefaultSettings } from '../services/WeatherDataService';
import { WeatherResponse } from '../api-services/OpenMeteoApiService';
import { getWeatherEmoji, getWeatherDescription, getWeatherSeverityClass, getTimeAwareWeatherEmoji } from '../utilities/WeatherCodeUtilities';
import { getDateStringInTimezone, formatTimeForDisplay, formatDateForDisplay, formatWeekday, formatMonthDay } from '../utilities/DateTimeUtilities';
import { buildTimeSeriesDaysData, findNowIndex, type TimeResolution } from './WeatherTimeSeriesViewModel';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { codeBlockText, parseCodeBlockYaml } from 'places-shared/settings';

type WeatherMode = 'current' | 'minutely15' | 'hourly' | 'daily';

export class WeatherProcessor extends BaseEnvironmentProcessor {
  private weatherDataService: WeatherDataService;

  constructor(plugin: PlacesEnvironmentPlugin, weatherDataService: WeatherDataService) {
    super(plugin);
    this.weatherDataService = weatherDataService;
  }

  private createSeasonalEstimateBadge(parent: HTMLElement, detail: string, extraClass?: string): HTMLElement {
    const badge = parent.createSpan('weather-seasonal-badge');
    if (extraClass) badge.addClass(extraClass);
    badge.setAttr('title', detail);
    badge.setAttr('aria-label', detail);
    badge.setAttr('tabindex', '0');
    badge.createSpan('weather-seasonal-badge-text').setText('Seasonal estimate');
    const icon = badge.createSpan('weather-seasonal-badge-icon');
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

        el.empty();
        el.removeClass(`weather-${mode}-loading`);
        const container = el.createDiv(`weather-${mode}-wrapper`);
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
    el.empty();
    el.addClass('weather-current-container');

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

    const widget = el.createDiv(`weather-widget weather-${severityClass}`);

    const topRow = widget.createDiv('weather-widget-top-row');

    const mainSection = topRow.createDiv('weather-widget-main');
    const iconDiv = mainSection.createDiv('weather-widget-icon');
    iconDiv.setText(getTimeAwareWeatherEmoji(weatherCode, new Date(), sunrise, sunset));

    const tempDiv = mainSection.createDiv('weather-widget-temp');
    const temperature = current.temperature_2m;
    if (typeof temperature === 'number') {
      const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
      tempDiv.setText(`${Math.round(temperature)}${tempUnit}`);
    }

    const conditionDiv = mainSection.createDiv('weather-widget-condition');
    conditionDiv.setText(getWeatherDescription(weatherCode));

    this.renderTrendSparkline(topRow, response, settings);

    const detailsSection = widget.createDiv('weather-widget-details');

    if (current.wind_speed_10m !== undefined) {
      const windDiv = detailsSection.createDiv('weather-widget-detail');
      windDiv.createSpan('weather-detail-icon').setText('💨');
      const windUnit = settings.units === 'imperial' ? 'mph' : 'km/h';
      windDiv.createSpan('weather-detail-value').setText(`${Math.round(current.wind_speed_10m as number)} ${windUnit}`);
    }

    if (current.relative_humidity_2m !== undefined) {
      const humidityDiv = detailsSection.createDiv('weather-widget-detail');
      humidityDiv.createSpan('weather-detail-label').setText('Humidity');
      humidityDiv.createSpan('weather-detail-value').setText(`${Math.round(current.relative_humidity_2m as number)}%`);
    }

    // Not "in": it reads as the word.
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
      const precipDiv = detailsSection.createDiv('weather-widget-detail');
      precipDiv.createSpan('weather-detail-icon').setText(precipIcon);

      const parts: string[] = [];
      if (nextHourAmount > 0) {
        parts.push(`${nextHourAmount.toFixed(1)}${precipUnit} next hr`);
      }
      if (todayTotal > 0) {
        parts.push(`${todayTotal.toFixed(1)}${precipUnit} today`);
      }
      precipDiv.createSpan('weather-detail-value').setText(parts.join(' · '));
    }

    const precipProbability = daily ? ((daily.precipitation_probability_max as (number | null)[])?.[0] ?? null) : null;
    if (precipProbability !== null && precipProbability > 0) {
      const probDiv = detailsSection.createDiv('weather-widget-detail');
      probDiv.createSpan('weather-detail-icon').setText('☂️');
      probDiv.createSpan('weather-detail-value').setText(`${Math.round(precipProbability)}%`);
    }

    if (current.apparent_temperature !== undefined) {
      const feelsLikeDiv = detailsSection.createDiv('weather-widget-detail');
      feelsLikeDiv.createSpan('weather-detail-icon').setText('🌡️');
      const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
      feelsLikeDiv.createSpan('weather-detail-value').setText(`Feels ${Math.round(current.apparent_temperature as number)}${tempUnit}`);
    }

    // Attribution is required by Open-Meteo's CC BY 4.0 license.
    const attributionDiv = detailsSection.createDiv('weather-attribution');
    const link = attributionDiv.createEl('a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });
    link.setAttr('target', '_blank');
    link.setAttr('rel', 'noopener noreferrer');

    this.addRefreshButton(el, 'current', ctx, source, settings);
  }

  private renderTimeSeriesMode(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string, resolution: TimeResolution): void {
    el.empty();
    el.addClass('weather-hourly-container');

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
      const dayCard = el.createDiv('weather-day-card');
      if (index === days.length - 1) {
        dayCard.addClass('weather-day-card-last');
      }

      const header = dayCard.createDiv('weather-day-header');

      const dateSpan = header.createSpan('weather-day-date');
      if (day.isToday) {
        dateSpan.createSpan('weather-day-today').setText('Today');
      } else {
        dateSpan.setText(formatDateForDisplay(day.date, timezone));
      }

      if (day.sunrise || day.sunset) {
        const sunSpan = header.createSpan('weather-day-sun');
        if (day.sunrise instanceof Date) {
          sunSpan.createSpan().setText(`🌅 ${formatTimeForDisplay(day.sunrise, timezone)}`);
        }
        if (day.sunset instanceof Date) {
          sunSpan.createSpan().setText(`🌇 ${formatTimeForDisplay(day.sunset, timezone)}`);
        }
      }

      if (day.tempMax !== null || day.tempMin !== null || day.precipSum !== null) {
        const summarySpan = header.createSpan('weather-day-summary');
        if (day.tempMax !== null && day.tempMin !== null) {
          summarySpan.createSpan('weather-day-highlow').setText(`↓${Math.round(day.tempMin)}° ↑${Math.round(day.tempMax)}°`);
        }
        if (day.precipSum !== null && day.precipSum > 0) {
          summarySpan.createSpan('weather-day-precip-total').setText(`💧${day.precipSum.toFixed(1)}${precipUnit}`);
        }
      }

      const slotsRow = dayCard.createDiv('weather-day-hours-row');
      const totalPrecipAmount = day.slots.reduce((sum, s) => sum + (s.precipAmount ?? 0), 0);

      const timeFormat: Intl.DateTimeFormatOptions = resolution === 'minutely15'
        ? { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }
        : { hour: 'numeric', hour12: true, timeZone: timezone };

      for (const slot of day.slots) {
        const severityClass = getWeatherSeverityClass(slot.weatherCode);
        const slotCard = slotsRow.createDiv(`weather-day-hour weather-${severityClass}`);

        if (slot.isNow) {
          slotCard.addClass('weather-day-hour-now');
        }

        if (slot.precipAmount !== null && slot.precipAmount > 0 && totalPrecipAmount > 0) {
          const precipRatio = slot.precipAmount / totalPrecipAmount;
          const precipPercent = Math.round(precipRatio * 100);
          slotCard.setCssProps({
            '--precip-height': `${precipPercent}%`
          });
          slotCard.addClass('weather-day-hour-has-precip');
        }

        slotCard.createSpan('weather-day-hour-time').setText(
          slot.time.toLocaleTimeString('en-US', timeFormat)
        );

        slotCard.createSpan('weather-day-hour-icon').setText(getTimeAwareWeatherEmoji(slot.weatherCode, slot.time, day.sunrise, day.sunset));

        if (slot.temperature !== null) {
          slotCard.createSpan('weather-day-hour-temp').setText(`${Math.round(slot.temperature)}${tempUnit}`);
        }

        const hasPrecipProb = slot.precipProbability !== null && slot.precipProbability > 0;
        const hasPrecipAmt = slot.precipAmount !== null && slot.precipAmount > 0;
        if (hasPrecipProb || hasPrecipAmt) {
          const precipDiv = slotCard.createDiv('weather-day-hour-precip');
          if (hasPrecipAmt) {
            precipDiv.createSpan('weather-precip-amount').setText(`${slot.precipAmount!.toFixed(2)}${precipUnit}`);
          }
          precipDiv.createSpan('weather-precip-icon').setText('💧');
          if (hasPrecipProb) {
            precipDiv.createSpan('weather-precip-probability').setText(`${Math.round(slot.precipProbability!)}%`);
          }
        }
      }
    });

    const attribution = el.createDiv('weather-attribution');
    if (isSeasonal) {
      this.createSeasonalEstimateBadge(attribution, seasonalDetail, 'weather-seasonal-attribution-badge');
    }
    const link = attribution.createEl('a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });
    link.setAttr('target', '_blank');
    link.setAttr('rel', 'noopener noreferrer');

    this.addRefreshButton(el, resolution, ctx, source, settings);
  }


  private renderDailyMode(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    el.empty();
    el.addClass('weather-forecast-container');

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
    const grid = el.createDiv('weather-forecast-grid');

    for (let i = 0; i < times.length; i++) {
      const date = times[i];
      const rawWeatherCode = (daily.weather_code as (number | null)[] | undefined)?.[i];
      const weatherCode = rawWeatherCode ?? 0;
      const tempMax = (daily.temperature_2m_max as (number | null)[])?.[i];
      const tempMin = (daily.temperature_2m_min as (number | null)[])?.[i];
      const precipitationSum = (daily.precipitation_sum as (number | null)[])?.[i] ?? 0;
      const snowfallSum = (daily.snowfall_sum as (number | null)[])?.[i] ?? 0;
      // precipitation_sum is snow's water equivalent; snowfall reads larger.
      const precipAmount = Math.max(precipitationSum, snowfallSum);
      const precipProbability = (daily.precipitation_probability_max as (number | null)[])?.[i];
      const sunrise = (daily.sunrise as (Date | null)[])?.[i];
      const sunset = (daily.sunset as (Date | null)[])?.[i];

      const severityClass = isSeasonal ? 'mild' : getWeatherSeverityClass(weatherCode);
      const card = grid.createDiv(`weather-forecast-card weather-${severityClass}`);

      const dateHeader = card.createDiv('weather-forecast-date');
      const dayName = formatWeekday(date, timezone);
      const dateStr = formatMonthDay(date, timezone);

      const isToday = getDateStringInTimezone(date, timezone) === todayStr;
      if (isToday) {
        dateHeader.addClass('weather-forecast-today');
        dateHeader.createSpan('weather-forecast-day').setText('Today');
      } else {
        dateHeader.createSpan('weather-forecast-day').setText(dayName);
      }
      dateHeader.createSpan('weather-forecast-date-str').setText(dateStr);

      // Seasonal forecasts carry no weather codes.
      if (!isSeasonal) {
        const iconDiv = card.createDiv('weather-forecast-icon');
        iconDiv.setText(isToday
          ? getTimeAwareWeatherEmoji(weatherCode, new Date(), sunrise ?? null, sunset ?? null)
          : getWeatherEmoji(weatherCode));

        const conditionDiv = card.createDiv('weather-forecast-condition');
        conditionDiv.setText(getWeatherDescription(weatherCode));
      }

      const tempDiv = card.createDiv('weather-forecast-temps');
      if (tempMin !== null && tempMin !== undefined) {
        tempDiv.createSpan('weather-forecast-low').setText(`${Math.round(tempMin)}${tempUnit}`);
      }
      if (tempMax !== null && tempMax !== undefined) {
        tempDiv.createSpan('weather-forecast-high').setText(`${Math.round(tempMax)}${tempUnit}`);
      }

      const hasPrecipProbability = precipProbability !== null && precipProbability !== undefined && precipProbability > 0;
      const hasPrecipAmount = precipAmount > 0;
      if (hasPrecipProbability || hasPrecipAmount) {
        const precipDiv = card.createDiv('weather-forecast-precip');
        if (hasPrecipAmount) {
          precipDiv.createSpan('weather-precip-amount').setText(`${precipAmount.toFixed(1)}${precipUnit}`);
        }
        const precipIcon = snowfallSum > precipitationSum ? '❄️' : '💧';
        precipDiv.createSpan('weather-precip-icon').setText(precipIcon);
        if (hasPrecipProbability) {
          precipDiv.createSpan('weather-precip-probability').setText(`${Math.round(precipProbability)}%`);
        }
      }

      if (settings.showSunriseSunset && (sunrise || sunset)) {
        const solarDiv = card.createDiv('weather-forecast-solar');
        if (sunrise instanceof Date) {
          solarDiv.createSpan('weather-sunrise').setText(formatTimeForDisplay(sunrise, timezone));
        }
        if (sunset instanceof Date) {
          solarDiv.createSpan('weather-sunset').setText(formatTimeForDisplay(sunset, timezone));
        }
      }
    }

    const attribution = el.createDiv('weather-attribution');
    if (isSeasonal) {
      this.createSeasonalEstimateBadge(attribution, seasonalDetail, 'weather-seasonal-attribution-badge');
    }
    const link = attribution.createEl('a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });
    link.setAttr('target', '_blank');
    link.setAttr('rel', 'noopener noreferrer');

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


  // Past ~2 hours and next ~4 hours of minutely15 data, current position marked.
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
    const paddingBottom = 16; // Space for time labels
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

    const sparklineDiv = container.createDiv('weather-widget-sparkline');

    const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
    const yAxisDiv = sparklineDiv.createDiv('weather-sparkline-yaxis');
    yAxisDiv.createSpan('weather-sparkline-max').setText(`${Math.round(maxTemp)}${tempUnit}`);
    yAxisDiv.createSpan('weather-sparkline-min').setText(`${Math.round(minTemp)}${tempUnit}`);

    const chartArea = sparklineDiv.createDiv('weather-sparkline-chart-area');

    // Gradient ids are document-global; two widgets sharing one id share one fill.
    const gradientId = `sparkline-gradient-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const svg = chartArea.createSvg('svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.addClass('weather-sparkline-svg');

    const defs = svg.createSvg('defs');
    const gradient = defs.createSvg('linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '100%');

    const stop1 = gradient.createSvg('stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', 'var(--interactive-accent)');
    stop1.setAttribute('stop-opacity', '0.3');

    const stop2 = gradient.createSvg('stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', 'var(--interactive-accent)');
    stop2.setAttribute('stop-opacity', '0.05');

    const plotBottom = paddingTop + plotHeight;
    const areaPathD = pathD + ` L ${validPoints[validPoints.length - 1].x} ${plotBottom} L ${validPoints[0].x} ${plotBottom} Z`;
    const areaPath = svg.createSvg('path');
    areaPath.setAttribute('d', areaPathD);
    areaPath.setAttribute('fill', `url(#${gradientId})`);
    const linePath = svg.createSvg('path');
    linePath.setAttribute('d', pathD);
    linePath.setAttribute('stroke', 'var(--interactive-accent)');
    linePath.setAttribute('stroke-width', '2');
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke-linecap', 'round');
    linePath.setAttribute('stroke-linejoin', 'round');
    const nowPoint = points[nowPositionInWindow];
    if (nowPoint && nowPoint.temp !== null) {
      const circle = svg.createSvg('circle');
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

    const startText = svg.createSvg('text');
    startText.setAttribute('x', `${paddingX}`);
    startText.setAttribute('y', `${textY}`);
    startText.setAttribute('font-size', `${fontSize}`);
    startText.setAttribute('fill', 'var(--text-faint)');
    startText.setAttribute('text-anchor', 'start');
    startText.textContent = formatTimeForDisplay(startTime, timezone);
    const nowText = svg.createSvg('text');
    nowText.setAttribute('x', `${nowPoint.x}`);
    nowText.setAttribute('y', `${textY}`);
    nowText.setAttribute('font-size', `${fontSize}`);
    nowText.setAttribute('font-weight', '600');
    nowText.setAttribute('fill', 'var(--interactive-accent)');
    nowText.setAttribute('text-anchor', 'middle');
    nowText.textContent = 'Now';
    const endText = svg.createSvg('text');
    endText.setAttribute('x', `${width - paddingX}`);
    endText.setAttribute('y', `${textY}`);
    endText.setAttribute('font-size', `${fontSize}`);
    endText.setAttribute('fill', 'var(--text-faint)');
    endText.setAttribute('text-anchor', 'end');
    endText.textContent = formatTimeForDisplay(endTime, timezone);
  }
}
