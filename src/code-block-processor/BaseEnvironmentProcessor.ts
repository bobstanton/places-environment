import { MarkdownPostProcessorContext } from 'obsidian';
import type PlacesEnvironmentPlugin from '../main';
import { NamedCoordinate, parseNamedCoordinate } from "places-shared/geo";
import { getErrorMessage, renderError as sharedRenderError } from "places-shared/utils";
import { createFloatingRefreshButton } from "places-shared/ui";
import { CodeBlockReader } from "places-shared/settings";
import { getLocationStringFromFrontmatter } from '../utilities/FrontmatterUtilities';
import { DisposerRenderChild } from './DisposerRenderChild';

interface Disposable {
  destroy(): void;
}

export interface RenderErrorOptions {
  message: string;
  ctx?: MarkdownPostProcessorContext;
  source?: string;
  onRefresh?: () => Promise<void>;
  refreshLabel?: string;
}

export interface CodeBlockRenderOptions {
  loadingClass: string;
  loadingText: string;
  errorMessage: string;
  refreshLabel: string;
  render: (forceRefresh: boolean) => Promise<HTMLElement>;
  onError?: (error: unknown) => void;
}

export interface RefreshButtonOptions {
  label: string;
  buttonContainer?: HTMLElement;
  loadingClass?: string;
  loadingText?: string;
  errorEl?: HTMLElement;
  ctx?: MarkdownPostProcessorContext;
  source?: string;
  onRefresh: () => Promise<void>;
  onError?: (error: unknown) => void;
}

export abstract class BaseEnvironmentProcessor {
  private chartsByElement = new WeakMap<HTMLElement, Disposable[]>();
  private chartDisposerRegistered = new WeakSet<HTMLElement>();

  // Call before re-rendering the element.
  protected disposeTrackedCharts(el: HTMLElement): void {
    const charts = this.chartsByElement.get(el);
    if (!charts) return;
    for (const chart of charts) chart.destroy();
    this.chartsByElement.set(el, []);
  }

  protected trackChart(el: HTMLElement, ctx: MarkdownPostProcessorContext, chart: Disposable): void {
    if (!this.chartDisposerRegistered.has(el)) {
      this.chartDisposerRegistered.add(el);
      ctx.addChild(new DisposerRenderChild(el, () => this.disposeTrackedCharts(el)));
    }
    const charts = this.chartsByElement.get(el) ?? [];
    charts.push(chart);
    this.chartsByElement.set(el, charts);
  }

  protected plugin: PlacesEnvironmentPlugin;
  private static readonly LOADING_CLASSES = [
    'tide-table-loading',
    'tide-chart-loading',
    'weather-widget-loading',
    'weather-chart-loading',
    'weather-forecast-loading',
    'weather-template-loading',
    'weather-table-loading',
    'solar-table-loading',
    'solar-chart-loading',
  ];

  constructor(plugin: PlacesEnvironmentPlugin) {
    this.plugin = plugin;
  }

  // The places-* classes are styled by the main plugin.
  protected renderLoadingState(el: HTMLElement, loadingText: string = 'Loading data...'): void {
    el.empty();

    const loadingDiv = el.createDiv('places-loading');
    loadingDiv.createDiv('places-loading-spinner-sm');
    const text = loadingDiv.createDiv('places-loading-text');
    text.setText(loadingText);
  }

  protected renderError(el: HTMLElement, options: RenderErrorOptions): void {
    const { message, ctx, source, onRefresh, refreshLabel = 'Refresh' } = options;

    el.empty();
    el.removeClass('places-loading');
    for (const className of BaseEnvironmentProcessor.LOADING_CLASSES) {
      el.removeClass(className);
    }

    const errorContainer = sharedRenderError(el, { icon: '⚠️', title: 'Error', message });

    if (onRefresh) {
      const buttonContainer = errorContainer.createDiv('places-floating-buttons');
      createFloatingRefreshButton({
        buttonContainer,
        ariaLabel: refreshLabel,
        onRefresh,
        onError: (error) => {
          this.renderError(el, {
            message: getErrorMessage(error),
            ctx,
            source,
            onRefresh,
            refreshLabel
          });
        }
      });
    }
  }

  protected async renderCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, options: CodeBlockRenderOptions): Promise<void> {
    const renderFresh = async (forceRefresh: boolean): Promise<void> => {
      el.addClass(options.loadingClass);
      this.renderLoadingState(el, options.loadingText);
      try {
        await options.render(forceRefresh);
      } finally {
        el.removeClass(options.loadingClass);
      }
    };

    try {
      await renderFresh(false);
    } catch (error) {
      options.onError?.(error);
      this.renderError(el, {
        message: error instanceof Error ? error.message : options.errorMessage,
        ctx,
        source,
        onRefresh: () => renderFresh(true),
        refreshLabel: options.refreshLabel
      });
    }
  }

  protected addFloatingRefreshButton(el: HTMLElement, options: RefreshButtonOptions): HTMLElement {
    const buttonContainer = options.buttonContainer ?? el.createDiv('places-floating-buttons');

    const runRefresh = async (): Promise<void> => {
      if (options.loadingClass) {
        el.addClass(options.loadingClass);
      }
      try {
        await options.onRefresh();
      } finally {
        if (options.loadingClass) {
          el.removeClass(options.loadingClass);
        }
      }
    };

    return createFloatingRefreshButton({
      buttonContainer,
      ariaLabel: options.label,
      onRefresh: runRefresh,
      onError: (error) => {
        options.onError?.(error);
        this.renderError(options.errorEl ?? el, {
          message: getErrorMessage(error),
          ctx: options.ctx,
          source: options.source,
          onRefresh: runRefresh,
          refreshLabel: options.label
        });
      }
    });
  }

  protected getLocation(block: CodeBlockReader, ctx: MarkdownPostProcessorContext): NamedCoordinate {
    const locationString = block.text('location') ?? getLocationStringFromFrontmatter(this.plugin.app, ctx.sourcePath);

    if (!locationString) {
      throw new Error('No location found. Requires "location: lat, lon" in the code block or a Location frontmatter property.');
    }

    const parsed = parseNamedCoordinate(locationString);
    if (!parsed) {
      throw new Error('Invalid location format. Expected "latitude, longitude"');
    }
    return parsed;
  }
}
