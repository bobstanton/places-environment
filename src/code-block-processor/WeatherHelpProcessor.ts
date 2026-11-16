import * as _placesDom from 'places-shared/utils';
import { type MarkdownPostProcessorContext, Component, type App, loadPrism, setIcon } from "obsidian";
import { renderProviderTables } from "../core/blocks/renderProviderTables";
import { renderError } from "places-shared/utils";
import type { RenderContext } from '../generated-help/types.generated';

import * as weatherHelp from '../generated-help/weather-help.generated';
import * as weatherChartHelp from '../generated-help/weather-chart-help.generated';
import * as weatherTableHelp from '../generated-help/weather-table-help.generated';
import * as weatherTemplateHelp from '../generated-help/weather-template-help.generated';
import * as tideHelp from '../generated-help/tide-help.generated';
import * as tideTableHelp from '../generated-help/tide-table-help.generated';
import * as tideCardsHelp from '../generated-help/tide-cards-help.generated';
import * as tideChartHelp from '../generated-help/tide-chart-help.generated';
import * as solarHelp from '../generated-help/solar-help.generated';
import * as solarTableHelp from '../generated-help/solar-table-help.generated';
import * as solarChartHelp from '../generated-help/solar-chart-help.generated';
import * as vaultQueryHelp from '../generated-help/vaultquery-tables-help.generated';

// Shape emitted by md-to-obsidian-dom for each generated help module.
interface HelpModule {
  render: (container: HTMLElement, ctx: RenderContext) => void;
}

interface WeatherHelpPluginInterface {
  app: App;
}

export class WeatherHelpProcessor {
  private plugin: WeatherHelpPluginInterface;
  private component: Component;

  private readonly helpModules: Map<string, HelpModule> = new Map<string, HelpModule>([
    ['places-weather-help', weatherHelp],
    ['places-weather-chart-help', weatherChartHelp],
    ['places-weather-table-help', weatherTableHelp],
    ['places-weather-template-help', weatherTemplateHelp],
    ['places-tide-help', tideHelp],
    ['places-tide-table-help', tideTableHelp],
    ['places-tide-cards-help', tideCardsHelp],
    ['places-tide-chart-help', tideChartHelp],
    ['places-solar-help', solarHelp],
    ['places-solar-table-help', solarTableHelp],
    ['places-solar-chart-help', solarChartHelp],
    ['places-vaultquery-tables-help', vaultQueryHelp],
  ]);

  constructor(plugin: WeatherHelpPluginInterface) {
    this.plugin = plugin;
    this.component = new Component();
  }

  private createRenderContext(): RenderContext {
    return {
      app: this.plugin.app,
      component: this.component,
      renderDynamic: (parent: HTMLElement, key: string) => {
        if (key === 'vaultqueryTables') renderProviderTables(parent);
      },
      setIcon: (element: HTMLElement, iconId: string) => {
        setIcon(element, iconId);
      },
    };
  }

  processGeneralHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-weather-help');
  }

  processChartHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-weather-chart-help');
  }

  processTableHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-weather-table-help');
  }

  processTemplateHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-weather-template-help');
  }

  processTideHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-tide-help');
  }

  processTideTableHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-tide-table-help');
  }

  processTideCardsHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-tide-cards-help');
  }

  processTideChartHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-tide-chart-help');
  }

  processSolarHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-solar-help');
  }

  processSolarTableHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-solar-table-help');
  }

  processSolarChartHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-solar-chart-help');
  }

  processVaultQueryHelp(_source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): void {
    this.renderHelp(el, 'places-vaultquery-tables-help');
  }

  private renderHelp(el: HTMLElement, helpType: string): void {
    _placesDom.addClass(el, 'places-environment-help');

    const helpModule = this.helpModules.get(helpType);

    if (!helpModule) {
      renderError(el, { icon: '❓', title: 'Unknown Help Topic', message: `No help found for: ${helpType}` });

      return;
    }

    const helpContainer = _placesDom.createDiv(el, 'places-environment-help-container');

    void loadPrism().catch(() => undefined).then(() => {
      helpModule.render(helpContainer, this.createRenderContext());
    });
  }
}
