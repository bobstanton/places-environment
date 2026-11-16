import { getWeatherDescription, getWeatherEmoji, WEATHER_UNITS } from 'places-environment/core';
import type { PopupDomRenderer, PopupDomRendererRequest } from "places-shared/map";

export const WEATHER_POPUP_RENDERER_ID = 'environment.weather-summary';

export function createWeatherPopupRenderer(): PopupDomRenderer {
  return {
    id: WEATHER_POPUP_RENDERER_ID,
    description: 'Daily conditions, temperatures, precipitation, and wind',
    kind: 'dom',
    render: renderWeatherPopup,
  };
}

export function renderWeatherPopup(request: PopupDomRendererRequest): void {
  const { container } = request;
  const weather = normalizeDailyWeather(request.context);
  const { code: weatherCode, high: temperatureHigh, low: temperatureLow, summary, units } = weather;
  const root = container.createDiv({ cls: 'places-environment-weather-popup' });
  const header = root.createDiv({ cls: 'places-environment-weather-popup-header' });

  if (weatherCode !== undefined) {
    header.createSpan({ cls: 'places-environment-weather-popup-icon', text: getWeatherEmoji(weatherCode) });
  }

  const heading = header.createDiv({ cls: 'places-environment-weather-popup-heading' });

  heading.createDiv({
    cls: 'places-environment-weather-popup-condition',
    text: weatherCode === undefined ? summary ?? 'Weather' : getWeatherDescription(weatherCode),
  });
  const date = formatWeatherDate(weather.date);

  if (date) heading.createDiv({ cls: 'places-environment-weather-popup-date', text: date });

  const metrics = root.createDiv({ cls: 'places-environment-weather-popup-metrics' });

  appendMetric(metrics, 'High', formatTemperature(temperatureHigh, units));
  appendMetric(metrics, 'Low', formatTemperature(temperatureLow, units));
  appendMetric(metrics, 'Precipitation', formatPrecipitation(weather));
  appendMetric(metrics, 'Wind', formatWind(weather));

  if (metrics.childElementCount === 0 && summary) {
    root.createDiv({ cls: 'places-environment-weather-popup-summary', text: summary });
    metrics.remove();
  }
}

interface DailyWeather {
  code?: number;
  high?: number;
  low?: number;
  summary?: string;
  date?: string;
  precipitation?: number;
  precipitationProbability?: number;
  wind?: number;
  gusts?: number;
  direction?: number;
  units: 'imperial' | 'metric';
}

function normalizeDailyWeather(context: Readonly<Record<string, unknown>>): DailyWeather {
  const weather: DailyWeather = {
    code: finiteNumber(context.weather_code),
    high: finiteNumber(context.temperature_2m_max),
    low: finiteNumber(context.temperature_2m_min),
    summary: textValue(context.weather_summary) ?? textValue(context.description),
    date: textValue(context.date),
    precipitation: finiteNumber(context.precipitation_sum),
    precipitationProbability: finiteNumber(context.precipitation_probability_max),
    wind: finiteNumber(context.wind_speed_10m_max),
    gusts: finiteNumber(context.wind_gusts_10m_max),
    direction: finiteNumber(context.wind_direction_10m_dominant),
    units: context.units === 'imperial' ? 'imperial' : 'metric',
  };

  if (weather.code === undefined && weather.high === undefined && weather.low === undefined && !weather.summary) {
    throw new Error(`${WEATHER_POPUP_RENDERER_ID} requires a weather_daily row.`);
  }

  return weather;
}

function appendMetric(container: HTMLElement, label: string, value: string | undefined): void {
  if (!value) return;
  const metric = container.createDiv({ cls: 'places-environment-weather-popup-metric' });

  metric.createDiv({ cls: 'places-environment-weather-popup-label', text: label });
  metric.createDiv({ cls: 'places-environment-weather-popup-value', text: value });
}

function formatTemperature(value: number | undefined, units: 'imperial' | 'metric'): string | undefined {
  if (value === undefined) return undefined;

  return `${Math.round(value)}${WEATHER_UNITS[units].temperature}`;
}

function formatPrecipitation(weather: DailyWeather): string | undefined {
  const { precipitationProbability: probability, precipitation: amount, units } = weather;
  const parts: string[] = [];

  if (probability !== undefined && probability > 0) parts.push(`${Math.round(probability)}%`);

  if (amount !== undefined && amount > 0) {
    const precision = units === 'imperial' ? 2 : 1;

    parts.push(`${trimFixed(amount, precision)} ${WEATHER_UNITS[units].precipitation}`);
  }

  return parts.length > 0 ? parts.join(' / ') : undefined;
}

function formatWind(weather: DailyWeather): string | undefined {
  const { wind: speed, gusts, direction, units } = weather;

  if (speed === undefined && gusts === undefined && direction === undefined) return undefined;

  const speedUnit = WEATHER_UNITS[units].windSpeed;
  const parts: string[] = [];

  if (speed !== undefined) parts.push(`${Math.round(speed)} ${speedUnit}`);
  if (gusts !== undefined) parts.push(`gusts ${Math.round(gusts)} ${speedUnit}`);
  if (direction !== undefined) parts.push(compassDirection(direction));

  return parts.join(', ');
}

function compassDirection(degrees: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((degrees % 360) + 360) % 360;

  return points[Math.round(normalized / 45) % points.length];
}

function formatWeatherDate(value: unknown): string | undefined {
  const dateText = textValue(value);

  if (!dateText) return undefined;
  const date = new Date(`${dateText.slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) return dateText;

  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function finiteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function trimFixed(value: number, precision: number): string {
  return value.toFixed(precision).replace(/\.?0+$/, '');
}
