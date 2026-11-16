import * as _placesDom from 'places-shared/utils';
import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale, Filler, Legend, Tooltip, type ChartConfiguration, type ChartOptions } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';
import { WeatherDataService, WeatherCodeBlockSettings, WeatherCodeBlockDefaultSettings, WeatherData } from 'places-environment/core';
import { getHourInTimezone, getMinuteInTimezone, formatWeekday, formatMonthDay } from '../utilities/DateTimeUtilities';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { formatDisplayCoordinate } from "places-shared/utils";

Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Filler, Legend, Tooltip);

// Variable categories for dual Y-axis support
const TEMPERATURE_VARS = ['temperature_2m', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature', 'dew_point_2m'];
const PRECIPITATION_VARS = ['precipitation', 'precipitation_sum', 'rain', 'showers', 'snowfall'];
const HUMIDITY_VARS = ['relative_humidity_2m'];
const WIND_VARS = ['wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m', 'wind_speed_180m', 'wind_gusts_10m'];
const PRESSURE_VARS = ['surface_pressure', 'pressure_msl'];
const CLOUD_VARS = ['cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high'];

const COLORS = [
  { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)' },   // Blue
  { border: 'rgb(239, 68, 68)', background: 'rgba(239, 68, 68, 0.1)' },     // Red
  { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)' },     // Green
  { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.1)' },   // Purple
  { border: 'rgb(249, 115, 22)', background: 'rgba(249, 115, 22, 0.1)' },   // Orange
  { border: 'rgb(236, 72, 153)', background: 'rgba(236, 72, 153, 0.1)' },   // Pink
];

interface WeatherChartPoint {
  x: number;
  y: number;
  hour: number;
}

export class WeatherChartProcessor extends BaseEnvironmentProcessor {
  private weatherDataService: WeatherDataService;

  constructor(plugin: EnvironmentPluginHost, weatherDataService: WeatherDataService) {
    super(plugin);
    this.weatherDataService = weatherDataService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'weather-chart-loading',
      loadingText: 'Loading weather data...',
      errorMessage: 'Failed to load weather data',
      refreshLabel: 'Refresh weather chart',
      render: async (forceRefresh) => {
        const settings = this.weatherDataService.parseCodeBlockSettings(source, ctx);

        settings.forceRefresh = forceRefresh;
        const weatherData = await this.weatherDataService.getHourlyForecast(settings);

        _placesDom.emptyElement(el);
        _placesDom.removeClass(el, 'weather-chart-loading');
        const container = _placesDom.createDiv(el, 'weather-chart-wrapper');

        this.renderWeatherChart(container, weatherData, settings, ctx, source);
        renderFreshnessIndicator(container, weatherData.metadata);
        renderSettingsTraceIfRequested(container, source, ctx, this.plugin, 'places-weather-chart', WeatherCodeBlockDefaultSettings, settings);

        return container;
      }
    });
  }

  private renderWeatherChart(el: HTMLElement, weatherData: WeatherData, settings: WeatherCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    this.disposeTrackedCharts(el);
    _placesDom.emptyElement(el);
    _placesDom.addClass(el, 'weather-chart-container');

    const chartContainer = _placesDom.createDiv(el, 'weather-chart-wrapper');

    _placesDom.setCssProperties(chartContainer, {
      '--places-chart-height': settings.height,
    });

    const canvas = _placesDom.createElement(chartContainer, 'canvas', { cls: 'weather-chart-canvas' });
    const canvasContext = canvas.getContext('2d');

    if (!canvasContext) {
      throw new Error('Failed to get canvas context for weather chart');
    }

    const chartConfig = this.prepareChartConfig(weatherData, settings);

    this.trackChart(el, ctx, new Chart<'line', WeatherChartPoint[]>(canvasContext, chartConfig));

    const attribution = _placesDom.createDiv(el, 'weather-attribution');
    const link = _placesDom.createElement(attribution, 'a', {
      href: 'https://open-meteo.com/',
      text: 'Weather data by Open-Meteo.com'
    });

    _placesDom.setAttribute(link, 'target', '_blank');
    _placesDom.setAttribute(link, 'rel', 'noopener noreferrer');

    this.addRefreshButton(el, ctx, source, settings);
  }

  private prepareChartConfig(weatherData: WeatherData, settings: WeatherCodeBlockSettings): ChartConfiguration<'line', WeatherChartPoint[]> {
    const datasets: ChartConfiguration<'line', WeatherChartPoint[]>['data']['datasets'] = [];
    const hourlyVariables = settings.hourly || [];
    const minutely15Variables = settings.minutely15 || [];
    const allVariables = [...hourlyVariables, ...minutely15Variables];
    const responses = weatherData.responses;

    const hasTemperature = allVariables.some(v => TEMPERATURE_VARS.includes(v));
    const hasPrecipitation = allVariables.some(v => PRECIPITATION_VARS.includes(v));
    const needsDualAxis = hasTemperature && hasPrecipitation;

    let colorIndex = 0;

    for (const response of responses) {
      const timezone = response.timezone;
      const locationLabel = responses.length > 1
        ? ` (${response.coordinates.name || formatDisplayCoordinate(response.coordinates, 2)})`
        : '';

      colorIndex = this.appendWeatherDatasets(datasets, {
        source: response.minutely15,
        variables: minutely15Variables,
        timezone,
        settings,
        needsDualAxis,
        colorIndex,
        labelSuffix: ' (15min)',
        locationLabel
      });

      colorIndex = this.appendWeatherDatasets(datasets, {
        source: response.hourly,
        variables: hourlyVariables,
        timezone,
        settings,
        needsDualAxis,
        colorIndex,
        labelSuffix: '',
        locationLabel
      });
    }

    const allTimes = responses.flatMap(r => [
      ...(r.minutely15?.time || []),
      ...(r.hourly?.time || [])
    ]);
    const minTime = Math.min(...allTimes.map(t => t.getTime()));
    const maxTime = Math.max(...allTimes.map(t => t.getTime()));
    const durationHours = (maxTime - minTime) / (1000 * 60 * 60);
    const durationDays = durationHours / 24;

    const chartTimezone = responses[0]?.timezone || 'UTC';

    const getHourInTz = (date: Date): number => getHourInTimezone(date, chartTimezone);
    const getMinuteInTz = (date: Date): number => getMinuteInTimezone(date, chartTimezone);

    const scales: NonNullable<ChartOptions<'line'>['scales']> = {
      x: {
        type: 'time',
        time: {
          // Always use hour unit to show times; callback handles day labels at midnight
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm'
          }
        },
        ticks: {
          stepSize: durationDays > 3 ? (durationDays > 7 ? 6 : 3) : 1,
          callback: function(value) {
            const date = new Date(value);
            const hour = getHourInTz(date);
            const minutes = getMinuteInTz(date);

            if (hour === 0 && minutes === 0) {
              return [
                formatWeekday(date, chartTimezone),
                formatMonthDay(date, chartTimezone)
              ];
            }

            return date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              hour12: true,
              timeZone: chartTimezone
            });
          },
          maxTicksLimit: durationDays > 7 ? 28 : (durationDays > 3 ? 24 : 48),
          autoSkip: true,
          autoSkipPadding: 15
        },
        title: {
          display: true,
          text: 'Time'
        },
        grid: {
          display: true,
          color: (context) => {
            const date = new Date(context.tick.value);
            const hour = getHourInTz(date);
            const minutes = getMinuteInTz(date);

            if (hour === 0 && minutes === 0) {
              return 'rgba(0, 0, 0, 0.3)';
            }

            return 'rgba(0, 0, 0, 0.1)';
          },
          lineWidth: (context) => {
            const date = new Date(context.tick.value);
            const hour = getHourInTz(date);
            const minutes = getMinuteInTz(date);

            if (hour === 0 && minutes === 0) {
              return 2;
            }

            return 1;
          }
        }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: this.getYAxisLabel(allVariables.filter(v => !PRECIPITATION_VARS.includes(v)), settings.units)
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    };

    if (needsDualAxis) {
      scales.y1 = {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: this.getYAxisLabel(allVariables.filter(v => PRECIPITATION_VARS.includes(v)), settings.units)
        },
        grid: {
          drawOnChartArea: false
        },
        min: 0
      };
    }
    
    return {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                const date = new Date(context[0].parsed.x ?? 0);

                return date.toLocaleString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: chartTimezone
                });
              },
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y ?? 0;
                const variable = this.extractVariableFromLabel(label);
                const unit = this.getVariableUnit(variable, settings.units);

                return `${label}: ${value?.toFixed(1)} ${unit}`;
              }
            }
          }
        },
        scales
      }
    };
  }

  private formatVariableName(variable: string): string {
    const names: Record<string, string> = {
      'temperature_2m': 'Temperature',
      'temperature_2m_max': 'Max Temperature',
      'temperature_2m_min': 'Min Temperature',
      'apparent_temperature': 'Feels Like',
      'precipitation': 'Precipitation',
      'precipitation_sum': 'Total Precipitation',
      'rain': 'Rain',
      'showers': 'Showers',
      'snowfall': 'Snowfall',
      'relative_humidity_2m': 'Humidity',
      'wind_speed_10m': 'Wind Speed',
      'wind_gusts_10m': 'Wind Gusts',
      'cloud_cover': 'Cloud Cover',
      'weather_code': 'Weather',
      'surface_pressure': 'Pressure',
      'dew_point_2m': 'Dew Point'
    };

    return names[variable] || variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private appendWeatherDatasets(
    datasets: ChartConfiguration<'line', WeatherChartPoint[]>['data']['datasets'],
    options: {
      source: WeatherData['responses'][number]['hourly'] | WeatherData['responses'][number]['minutely15'] | undefined;
      variables: string[];
      timezone: string;
      settings: WeatherCodeBlockSettings;
      needsDualAxis: boolean;
      colorIndex: number;
      labelSuffix: string;
      locationLabel: string;
    }
  ): number {
    if (!options.source || options.variables.length === 0) {
      return options.colorIndex;
    }

    let colorIndex = options.colorIndex;
    const times = options.source.time;

    for (const variable of options.variables) {
      const values = options.source[variable] as (number | null)[];

      if (!values) continue;

      const color = COLORS[colorIndex % COLORS.length];

      colorIndex++;
      const yAxisID = options.needsDualAxis && PRECIPITATION_VARS.includes(variable) ? 'y1' : 'y';

      datasets.push({
        label: this.formatVariableName(variable) + options.labelSuffix + options.locationLabel,
        data: this.createTimeFilteredData(times, values, options.timezone, options.settings),
        borderColor: color.border,
        backgroundColor: color.background,
        fill: PRECIPITATION_VARS.includes(variable),
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        yAxisID
      });
    }

    return colorIndex;
  }

  private createTimeFilteredData(times: Date[], values: (number | null)[], timezone: string, settings: WeatherCodeBlockSettings): WeatherChartPoint[] {
    const points = times.map((time, i) => ({
      x: time.getTime(),
      y: values[i],
      hour: getHourInTimezone(time, timezone)
    }));

    return points.filter((point): point is WeatherChartPoint =>
      point.y !== null && point.y !== undefined && this.isChartPointVisible(point, settings)
    );
  }

  private isChartPointVisible(point: { y: number | null; hour: number }, settings: WeatherCodeBlockSettings): boolean {
    if (point.y === null) return false;

    if (settings.startTime !== undefined && settings.endTime !== undefined) {
      if (settings.startTime <= settings.endTime) {
        return point.hour >= settings.startTime && point.hour <= settings.endTime;
      }

      return point.hour >= settings.startTime || point.hour <= settings.endTime;
    }

    if (settings.startTime !== undefined) {
      return point.hour >= settings.startTime;
    }

    if (settings.endTime !== undefined) {
      return point.hour <= settings.endTime;
    }

    return true;
  }

  private extractVariableFromLabel(label: string): string {
    const match = label.match(/^(.+?)(?: \([\d.-]+, [\d.-]+\))?$/);
    const name = match ? match[1] : label;

    const reverseNames: Record<string, string> = {
      'Temperature': 'temperature_2m',
      'Max Temperature': 'temperature_2m_max',
      'Min Temperature': 'temperature_2m_min',
      'Feels Like': 'apparent_temperature',
      'Precipitation': 'precipitation',
      'Total Precipitation': 'precipitation_sum',
      'Rain': 'rain',
      'Showers': 'showers',
      'Snowfall': 'snowfall',
      'Humidity': 'relative_humidity_2m',
      'Wind Speed': 'wind_speed_10m',
      'Wind Gusts': 'wind_gusts_10m',
      'Cloud Cover': 'cloud_cover',
      'Weather': 'weather_code',
      'Pressure': 'surface_pressure',
      'Dew Point': 'dew_point_2m'
    };

    return reverseNames[name] || name.toLowerCase().replace(/ /g, '_');
  }

  private getVariableUnit(variable: string, units: string): string {
    if (TEMPERATURE_VARS.includes(variable)) {
      return units === 'imperial' ? '°F' : '°C';
    }

    if (PRECIPITATION_VARS.includes(variable)) {
      return units === 'imperial' ? 'in' : 'mm';
    }

    if (HUMIDITY_VARS.includes(variable) || CLOUD_VARS.includes(variable)) {
      return '%';
    }

    if (WIND_VARS.includes(variable)) {
      return units === 'imperial' ? 'mph' : 'km/h';
    }

    if (PRESSURE_VARS.includes(variable)) {
      return 'hPa';
    }

    return '';
  }

  private getYAxisLabel(variables: string[], units: string): string {
    if (variables.length === 0) return '';

    const firstVar = variables[0];

    if (TEMPERATURE_VARS.includes(firstVar)) {
      return units === 'imperial' ? 'Temperature (°F)' : 'Temperature (°C)';
    }

    if (PRECIPITATION_VARS.includes(firstVar)) {
      return units === 'imperial' ? 'Precipitation (in)' : 'Precipitation (mm)';
    }

    if (HUMIDITY_VARS.includes(firstVar)) {
      return 'Humidity (%)';
    }

    if (WIND_VARS.includes(firstVar)) {
      return units === 'imperial' ? 'Wind Speed (mph)' : 'Wind Speed (km/h)';
    }

    if (CLOUD_VARS.includes(firstVar)) {
      return 'Cloud Cover (%)';
    }

    if (PRESSURE_VARS.includes(firstVar)) {
      return 'Pressure (hPa)';
    }

    return this.formatVariableName(firstVar);
  }

  private addRefreshButton(el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string, settings: WeatherCodeBlockSettings): void {
    this.addFloatingRefreshButton(el, {
      label: 'Refresh weather chart',
      loadingClass: 'weather-chart-loading',
      loadingText: 'Loading weather data...',
      ctx,
      source,
      onRefresh: async () => {
        const refreshSettings = { ...settings, forceRefresh: true };
        const weatherData = await this.weatherDataService.getHourlyForecast(refreshSettings);

        this.renderWeatherChart(el, weatherData, refreshSettings, ctx, source);
        renderFreshnessIndicator(el, weatherData.metadata);
      }
    });
  }
}
