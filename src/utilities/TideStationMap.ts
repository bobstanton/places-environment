import { MarkdownPostProcessorContext } from 'obsidian';
import type { IPlacesHostServices } from "places-shared/services";
import type { MapPlace } from "places-shared/overlay";
import { createMapRenderPlan, resolveCameraIntent } from "places-shared/render";
import { resolveHostMapConfig } from "places-shared/services";
import { km, formatKmInSystem } from "places-shared/units";
import { formatDisplayCoordinate, logger } from "places-shared/utils";
import type PlacesEnvironmentPlugin from '../main';
import { TideCodeBlockSettings, TideData, tideUnitToUnitsSystem } from '../types';
import { tideStationTitle, tideStationTypeLabel } from './TideTableData';

const TIDE_MAP_HEIGHT = '300px';

export function renderTideStationMapIfRequested(plugin: PlacesEnvironmentPlugin, container: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, ctx: MarkdownPostProcessorContext): void {
  if (!settings.showMap) return;

  const host = plugin.getHostServices();
  void renderTideStationMap(host, container, tideData, settings.mapProvider, ctx).catch(error => {
    logger.scope('Tides').warn('Tide station map failed to render', error);
  });
}

// The requested location comes from fetch-time metadata; pre-existing cache
// entries lack it and show the station alone.
export async function renderTideStationMap(host: IPlacesHostServices, container: HTMLElement, tideData: TideData, mapProvider: string | undefined, ctx: MarkdownPostProcessorContext): Promise<void> {
  const unitsSystem = tideUnitToUnitsSystem(tideData.units);
  const station = tideData.station;

  const places: MapPlace[] = [{
    id: `tide-station:${station.id}`,
    latitude: station.lat,
    longitude: station.lon,
    name: tideStationTitle(station),
    icon: '🌊',
    subtitle: [
      tideStationTypeLabel(station.type),
      station.distance_km !== undefined ? `${formatKmInSystem(km(station.distance_km), unitsSystem, 1)} from the requested location` : undefined,
    ].filter(Boolean).join(' · ') || undefined,
  }];

  const requested = tideData.metadata.requestedLocation;
  if (requested) {
    places.push({
      id: 'tide-requested-location',
      latitude: requested.latitude,
      longitude: requested.longitude,
      name: 'Requested location',
      icon: '📍',
      subtitle: formatDisplayCoordinate(requested),
    });
  }

  const blockSettings = {
    mapProvider: host.maps.resolveMapProvider(mapProvider),
    height: TIDE_MAP_HEIGHT,
    width: '100%',
    showLabels: true,
    poiDiscovery: false,
  };
  const { config } = resolveHostMapConfig(host, blockSettings, places.length);
  const source = { path: ctx.sourcePath };
  const plan = createMapRenderPlan({ surfaceKind: 'other', places, config, clusteringEnabled: false, source, camera: resolveCameraIntent(config, source) });

  const mapContainer = container.createDiv({ cls: 'tide-station-map-wrap' }).createDiv({ cls: 'tide-station-map' });
  const rendered = await host.maps.renderMapSurface({
    host: mapContainer.parentElement ?? mapContainer,
    mapContainer,
    providerName: config.mapProvider,
    ctx,
    renderPlan: plan,
  });
  if (!rendered) {
    logger.scope('Tides').debug('Tide station map did not render', { provider: config.mapProvider });
  }
}
