import { type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import { buildSettingsTrace, describeCachePolicy, parseCodeBlockYaml, SettingsTraceLayer, type CachePolicy } from "places-shared/settings";
import { renderSettingsTraceView } from "places-shared/ui";
import type { EnvironmentPluginHost } from './EnvironmentPluginHost';

// buildSettingsTrace lines layers up by key; blocks write cache:, resolved
// settings store cachePolicy.
function withReadableCachePolicy(values: object): Record<string, unknown> {
  const { cachePolicy, ...rest } = values as Record<string, unknown> & { cachePolicy?: CachePolicy };

  return cachePolicy ? { ...rest, cache: describeCachePolicy(cachePolicy) } : { ...rest };
}

export function renderSettingsTraceIfRequested(el: HTMLElement, source: string, ctx: MarkdownPostProcessorContext, plugin: EnvironmentPluginHost, blockName: string, defaults: object, resolved: object): void {
  const pairs = parseCodeBlockYaml(source);

  if (String(pairs.debug).toLowerCase() !== 'settings') return;

  const frontmatterLocation = plugin.locationFromNote(ctx.sourcePath);
  const layers: SettingsTraceLayer[] = [
    { name: 'Default', values: withReadableCachePolicy(defaults) },
    { name: 'Global', values: { units: plugin.getDefaultUnits() } },
    { name: 'Frontmatter', values: frontmatterLocation ? { location: frontmatterLocation } : {} },
    { name: 'Block', values: pairs },
  ];

  renderSettingsTraceView(el, buildSettingsTrace(layers, withReadableCachePolicy(resolved)), `Settings resolution (${blockName})`);
}
