import type { TideData, TidePoint } from '../types';

// NOAA prediction times are station-local wall-clock strings, not instants.

export interface TidePredictionPoint {
  t: string;
  v: string;
  type?: 'H' | 'L';
}

export interface TimedTidePoint {
  timestamp: number;
  point: TidePoint;
}

export interface TideTimeline {
  hourly: TimedTidePoint[];
  hilo: TimedTidePoint[];
}

const timelineCache = new WeakMap<TideData, TideTimeline>();

export function getTideTimeline(data: TideData): TideTimeline {
  const cached = timelineCache.get(data);

  if (cached) return cached;
  const convert = (points: TidePoint[]) => points
    .map(point => ({ timestamp: parseNaiveTimestamp(point.timestamp_local).getTime(), point }))
    .sort((left, right) => left.timestamp - right.timestamp);
  const timeline = { hourly: convert(data.hourly), hilo: convert(data.hilo) };

  timelineCache.set(data, timeline);

  return timeline;
}

export function parseNaiveTimestamp(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);

  if (!match) return new Date(value);

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

export function formatNaiveTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function stationWallClockString(utcEpochMs: number, stationUtcOffsetMs: number): string {
  const shifted = new Date(utcEpochMs + stationUtcOffsetMs);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

export function computeStationUtcOffsetMs(localExtrema: TidePredictionPoint[], gmtExtrema: TidePredictionPoint[]): number | undefined {
  const local = localExtrema[0];
  const gmt = gmtExtrema.find(candidate => candidate.type === local?.type && candidate.v === local?.v) ?? gmtExtrema[0];

  if (!local || !gmt) return undefined;

  const offset = parseNaiveTimestamp(local.t).getTime() - parseNaiveTimestamp(gmt.t).getTime();

  return Number.isFinite(offset) ? offset : undefined;
}

export function synthesizeHourlyFromExtremes(extrema: TidePredictionPoint[]): TidePredictionPoint[] {
  const result: TidePredictionPoint[] = [];
  const HOUR_MS = 60 * 60 * 1000;

  for (let i = 0; i < extrema.length - 1; i++) {
    const from = extrema[i];
    const to = extrema[i + 1];
    const fromTime = parseNaiveTimestamp(from.t).getTime();
    const toTime = parseNaiveTimestamp(to.t).getTime();

    if (!(toTime > fromTime)) continue;

    const fromHeight = parseFloat(from.v);
    const toHeight = parseFloat(to.v);

    for (let time = fromTime; time < toTime; time += HOUR_MS) {
      const phase = (time - fromTime) / (toTime - fromTime);
      const height = (fromHeight + toHeight) / 2 + ((fromHeight - toHeight) / 2) * Math.cos(Math.PI * phase);

      result.push({ t: formatNaiveTimestamp(new Date(time)), v: height.toFixed(3) });
    }
  }

  const last = extrema[extrema.length - 1];

  if (last) {
    result.push({ t: last.t, v: last.v });
  }

  return result;
}

export function normalizeTideStationType(raw: string | undefined): 'R' | 'S' | undefined {
  const value = raw?.trim().toLowerCase();

  if (!value) return undefined;
  if (value === 'r' || value.includes('reference') || value.includes('harmonic')) return 'R';
  if (value === 's' || value.includes('subordinate')) return 'S';

  return undefined;
}
