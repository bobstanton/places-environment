import * as _placesDom from 'places-shared/utils';
import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import type { TideCodeBlockSettings, TideData, TideDataService } from 'places-environment/core';
import { copyToClipboard } from "places-shared/utils";
import { createFloatingCopyButton } from "places-shared/ui";
import { buildTideMarkdown } from '../utilities/TideTableData';
import type { RefreshButtonOptions } from './BaseEnvironmentProcessor';
import { renderFreshnessIndicator } from './FreshnessIndicator';

export function createTideButtons(options: {
  container: HTMLElement;
  renderTarget: HTMLElement;
  tideData: TideData;
  settings: TideCodeBlockSettings;
  service: TideDataService;
  ctx: MarkdownPostProcessorContext;
  source: string;
  label: string;
  addRefreshButton: (el: HTMLElement, options: RefreshButtonOptions) => HTMLElement;
  render: (data: TideData, settings: TideCodeBlockSettings) => void;
}): void {
  const { container, renderTarget, tideData, settings, service, ctx, source } = options;
  const buttonContainer = _placesDom.createDiv(container, 'places-floating-buttons');
  let markdown: string | undefined;

  createFloatingCopyButton({
    buttonContainer,
    onCopy: () => copyToClipboard(markdown ??= buildTideMarkdown(tideData, settings, date => service.interpolateHeightAtTime(tideData, date))),
  });
  options.addRefreshButton(container, {
    buttonContainer,
    errorEl: renderTarget,
    label: options.label,
    ctx,
    source,
    onRefresh: async () => {
      const refreshedSettings = service.parseCodeBlockSettings(source, ctx);

      refreshedSettings.forceRefresh = true;
      const refreshedData = await service.getTideData(refreshedSettings);

      options.render(refreshedData, refreshedSettings);
      renderFreshnessIndicator(renderTarget, refreshedData.metadata);
    },
  });
}
