// NOAA CO-OPS API (tides & currents)

import { loggedRequestUrl as requestUrl } from "places-shared/utils";
import { DistanceCalculator } from "places-shared/geo";

const APPLICATION_ID = 'Places-Obsidian';

export type NoaaDatum = 'CRD' | 'IGLD' | 'LWD' | 'MHHW' | 'MHW' | 'MTL' | 'MSL' | 'MLW' | 'MLLW' | 'NAVD' | 'STND';
export type NoaaUnits = 'metric' | 'english';
export type NoaaTimeZone = 'gmt' | 'lst' | 'lst_ldt';
export type NoaaPredictionInterval = 'h' | 'hilo' | '1' | '5' | '6' | '10' | '15' | '30' | '60';

export interface TidePredictionOptions {
  datum?: NoaaDatum;
  units?: NoaaUnits;
  timeZone?: NoaaTimeZone;
  interval?: NoaaPredictionInterval;
}

export interface CoopsStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  state: string;
  type?: string;
  tidal?: boolean;
  greatlakes?: boolean;
  forecast?: boolean;
  affiliations?: string;
}

export interface StationMetadata {
  id: string;
  name: string;
  lat: number;
  lng: number; // API uses 'lng' not 'lon'
  state: string;
  // 'R' (reference/harmonic) or 'S' (subordinate, offset-derived) on tide prediction stations.
  type?: string;
  // Reference station a subordinate station derives its predictions from.
  reference_id?: string;
  tidal?: boolean;
  greatlakes?: boolean;
  shefcode?: string;
  details?: { self: string };
  sensors?: { self: string };
  floodlevels?: { self: string };
  datums?: { self: string };
  supersededdatums?: { self: string };
  harmonicConstituents?: { self: string };
  benchmarks?: { self: string };
  tidePredOffsets?: { self: string };
  currents?: object;
  predictions?: object;
  forecast?: boolean;
  outlook?: boolean;
  HTpy?: object;
  stormsurge?: boolean;
  affiliations: string;
  disclaimers?: object;
  notices?: object;
}

export interface TidePrediction {
  t: string;
  v: string;
  type?: 'H' | 'L';
}

interface NoaaErrorResponse {
  error?: {
    message: string;
  };
}

// Persistent store hooks (the environment plugin's cache); entries are { t, d }.
export interface StationCatalogStore {
  get(key: string): { t: number; d: unknown } | null;
  set(key: string, data: unknown): Promise<void>;
}

const STATION_CATALOG_KEY = 'noaa-station-catalog';

export class NoaaApiService {
  private readonly BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod';
  private readonly METADATA_BASE = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi';

  private stationCache: StationMetadata[] | null = null;
  private stationCacheTime: number = 0;
  private stationCatalogPromise: Promise<StationMetadata[]> | null = null;
  private readonly STATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour (in-memory)
  // The catalog changes rarely; persisted copies stay fresh for a week and are served stale on fetch failure.
  private readonly STATION_CATALOG_PERSIST_TTL = 7 * 24 * 60 * 60 * 1000;

  constructor(private catalogStore?: StationCatalogStore) {}

  private parseApiError(data: NoaaErrorResponse, context: string): void {
    if (data?.error?.message) {
      throw new Error(`[NOAA ${context}] ${data.error.message}`);
    }
  }

  private async getAllStations(): Promise<StationMetadata[]> {
    const now = Date.now();
    if (this.stationCache && (now - this.stationCacheTime) < this.STATION_CACHE_TTL) {
      return this.stationCache;
    }

    if (this.stationCatalogPromise !== null) return this.stationCatalogPromise;
    const promise = this.loadStationCatalog(now);
    this.stationCatalogPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.stationCatalogPromise === promise) this.stationCatalogPromise = null;
    }
  }

  private async loadStationCatalog(now: number): Promise<StationMetadata[]> {

    const persisted = this.catalogStore?.get(STATION_CATALOG_KEY) ?? null;
    if (persisted && Array.isArray(persisted.d) && (now - persisted.t) < this.STATION_CATALOG_PERSIST_TTL) {
      this.stationCache = persisted.d as StationMetadata[];
      this.stationCacheTime = now;
      return this.stationCache;
    }

    try {
      this.stationCache = await this.fetchStationCatalog();
      this.stationCacheTime = now;
      await this.catalogStore?.set(STATION_CATALOG_KEY, this.stationCache);
      return this.stationCache;
    } catch (error) {
      // stale-if-error: an old catalog beats no station discovery (offline, NOAA outage).
      if (persisted && Array.isArray(persisted.d)) {
        this.stationCache = persisted.d as StationMetadata[];
        this.stationCacheTime = now;
        return this.stationCache;
      }
      throw error;
    }
  }

  private async fetchStationCatalog(): Promise<StationMetadata[]> {
    // The tide-predictions catalog (~3,500 stations incl. subordinate stations, each typed
    // R/S). The plain stations.json is only the ~300 active water-level observation
    // stations - discovering against it served far-away stations for most coastlines.
    const url = `${this.METADATA_BASE}/stations.json?type=tidepredictions`;
    const resp = await requestUrl({ url });

    if (resp.status !== 200 || !resp.text) {
      throw new Error(`[NOAA] Failed to fetch stations: HTTP ${resp.status}`);
    }

    const data = JSON.parse(resp.text) as NoaaErrorResponse & { stations?: StationMetadata[] };
    this.parseApiError(data, 'stations');

    // Keep only the fields station discovery uses - the raw catalog is ~2MB.
    return (Array.isArray(data?.stations) ? data.stations : []).map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      state: s.state,
      type: s.type,
      reference_id: s.reference_id,
      affiliations: s.affiliations,
    }));
  }

  async findStationsByBBox(minLon: number, minLat: number, maxLon: number, maxLat: number): Promise<CoopsStation[]> {
    const allStations = await this.getAllStations();

    // Every station in the tide-predictions catalog is a tide station by definition.
    const filteredStations = allStations
      .filter((s: StationMetadata) => {
        const lat = s.lat;
        const lon = s.lng; // API uses 'lng' not 'lon'
        return Number.isFinite(lat) && Number.isFinite(lon) &&
          lat >= minLat && lat <= maxLat &&
          lon >= minLon && lon <= maxLon;
      })
      .map((s: StationMetadata) => this.stationMetadataToCoopsStation(s));

    return filteredStations;
  }

  async findNearestTideStation(lon: number, lat: number): Promise<CoopsStation | undefined> {
    const [nearest] = await this.findNearbyTideStations(lon, lat, 1);
    return nearest;
  }

  async findNearbyTideStations(lon: number, lat: number, maxResults: number = 10): Promise<CoopsStation[]> {
    const maxDelta = 0.9;
    const stations = await this.getAllStations();
    return stations
      .filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lng)
        && Math.abs(station.lat - lat) <= maxDelta
        && Math.abs(station.lng - lon) <= maxDelta)
      .map(station => {
        const converted = this.stationMetadataToCoopsStation(station);
        return {
          station: converted,
          distance: DistanceCalculator.haversineDistance(lat, lon, converted.lat, converted.lon),
        };
      })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, maxResults)
      .map(result => result.station);
  }

  async findTideStationById(stationId: string): Promise<CoopsStation | undefined> {
    // The cached tide-predictions catalog covers every prediction station with its R/S
    // type; the direct metadata endpoint is the fallback for stations outside it.
    const catalogStation = (await this.getAllStations()).find((s) => s.id === stationId);
    if (catalogStation) {
      return this.stationMetadataToCoopsStation(catalogStation);
    }

    const metadata = await this.getStationMetadata(stationId);
    if (!metadata || metadata.tidal === false) {
      return undefined;
    }

    return this.stationMetadataToCoopsStation(metadata);
  }

  async findTideStationByName(query: string): Promise<CoopsStation | undefined> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return undefined;
    }

    const byId = await this.findTideStationById(normalizedQuery);
    if (byId) {
      return byId;
    }

    const allStations = await this.getAllStations();
    const exact = allStations.find((station) => station.name.toLowerCase() === normalizedQuery);
    const partial = allStations.find((station) => station.name.toLowerCase().includes(normalizedQuery));
    const station = exact ?? partial;

    return station ? this.stationMetadataToCoopsStation(station) : undefined;
  }

  async getTidePredictions(stationId: string, start: string, end: string, options: TidePredictionOptions = {}): Promise<TidePrediction[]> {
    const {
      datum = 'MLLW',
      units = 'english',
      // Station local time (LST/LDT), matching NOAA's published tide tables. Returned `t`
      // strings are station wall-clock and must be displayed verbatim - never re-interpreted
      // through the viewer's timezone. (gmt here once shifted every displayed time by the
      // viewer's UTC offset.)
      timeZone = 'lst_ldt',
      interval = 'hilo'
    } = options;

    const params = new URLSearchParams({
      application: APPLICATION_ID,
      format: 'json',
      product: 'predictions',
      interval,
      time_zone: timeZone,
      datum,
      units,
      begin_date: start.replace(/-/g, ''),
      end_date: end.replace(/-/g, ''),
      station: stationId
    });

    const url = `${this.BASE}/datagetter?${String(params)}`;
    const resp = await requestUrl({ url });

    if (resp.status !== 200 || !resp.text) {
      throw new Error(`[NOAA] Failed to fetch tide predictions: HTTP ${resp.status}`);
    }

    const data = JSON.parse(resp.text) as NoaaErrorResponse & { predictions?: TidePrediction[] };
    this.parseApiError(data, 'predictions');

    return Array.isArray(data?.predictions) ? data.predictions : [];
  }

  async getStationMetadata(stationId: string): Promise<StationMetadata | null> {
    try {
      const directUrl = `${this.METADATA_BASE}/stations/${stationId}.json`;
      const resp = await requestUrl({ url: directUrl });

      if (resp.status === 200 && resp.text) {
        const data = JSON.parse(resp.text) as NoaaErrorResponse & { stations?: StationMetadata[] };
        this.parseApiError(data, 'station metadata');

        if (Array.isArray(data?.stations) && data.stations.length > 0) {
          return data.stations[0];
        }
      }
    } catch {
      // Individual station metadata fetch failed; fall through to bulk station lookup below
    }

    const allStations = await this.getAllStations();
    return allStations.find((s: StationMetadata) => s.id === stationId) || null;
  }

  async getSupportedDatums(stationId: string): Promise<string[]> {
    const metadata = await this.getStationMetadata(stationId);
    if (!metadata?.datums) {
      throw new Error(`[NOAA] No datums metadata available for station ${stationId}`);
    }

    const datumsUrl = metadata.datums?.self;
    if (!datumsUrl || typeof datumsUrl !== 'string') {
      throw new Error(`[NOAA] Invalid datums URL for station ${stationId}`);
    }

    const resp = await requestUrl({ url: datumsUrl });

    if (resp.status !== 200 || !resp.text) {
      throw new Error(`[NOAA] Failed to fetch datums for station ${stationId}: HTTP ${resp.status}`);
    }

    const datumsData = JSON.parse(resp.text) as NoaaErrorResponse & { datums?: Array<{ name?: string }> };
    this.parseApiError(datumsData, 'datums');

    if (!Array.isArray(datumsData?.datums)) {
      throw new Error(`[NOAA] Invalid datums response format for station ${stationId}`);
    }

    return datumsData.datums
      .map((d) => d.name)
      .filter((name): name is string => Boolean(name));
  }

  getStationCapabilities(station: CoopsStation | StationMetadata): { predictions: boolean; hourly: boolean } {
    const isCoopsStation = 'type' in station;
    return {
      predictions: station.tidal !== false && (
        isCoopsStation
          ? (station.type === 'waterlevels' || station.type === 'R' || station.type === 'S' || !station.type)
          : station.tidal === true
      ),
      hourly: true // Most NOAA stations provide hourly data
    };
  }

  private stationMetadataToCoopsStation(station: StationMetadata): CoopsStation {
    const stationType = station.type === 'R' || station.type === 'S' ? station.type : undefined;
    return {
      id: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lng,
      state: station.state,
      type: stationType,
      tidal: station.tidal,
      greatlakes: station.greatlakes,
      forecast: station.forecast,
      affiliations: station.affiliations,
    };
  }

  clearCache(): void {
    this.stationCache = null;
    this.stationCacheTime = 0;
    this.stationCatalogPromise = null;
  }
}
