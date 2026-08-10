import { MarkdownPostProcessorContext } from 'obsidian';
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { TideCodeBlockSettings, TideData, TideCodeBlockDefaultSettings } from '../types';
import { buildTideEvents, tideEventsToRows, buildTideMoonPhaseRows, buildTideMarkdown, renderTideStationInfo } from '../utilities/TideTableData';
import { renderTideStationMapIfRequested } from '../utilities/TideStationMap';
import { TideDataService } from '../services/TideDataService';
import { copyToClipboard } from "places-shared/utils";
import { createFloatingCopyButton } from "places-shared/ui";
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';

// The card layout lives in places-tide-cards (TideCardsProcessor).
export class TideTableProcessor extends BaseEnvironmentProcessor {
  private tideDataService: TideDataService;

  constructor(plugin: PlacesEnvironmentPlugin, tideDataService: TideDataService) {
    super(plugin);
    this.tideDataService = tideDataService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'tide-table-loading',
      loadingText: 'Loading tide data...',
      errorMessage: 'Failed to render tide table',
      refreshLabel: 'Refresh tide table',
      render: async (forceRefresh) => {
        const settings = this.tideDataService.parseCodeBlockSettings(source, ctx);
        settings.forceRefresh = forceRefresh;
        const tideData = await this.tideDataService.getTideData(settings);
        this.renderTideTable(el, tideData, settings, ctx, source);
        renderFreshnessIndicator(el, tideData.metadata);
        renderSettingsTraceIfRequested(el, source, ctx, this.plugin, 'places-tide-table', TideCodeBlockDefaultSettings, settings);
        return el;
      },
    });
  }

  private renderTideTable(el: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    el.empty();
    el.removeClass('tide-loading');

    const container = el.createDiv('tide-table-container');

    if (settings.showStation) {
      renderTideStationInfo(container, tideData);
    }

    renderTideStationMapIfRequested(this.plugin, container, tideData, settings, ctx);

    const events = buildTideEvents(tideData, settings, (date) => this.tideDataService.interpolateHeightAtTime(tideData, date));
    if (events.length === 0) {
      container.createDiv('solar-band-unavailable').setText('No tide or solar data available.');
    } else {
      this.renderHtmlTable(container, tideEventsToRows(events));
    }

    if (settings.showMoonPhases && (tideData.descriptionByDate?.size ?? 0) > 0) {
      container.createEl('h5', { cls: 'tide-table-subheading', text: 'Observed ranges & moon phases' });
      this.renderHtmlTable(container, buildTideMoonPhaseRows(tideData));
    }

    this.createFloatingButtonContainer(container, tideData, settings, ctx, source);
  }

  private renderHtmlTable(container: HTMLElement, rows: string[][]): void {
    const table = container.createEl('table', { cls: 'tide-data-table' });
    for (let i = 0; i < rows.length; i++) {
      const tr = table.createEl('tr');
      const cellTag = i === 0 ? 'th' : 'td';
      for (const cell of rows[i]) {
        tr.createEl(cellTag, { text: cell });
      }
    }
  }

  private createFloatingButtonContainer(container: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    const buttonContainer = container.createDiv('places-floating-buttons');
    let markdown: string | undefined;

    createFloatingCopyButton({
      buttonContainer,
      onCopy: () => copyToClipboard(markdown ??= buildTideMarkdown(tideData, settings, date => this.tideDataService.interpolateHeightAtTime(tideData, date))),
    });

    this.addFloatingRefreshButton(container, {
      buttonContainer,
      label: 'Refresh tide table',
      ctx,
      source,
      onRefresh: async () => {
        const refreshedSettings = this.tideDataService.parseCodeBlockSettings(source, ctx);
        refreshedSettings.forceRefresh = true;
        const refreshedTideData = await this.tideDataService.getTideData(refreshedSettings);
        this.renderTideTable(container.parentElement ?? container, refreshedTideData, refreshedSettings, ctx, source);
        renderFreshnessIndicator(container.parentElement ?? container, refreshedTideData.metadata);
      }
    });
  }
}
