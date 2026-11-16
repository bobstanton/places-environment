import { type RenderOwner as Component, type BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import type { EnvironmentHost } from 'places-environment/core';
import type { MapHostServices } from "places-shared/services";

export interface EnvironmentPluginHost extends Pick<EnvironmentHost, 'locationFromNote' | 'getDefaultUnits'> {
  registerActions?(container: HTMLElement, ctx: MarkdownPostProcessorContext): void;
  registerCleanup(el: HTMLElement, ctx: MarkdownPostProcessorContext, cleanup: () => void): void;
  renderMarkdown?(markdown: string, container: HTMLElement, sourcePath: string, component: Component): Promise<void>;
  readKnapTemplateFile?(reference: string, sourcePath: string): Promise<string>;
  getHostServices?(): MapHostServices;
}
