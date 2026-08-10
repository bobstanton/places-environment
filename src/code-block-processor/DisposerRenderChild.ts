import { MarkdownRenderChild } from 'obsidian';

// Runs a dispose callback when the rendered block leaves the DOM (note closed, block
// removed). Register per rendered element via ctx.addChild; pair with an explicit
// dispose on re-render, since re-rendering reuses the element and does not unload it.
export class DisposerRenderChild extends MarkdownRenderChild {
  constructor(containerEl: HTMLElement, private dispose: () => void) {
    super(containerEl);
  }

  onunload(): void {
    this.dispose();
  }
}
