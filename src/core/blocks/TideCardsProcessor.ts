import * as _placesDom from 'places-shared/utils';
import { createTideButtons } from './TideButtons';
import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { renderFreshnessIndicator } from './FreshnessIndicator';
import { TideCodeBlockSettings, TideData, SolarEvent, TideDescription, tideUnitToUnitsSystem, TideCodeBlockDefaultSettings } from 'places-environment/core';
import { groupTidesByDay } from 'places-environment/core';
import { renderTideStationInfo } from '../utilities/TideTableData';
import { renderTideStationMapIfRequested } from '../utilities/TideStationMap';
import { parseNaiveTimestamp } from 'places-environment/core';
import { TideDataService } from 'places-environment/core';
import { getElevationUnit } from "places-shared/units";
import { DateParser } from "places-shared/settings";
import { BaseEnvironmentProcessor } from './BaseEnvironmentProcessor';
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';
import { renderSettingsTraceIfRequested } from './SettingsDebugTrace';

export class TideCardsProcessor extends BaseEnvironmentProcessor {
  private tideDataService: TideDataService;

  constructor(plugin: EnvironmentPluginHost, tideDataService: TideDataService) {
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
    _placesDom.emptyElement(el);
    _placesDom.addClass(el, 'tide-table-container');

    if (settings.showStation) {
      renderTideStationInfo(el, tideData);
    }

    renderTideStationMapIfRequested(this.plugin, el, tideData, settings, ctx);

    const tidesByDay = groupTidesByDay(tideData.hilo);
    const sortedDays = Object.keys(tidesByDay).sort();

    const tidesContainer = _placesDom.createDiv(el, 'tide-days-container');

    for (const dayStr of sortedDays) {
      const dayTides = tidesByDay[dayStr];
      const dayCard = _placesDom.createDiv(tidesContainer, 'tide-day-card');

      const dayHeader = _placesDom.createDiv(dayCard, 'tide-day-header');
      const dayDate = new Date(dayStr + 'T12:00:00');

      const dateDiv = _placesDom.createDiv(dayHeader, 'tide-day-date');

      _placesDom.setText(dateDiv, dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

      const weekdayDiv = _placesDom.createSpan(dayHeader, 'tide-day-weekday');

      _placesDom.setText(weekdayDiv, dayDate.toLocaleDateString('en-US', { weekday: 'long' }));

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

      const eventsGrid = _placesDom.createDiv(dayCard, 'tide-events-grid');

      dayTides.forEach(tide => {
        const eventCard = _placesDom.createDiv(eventsGrid, 'tide-event-card');

        _placesDom.addClass(eventCard, tide.type === 'H' ? 'tide-high' : 'tide-low');

        _placesDom.setText(_placesDom.createDiv(eventCard, 'tide-event-type'), tide.type === 'H' ? 'High' : 'Low');
        _placesDom.setText(_placesDom.createDiv(eventCard, 'tide-event-time'), DateParser.formatTime12Hour(parseNaiveTimestamp(tide.timestamp_local)));

        const unitsSystem = tideUnitToUnitsSystem(tideData.units);
        const elevationUnit = getElevationUnit(unitsSystem);

        _placesDom.setText(_placesDom.createDiv(eventCard, 'tide-event-height'), `${tide.height.toFixed(2)} ${elevationUnit.abbreviation}`);
      });
    }

    createTideButtons({
      container: el, renderTarget: el, tideData, settings, ctx, source,
      service: this.tideDataService,
      label: 'Refresh tide cards',
      addRefreshButton: (target, options) => this.addFloatingRefreshButton(target, options),
      render: (data, refreshedSettings) => this.renderTideCards(el, data, refreshedSettings, ctx, source),
    });
  }

  private renderTideDescription(container: HTMLElement, description: TideDescription): void {
    const moonInfo = _placesDom.createDiv(container, 'tide-moon-info');

    _placesDom.setText(_placesDom.createDiv(moonInfo, 'tide-moon-description'), description.description);
  }

  private renderSolarEvents(container: HTMLElement, solarEvent: SolarEvent): void {
    const solarInfo = _placesDom.createDiv(container, 'tide-solar-info');

    const solarMain = _placesDom.createDiv(solarInfo, 'tide-solar-main');

    _placesDom.setText(_placesDom.createDiv(solarMain, 'tide-solar-sunrise'), `🌅 ${DateParser.formatTime12Hour(solarEvent.sunrise)}`);
    _placesDom.setText(_placesDom.createDiv(solarMain, 'tide-solar-sunset'), `🌇 ${DateParser.formatTime12Hour(solarEvent.sunset)}`);

    if (solarEvent.civil_twilight_begin && solarEvent.civil_twilight_end) {
      const solarGolden = _placesDom.createDiv(solarInfo, 'tide-solar-golden');

      _placesDom.setText(_placesDom.createDiv(solarGolden, 'tide-solar-dawn'), `Dawn ${DateParser.formatTime12Hour(solarEvent.civil_twilight_begin)}`);
      _placesDom.setText(_placesDom.createDiv(solarGolden, 'tide-solar-dusk'), `Dusk ${DateParser.formatTime12Hour(solarEvent.civil_twilight_end)}`);
    }
  }
}
