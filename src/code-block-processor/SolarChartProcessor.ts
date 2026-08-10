import { MarkdownPostProcessorContext } from 'obsidian';
import { SolarApiService } from '../api-services/SolarApiService';
import type { SolarEvent } from '../types';
import { NamedCoordinate } from "places-shared/geo";
import { CACHE_DEFAULT, CodeBlockReader, parseBoolean, parseCacheSetting, DateParser, type CachePolicy } from "places-shared/settings";
import { formatDisplayCoordinate } from "places-shared/utils";
import { Chart, LineController, LineElement, PointElement, LinearScale, Filler, Legend, Tooltip, ChartDataset } from 'chart.js';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { TWILIGHT_STAGES, TWILIGHT_STAGE_LABELS, twilightIntervalsForDay, splitSeriesAtBoundaries, twilightSegmentFill, paintSolarNoonLine, type TwilightInterval } from '../utilities/SolarShading';
import { getSunPosition, azimuthToCompass } from '../services/SolarPositionService';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { parseWallClockTime } from '../utilities/DateTimeUtilities';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Legend, Tooltip);

export interface SolarChartSettings {
  location?: NamedCoordinate;
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  // Always set: defaults are spread before block values are applied
  height: string;
  showHeader?: boolean;
  showSummary?: boolean;
  showLegend?: boolean;
  // 'rows' stacks each day; 'continuous' draws one curve/band flowing left to right.
  layout?: 'rows' | 'continuous';
  cachePolicy: CachePolicy;
}

const SolarChartDefaultSettings: SolarChartSettings = {
  height: '320px',
  showHeader: true,
  showSummary: true,
  showLegend: true,
  layout: 'rows',
  cachePolicy: CACHE_DEFAULT
};

// Reference to a summary item, for alignment with its event's x-position on the arc.
interface SummaryRef {
  el: HTMLElement;
  minutes: number | null;
}

// 10-minute sampling gives a smooth altitude curve (145 points across the day).
const SAMPLE_STEP_MINUTES = 10;
const MINUTES_PER_DAY = 24 * 60;


export class SolarChartProcessor extends BaseEnvironmentProcessor {
  private solarService: SolarApiService;

  constructor(plugin: PlacesEnvironmentPlugin, solarService: SolarApiService) {
    super(plugin);
    this.solarService = solarService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'solar-chart-loading',
      loadingText: 'Loading solar data...',
      errorMessage: 'Failed to render solar chart',
      refreshLabel: 'Refresh solar chart',
      render: async (forceRefresh) => {
        await this.refreshSolarChart(el, source, ctx, forceRefresh);
        return el;
      },
    });
  }

  private parseCodeBlockSettings(source: string, ctx: MarkdownPostProcessorContext): SolarChartSettings {
    const block = new CodeBlockReader(source);
    const settings: SolarChartSettings = { ...SolarChartDefaultSettings };

    if (block.text('height')) settings.height = block.text('height')!;
    settings.showHeader = parseBoolean(block.raw('showHeader'), SolarChartDefaultSettings.showHeader!);
    settings.showSummary = parseBoolean(block.raw('showSummary'), SolarChartDefaultSettings.showSummary!);
    settings.showLegend = parseBoolean(block.raw('showLegend'), SolarChartDefaultSettings.showLegend!);
    settings.layout = block.text('layout')?.trim().toLowerCase() === 'continuous' ? 'continuous' : 'rows';

    // With endDate set, the chart renders a section per day across the range;
    // otherwise it shows the start day only.
    const start = block.text('startDate') ?? 'today';
    const end = block.text('endDate') ?? start;
    const [startDate, endDate] = DateParser.parseDateRange({ startDate: start, endDate: end });
    settings.startDate = startDate;
    settings.endDate = endDate;

    settings.location = this.getLocation(block, ctx);
    settings.timezone = block.text('timezone')?.trim() || undefined;
    settings.cachePolicy = parseCacheSetting(block.text('cache'), SolarChartDefaultSettings.cachePolicy);

    return settings;
  }

  private async getSolarData(settings: SolarChartSettings): Promise<SolarEvent[]> {
    return this.solarService.getSolarEvents(settings.location!, settings.startDate!, settings.endDate!, {
      timezone: settings.timezone,
      cachePolicy: settings.cachePolicy
    });
  }

  private async refreshSolarChart(el: HTMLElement, source: string, ctx: MarkdownPostProcessorContext, _forceRefresh: boolean): Promise<void> {
    const settings = this.parseCodeBlockSettings(source, ctx);
    const solarData = await this.getSolarData(settings);
    this.renderSolarChart(el, solarData, settings, ctx, source);
    renderSettingsTraceIfRequested(el, source, ctx, this.plugin, 'places-solar-chart', SolarChartDefaultSettings, settings);
  }

  private timeToMinutes(timestamp: string): number {
    const parts = parseWallClockTime(timestamp);
    if (!parts) return NaN;
    return parts.hours * 60 + parts.minutes;
  }

  private minutesToTimeString(minutes: number): string {
    const clamped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hours24 = Math.floor(clamped / 60);
    const mins = clamped % 60;
    const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    return `${hours12}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }

  private formatDayLength(dayLength: string | number): string {
    let totalSeconds: number;
    if (typeof dayLength === 'number') {
      totalSeconds = dayLength;
    } else {
      const parts = String(dayLength).split(':').map(p => parseInt(p, 10) || 0);
      totalSeconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    const totalMinutes = Math.round(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  private renderSolarChart(el: HTMLElement, solarData: SolarEvent[], settings: SolarChartSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    this.disposeTrackedCharts(el);
    el.empty();
    el.removeClass('tide-loading');

    if (solarData.length === 0) {
      this.renderError(el, { message: 'No solar data available for this date.' });
      return;
    }

    const { latitude, longitude } = settings.location!;
    const multiDay = solarData.length > 1;

    const container = el.createDiv('solar-chart-container');

    if (settings.showHeader) {
      const headerDiv = container.createDiv('tide-station-info');
      headerDiv.createEl('h4').setText('Sun & daylight');
      const detailsDiv = headerDiv.createDiv('tide-station-details');
      if (settings.location) {
        detailsDiv.createSpan('tide-station-distance').setText(settings.location.name ?? formatDisplayCoordinate(settings.location, 4));
      }
      const firstDay = this.dayStartOf(solarData[0]);
      const lastDay = this.dayStartOf(solarData[solarData.length - 1]);
      const rangeText = multiDay
        ? `${firstDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${lastDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : firstDay.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      detailsDiv.createSpan('tide-station-datum').setText(rangeText);
    }

    if (settings.layout === 'continuous' && multiDay) {
      this.renderContinuous(container, solarData, settings, latitude, longitude, el, ctx);
    } else {
      for (const solar of solarData) {
        const dayStart = this.dayStartOf(solar);
        const daySection = container.createDiv('solar-day');
        if (multiDay) {
          daySection.createDiv('solar-day-label').setText(dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
        }
        const summaryRefs: SummaryRef[] = [];
        const chart = this.renderAltitudeArc(daySection, solar, dayStart, latitude, longitude, settings, summaryRefs);
        if (chart) this.trackChart(el, ctx, chart);
        if (settings.showSummary) {
          this.renderSummary(daySection, solar, latitude, longitude, summaryRefs, chart !== undefined);
          // Re-run the chart's draw for the alignment plugin to position the now-rendered labels.
          chart?.update('none');
        }
      }
    }

    // One shared legend at the bottom rather than repeating it per day.
    if (settings.showLegend) {
      this.renderShadingLegend(container);
    }

    this.addFloatingRefreshButton(container, {
      label: 'Refresh solar chart',
      errorEl: el,
      ctx,
      source,
      onRefresh: () => this.refreshSolarChart(el, source, ctx, true)
    });
  }

  // The eight twilight boundaries of a day, in minutes-of-day (NaNs when unavailable).
  private twilightBoundaryMinutes(solar: SolarEvent): number[] {
    return [
      this.timeToMinutes(solar.astronomical_twilight_begin),
      this.timeToMinutes(solar.nautical_twilight_begin),
      this.timeToMinutes(solar.civil_twilight_begin),
      this.timeToMinutes(solar.sunrise),
      this.timeToMinutes(solar.sunset),
      this.timeToMinutes(solar.civil_twilight_end),
      this.timeToMinutes(solar.nautical_twilight_end),
      this.timeToMinutes(solar.astronomical_twilight_end),
    ];
  }

  private dayStartOf(solar: SolarEvent): Date {
    const match = solar.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
    }
    const sunriseDate = new Date(solar.sunrise);
    return new Date(sunriseDate.getFullYear(), sunriseDate.getMonth(), sunriseDate.getDate(), 0, 0, 0, 0);
  }

  private dayStartInstantOf(solar: SolarEvent): Date {
    const match = solar.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const offsetMinutes = this.timestampOffsetMinutes(solar.solar_noon || solar.sunrise || solar.sunset);
    if (match && offsetMinutes !== null) {
      const utcMidnight = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
      return new Date(utcMidnight - offsetMinutes * 60_000);
    }
    return this.dayStartOf(solar);
  }

  private timestampOffsetMinutes(timestamp: string): number | null {
    const match = timestamp.match(/([+-])(\d{2}):(\d{2})$/);
    if (!match) return null;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3]));
  }

  private renderContinuous(container: HTMLElement, solarData: SolarEvent[], settings: SolarChartSettings, latitude: number, longitude: number, blockEl: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const rangeStart = this.dayStartInstantOf(solarData[0]);
    const dayStartInstants = solarData.map(solar => this.dayStartInstantOf(solar));
    const totalDays = solarData.length;
    const totalMinutes = totalDays * MINUTES_PER_DAY;
    const minuteToDate = (minute: number): Date => {
      const dayIndex = Math.min(Math.max(Math.floor(minute / MINUTES_PER_DAY), 0), dayStartInstants.length - 1);
      const minuteInDay = minute - dayIndex * MINUTES_PER_DAY;
      return new Date(dayStartInstants[dayIndex].getTime() + minuteInDay * 60_000);
    };

    // Twilight intervals and noon positions for every day, in continuous-minute space.
    const twilight: TwilightInterval[] = [];
    const noonOffsets: number[] = [];
    solarData.forEach((solar, dayIdx) => {
      const offset = dayIdx * MINUTES_PER_DAY;
      const boundaries = this.twilightBoundaryMinutes(solar).map(minutes => offset + minutes);
      twilight.push(...twilightIntervalsForDay(boundaries, offset, offset + MINUTES_PER_DAY));
      const noonMinutes = this.timeToMinutes(solar.solar_noon);
      if (!isNaN(noonMinutes)) noonOffsets.push(offset + noonMinutes);
    });

    {
      const canvasContainer = container.createDiv('solar-chart-canvas');
      canvasContainer.setCssProps({
        '--places-chart-height': settings.height
      });
      const canvas = canvasContainer.createEl('canvas');
      const canvasCtx = canvas.getContext('2d');
      if (canvasCtx) {
        const curve: { x: number; y: number }[] = [];
        let minAlt = 0;
        let maxAlt = 0;
        for (let minute = 0; minute <= totalMinutes; minute += SAMPLE_STEP_MINUTES) {
          const altitude = getSunPosition(minuteToDate(minute), latitude, longitude).altitudeDeg;
          curve.push({ x: minute, y: altitude });
          minAlt = Math.min(minAlt, altitude);
          maxAlt = Math.max(maxAlt, altitude);
        }

        splitSeriesAtBoundaries(curve, twilight);

        const datasets: ChartDataset[] = [
          {
            label: 'Altitude', data: curve, parsing: false, borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, tension: 0.3,
            fill: 'start',
            backgroundColor: '#cfe8f7',
            segment: twilight.length > 0 ? { backgroundColor: twilightSegmentFill(twilight, '#cfe8f7') } : undefined,
          },
          {
            label: 'Horizon', data: [{ x: 0, y: 0 }, { x: totalMinutes, y: 0 }], parsing: false,
            borderColor: 'rgba(120, 120, 120, 0.6)', borderWidth: 1, pointRadius: 0, fill: false,
          },
        ];

        const nowMinutes = (Date.now() - rangeStart.getTime()) / 60_000;
        if (nowMinutes >= 0 && nowMinutes <= totalMinutes) {
          datasets.push({
            label: 'Now', data: [{ x: nowMinutes, y: getSunPosition(new Date(), latitude, longitude).altitudeDeg }], parsing: false,
            showLine: false, pointRadius: 6, pointStyle: 'rectRot', pointBackgroundColor: '#ef4444', pointBorderColor: '#ffffff', pointBorderWidth: 1,
          });
        }

        const yMin = Math.floor(Math.min(minAlt, -5) / 10) * 10;
        const yMax = Math.ceil(Math.max(maxAlt, 10) / 10) * 10;

        const dayLinesPlugin = {
          id: 'dayLines',
          afterDraw: (chart: Chart) => {
            const xScale = chart.scales.x;
            const drawCtx = chart.ctx;
            drawCtx.save();
            drawCtx.strokeStyle = 'rgba(120, 120, 120, 0.25)';
            drawCtx.lineWidth = 1;
            for (let day = 1; day < totalDays; day++) {
              const x = xScale.getPixelForValue(day * MINUTES_PER_DAY);
              drawCtx.beginPath();
              drawCtx.moveTo(x, chart.chartArea.top);
              drawCtx.lineTo(x, chart.chartArea.bottom);
              drawCtx.stroke();
            }
            drawCtx.restore();
          },
        };

        const solarNoonPlugin = {
          id: 'solarNoon',
          afterDraw: (chart: Chart) => {
            for (const offset of noonOffsets) {
              paintSolarNoonLine(chart.ctx, chart.scales.x.getPixelForValue(offset), chart.chartArea.top, chart.chartArea.bottom);
            }
          },
        };

        const chart = new Chart(canvasCtx, {
          type: 'line',
          data: { datasets },
          plugins: [solarNoonPlugin, dayLinesPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: false, axis: 'x' },
            scales: {
              x: {
                type: 'linear', min: 0, max: totalMinutes,
                ticks: { stepSize: MINUTES_PER_DAY, callback: (value) => typeof value === 'number' ? minuteToDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : value },
                grid: { display: true },
              },
              y: {
                type: 'linear', min: yMin, max: yMax, title: { display: true, text: 'Sun altitude' }, ticks: { callback: (value) => `${value}°` },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                mode: 'nearest', intersect: false, axis: 'x',
                callbacks: {
                  title: (items) => items.length ? minuteToDate(items[0].parsed.x ?? 0).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '',
                  label: (context) => {
                    const label = context.dataset.label || '';
                    const altitude = `${Math.round(context.parsed.y ?? 0)}°`;
                    if (label === 'Horizon') return '';
                    if (label === 'Altitude') return `Altitude: ${altitude}`;
                    return `${label}: ${altitude}`;
                  },
                },
              },
            },
          },
        });
        this.trackChart(blockEl, ctx, chart);
      }
    }

  }

  private renderShadingLegend(container: HTMLElement): void {
    const legend = container.createDiv('solar-band-legend');
    for (const stage of TWILIGHT_STAGES) {
      const entry = legend.createDiv('solar-band-legend-item');
      entry.createDiv(`solar-band-swatch solar-band-swatch-${stage}`);
      entry.createSpan().setText(TWILIGHT_STAGE_LABELS[stage]);
    }
    const noonEntry = legend.createDiv('solar-band-legend-item');
    noonEntry.createDiv('solar-band-swatch solar-noon-swatch');
    noonEntry.createSpan().setText('Solar noon');
  }

  private renderAltitudeArc(container: HTMLElement, solar: SolarEvent, dayStart: Date, latitude: number, longitude: number, settings: SolarChartSettings, summaryRefs?: SummaryRef[]): Chart | undefined {
    const canvasContainer = container.createDiv('solar-chart-canvas');
    canvasContainer.setCssProps({
      '--places-chart-height': settings.height
    });
    const canvas = canvasContainer.createEl('canvas');
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return undefined;

    // Sample the Sun's altitude across the whole location-local day.
    const dayStartInstant = this.dayStartInstantOf(solar);
    const curve: { x: number; y: number }[] = [];
    let minAlt = 0;
    let maxAlt = 0;
    for (let minute = 0; minute <= MINUTES_PER_DAY; minute += SAMPLE_STEP_MINUTES) {
      const sampleDate = new Date(dayStartInstant.getTime() + minute * 60_000);
      const altitude = getSunPosition(sampleDate, latitude, longitude).altitudeDeg;
      curve.push({ x: minute, y: altitude });
      minAlt = Math.min(minAlt, altitude);
      maxAlt = Math.max(maxAlt, altitude);
    }

    const noonMinutes = this.timeToMinutes(solar.solar_noon);
    const riseMinutes = this.timeToMinutes(solar.sunrise);
    const setMinutes = this.timeToMinutes(solar.sunset);

    // Twilight stages shade only the area under the arc, sharing the tide chart's palette.
    const twilight = twilightIntervalsForDay(this.twilightBoundaryMinutes(solar), 0, MINUTES_PER_DAY);
    splitSeriesAtBoundaries(curve, twilight);

    const datasets: ChartDataset[] = [];

    datasets.push({
      label: 'Altitude',
      data: curve,
      parsing: false,
      borderColor: '#f59e0b',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      fill: 'start',
      backgroundColor: '#cfe8f7',
      segment: twilight.length > 0 ? {
        backgroundColor: twilightSegmentFill(twilight, '#cfe8f7'),
      } : undefined,
    });

    datasets.push({
      label: 'Horizon',
      data: [{ x: 0, y: 0 }, { x: MINUTES_PER_DAY, y: 0 }],
      parsing: false,
      borderColor: 'rgba(120, 120, 120, 0.6)',
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
    });

    if (!isNaN(riseMinutes) && !isNaN(setMinutes)) {
      datasets.push({
        label: 'Sunrise / sunset',
        data: [{ x: riseMinutes, y: 0 }, { x: setMinutes, y: 0 }],
        parsing: false,
        showLine: false,
        pointRadius: 4,
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1,
      });
    }

    // "Now" marker, only when the chart is showing today.
    const now = new Date();
    const isToday = now.getFullYear() === dayStart.getFullYear() && now.getMonth() === dayStart.getMonth() && now.getDate() === dayStart.getDate();
    if (isToday) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nowAltitude = getSunPosition(now, latitude, longitude).altitudeDeg;
      datasets.push({
        label: 'Now',
        data: [{ x: nowMinutes, y: nowAltitude }],
        parsing: false,
        showLine: false,
        pointRadius: 6,
        pointStyle: 'rectRot',
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1,
      });
    }

    const yMin = Math.floor(Math.min(minAlt, -5) / 10) * 10;
    const yMax = Math.ceil(Math.max(maxAlt, 10) / 10) * 10;

    // Positions each timed summary item under its event's x-position on the arc; untimed
    // items (e.g. day length) go to the center of the widest free gap, clear of overlaps.
    const alignSummaryPlugin = {
      id: 'alignSummary',
      afterDraw: (chart: Chart) => {
        if (!summaryRefs || summaryRefs.length === 0) return;
        const xScale = chart.scales.x;
        const area = chart.chartArea;

        const eventXs: number[] = [];
        for (const ref of summaryRefs) {
          if (ref.minutes !== null) {
            const px = xScale.getPixelForValue(ref.minutes);
            ref.el.setCssProps({
              left: `${px}px`,
              transform: 'translateX(-50%)'
            });
            eventXs.push(px);
          }
        }

        const untimed = summaryRefs.filter((ref) => ref.minutes === null);
        if (untimed.length > 0) {
          const points = [area.left, ...eventXs.sort((a, b) => a - b), area.right];
          let bestMid = (area.left + area.right) / 2;
          let bestGap = -1;
          for (let i = 0; i < points.length - 1; i++) {
            const gap = points[i + 1] - points[i];
            if (gap > bestGap) {
              bestGap = gap;
              bestMid = (points[i] + points[i + 1]) / 2;
            }
          }
          for (const ref of untimed) {
            ref.el.setCssProps({
              left: `${bestMid}px`,
              transform: 'translateX(-50%)'
            });
          }
        }
      },
    };

    const solarNoonPlugin = {
      id: 'solarNoon',
      afterDraw: (chart: Chart) => {
        if (!isNaN(noonMinutes)) {
          const xScale = chart.scales.x;
          paintSolarNoonLine(chart.ctx, xScale.getPixelForValue(noonMinutes), chart.chartArea.top, chart.chartArea.bottom);
        }
      },
    };

    const chart = new Chart(canvasCtx, {
      type: 'line',
      data: { datasets },
      plugins: [solarNoonPlugin, alignSummaryPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Disable animation: hover/tooltip feedback is instant.
        animation: false,
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: MINUTES_PER_DAY,
            ticks: {
              stepSize: 180,
              callback: (value) => typeof value === 'number' ? this.minutesToTimeString(value) : value,
            },
            grid: { display: true },
          },
          y: {
            type: 'linear',
            min: yMin,
            max: yMax,
            title: { display: true, text: 'Sun altitude' },
            ticks: { callback: (value) => `${value}°` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'nearest',
            intersect: false,
            axis: 'x',
            callbacks: {
              title: (items) => items.length ? this.minutesToTimeString(items[0].parsed.x ?? 0) : '',
              label: (context) => {
                const label = context.dataset.label || '';
                const altitude = `${Math.round(context.parsed.y ?? 0)}°`;
                if (label === 'Horizon') return '';
                if (label === 'Altitude') return `Altitude: ${altitude}`;
                return `${label}: ${altitude}`;
              },
            },
          },
        },
      },
    });
    return chart;
  }

  private renderSummary(container: HTMLElement, solar: SolarEvent, latitude: number, longitude: number, refs?: SummaryRef[], aligned = false): void {
    const riseAz = getSunPosition(new Date(solar.sunrise), latitude, longitude).azimuthDeg;
    const setAz = getSunPosition(new Date(solar.sunset), latitude, longitude).azimuthDeg;
    const noonAlt = getSunPosition(new Date(solar.solar_noon), latitude, longitude).altitudeDeg;

    const summary = container.createDiv(aligned ? 'solar-summary solar-summary-aligned' : 'solar-summary');
    const addItem = (label: string, value: string, detail: string, minutes: number | null): void => {
      const item = summary.createDiv('solar-summary-item');
      item.createDiv('solar-summary-label').setText(label);
      item.createDiv('solar-summary-value').setText(value);
      item.createDiv('solar-summary-detail').setText(detail);
      refs?.push({ el: item, minutes: minutes !== null && isNaN(minutes) ? null : minutes });
    };

    addItem('Sunrise', this.minutesToTimeString(this.timeToMinutes(solar.sunrise)), `${Math.round(riseAz)}° ${azimuthToCompass(riseAz)}`, this.timeToMinutes(solar.sunrise));
    addItem('Solar noon', this.minutesToTimeString(this.timeToMinutes(solar.solar_noon)), `${Math.round(noonAlt)}° altitude`, this.timeToMinutes(solar.solar_noon));
    addItem('Sunset', this.minutesToTimeString(this.timeToMinutes(solar.sunset)), `${Math.round(setAz)}° ${azimuthToCompass(setAz)}`, this.timeToMinutes(solar.sunset));
    addItem('Day length', this.formatDayLength(solar.day_length), 'of daylight', null);
  }

}
