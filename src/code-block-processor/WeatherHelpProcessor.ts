import { MarkdownPostProcessorContext, loadPrism, setIcon, Component, App } from 'obsidian';
import { renderError } from "places-shared/utils";
import type { RenderContext } from '../generated-help/types.generated';
import type { ProviderTableDefinition } from 'vaultquery/api';
import { weatherTableDefinitions } from '../services/VaultQueryWeatherProvider';
import { tideTableDefinitions } from '../services/VaultQueryTideProvider';
import { solarTableDefinitions } from '../services/VaultQuerySolarProvider';

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
        if (key === 'vaultqueryTables') this.renderVaultQueryTables(parent);
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

  // Rendered from the same ProviderTableDefinitions that create the tables.
  private renderVaultQueryTables(container: HTMLElement): void {
    const definitions: ProviderTableDefinition[] = [...weatherTableDefinitions(), ...tideTableDefinitions(), ...solarTableDefinitions()];
    for (const definition of definitions) {
      container.createEl('h3').createEl('code', { text: definition.name });
      if (definition.description) container.createEl('p', { text: definition.description });

      const wrapper = container.createDiv('places-environment-help-table-wrapper');
      const table = wrapper.createEl('table', { cls: 'places-environment-help-table' });
      const head = table.createEl('thead').createEl('tr');
      for (const label of ['Column', 'Type', 'Notes']) head.createEl('th', { text: label });

      const body = table.createEl('tbody');
      for (const column of definition.columns) {
        const row = body.createEl('tr');
        row.createEl('td').createEl('code', { text: column.name });
        row.createEl('td', { text: column.type });
        const notes: string[] = [];
        if (definition.primaryKey.includes(column.name)) notes.push('primary key');
        else if (column.nullable === false) notes.push('required');
        row.createEl('td', { text: notes.join(', ') });
      }
    }
  }

  private renderHelp(el: HTMLElement, helpType: string): void {
    el.addClass('places-environment-help');

    const helpModule = this.helpModules.get(helpType);
    if (!helpModule) {
      renderError(el, { icon: '❓', title: 'Unknown Help Topic', message: `No help found for: ${helpType}` });
      return;
    }

    const helpContainer = el.createDiv('places-environment-help-container');
    // yaml display fences fall back to Obsidian's Prism at render time; load
    // it first, leaving the fallback with Prism.languages populated. Rendering
    // proceeds unhighlighted if Prism cannot load.
    void loadPrism().catch(() => undefined).then(() => {
      helpModule.render(helpContainer, this.createRenderContext());
    });
  }
}
