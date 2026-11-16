import * as _placesDom from 'places-shared/utils';
interface FreshnessMetadata {
  retrievedAt?: number;
  servedStale?: boolean;
}

export function renderFreshnessIndicator(container: HTMLElement, ...metadatas: Array<FreshnessMetadata | undefined>): void {
  const stale = metadatas.filter((metadata): metadata is FreshnessMetadata => Boolean(metadata?.servedStale));

  if (stale.length === 0) return;

  const oldest = Math.min(...stale.map(metadata => metadata.retrievedAt ?? Date.now()));

  _placesDom.createDiv(container, {
    cls: 'places-data-freshness places-data-freshness-stale',
    text: `Cached data from ${(new Date(oldest)).toLocaleString()}; refresh failed.`,
  });
}
