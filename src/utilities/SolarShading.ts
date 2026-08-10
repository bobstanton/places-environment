export type TwilightStage = 'night' | 'astronomical' | 'nautical' | 'civil' | 'day';

export const TWILIGHT_STAGES: TwilightStage[] = ['night', 'astronomical', 'nautical', 'civil', 'day'];

export const TWILIGHT_STAGE_LABELS: Record<TwilightStage, string> = {
  night: 'Night',
  astronomical: 'Astronomical twilight',
  nautical: 'Nautical twilight',
  civil: 'Civil twilight',
  day: 'Daylight',
};

export const TWILIGHT_STAGE_COLORS: Record<TwilightStage, string> = {
  night: '#0d1b2a',
  astronomical: '#1b3a5b',
  nautical: '#2d6094',
  civil: '#6aa9e9',
  day: '#cfe8f7',
};

export const SOLAR_NOON_COLOR = '#f59e0b';

export interface TwilightInterval {
  start: number;
  end: number;
  stage: TwilightStage;
}

export function twilightIntervalsForDay(boundaries: number[], dayStart: number, dayEnd: number): TwilightInterval[] {
  if (boundaries.length !== 8 || boundaries.some(boundary => !Number.isFinite(boundary))) return [];

  const stages: TwilightStage[] = ['night', 'astronomical', 'nautical', 'civil', 'day', 'civil', 'nautical', 'astronomical', 'night'];
  const edges = [dayStart, ...boundaries, dayEnd];
  const intervals: TwilightInterval[] = [];
  let previous = dayStart;
  for (let i = 0; i < stages.length; i++) {
    const start = Math.min(Math.max(edges[i], previous), dayEnd);
    const end = Math.min(Math.max(edges[i + 1], start), dayEnd);
    previous = end;
    if (end > start) {
      intervals.push({ start, end, stage: stages[i] });
    }
  }
  return intervals;
}

export function twilightStageAt(intervals: TwilightInterval[], time: number): TwilightStage | undefined {
  return intervals.find(interval => time >= interval.start && time <= interval.end)?.stage;
}

export function splitSeriesAtBoundaries(points: Array<{ x: number; y: number }>, intervals: TwilightInterval[]): void {
  const boundaries = new Set<number>();
  for (const interval of intervals) {
    boundaries.add(interval.start);
    boundaries.add(interval.end);
  }

  for (const boundary of boundaries) {
    if (points.length < 2) return;
    if (boundary <= points[0].x || boundary >= points[points.length - 1].x) continue;
    if (points.some(point => point.x === boundary)) continue;
    const after = points.findIndex(point => point.x > boundary);
    const p1 = points[after - 1];
    const p2 = points[after];
    const p0 = points[after - 2] ?? p1;
    const p3 = points[after + 1] ?? p2;
    const t = (boundary - p1.x) / (p2.x - p1.x);
    points.splice(after, 0, { x: boundary, y: catmullRomY(p0.y, p1.y, p2.y, p3.y, t) });
  }
}

function catmullRomY(y0: number, y1: number, y2: number, y3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * y1) +
    (-y0 + y2) * t +
    (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
    (-y0 + 3 * y1 - 3 * y2 + y3) * t3
  );
}

export function densifySeries(points: Array<{ x: number; y: number }>, maxGap: number): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;

  const result: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    result.push(p1);
    const gap = p2.x - p1.x;
    if (gap <= maxGap) continue;
    const segments = Math.ceil(gap / maxGap);
    for (let j = 1; j < segments; j++) {
      const t = j / segments;
      result.push({ x: p1.x + gap * t, y: catmullRomY(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function twilightSegmentFill(intervals: TwilightInterval[], fallback: string): (segCtx: { p0: { parsed: { x: number | null } }; p1: { parsed: { x: number | null } } }) => string {
  return (segCtx) => {
    const midpoint = ((segCtx.p0.parsed.x ?? 0) + (segCtx.p1.parsed.x ?? 0)) / 2;
    const stage = twilightStageAt(intervals, midpoint);
    return stage ? TWILIGHT_STAGE_COLORS[stage] : fallback;
  };
}

export function paintSolarNoonLine(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
  ctx.save();
  ctx.strokeStyle = SOLAR_NOON_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.restore();
}
