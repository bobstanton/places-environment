import { MarkdownPostProcessorContext } from 'obsidian';
import { SolarApiService } from '../api-services/SolarApiService';
import type { SolarEvent } from '../types';
import { NamedCoordinate } from "places-shared/geo";
import { CACHE_DEFAULT, CodeBlockReader, parseBoolean, parseCacheSetting, DateParser, type CachePolicy } from "places-shared/settings";
import { getErrorMessage, formatDisplayCoordinate, copyToClipboard } from "places-shared/utils";
import { createFloatingCopyButton, createFloatingRefreshButton } from "places-shared/ui";
import { markdownTable } from 'markdown-table';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';
import { parseWallClockTime } from '../utilities/DateTimeUtilities';
import { azimuthToCompass, getSunPosition, type SunPosition } from '../services/SolarPositionService';

export interface SolarCodeBlockSettings {
  location?: NamedCoordinate;
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  showTwilight?: boolean;
  showDayLength?: boolean;
  showSolarNoon?: boolean;
  // Compass direction of the sunrise and sunset on the horizon.
  showAzimuth?: boolean;
  // Peak sun altitude at solar noon.
  showAltitude?: boolean;
  cachePolicy: CachePolicy;
}

const SolarCodeBlockDefaultSettings: SolarCodeBlockSettings = {
  showTwilight: true,
  showDayLength: true,
  showSolarNoon: false,
  showAzimuth: false,
  showAltitude: false,
  cachePolicy: CACHE_DEFAULT,
};

export class SolarTableProcessor extends BaseEnvironmentProcessor {
  private solarService: SolarApiService;

  constructor(plugin: PlacesEnvironmentPlugin, solarService: SolarApiService) {
    super(plugin);
    this.solarService = solarService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'solar-table-loading',
      loadingText: 'Loading solar data...',
      errorMessage: 'Failed to render solar table',
      refreshLabel: 'Refresh solar table',
      render: async () => {
      const settings = this.parseCodeBlockSettings(source, ctx);
      const solarData = await this.getSolarData(settings);
      this.renderSolarTable(el, solarData, settings, ctx, source);
      renderSettingsTraceIfRequested(el, source, ctx, this.plugin, 'places-solar-table', SolarCodeBlockDefaultSettings, settings);
        return el;
      },
    });
  }

  private parseCodeBlockSettings(source: string, ctx: MarkdownPostProcessorContext): SolarCodeBlockSettings {
    const block = new CodeBlockReader(source, { colonTextKeys: ['coordinates', 'location'] });
    const settings: SolarCodeBlockSettings = { ...SolarCodeBlockDefaultSettings };

    settings.showTwilight = parseBoolean(block.raw('showTwilight'), SolarCodeBlockDefaultSettings.showTwilight!);
    settings.showDayLength = parseBoolean(block.raw('showDayLength'), SolarCodeBlockDefaultSettings.showDayLength!);
    settings.showSolarNoon = parseBoolean(block.raw('showSolarNoon'), SolarCodeBlockDefaultSettings.showSolarNoon!);
    settings.showAzimuth = parseBoolean(block.raw('showAzimuth'), SolarCodeBlockDefaultSettings.showAzimuth!);
    settings.showAltitude = parseBoolean(block.raw('showAltitude'), SolarCodeBlockDefaultSettings.showAltitude!);

    const [startDate, endDate] = DateParser.parseDateRange({
      startDate: block.text('startDate') ?? 'today',
      endDate: block.text('endDate') ?? '+1w'
    });
    settings.startDate = startDate;
    settings.endDate = endDate;

    settings.location = this.getLocation(block, ctx);
    settings.timezone = block.text('timezone')?.trim() || undefined;
    settings.cachePolicy = parseCacheSetting(block.text('cache'), SolarCodeBlockDefaultSettings.cachePolicy);

    return settings;
  }

  private async getSolarData(settings: SolarCodeBlockSettings): Promise<SolarEvent[]> {
    return this.solarService.getSolarEvents(
      settings.location!,
      settings.startDate!,
      settings.endDate!,
      { timezone: settings.timezone, cachePolicy: settings.cachePolicy }
    );
  }

  private formatTime(timestamp: string): string {
    const parts = parseWallClockTime(timestamp);
    if (!parts) {
      return timestamp;
    }
    return this.formatClockTime(parts.hours, parts.minutes);
  }

  private formatClockTime(hours24: number, minutes: number): string {
    const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  private formatDuration(duration: string | number): string {
    if (typeof duration === 'number') {
      const totalMinutes = Math.round(duration / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    }

    if (typeof duration === 'string') {
      const parts = duration.split(':');
      if (parts.length >= 2) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        } else {
          return `${minutes}m`;
        }
      }
    }

    return String(duration);
  }

  private renderSolarTable(el: HTMLElement, solarData: SolarEvent[], settings: SolarCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    el.empty();
    el.removeClass('tide-loading');

    const container = el.createDiv('solar-table-container');

    if (settings.location) {
      const locationDiv = container.createDiv('solar-location-info');
      const heading = locationDiv.createEl('h4');
      heading.setText(`Solar Times for ${settings.location.name ?? formatDisplayCoordinate(settings.location, 4)}`);
    }

    const headers = ['Date', 'Sunrise', 'Sunset'];

    if (settings.showAzimuth) {
      headers.push('Sunrise dir', 'Sunset dir');
    }
    if (settings.showSolarNoon) {
      headers.push('Solar Noon');
    }
    if (settings.showAltitude) {
      headers.push('Peak altitude');
    }
    if (settings.showDayLength) {
      headers.push('Day Length');
    }
    if (settings.showTwilight) {
      headers.push('Dawn', 'Dusk');
    }

    const tableData: string[][] = [headers];

    for (const solar of solarData) {
      const row: string[] = [
        this.formatDate(solar.date),
        this.formatTime(solar.sunrise),
        this.formatTime(solar.sunset)
      ];

      if (settings.showAzimuth) {
        row.push(this.formatBearing(solar.sunrise, settings), this.formatBearing(solar.sunset, settings));
      }
      if (settings.showSolarNoon) {
        row.push(this.formatTime(solar.solar_noon));
      }
      if (settings.showAltitude) {
        const noon = this.sunPositionAt(solar.solar_noon, settings);
        row.push(noon ? `${Math.round(noon.altitudeDeg)}°` : '');
      }
      if (settings.showDayLength) {
        row.push(this.formatDuration(solar.day_length));
      }
      if (settings.showTwilight) {
        row.push(
          this.formatTime(solar.civil_twilight_begin),
          this.formatTime(solar.civil_twilight_end)
        );
      }

      tableData.push(row);
    }

    const tableWrapper = container.createDiv('solar-table-scroll');
    this.captureTableScrollInteractions(tableWrapper);
    const tableEl = tableWrapper.createEl('table', { cls: 'solar-table' });

    for (let i = 0; i < tableData.length; i++) {
      const row = tableData[i];
      const tr = tableEl.createEl('tr');
      const cellTag = i === 0 ? 'th' : 'td';

      for (const cellContent of row) {
        tr.createEl(cellTag, { text: cellContent });
      }
    }

    this.createFloatingButtonContainer(container, tableData, ctx, source);
  }

  // Where on the horizon an event happens, as `62° ENE`. Bearings are clockwise
  // from true north, the same convention as the `solar_events` azimuth columns
  // and the map's `iconRotation`.
  private formatBearing(timestamp: string | undefined, settings: SolarCodeBlockSettings): string {
    const position = this.sunPositionAt(timestamp, settings);
    if (!position) return '';
    return `${Math.round(position.azimuthDeg)}° ${azimuthToCompass(position.azimuthDeg)}`;
  }

  private sunPositionAt(timestamp: string | undefined, settings: SolarCodeBlockSettings): SunPosition | undefined {
    if (!timestamp || !settings.location) return undefined;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return undefined;
    return getSunPosition(date, settings.location.latitude, settings.location.longitude);
  }

  private formatDate(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return date;
    return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
  }

  private captureTableScrollInteractions(scrollEl: HTMLElement): void {
    const stopPropagation = (event: Event) => event.stopPropagation();
    scrollEl.addEventListener('wheel', stopPropagation);
    scrollEl.addEventListener('mousedown', stopPropagation);
    scrollEl.addEventListener('touchstart', stopPropagation, { passive: true });
    scrollEl.addEventListener('touchmove', stopPropagation, { passive: true });
  }

  private createFloatingButtonContainer(container: HTMLElement, tableData: string[][], ctx: MarkdownPostProcessorContext, source: string): void {
    const buttonContainer = container.createDiv('places-floating-buttons');

    createFloatingCopyButton({
      buttonContainer,
      onCopy: () => this.copyMarkdownTable(tableData),
    });

    createFloatingRefreshButton({
      buttonContainer,
      ariaLabel: 'Refresh solar table',
      onRefresh: async () => {
        const refreshSettings = this.parseCodeBlockSettings(source, ctx);
        const refreshedSolarData = await this.getSolarData(refreshSettings);
        this.renderSolarTable(container.parentElement ?? container, refreshedSolarData, refreshSettings, ctx, source);
      },
      onError: (error) => {
        this.renderError(container, {
          message: getErrorMessage(error),
          ctx,
          source,
          onRefresh: async () => {
            const refreshSettings = this.parseCodeBlockSettings(source, ctx);
              const refreshedSolarData = await this.getSolarData(refreshSettings);
            this.renderSolarTable(container.parentElement ?? container, refreshedSolarData, refreshSettings, ctx, source);
          },
          refreshLabel: 'Refresh solar table'
        });
      }
    });
  }

  private async copyMarkdownTable(tableData: string[][]): Promise<void> {
    let markdown = `# Solar Times\n\n`;

    if (tableData.length > 0) {
      markdown += `**Generated:** ${new Date().toLocaleString()}  \n\n`;

      const table = markdownTable(tableData, {
        align: ['left', 'center', 'center', 'center', 'center', 'center', 'center']
      });
      markdown += table + '\n';
    } else {
      markdown += "*No solar data available.*\n";
    }

    markdown += "\n---\n\n";
    markdown += "*Solar data provided by [sunrise-sunset.org](https://sunrise-sunset.org).*  \n";

    await copyToClipboard(markdown);
  }
}
