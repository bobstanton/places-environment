import { registerCodeBlockActions } from 'places-shared/obsidian/ui';
import { Plugin, App, Setting, MarkdownPostProcessorContext, MarkdownRenderer, Component, type SettingGroupItem } from 'obsidian';
import { NoaaApiService } from 'places-environment/core';
import { getLocationStringFromFrontmatter } from './utilities/FrontmatterUtilities';
import { SolarApiService } from 'places-environment/core';
import { TideDataService } from 'places-environment/core';
import { TideTableProcessor } from './core/blocks/TideTableProcessor';
import { TideCardsProcessor } from './core/blocks/TideCardsProcessor';
import { TideChartProcessor } from './core/blocks/TideChartProcessor';
import { UnitsSystem } from "places-shared/units";

import { SolarTableProcessor } from './core/blocks/SolarTableProcessor';
import { SolarChartProcessor } from './core/blocks/SolarChartProcessor';

import { WeatherDataService } from './services/WeatherDataService';
import { WeatherProcessor } from './core/blocks/WeatherProcessor';
import { WeatherChartProcessor } from './core/blocks/WeatherChartProcessor';
import { WeatherTableProcessor } from './core/blocks/WeatherTableProcessor';
import { WeatherTemplateProcessor } from './core/blocks/WeatherTemplateProcessor';
import { WeatherHelpProcessor } from './code-block-processor/WeatherHelpProcessor';
import { DisposerRenderChild } from './code-block-processor/DisposerRenderChild';
import { createPlacesWeatherProvider } from 'places-environment/core';
import { createPlacesTideProvider } from 'places-environment/core';
import { createPlacesSolarProvider } from 'places-environment/core';
import { registerVaultQueryTableProviders, type ManagedVaultQueryTableProviderRegistration } from 'vaultquery/api';

import { IPlaceExtensionSettings, IPlacesExtensionHostSettings, DEFAULT_SETTINGS as MAIN_DEFAULT_SETTINGS } from "places-shared/settings";
import { readKnapTemplateFile, IPlacePluginExtension, IPlacePluginExtensionExports, IPlacesHostServices, registerPlaceExtensionLifecycle, PLACES_EXTENSION_API_VERSION, type ExtensionSettingsGroup } from "places-shared/obsidian/services";
import { getErrorMessage, scalarToString, Utilities, ICacheEntry, renderError, logger, configureRequestLogging } from "places-shared/utils";
import { createFloatingRefreshButton } from "places-shared/obsidian/ui";
import { initOverlayCompression } from "places-shared/compression";

import { ALL_CODE_BLOCK_DEFINITIONS, ALL_HIGHLIGHT_CONFIGS } from './CodeBlockDefinitions';
import { DEFAULT_MAX_CACHE_ENTRIES, evictOrdinaryCacheEntries, parseMaxCacheEntries } from './services/PersistentCachePolicy';
import { decodeCachePayload, encodeCachePayload, isZstdCachePayload } from './services/PersistentCacheCodec';
import { createWeatherPopupRenderer } from './popup/WeatherPopupRenderer';

import './styles.css';
import 'places-shared/block-styles.css';
import 'places-shared/error-styles.css';
import 'places-shared/loading-styles.css';
import 'places-shared/settings-trace-styles.css';

const DEFAULT_SETTINGS: Record<string, string> = {
  enableCache: 'true',
  maxCacheEntries: String(DEFAULT_MAX_CACHE_ENTRIES),
  cache: '{}',
  lastCleanup: '0'
};

function isCacheDataRecord(value: unknown): value is Record<string, ICacheEntry> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || !('k' in entry) || !('t' in entry) || !('d' in entry)) return false;
    if (typeof entry.k !== 'string' || typeof entry.t !== 'number') return false;
  }

  return true;
}

export default class PlacesEnvironmentPlugin extends Plugin implements IPlacePluginExtension {
  // Created in getPlaceExports, once an API key is available.
  private noaaService: NoaaApiService | null = null;
  private solarService: SolarApiService | null = null;
  private tideDataService: TideDataService | null = null;
  private tableProcessor: TideTableProcessor | null = null;
  private cardsProcessor: TideCardsProcessor | null = null;
  private chartProcessor: TideChartProcessor | null = null;

  private solarTableProcessor: SolarTableProcessor | null = null;
  private solarChartProcessor: SolarChartProcessor | null = null;

  private weatherDataService: WeatherDataService | null = null;
  private weatherProcessor: WeatherProcessor | null = null;
  private weatherChartProcessor: WeatherChartProcessor | null = null;
  private weatherTableProcessor: WeatherTableProcessor | null = null;
  private weatherTemplateProcessor: WeatherTemplateProcessor | null = null;
  private weatherHelpProcessor: WeatherHelpProcessor | null = null;

  private extensionSettings!: IPlaceExtensionSettings;
  private mainSettings: IPlacesExtensionHostSettings | null = null;
  private hostServices!: IPlacesHostServices;
  private cacheData: Record<string, ICacheEntry> = {};
  private decodedCacheData = new Map<string, { t: number; d: unknown }>();
  private cacheSaveTimer: number | null = null;
  private cacheDirty = false;
  private vaultQueryTables: ManagedVaultQueryTableProviderRegistration | null = null;
  private vaultQueryRegistration: Promise<ManagedVaultQueryTableProviderRegistration> | null = null;

  getPlaceExports(_app: App, extensionSettings: IPlaceExtensionSettings, mainSettings: IPlacesExtensionHostSettings, host: IPlacesHostServices): IPlacePluginExtensionExports {
    configureRequestLogging(mainSettings.developerMode);
    Utilities.applyDefaults(extensionSettings, DEFAULT_SETTINGS);

    this.extensionSettings = extensionSettings;
    this.mainSettings = mainSettings;
    this.hostServices = host;

    const cacheStore = {
      get: (key: string) => this.get(key),
      set: (key: string, data: unknown) => this.set(key, data),
    };

    this.noaaService = new NoaaApiService(cacheStore, host.apiUsage);
    this.solarService = new SolarApiService(cacheStore, host.apiUsage);
    this.tideDataService = new TideDataService(this.noaaService, this, this.solarService);
    this.tableProcessor = new TideTableProcessor(this, this.tideDataService);
    this.cardsProcessor = new TideCardsProcessor(this, this.tideDataService);
    this.chartProcessor = new TideChartProcessor(this, this.tideDataService);

    this.solarTableProcessor = new SolarTableProcessor(this, this.solarService);
    this.solarChartProcessor = new SolarChartProcessor(this, this.solarService);

    this.weatherDataService = new WeatherDataService(this);
    this.weatherProcessor = new WeatherProcessor(this, this.weatherDataService);
    this.weatherChartProcessor = new WeatherChartProcessor(this, this.weatherDataService);
    this.weatherTableProcessor = new WeatherTableProcessor(this, this.weatherDataService);
    this.weatherTemplateProcessor = new WeatherTemplateProcessor(this, this.weatherDataService);
    this.weatherHelpProcessor = new WeatherHelpProcessor(this);

    void this.registerVaultQueryProviders();

    return {
      apiVersion: PLACES_EXTENSION_API_VERSION,
      codeBlockProcessors: this.getCodeBlockProcessors(),
      codeBlockDefinitions: ALL_CODE_BLOCK_DEFINITIONS,
      highlightConfigs: ALL_HIGHLIGHT_CONFIGS,
      popupRenderers: [createWeatherPopupRenderer()],
      settingsGroup: this.settingsGroup(extensionSettings),
      dispose: () => this.disposeVaultQueryProviders(),
    };
  }

  async onload() {
    await initOverlayCompression();
    const savedData: unknown = await this.loadData();

    if (typeof savedData === 'object' && savedData !== null && 'cacheData' in savedData && isCacheDataRecord(savedData.cacheData)) {
      this.cacheData = savedData.cacheData;
    }

    registerPlaceExtensionLifecycle(this);
  }
  
  private createEnvironmentBlock(type: string, label: string, getHandler: () => ((source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void | Promise<void>) | null, refreshLabel?: string): NonNullable<IPlacePluginExtensionExports['codeBlockProcessors']>[number] {
    return { blockType: type, sourceFormat: type.endsWith('-template') ? 'yaml-template' : 'yaml', indexDependencies: 'notes', colonTextKeys: ['coordinates', 'location'], processor: async (source, el, ctx) => {
      const handler = getHandler();

      if (!handler) {
        this.renderProcessorError(el, label, 'Service not initialized.');

        return;
      }

      try {
        await handler(source, el, ctx);
      } catch (error) {
        logger.scope('Places').error(`Error processing ${label}:`, error);

        if (refreshLabel) {
          this.renderRefreshableProcessorError(el, ctx, label, (error as Error).message, refreshLabel, async () => {
            const retry = getHandler();

            if (!retry) {
              throw new Error('Service not initialized.');
            }

            await retry(source, el, ctx);
          });
        } else {
          this.renderProcessorError(el, label, (error as Error).message);
        }
      }
    }};
  }

  private getCodeBlockProcessors(): NonNullable<IPlacePluginExtensionExports['codeBlockProcessors']> {
    const dataBlock = (get: () => { processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> } | null) => () => {
      const processor = get();

      return processor ? processor.processCodeBlock.bind(processor) : null;
    };
    const helpBlock = (invoke: (help: WeatherHelpProcessor, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void) => () => {
      const help = this.weatherHelpProcessor;

      return help ? (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => invoke(help, source, el, ctx) : null;
    };

    return [
      this.createEnvironmentBlock("places-tide-table", "tide table", dataBlock(() => this.tableProcessor)),
      this.createEnvironmentBlock("places-tide-cards", "tide cards", dataBlock(() => this.cardsProcessor)),
      this.createEnvironmentBlock("places-tide-chart", "tide chart", dataBlock(() => this.chartProcessor)),
      this.createEnvironmentBlock("places-solar-table", "solar table", dataBlock(() => this.solarTableProcessor)),
      this.createEnvironmentBlock("places-solar-chart", "solar chart", dataBlock(() => this.solarChartProcessor)),
      this.createEnvironmentBlock("places-weather", "weather", dataBlock(() => this.weatherProcessor), "Refresh weather"),
      this.createEnvironmentBlock("places-weather-chart", "weather chart", dataBlock(() => this.weatherChartProcessor), "Refresh weather chart"),
      this.createEnvironmentBlock("places-weather-table", "weather table", dataBlock(() => this.weatherTableProcessor), "Refresh weather table"),
      this.createEnvironmentBlock("places-weather-template", "weather template", dataBlock(() => this.weatherTemplateProcessor), "Refresh weather template"),
      this.createEnvironmentBlock("places-tide-help", "tide help", helpBlock((help, source, el, ctx) => help.processTideHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-tide-table-help", "tide table help", helpBlock((help, source, el, ctx) => help.processTideTableHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-tide-cards-help", "tide cards help", helpBlock((help, source, el, ctx) => help.processTideCardsHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-tide-chart-help", "tide chart help", helpBlock((help, source, el, ctx) => help.processTideChartHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-solar-help", "solar help", helpBlock((help, source, el, ctx) => help.processSolarHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-solar-table-help", "solar table help", helpBlock((help, source, el, ctx) => help.processSolarTableHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-solar-chart-help", "solar chart help", helpBlock((help, source, el, ctx) => help.processSolarChartHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-weather-help", "weather help", helpBlock((help, source, el, ctx) => help.processGeneralHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-weather-chart-help", "weather chart help", helpBlock((help, source, el, ctx) => help.processChartHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-weather-table-help", "weather table help", helpBlock((help, source, el, ctx) => help.processTableHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-weather-template-help", "weather template help", helpBlock((help, source, el, ctx) => help.processTemplateHelp(source, el, ctx))),
      this.createEnvironmentBlock("places-vaultquery-tables-help", "vaultquery tables help", helpBlock((help, source, el, ctx) => help.processVaultQueryHelp(source, el, ctx))),
    ];
  }

  private async registerVaultQueryProviders(): Promise<void> {
    if (!this.weatherDataService || !this.tideDataService) {
      logger.scope('Places').warn('[Environment VaultQuery] Provider registration skipped: services are not initialized');

      return;
    }

    if (this.vaultQueryRegistration !== null) {
      logger.scope('Places').info('[Environment VaultQuery] Provider registration skipped: managed registration already exists');

      return;
    }

    const registration = registerVaultQueryTableProviders(this.app, {
      pluginId: 'places-environment',
      providers: [
        createPlacesWeatherProvider(this.weatherDataService),
        createPlacesTideProvider(this.tideDataService),
        createPlacesSolarProvider(this, this.solarService!),
      ],
      logger: {
        debug: message => logger.scope('Places').debug(message),
        info: message => logger.scope('Places').info(message),
        warn: message => logger.scope('Places').warn(message),
        error: (message, error) => logger.scope('Places').error(message, error),
      },
    });

    this.vaultQueryRegistration = registration;
    const tables = await registration;

    if (this.vaultQueryRegistration === registration) {
      this.vaultQueryTables = tables;
    }
  }

  onunload() {
    if (this.cacheSaveTimer !== null) {
      window.clearTimeout(this.cacheSaveTimer);
      this.cacheSaveTimer = null;
    }

    void this.flushCacheSave();
    void this.disposeVaultQueryProviders();

    this.noaaService = null;
    this.tideDataService = null;
    this.tableProcessor = null;
    this.chartProcessor = null;

    this.solarTableProcessor = null;
    this.solarChartProcessor = null;

    this.weatherDataService = null;
    this.weatherProcessor = null;
    this.weatherChartProcessor = null;
    this.weatherTableProcessor = null;
    this.weatherTemplateProcessor = null;
    this.weatherHelpProcessor = null;
  }

  private async disposeVaultQueryProviders(): Promise<void> {
    const registration = this.vaultQueryRegistration;
    const existingTables = this.vaultQueryTables;

    this.vaultQueryRegistration = null;
    this.vaultQueryTables = null;
    const tables = registration !== null ? await registration.catch(() => null) : existingTables;

    await tables?.dispose();
  }

  get(cacheKey: string, retention?: 'forever'): ICacheEntry | null {
    const entry = this.cacheData[cacheKey];

    if (entry && retention === 'forever' && entry.retention !== 'forever') {
      entry.retention = 'forever';
      this.scheduleCacheSave();
    }

    if (!entry) return null;
    if (!isZstdCachePayload(entry.d)) return entry;

    const memo = this.decodedCacheData.get(cacheKey);

    if (memo?.t === entry.t) {
      return { ...entry, d: memo.d };
    }

    try {
      const decoded = decodeCachePayload(entry.d);

      this.decodedCacheData.set(cacheKey, { t: entry.t, d: decoded });

      return { ...entry, d: decoded };
    } catch (error) {
      logger.scope('Cache').warn('Failed to decode environmental cache entry', { cacheKey, error });

      return null;
    }
  }

  locationFromNote(sourcePath: string | undefined): string | null {
    return sourcePath ? getLocationStringFromFrontmatter(this.app, sourcePath) : null;
  }

  registerCleanup(el: HTMLElement, ctx: MarkdownPostProcessorContext, cleanup: () => void): void {
    ctx.addChild(new DisposerRenderChild(el, cleanup));
  }

  readKnapTemplateFile(reference: string, sourcePath: string): Promise<string> {
    return readKnapTemplateFile(this.app, reference, sourcePath);
  }

  renderMarkdown(markdown: string, container: HTMLElement, sourcePath: string, owner: import('places-shared/ui').RenderOwner): Promise<void> {
    const component = new Component();

    component.load();
    owner.register(() => component.unload());

    return MarkdownRenderer.render(this.app, markdown, container, sourcePath, component);
  }

  registerActions(container: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    registerCodeBlockActions(container, ctx);
  }

  get apiUsage(): IPlacesHostServices['apiUsage'] {
    return this.hostServices?.apiUsage;
  }

  getDefaultUnits(): UnitsSystem {
    // mainSettings is null only before getPlaceExports has run, and the code
    // blocks that consult this are not registered until it has.
    return this.mainSettings?.units ?? MAIN_DEFAULT_SETTINGS.units;
  }

  getHostServices(): IPlacesHostServices {
    return this.hostServices;
  }

  getMainSettings(): IPlacesExtensionHostSettings {
    return this.mainSettings ?? MAIN_DEFAULT_SETTINGS;
  }

  async set(cacheKey: string, data: unknown, retention?: 'forever'): Promise<void> {
    const timestamp = Date.now();
    const payload = encodeCachePayload(data);

    this.cacheData[cacheKey] = {
      k: cacheKey,
      t: timestamp,
      d: payload,
      ...(retention === 'forever' ? { retention } : {})
    };
    this.decodedCacheData.set(cacheKey, { t: timestamp, d: data });

    // Evict-on-write only. Explicitly permanent entries neither count toward
    // the configurable cap nor participate in capacity eviction.
    evictOrdinaryCacheEntries(
      this.cacheData,
      parseMaxCacheEntries(this.extensionSettings?.maxCacheEntries),
    );

    this.scheduleCacheSave();
  }

  // saveData rewrites the whole multi-megabyte cache file. Writes are coalesced
  // into one debounced flush; at most the last two seconds of cache entries are
  // lost on a hard crash.
  private scheduleCacheSave(): void {
    this.cacheDirty = true;
    if (this.cacheSaveTimer !== null) return;
    this.cacheSaveTimer = window.setTimeout(() => {
      this.cacheSaveTimer = null;
      void this.flushCacheSave();
    }, 2000);
  }

  private async flushCacheSave(): Promise<void> {
    if (!this.cacheDirty) return;
    this.cacheDirty = false;

    await this.saveData({ cacheData: this.cacheData });
  }

  getSize(): { count: number; sizeKB: number } {
    const count = Object.keys(this.cacheData).length;
    const sizeBytes = JSON.stringify(this.cacheData).length;
    const sizeKB = Math.round(sizeBytes / 1024 * 100) / 100;

    return { count, sizeKB };
  }

  async clear(): Promise<void> {
    this.cacheData = {};
    this.decodedCacheData.clear();
    this.cacheDirty = false;

    if (this.cacheSaveTimer !== null) {
      window.clearTimeout(this.cacheSaveTimer);
      this.cacheSaveTimer = null;
    }

    await this.saveData({ cacheData: this.cacheData });
  }

  private renderProcessorError(el: HTMLElement, processorType: string, message: string): void {
    el.empty();
    renderError(el, { icon: '⚠️', title: `${processorType} Error`, message });
  }

  private renderRefreshableProcessorError(el: HTMLElement, ctx: MarkdownPostProcessorContext, processorType: string, message: string, refreshLabel: string, onRefresh: () => Promise<void>): void {
    el.empty();
    const errorContainer = renderError(el, { icon: '⚠️', title: `${processorType} Error`, message });
    const buttonContainer = errorContainer.createDiv('places-floating-buttons');

    createFloatingRefreshButton({
      buttonContainer,
      ctx,
      ariaLabel: refreshLabel,
      onRefresh,
      onError: (error) => {
        this.renderRefreshableProcessorError(
          el,
          ctx,
          processorType,
          getErrorMessage(error),
          refreshLabel,
          onRefresh
        );
      }
    });
  }

  private settingsGroup(settings: IPlaceExtensionSettings): ExtensionSettingsGroup {
    const cacheItems: SettingGroupItem[] = [
      {
        name: 'Enable caching',
        desc: 'Cache environmental data for later use.',
        control: { type: 'toggle', key: 'enableCache' },
      },
      {
        name: 'Maximum cached entries',
        desc: 'Maximum ordinary entries retained in the environment cache.',
        control: { type: 'number', key: 'maxCacheEntries', placeholder: String(DEFAULT_MAX_CACHE_ENTRIES), min: 1, max: 10000 },
      },
      {
        name: 'Cache information',
        render: (setting) => this.renderCacheInformation(setting, settings),
      },
    ];
    const attributionItem: SettingGroupItem = {
      name: 'Data attribution',
      searchable: false,
      render: (setting) => {
        setting.settingEl.empty();
        this.renderAttribution(setting.settingEl);
      },
    };

    return {
      heading: 'Environment',
      category: 'feature',
      displayValue: () => settings.enableCache === 'false' ? 'Cache off' : 'Cache on',
      items: [...cacheItems, attributionItem],
      pageItems: [
        { type: 'group', heading: 'Cache', items: cacheItems },
        { type: 'group', heading: 'Data sources', items: [attributionItem] },
      ],
      getValue: (key) => {
        if (key === 'enableCache') return settings.enableCache !== 'false';  
        if (key === 'maxCacheEntries') return parseMaxCacheEntries(settings.maxCacheEntries);

        return settings[key];
      },
      setValue: (key, value) => {
        if (key === 'enableCache') {
          settings.enableCache = String(value === true);

          return;
        }

        if (key === 'maxCacheEntries') {
          const maxEntries = parseMaxCacheEntries(scalarToString(value));

          settings.maxCacheEntries = String(maxEntries);
          evictOrdinaryCacheEntries(this.cacheData, maxEntries);
          this.scheduleCacheSave();

          return;
        }

        settings[key] = scalarToString(value);
      },
    };
  }

  private renderAttribution(el: HTMLElement): void {
    const attributionEl = el.createDiv({ cls: 'places-environment-attribution' });

    const tideDataP = attributionEl.createEl('p');
    const tideDataStrong = tideDataP.createEl('strong');

    tideDataStrong.setText('🌊 Tide data:');
    tideDataP.appendText(' ');
    const tideDataLink = tideDataP.createEl('a');

    tideDataLink.href = 'https://tidesandcurrents.noaa.gov/';
    tideDataLink.target = '_blank';
    tideDataLink.rel = 'noopener';
    tideDataLink.setText('NOAA tides & currents');

    const solarDataP = attributionEl.createEl('p');
    const solarDataStrong = solarDataP.createEl('strong');

    solarDataStrong.setText('🌅 Sunrise/sunset data:');
    solarDataP.appendText(' ');
    const solarDataLink = solarDataP.createEl('a');

    solarDataLink.href = 'https://sunrise-sunset.org/';
    solarDataLink.target = '_blank';
    solarDataLink.rel = 'noopener';
    solarDataLink.setText('sunrise-sunset.org');

    const weatherDataP = attributionEl.createEl('p');
    const weatherDataStrong = weatherDataP.createEl('strong');

    weatherDataStrong.setText('🌤️ Weather data:');
    weatherDataP.appendText(' ');
    const weatherDataLink = weatherDataP.createEl('a');

    weatherDataLink.href = 'https://open-meteo.com/';
    weatherDataLink.target = '_blank';
    weatherDataLink.rel = 'noopener';
    weatherDataLink.setText('Weather data by Open-Meteo.com');

    const disclaimerP = attributionEl.createEl('p', { cls: 'places-environment-disclaimer' });

    disclaimerP.setText('Data comes from these free public APIs; their usage terms apply.');
  }

  private renderCacheInformation(setting: Setting, settings: IPlaceExtensionSettings): void {
    const { count, sizeKB } = this.getSize();
    const lastCleanup = parseInt(settings.lastCleanup || '0');

    let descText = `Cache contains ${count} entries using ${sizeKB} KB.`;

    if (count > 0) {
      descText += ` Cache entries are automatically cleaned up after 30 days.`;

      const cleanupDate = lastCleanup > 0 ? new Date(lastCleanup).toLocaleDateString() : 'Never';

      descText += ` Last cleanup: ${cleanupDate} (cleanup runs every 7 days).`;
    }

    setting.setDesc(descText);
    setting.addButton(button => {
      button.setButtonText('Clear cache');
      button.setDestructive();
      button.onClick(async () => {
        await this.clear();
        const newDescText = `Cache contains 0 entries using 0 KB. Cache entries are automatically cleaned up after 30 days or when the plugin is updated.`;

        setting.setDesc(newDescText);
        button.setButtonText('Cache cleared!');
        window.setTimeout(() => {
          button.setButtonText('Clear cache');
        }, 2000);
      });
    });
  }
}
