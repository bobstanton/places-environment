 
import { MarkdownPostProcessorContext } from 'obsidian';
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale, Filler, Legend, Tooltip, Title, type ChartData, type ChartOptions, type Plugin } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { TideCodeBlockSettings, TideData, tideUnitToUnitsSystem, TideCodeBlockDefaultSettings } from '../types';
import { tideStationTitle, tideStationTypeLabel } from '../utilities/TideTableData';
import { renderTideStationMapIfRequested } from '../utilities/TideStationMap';
import { getTideTimeline, parseNaiveTimestamp } from '../utilities/TideTime';
import { TwilightInterval, TWILIGHT_STAGE_LABELS, twilightIntervalsForDay, twilightStageAt, splitSeriesAtBoundaries, densifySeries, twilightSegmentFill, paintSolarNoonLine } from '../utilities/SolarShading';
import { TideDataService } from '../services/TideDataService';
import { getElevationUnit } from "places-shared/units";
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';

Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Filler, Legend, Tooltip, Title);

// Fallback fill under the tide curve when solar data is unavailable (the daylight color).
const TIDE_WATER_FILL = '#cfe8f7';
const DAY_MS = 24 * 60 * 60 * 1000;
type TideChartPoint = { x: number; y: number; timestamp?: string };

export class TideChartProcessor extends BaseEnvironmentProcessor {
  private tideDataService: TideDataService;

  constructor(plugin: PlacesEnvironmentPlugin, tideDataService: TideDataService) {
    super(plugin);
    this.tideDataService = tideDataService;
  }

  private chartDataBounds: { dataStart: number; dataEnd: number; hourlyEnd: number } | undefined;
  private twilightIntervals: TwilightInterval[] = [];

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'tide-chart-loading',
      loadingText: 'Loading tide data...',
      errorMessage: 'Failed to render tide chart',
      refreshLabel: 'Refresh tide chart',
      render: async (forceRefresh) => {
        const settings = this.tideDataService.parseCodeBlockSettings(source, ctx);
        settings.forceRefresh = forceRefresh;
        const tideData = await this.tideDataService.getTideData(settings);
        this.renderTideChart(el, tideData, settings, ctx, source);
        renderFreshnessIndicator(el, tideData.metadata);
        renderSettingsTraceIfRequested(el, source, ctx, this.plugin, 'places-tide-chart', TideCodeBlockDefaultSettings, settings);
        return el;
      },
    });
  }

  renderTideChart(el: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    el.removeClass('tide-chart-loading');
    el.addClass('tide-chart-container');
    
    const startDate = new Date(settings.startDate || new Date());
    const endDate = new Date(settings.endDate || new Date());

    this.renderContinuousChart(el, tideData, settings, [startDate, endDate], ctx, source);
  }

  renderContinuousChart(el: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, dateRange: [Date, Date], processorContext: MarkdownPostProcessorContext, source: string): void {
    this.disposeTrackedCharts(el);
    el.empty();
    
    const chartDiv = el.createDiv('tide-chart');
    
    if (settings.showStation) {
      this.renderStationInfoDiv(chartDiv, tideData, settings);
    }

    renderTideStationMapIfRequested(this.plugin, chartDiv, tideData, settings, processorContext);


    const chartContainer = chartDiv.createDiv('tide-chart-container');
    chartContainer.setCssProps({
      '--places-chart-height': settings.height
    });
    
    const canvas = chartContainer.createEl('canvas', { cls: 'tide-chart-canvas' });
    
    if (processorContext && source) {
      this.addFloatingRefreshButton(el, {
        label: 'Refresh tide chart',
        loadingClass: 'tide-chart-loading',
        loadingText: 'Loading tide data...',
        ctx: processorContext,
        source,
        onRefresh: async () => {
          const settings = this.tideDataService.parseCodeBlockSettings(source, processorContext);
          settings.forceRefresh = true;
          const tideData = await this.tideDataService.getTideData(settings);
          this.renderTideChart(el, tideData, settings, processorContext, source);
          renderFreshnessIndicator(el, tideData.metadata);
        }
      });
    }
    const canvasContext = canvas.getContext('2d');
    
    if (!canvasContext) {
      throw new Error('Failed to get canvas context for tide chart');
    }

    const chartData = this.prepareChartData(tideData, dateRange);

    const dayBoundariesPlugin: Plugin<'line'> = {
      id: 'dayBoundaries',
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        const startTime = xScale.min;
        const endTime = xScale.max;
        
        const start = new Date(startTime);
        const end = new Date(endTime);
        
        for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
          const midnight = new Date(date);
          midnight.setHours(0, 0, 0, 0);
          
          if (midnight > start && midnight < end) {
            const x = xScale.getPixelForValue(midnight.getTime());
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x, yScale.top);
            ctx.lineTo(x, yScale.bottom);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    };

    const solarEventsPlugin: Plugin<'line'> = {
      id: 'solarEvents',
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;

        // Markers rise from the axis to the tide curve (not full height), annotating the
        // curve without slicing the whole plot.
        const curveTopPixel = (time: number): number => {
          const height = this.tideDataService.interpolateHeightAtTime(tideData, new Date(time));
          if (height === null) return yScale.top;
          return Math.max(yScale.getPixelForValue(height), yScale.top);
        };

        const drawMarker = (time: number, color: string): void => {
          if (time < xScale.min || time > xScale.max) return;
          const x = xScale.getPixelForValue(time);
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(x, curveTopPixel(time));
          ctx.lineTo(x, yScale.bottom);
          ctx.stroke();
          ctx.restore();
        };

        (tideData.solar ?? []).forEach(solarEvent => {
          drawMarker(parseNaiveTimestamp(solarEvent.sunrise).getTime(), 'rgba(245, 158, 11, 0.8)');
          drawMarker(parseNaiveTimestamp(solarEvent.sunset).getTime(), 'rgba(30, 41, 59, 0.8)');

          if (solarEvent.solar_noon) {
            const noonTime = parseNaiveTimestamp(solarEvent.solar_noon).getTime();
            if (noonTime >= xScale.min && noonTime <= xScale.max) {
              paintSolarNoonLine(ctx, xScale.getPixelForValue(noonTime), yScale.top, yScale.bottom);
            }
          }
        });
      }
    };

    // Vertical "now" line when the current time falls within the chart range.
    const nowMarkerPlugin: Plugin<'line'> = {
      id: 'nowMarker',
      afterDraw: (chart) => {
        const xScale = chart.scales.x;
        const now = Date.now();
        if (now < xScale.min || now > xScale.max) return;
        const x = xScale.getPixelForValue(now);
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, chart.scales.y.top);
        ctx.lineTo(x, chart.scales.y.bottom);
        ctx.stroke();
        ctx.restore();
      }
    };

    const chart = new Chart<'line', TideChartPoint[]>(canvasContext, {
      type: 'line',
      data: chartData,
      options: this.getChartOptions(tideData),
      plugins: [dayBoundariesPlugin, solarEventsPlugin, nowMarkerPlugin]
    });
    this.trackChart(el, processorContext, chart);

    this.renderTideSummary(chartDiv, tideData);
  }

  // Summary row mirroring the solar chart: next high, next low, and the tidal range.
  private renderTideSummary(container: HTMLElement, tideData: TideData): void {
    const unitsSystem = tideUnitToUnitsSystem(tideData.units);
    const unitAbbr = getElevationUnit(unitsSystem).abbreviation;
    const now = Date.now();

    const sorted = getTideTimeline(tideData).hilo;
    const nextOf = (type: 'H' | 'L'): TideData['hilo'][number] | undefined => {
      const ofType = sorted.filter(entry => entry.point.type === type);
      return (ofType.find(entry => entry.timestamp >= now) ?? ofType[0])?.point;
    };
    const nextHigh = nextOf('H');
    const nextLow = nextOf('L');

    const highs = tideData.hilo.filter(t => t.type === 'H').map(t => t.height);
    const lows = tideData.hilo.filter(t => t.type === 'L').map(t => t.height);
    const range = (highs.length > 0 && lows.length > 0) ? Math.max(...highs) - Math.min(...lows) : null;

    const fmtTime = (timestamp: string): string =>
      parseNaiveTimestamp(timestamp).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

    const summary = container.createDiv('solar-summary');
    const addItem = (label: string, value: string, detail: string): void => {
      const item = summary.createDiv('solar-summary-item');
      item.createDiv('solar-summary-label').setText(label);
      item.createDiv('solar-summary-value').setText(value);
      item.createDiv('solar-summary-detail').setText(detail);
    };

    addItem('Next high', nextHigh ? fmtTime(nextHigh.timestamp_local) : '-', nextHigh ? `${nextHigh.height.toFixed(2)} ${unitAbbr}` : '');
    addItem('Next low', nextLow ? fmtTime(nextLow.timestamp_local) : '-', nextLow ? `${nextLow.height.toFixed(2)} ${unitAbbr}` : '');
    addItem('Range', range !== null ? `${range.toFixed(2)} ${unitAbbr}` : '-', 'high to low');
    addItem('Datum', tideData.datum, 'reference');
  }

    prepareChartData(tideData: TideData, dateRange: [Date, Date]): ChartData<'line', TideChartPoint[]> {
    const [startDate, endDate] = dateRange;
    const endDateWithBuffer = new Date(endDate);
    endDateWithBuffer.setHours(23, 59, 59, 999);
    const startTime = startDate.getTime();
    const endTime = endDateWithBuffer.getTime();

    // Hourly points resampled to 10-minute resolution (matching the solar chart's
    // sampling) - hourly spacing renders lumpy under Chart.js tension.
    const timeline = getTideTimeline(tideData);
    const hourlyData = densifySeries(
      timeline.hourly.map(({ point, timestamp }) => ({
        x: timestamp,
        y: point.height
      })),
      10 * 60 * 1000
    );

    const highTides = timeline.hilo.filter(({ point, timestamp }) =>
      point.type === 'H' && timestamp >= startTime && timestamp <= endTime
    ).map(({ point, timestamp }) => ({
      x: timestamp,
      y: point.height,
      timestamp: point.timestamp_local
    }));

    const lowTides = timeline.hilo.filter(({ point, timestamp }) =>
      point.type === 'L' && timestamp >= startTime && timestamp <= endTime
    ).map(({ point, timestamp }) => ({
      x: timestamp,
      y: point.height,
      timestamp: point.timestamp_local
    }));

    const allDataPoints = [
      ...hourlyData.map((h) => h.x),
      ...highTides.map((h) => h.x),
      ...lowTides.map((l) => l.x)
    ];
    const dataStart = Math.min(...allDataPoints);
    const dataEnd = Math.max(...allDataPoints);
    const hourlyEnd = hourlyData.length > 0 ? Math.max(...hourlyData.map((h) => h.x)) : dataEnd;
    
    this.chartDataBounds = { dataStart, dataEnd, hourlyEnd };

    // Twilight-stage intervals, shared with the solar chart's shading and the tooltip.
    // Tides and solar events share one frame: both are station wall-clock strings (solar
    // is converted at fetch time via the station's derived UTC offset).
    this.twilightIntervals = (tideData.solar ?? []).flatMap(s => {
      const boundaries = [
        s.astronomical_twilight_begin,
        s.nautical_twilight_begin,
        s.civil_twilight_begin,
        s.sunrise,
        s.sunset,
        s.civil_twilight_end,
        s.nautical_twilight_end,
        s.astronomical_twilight_end,
      ].map((value: string | undefined) => value ? parseNaiveTimestamp(value).getTime() : NaN);
      const dayAnchor = parseNaiveTimestamp(s.sunrise);
      dayAnchor.setHours(0, 0, 0, 0);
      return twilightIntervalsForDay(boundaries, dayAnchor.getTime(), dayAnchor.getTime() + DAY_MS);
    });
    // Fill transitions must land exactly on the stage boundaries.
    splitSeriesAtBoundaries(hourlyData, this.twilightIntervals);

    return {
      datasets: [
        {
          type: 'line',
          label: `Tide Height (${tideData.units})`,
          data: hourlyData,
          borderColor: '#2196f3',
          backgroundColor: TIDE_WATER_FILL,
          fill: true,
          // Only the area under the curve is shaded, colored by twilight stage.
          segment: this.twilightIntervals.length > 0 ? {
            backgroundColor: twilightSegmentFill(this.twilightIntervals, TIDE_WATER_FILL),
          } : undefined,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        },
        {
          label: 'High Tide',
          data: highTides,
          borderColor: 'rgba(0, 51, 102, 0.8)', /* Dark Blue */
          backgroundColor: '#003366', /* Dark Blue */
          pointRadius: 3,
          pointHoverRadius: 5,
          showLine: false,
          borderWidth: 2
        },
        {
          label: 'Low Tide',
          data: lowTides,
          borderColor: 'rgba(244, 225, 193, 0.9)', /* Sand */
          backgroundColor: '#f4e1c1', /* Sand */
          pointRadius: 3,
          pointHoverRadius: 5,
          showLine: false,
          borderWidth: 2
        }
      ]
    };
  }
  
    getChartOptions(tideData: TideData): ChartOptions<'line'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      // Disable animation: hover/tooltip feedback is instant.
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        title: {
          display: false  // Station info is already shown above the chart
        },
        legend: {
          display: false
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
                hour12: true
              });
            },
            label: (context) => {
              const height = context.parsed.y ?? 0;
              const unitsSystem = tideUnitToUnitsSystem(tideData.units);
              const elevationUnit = getElevationUnit(unitsSystem);
              return `${String(context.dataset.label)}: ${height.toFixed(2)} ${String(elevationUnit.abbreviation)}`;
            },
            afterBody: (context) => {
              // Only what changes point to point: the twilight stage at the hovered time.
              // Per-day solar times live in the tide table and the on-chart markers.
              const stage = twilightStageAt(this.twilightIntervals, context[0].parsed.x ?? 0);
              if (!stage) return [];
              if (stage === 'day') return ['☀️ Daylight'];
              if (stage === 'night') return ['🌙 Night'];
              return [TWILIGHT_STAGE_LABELS[stage]];
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          min: this.chartDataBounds?.dataStart,
          max: this.chartDataBounds?.dataEnd,
          time: {
            unit: 'hour',
            displayFormats: {
              hour: 'HH:mm',
              day: 'MMM dd'
            },
            tooltipFormat: 'MMM dd HH:mm'
          },
          ticks: {
            callback: function(value) {
              const date = new Date(value);
              const hour = date.getHours();
              const minutes = date.getMinutes();
              
              if (hour === 0 && minutes === 0) {
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                });
              }
              
              return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
            },
            maxTicksLimit: 24
          },
          title: {
            display: true,
            text: 'Time'
          },
          grid: {
            display: true,
            color: (context) => {
              const date = new Date(context.tick.value);
              const hour = date.getHours();
              const minutes = date.getMinutes();
              
              if (hour === 0 && minutes === 0) {
                return 'rgba(0, 0, 0, 0.3)';
              }
              return 'rgba(0, 0, 0, 0.1)';
            },
            lineWidth: (context) => {
              const date = new Date(context.tick.value);
              const hour = date.getHours();
              const minutes = date.getMinutes();
              
              if (hour === 0 && minutes === 0) {
                return 2;
              }
              return 1;
            }
          }
        },
        y: {
          title: {
            display: true,
            text: `Height (${getElevationUnit(tideUnitToUnitsSystem(tideData.units)).abbreviation}) - ${tideData.datum}`
          },
          grid: {
            display: true,
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      },
      elements: {
        point: {
          hoverBorderWidth: 2
        }
      }
    };
  }
  
  private renderStationInfoDiv(container: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings): void {
    const stationInfoDiv = container.createDiv('tide-station-info');
    
    const heading = stationInfoDiv.createEl('h4');
    // The title carries the distance from the requested location ("... · 2.3 mi").
    heading.setText(tideStationTitle(tideData.station, tideUnitToUnitsSystem(tideData.units)));

    const detailsDiv = stationInfoDiv.createDiv('tide-station-details');

    const typeLabel = tideStationTypeLabel(tideData.station.type);
    if (typeLabel) {
      detailsDiv.createSpan('tide-station-type').setText(typeLabel);
    }

    const datum = detailsDiv.createSpan('tide-station-datum');
    datum.setText("Datum: " + tideData.datum);

    const units = detailsDiv.createSpan('tide-station-units');
    const unitsSystem = tideUnitToUnitsSystem(tideData.units);
    const elevationUnit = getElevationUnit(unitsSystem);
    units.setText("Units: " + elevationUnit.name);
    
    // descriptionByDate is enrichment: absent when tide-description computation failed.
    const descriptions = settings.showMoonPhases ? Array.from(tideData.descriptionByDate?.values() ?? []) : [];
    if (descriptions.length > 0) {
      const bestDay = descriptions.reduce(
        (best, current) => current.tidalRange > best.tidalRange ? current : best
      );

      const moonInfo = stationInfoDiv.createDiv('tide-moon-info');
      const descDiv = moonInfo.createDiv('tide-moon-description');
      descDiv.setText(bestDay.description);
    }
  }
}
