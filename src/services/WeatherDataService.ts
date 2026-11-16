import { WeatherDataService as CoreWeatherDataService, type WeatherHost } from 'places-environment/core';
import { loggedRequestUrl } from "places-shared/utils";
import type PlacesEnvironmentPlugin from '../main';

export * from 'places-environment/core';

export function weatherHostFor(plugin: PlacesEnvironmentPlugin): WeatherHost {
  return {
    get: (cacheKey, retention) => plugin.get(cacheKey, retention),
    set: (cacheKey, data, retention) => plugin.set(cacheKey, data, retention),
    getDefaultUnits: () => plugin.getDefaultUnits(),
    locationFromNote: (sourcePath) => plugin.locationFromNote(sourcePath),
    fetchJson: async (url) => loggedRequestUrl({ url }),
    ...(plugin.apiUsage ? { apiUsage: plugin.apiUsage } : {}),
  };
}

export class WeatherDataService extends CoreWeatherDataService {
  constructor(plugin: PlacesEnvironmentPlugin) {
    super(weatherHostFor(plugin));
  }
}
