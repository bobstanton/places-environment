import * as _placesDom from 'places-shared/utils';
import type { BlockRenderContext as MarkdownPostProcessorContext } from "places-shared/ui";
import type { MapHostServices } from "places-shared/services";
import type { MapPlace } from "places-shared/overlay";
import { createMapRenderPlan, resolveCameraIntent } from "places-shared/render";
import { resolveHostMapConfig } from "places-shared/services";
import { km, formatKmInSystem } from "places-shared/units";
import { formatDisplayCoordinate, logger } from "places-shared/utils";
import type { EnvironmentPluginHost } from '../blocks/EnvironmentPluginHost';
import { TideCodeBlockSettings, TideData, tideUnitToUnitsSystem } from 'places-environment/core';
import { tideStationTitle, tideStationTypeLabel } from './TideTableData';

const TIDE_MAP_HEIGHT = '300px';

export function renderTideStationMapIfRequested(plugin: EnvironmentPluginHost, container: HTMLElement, tideData: TideData, settings: TideCodeBlockSettings, ctx: MarkdownPostProcessorContext): void {
  if (!settings.showMap) return;

  const host = plugin.getHostServices?.();

  if (!host) return;
  void renderTideStationMap(host, container, tideData, settings.mapProvider, ctx).catch(error => {
    logger.scope('Tides').warn('Tide station map failed to render', error);
  });
}

export async function renderTideStationMap(host: MapHostServices, container: HTMLElement, tideData: TideData, mapProvider: string | undefined, ctx: MarkdownPostProcessorContext): Promise<void> {
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

  await host.maps.renderMapSurface({
    host: _placesDom.createDiv(container, { cls: 'tide-station-map-wrap' }),
    mapContainerClass: 'tide-station-map',
    height: TIDE_MAP_HEIGHT,
    providerName: config.mapProvider,
    ctx,
    renderPlan: plan,
  });
}
