import { MarkdownPostProcessorContext } from 'obsidian';
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { TideCodeBlockSettings, TideData, SolarEvent, TideDescription, tideUnitToUnitsSystem, TideCodeBlockDefaultSettings } from '../types';
import { groupTidesByDay } from '../utilities/TideUtilities';
import { buildTideMarkdown, renderTideStationInfo } from '../utilities/TideTableData';
import { renderTideStationMapIfRequested } from '../utilities/TideStationMap';
import { parseNaiveTimestamp } from '../utilities/TideTime';
import { TideDataService } from '../services/TideDataService';
import { getElevationUnit } from "places-shared/units";
import { DateParser } from "places-shared/settings";
import { copyToClipboard } from "places-shared/utils";
import { createFloatingCopyButton } from "places-shared/ui";
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type PlacesEnvironmentPlugin from '../main';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';

export class TideCardsProcessor extends BaseEnvironmentProcessor {
  private tideDataService: TideDataService;

  constructor(plugin: PlacesEnvironmentPlugin, tideDataService: TideDataService) {
    super(plugin);
    this.tideDataService = tideDataService;
  }

  async processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    await this.renderCodeBlock(source, el, ctx, {
      loadingClass: 'tide-table-loading',
      loadingText: 'Loading tide data...',
      errorMessage: 'Failed to render tide cards',
      refreshLabel: 'Refresh tide cards',
      render: async (forceRefresh) => {
        const settings = this.tideDataService.parseCodeBlockSettings(source, ctx);
        settings.forceRefresh = forceRefresh;
        const tideData = await this.tideDataService.getTideData(settings);
        this.renderTideCards(el, tideData, settings, ctx, source);
        renderFreshnessIndicator(el, tideData.metadata);
        renderSettingsTraceIfRequested(el, source, ctx, this.plugin, 'places-tide-cards', TideCodeBlockDefaultSettings, settings);
        return el;
      },
    });
  }

  private renderTideCards(el: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, ctx: MarkdownPostProcessorContext, source: string): void {
    el.empty();
    el.addClass('tide-table-container');

    if (settings.showStation) {
      renderTideStationInfo(el, tideData);
    }

    renderTideStationMapIfRequested(this.plugin, el, tideData, settings, ctx);

    const tidesByDay = groupTidesByDay(tideData.hilo);
    const sortedDays = Object.keys(tidesByDay).sort();

    const tidesContainer = el.createDiv('tide-days-container');

    for (const dayStr of sortedDays) {
      const dayTides = tidesByDay[dayStr];
      const dayCard = tidesContainer.createDiv('tide-day-card');

      const dayHeader = dayCard.createDiv('tide-day-header');
      const dayDate = new Date(dayStr + 'T12:00:00');

      const dateDiv = dayHeader.createDiv('tide-day-date');
      dateDiv.setText(dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

      const weekdayDiv = dayHeader.createSpan('tide-day-weekday');
      weekdayDiv.setText(dayDate.toLocaleDateString('en-US', { weekday: 'long' }));

      if (settings.showMoonPhases) {
        const description = tideData.descriptionByDate?.get(dayStr);
        if (description) {
          this.renderTideDescription(dayCard, description);
        }
      }

      if (settings.showSolar) {
        const solarEvent = tideData.solarByDate?.get(dayStr);
        if (solarEvent) {
          this.renderSolarEvents(dayCard, solarEvent);
        }
      }

      const eventsGrid = dayCard.createDiv('tide-events-grid');

      dayTides.forEach(tide => {
        const eventCard = eventsGrid.createDiv('tide-event-card');
        eventCard.addClass(tide.type === 'H' ? 'tide-high' : 'tide-low');

        eventCard.createDiv('tide-event-type').setText(tide.type === 'H' ? 'High' : 'Low');
        eventCard.createDiv('tide-event-time').setText(DateParser.formatTime12Hour(parseNaiveTimestamp(tide.timestamp_local)));

        const unitsSystem = tideUnitToUnitsSystem(tideData.units);
        const elevationUnit = getElevationUnit(unitsSystem);
        eventCard.createDiv('tide-event-height').setText(`${tide.height.toFixed(2)} ${elevationUnit.abbreviation}`);
      });
    }

    this.createFloatingButtonContainer(el, tideData, settings, ctx, source);
  }

  private renderTideDescription(container: HTMLElement, description: TideDescription): void {
    const moonInfo = container.createDiv('tide-moon-info');
    moonInfo.createDiv('tide-moon-description').setText(description.description);
  }

  private renderSolarEvents(container: HTMLElement, solarEvent: SolarEvent): void {
    const solarInfo = container.createDiv('tide-solar-info');

    const solarMain = solarInfo.createDiv('tide-solar-main');
    solarMain.createDiv('tide-solar-sunrise').setText(`🌅 ${DateParser.formatTime12Hour(solarEvent.sunrise)}`);
    solarMain.createDiv('tide-solar-sunset').setText(`🌇 ${DateParser.formatTime12Hour(solarEvent.sunset)}`);

    if (solarEvent.civil_twilight_begin && solarEvent.civil_twilight_end) {
      const solarGolden = solarInfo.createDiv('tide-solar-golden');
      solarGolden.createDiv('tide-solar-dawn').setText(`Dawn ${DateParser.formatTime12Hour(solarEvent.civil_twilight_begin)}`);
      solarGolden.createDiv('tide-solar-dusk').setText(`Dusk ${DateParser.formatTime12Hour(solarEvent.civil_twilight_end)}`);
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
      label: 'Refresh tide cards',
      ctx,
      source,
      onRefresh: async () => {
        const refreshedSettings = this.tideDataService.parseCodeBlockSettings(source, ctx);
        refreshedSettings.forceRefresh = true;
        const refreshedTideData = await this.tideDataService.getTideData(refreshedSettings);
        this.renderTideCards(container, refreshedTideData, refreshedSettings, ctx, source);
        renderFreshnessIndicator(container, refreshedTideData.metadata);
      }
    });
  }
}
