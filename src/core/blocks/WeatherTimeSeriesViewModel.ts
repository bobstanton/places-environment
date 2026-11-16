import type { WeatherCodeBlockSettings, WeatherData } from 'places-environment/core';
import type { WeatherResponse } from 'places-environment/core';
import { getDateStringInTimezone, getHourInTimezone } from '../utilities/DateTimeUtilities';

export type TimeResolution = 'minutely15' | 'hourly';

type TimeSeriesData = NonNullable<WeatherResponse['minutely15']>;
type DailyDataSource = NonNullable<WeatherResponse['daily']>;

interface TimeSlotData {
  time: Date;
  temperature: number | null;
  weatherCode: number;
  precipProbability: number | null;
  precipAmount: number | null;
  isNow: boolean;
}

interface DayData {
  date: Date;
  dateStr: string;
  isToday: boolean;
  sunrise: Date | null;
  sunset: Date | null;
  tempMax: number | null;
  tempMin: number | null;
  precipSum: number | null;
  slots: TimeSlotData[];
}

interface TimeSeriesBuildContext {
  dataSource: TimeSeriesData;
  daily?: DailyDataSource;
  timezone: string;
  settings: WeatherCodeBlockSettings;
  resolution: TimeResolution;
  nowIndex: number;
  currentHour: number;
  nowDateStr: string;
  nowMs: number;
}

interface DailySummary {
  sunrise: Date | null;
  sunset: Date | null;
  tempMax: number | null;
  tempMin: number | null;
  precipSum: number | null;
}

export function findNowIndex(times: Date[]): number {
  const now = Date.now();
  let nowIndex = 0;
  let minDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i].getTime() - now);

    if (diff < minDiff) {
      minDiff = diff;
      nowIndex = i;
    }
  }

  return nowIndex;
}

function getNumericValue(source: TimeSeriesData | DailyDataSource | undefined, key: string, index: number): number | null {
  const values = source?.[key] as (number | null)[] | undefined;

  return values?.[index] ?? null;
}

function getDateValue(source: DailyDataSource | undefined, key: string, index: number): Date | null {
  const values = source?.[key] as (Date | null)[] | undefined;

  return values?.[index] ?? null;
}

function getPrecipAmount(source: TimeSeriesData | DailyDataSource | undefined, index: number, precipitationKey = 'precipitation', snowfallKey = 'snowfall'): number | null {
  const rain = getNumericValue(source, precipitationKey, index) ?? 0;
  const snowfall = getNumericValue(source, snowfallKey, index) ?? 0;
  const amount = Math.max(rain, snowfall);

  return amount > 0 ? amount : null;
}

function findDailyIndex(daily: DailyDataSource | undefined, dateStr: string, timezone: string): number {
  return daily?.time?.findIndex(d => getDateStringInTimezone(d, timezone) === dateStr) ?? -1;
}

function getDailySummary(daily: DailyDataSource | undefined, dailyIndex: number): DailySummary {
  if (dailyIndex < 0) {
    return {
      sunrise: null,
      sunset: null,
      tempMax: null,
      tempMin: null,
      precipSum: null,
    };
  }

  return {
    sunrise: getDateValue(daily, 'sunrise', dailyIndex),
    sunset: getDateValue(daily, 'sunset', dailyIndex),
    tempMax: getNumericValue(daily, 'temperature_2m_max', dailyIndex),
    tempMin: getNumericValue(daily, 'temperature_2m_min', dailyIndex),
    precipSum: getPrecipAmount(daily, dailyIndex, 'precipitation_sum', 'snowfall_sum'),
  };
}

function isWithinClockWindow(hour: number, settings: WeatherCodeBlockSettings): boolean {
  const { startTime, endTime } = settings;

  if (startTime === undefined && endTime === undefined) return true;
  if (startTime === undefined) return hour <= endTime!;
  if (endTime === undefined) return hour >= startTime;
  if (startTime <= endTime) return hour >= startTime && hour <= endTime;

  return hour >= startTime || hour <= endTime;
}

function passesOffsetWindow(time: Date, settings: WeatherCodeBlockSettings, nowMs: number): boolean {
  const hoursDiff = (time.getTime() - nowMs) / (1000 * 60 * 60);

  if (settings.startTimeOffset !== undefined && hoursDiff < settings.startTimeOffset) return false;
  if (settings.endTimeOffset !== undefined && hoursDiff > settings.endTimeOffset) return false;

  return true;
}

function shouldIncludeTimeSlot(time: Date, hour: number, context: TimeSeriesBuildContext): boolean {
  const settings = context.settings;
  const hasOffsetWindow = settings.startTimeOffset !== undefined || settings.endTimeOffset !== undefined;

  return hasOffsetWindow
    ? passesOffsetWindow(time, settings, context.nowMs)
    : isWithinClockWindow(hour, settings);
}

function getOrCreateDayData(dayMap: Map<string, DayData>, time: Date, dateStr: string, context: TimeSeriesBuildContext): DayData {
  const existing = dayMap.get(dateStr);

  if (existing) return existing;

  const dayDate = new Date(time);

  dayDate.setHours(0, 0, 0, 0);
  const dailyIndex = findDailyIndex(context.daily, dateStr, context.timezone);
  const summary = getDailySummary(context.daily, dailyIndex);
  const dayData: DayData = {
    date: dayDate,
    dateStr,
    isToday: dateStr === context.nowDateStr,
    ...summary,
    slots: [],
  };

  dayMap.set(dateStr, dayData);

  return dayData;
}

function createTimeSlotData(index: number, time: Date, dateStr: string, hour: number, context: TimeSeriesBuildContext): TimeSlotData {
  const isNow = context.resolution === 'minutely15'
    ? index === context.nowIndex
    : dateStr === context.nowDateStr && hour === context.currentHour;

  return {
    time,
    temperature: getNumericValue(context.dataSource, 'temperature_2m', index),
    weatherCode: getNumericValue(context.dataSource, 'weather_code', index) ?? 0,
    precipProbability: getNumericValue(context.dataSource, 'precipitation_probability', index),
    precipAmount: getPrecipAmount(context.dataSource, index),
    isNow,
  };
}

function createBuildContext(response: WeatherResponse, dataSource: TimeSeriesData, settings: WeatherCodeBlockSettings, resolution: TimeResolution): TimeSeriesBuildContext {
  const now = new Date();
  const nowTruncatedToHour = new Date(now);

  nowTruncatedToHour.setMinutes(0, 0, 0);

  return {
    dataSource,
    daily: response.daily,
    timezone: response.timezone,
    settings,
    resolution,
    nowIndex: findNowIndex(dataSource.time),
    currentHour: getHourInTimezone(now, response.timezone),
    nowDateStr: getDateStringInTimezone(now, response.timezone),
    nowMs: nowTruncatedToHour.getTime(),
  };
}

export function buildTimeSeriesDaysData(weatherData: WeatherData, settings: WeatherCodeBlockSettings, resolution: TimeResolution): DayData[] {
  const response = weatherData.responses[0];
  const dataSource = resolution === 'minutely15' ? response.minutely15 : response.hourly;

  if (!dataSource || !dataSource.time) return [];

  const context = createBuildContext(response, dataSource, settings, resolution);
  const times = dataSource.time;
  const dayMap = new Map<string, DayData>();

  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    const dateStr = getDateStringInTimezone(time, context.timezone);
    const hour = getHourInTimezone(time, context.timezone);

    if (!shouldIncludeTimeSlot(time, hour, context)) continue;

    const dayData = getOrCreateDayData(dayMap, time, dateStr, context);

    dayData.slots.push(createTimeSlotData(i, time, dateStr, hour, context));
  }

  const defaultDays = resolution === 'minutely15' ? 1 : 7;

  return Array.from(dayMap.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, settings.days || defaultDays);
}
