import * as _placesDom from 'places-shared/utils';
import { createTideButtons } from './TideButtons';
import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { TideCodeBlockSettings, TideData, TideCodeBlockDefaultSettings } from 'places-environment/core';
import { buildTideEvents, tideEventsToRows, buildTideMoonPhaseRows, renderTideStationInfo } from '../utilities/TideTableData';
import { renderTideStationMapIfRequested } from '../utilities/TideStationMap';
import { TideDataService } from 'places-environment/core';
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';

export class TideTableProcessor extends BaseEnvironmentProcessor {
  private tideDataService: TideDataService;

  constructor(plugin: EnvironmentPluginHost, tideDataService: TideDataService) {
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
    _placesDom.emptyElement(el);
    _placesDom.removeClass(el, 'tide-loading');

    const container = _placesDom.createDiv(el, 'tide-table-container');

    if (settings.showStation) {
      renderTideStationInfo(container, tideData);
    }

    renderTideStationMapIfRequested(this.plugin, container, tideData, settings, ctx);

    const events = buildTideEvents(tideData, settings, (date) => this.tideDataService.interpolateHeightAtTime(tideData, date));

    if (events.length === 0) {
      _placesDom.setText(_placesDom.createDiv(container, 'solar-band-unavailable'), 'No tide or solar data available.');
    } else {
      this.renderHtmlTable(container, tideEventsToRows(events));
    }

    if (settings.showMoonPhases && (tideData.descriptionByDate?.size ?? 0) > 0) {
      _placesDom.createElement(container, 'h5', { cls: 'tide-table-subheading', text: 'Observed ranges & moon phases' });
      this.renderHtmlTable(container, buildTideMoonPhaseRows(tideData));
    }

    createTideButtons({
      container, renderTarget: el, tideData, settings, ctx, source,
      service: this.tideDataService,
      label: 'Refresh tide table',
      addRefreshButton: (target, options) => this.addFloatingRefreshButton(target, options),
      render: (data, refreshedSettings) => this.renderTideTable(el, data, refreshedSettings, ctx, source),
    });
  }

  private renderHtmlTable(container: HTMLElement, rows: string[][]): void {
    const table = _placesDom.createElement(container, 'table', { cls: 'tide-data-table' });

    for (let i = 0; i < rows.length; i++) {
      const tr = _placesDom.createElement(table, 'tr');
      const cellTag = i === 0 ? 'th' : 'td';

      for (const cell of rows[i]) {
        _placesDom.createElement(tr, cellTag, { text: cell });
      }
    }
  }
}
