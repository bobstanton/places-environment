 
import { MarkdownPostProcessorContext } from 'obsidian';
import type PlacesEnvironmentPlugin from '../main';
import { TideCodeBlockSettings, TideCodeBlockDefaultSettings, TideData, TideStation } from '../types';
import { CoopsStation, NoaaApiService, TidePrediction } from '../api-services/NoaaApiService';
import { SolarApiService } from '../api-services/SolarApiService';
import { classifyLunarTideTendency, TideDescriptionService } from './TideDescriptionService';
import { UnitsSystem } from "places-shared/units";
import { Coordinate, DistanceCalculator } from "places-shared/geo";
import { CodeBlockReader, cachePolicyExpiresAt, cachePolicyRetention, describeCachePolicy, isCacheEntryStale, parseBoolean, parseCacheSetting, parseEnumWithDefault, parseIntWithBounds, DateParser, parseCoordinateList } from "places-shared/settings";
import { logger, getErrorMessage } from "places-shared/utils";
import { getLocationStringFromFrontmatter } from '../utilities/FrontmatterUtilities';
import { processBatches } from '../utilities/BatchProcessing';
import { computeStationUtcOffsetMs, getTideTimeline, normalizeTideStationType, parseNaiveTimestamp, stationWallClockString, synthesizeHourlyFromExtremes } from '../utilities/TideTime';

const MAX_TIDE_LOCATIONS = 10;
const MAX_TIDE_STATIONS = 10;
const TIDE_BATCH_SIZE = 3;
const TIDE_BATCH_DELAY_MS = 150;
// `cache: true` means never stale: NOAA's published predictions for a past or
// future date do not change. Only an explicit duration or expiration date on
// the block introduces an age limit.
const TIDE_DEFAULT_MAX_AGE_MS = Infinity;

type TideBatchRequest = {
  settings: TideCodeBlockSettings;
  sourceLocation?: Coordinate;
  station?: CoopsStation;
};

interface CompressedTideSolarEvent {
  d: string;
  sr: string;
  ss: string;
  sn: string;
  dl: number;
  ctb: string;
  cte: string;
  ntb?: string;
  nte?: string;
  atb?: string;
  ate?: string;
}

interface CompressedTideDescription {
  d: string;
  lt?: 'Neap' | 'Intermediate' | 'Spring';
  tr: number;
  desc: string;
  mp: { p: number; n: string; e: string; i: number };
}

interface CompressedTideData {
  s: {
    i: string;
    n: string;
    lat: number;
    lon: number;
    d?: number;
    st: string;
    ty?: 'R' | 'S';
    cap?: TideStation['capabilities'];
    ds?: string[];
  };
  d: string;
  u: TideData['units'];
  m: { r: string; s: string; e: string; o?: number; rl?: [number, number] };
  h: Array<[number, 'H' | 'L', number]>;
  hr: Array<[number, number]>;
  sol?: CompressedTideSolarEvent[];
  desc?: CompressedTideDescription[];
}

function parseSemicolonList(value: string | undefined): string[] {
  return (value ?? '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseMaxStations(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === '') return defaultValue;

  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TIDE_STATIONS) {
    throw new Error(`maxStations must be an integer from 1 to ${MAX_TIDE_STATIONS}.`);
  }

  return parsed;
}

function normalizeStationType(station: CoopsStation): TideStation['type'] {
  return normalizeTideStationType(station.type);
}

export class TideDataService {
  private readonly inFlightRequests = new Map<string, Promise<TideData>>();
  private readonly stationRequests = new Map<string, Promise<CoopsStation>>();
  private readonly resolvedStations = new Map<string, CoopsStation>();
  private noaaService: NoaaApiService;
  private solarService: SolarApiService;
  private tideDescriptionService: TideDescriptionService;
  private plugin: PlacesEnvironmentPlugin;

  constructor(noaaService: NoaaApiService, plugin: PlacesEnvironmentPlugin, solarService: SolarApiService) {
    this.noaaService = noaaService;
    this.solarService = solarService;
    this.tideDescriptionService = new TideDescriptionService();
    this.plugin = plugin;
  }

  parseCodeBlockSettings(source: string, ctx: MarkdownPostProcessorContext): TideCodeBlockSettings {
    const block = new CodeBlockReader(source, { colonTextKeys: ['location'] });
    const defaults = TideCodeBlockDefaultSettings;
    const days = parseIntWithBounds(block.raw('days'), defaults.days, 1, 16);

    const [startDate, endDate] = DateParser.parseDateRange({
      startDate: block.text('startDate') ?? 'today',
      endDate: block.text('endDate') ?? DateParser.relativeEndDateForCalendarDays(days)
    });

    const locationString = block.text('location') ?? getLocationStringFromFrontmatter(this.plugin.app, ctx.sourcePath);
    const stations = block.textList('station').flatMap(parseSemicolonList);
    const stationIds = block.textList('stationId').flatMap(parseSemicolonList);
    const station = stations[0];
    const stationId = stationIds[0];
    if (!locationString && !station && !stationId) {
      throw new Error('No tide source found. Specify location, station, stationId, or add Location property to frontmatter.');
    }

    const parsedLocations = locationString ? parseCoordinateList(locationString) : [];
    if (parsedLocations.length > MAX_TIDE_LOCATIONS) {
      throw new Error(`Tide VaultQuery definitions support up to ${MAX_TIDE_LOCATIONS} locations.`);
    }
    const locations = parsedLocations;
    if (locationString && locations.length === 0) {
      throw new Error('Invalid location format. Expected "latitude, longitude" or multiple locations separated by semicolons.');
    }
    const totalSources = locations.length + stationIds.length + stations.length;
    if (totalSources > MAX_TIDE_LOCATIONS) {
      throw new Error(`Tide VaultQuery definitions support up to ${MAX_TIDE_LOCATIONS} total locations, station IDs, and station names.`);
    }

    const cachePolicy = parseCacheSetting(block.text('cache'), defaults.cachePolicy);

    return {
      location: locations[0],
      locations,
      station,
      stations,
      stationId,
      stationIds,
      maxStations: parseMaxStations(block.text('maxStations'), defaults.maxStations),
      days,
      startDate,
      endDate,
      datum: block.text('datum') ?? defaults.datum,
      units: parseEnumWithDefault(block.raw('units'), ['imperial', 'metric'] as const, this.plugin.getDefaultUnits()),
      height: block.text('height') ?? defaults.height,
      showStation: parseBoolean(block.raw('showStation'), defaults.showStation),
      showMap: parseBoolean(block.raw('showMap'), defaults.showMap),
      mapProvider: block.text('mapProvider')?.trim() || undefined,
      showSolar: parseBoolean(block.raw('showSolar'), defaults.showSolar),
      showMoonPhases: parseBoolean(block.raw('showMoonPhases'), defaults.showMoonPhases),
      exportHourlyEstimates: parseBoolean(block.raw('exportHourlyEstimates'), defaults.exportHourlyEstimates),
      cachePolicy,
    };
  }

  async getTideData(settings: TideCodeBlockSettings): Promise<TideData> {
    const station = await this.resolveStation(settings);
    return await this.getTideDataForStation(settings, station, settings.location);
  }

  async getTideDataBatch(settings: TideCodeBlockSettings): Promise<TideData[]> {
    const requests = await this.buildBatchRequests(settings);
    if (requests.length === 0) {
      return [await this.getTideData(settings)];
    }

    const seenStationIds = new Set<string>();
    const batchResult = await processBatches(
      requests,
      async request => {
        const station = request.station ?? await this.resolveStation(request.settings);
        if (seenStationIds.has(station.id)) return null;
        seenStationIds.add(station.id);
        return await this.getTideDataForStation(request.settings, station, request.sourceLocation);
      },
      { batchSize: TIDE_BATCH_SIZE, delayBetweenBatchesMs: TIDE_BATCH_DELAY_MS }
    );

    if (batchResult.errors.length > 0) {
      logger.scope('Tides').warn('[TideDataService] Some batched tide requests failed', {
        errors: batchResult.errors.map(error => ({ index: error.index, message: error.error.message })),
      });
    }

    return batchResult.results.filter((result): result is TideData => result !== null);
  }

  private async buildBatchRequests(settings: TideCodeBlockSettings): Promise<TideBatchRequest[]> {
    const requests: TideBatchRequest[] = [];

    for (const stationId of settings.stationIds ?? []) {
      requests.push({
        settings: { ...settings, stationId, stationIds: [stationId], station: undefined, stations: undefined, location: undefined, locations: [] },
      });
    }

    for (const station of settings.stations ?? []) {
      requests.push({
        settings: { ...settings, station, stations: [station], stationId: undefined, stationIds: undefined, location: undefined, locations: [] },
      });
    }

    // Each explicit location yields its nearest station; `maxStations` is how many nearby
    // stations to pull per location (default 1). The overall total is still capped at
    // MAX_TIDE_STATIONS.
    const locations = settings.locations?.length ? settings.locations : settings.location ? [settings.location] : [];
    for (const location of locations) {
      if (requests.length >= MAX_TIDE_STATIONS) break;
      const perLocation = Math.min(settings.maxStations, MAX_TIDE_STATIONS - requests.length);

      const stations = perLocation > 1
        ? await this.noaaService.findNearbyTideStations(location.longitude, location.latitude, perLocation)
        : [await this.resolveStation({ ...settings, location, locations: [location], station: undefined, stations: undefined, stationId: undefined, stationIds: undefined })];

      if (stations.length === 0 || stations[0] === undefined) {
        throw new Error('No tide station found near the specified location');
      }

      for (const station of stations) {
        if (!station) continue;
        requests.push({
          settings: { ...settings, location, locations: [location], station: undefined, stations: undefined, stationId: undefined, stationIds: undefined },
          sourceLocation: location,
          station,
        });
        if (requests.length >= MAX_TIDE_STATIONS) break;
      }
    }

    return requests;
  }

  private async resolveStation(settings: TideCodeBlockSettings): Promise<CoopsStation> {
    const key = settings.stationId
      ? `id:${settings.stationId.trim().toLowerCase()}`
      : settings.station
        ? `name:${settings.station.trim().toLowerCase()}`
        : settings.location
          ? `location:${settings.location.latitude.toFixed(5)},${settings.location.longitude.toFixed(5)}`
          : 'missing';
    const cached = this.resolvedStations.get(key);
    if (cached) return cached;
    const active = this.stationRequests.get(key);
    if (active !== undefined) return active;
    const request = this.resolveStationUncached(settings);
    this.stationRequests.set(key, request);
    try {
      const station = await request;
      this.resolvedStations.set(key, station);
      return station;
    } finally {
      if (this.stationRequests.get(key) === request) this.stationRequests.delete(key);
    }
  }

  private async resolveStationUncached(settings: TideCodeBlockSettings): Promise<CoopsStation> {
    if (settings.stationId) {
      const station = await this.noaaService.findTideStationById(settings.stationId);
      if (!station) {
        throw new Error(`No NOAA tide station found for stationId: ${settings.stationId}`);
      }
      return station;
    }

    if (settings.station) {
      const station = await this.noaaService.findTideStationByName(settings.station);
      if (!station) {
        throw new Error(`No NOAA tide station found for station: ${settings.station}`);
      }
      return station;
    }

    if (!settings.location) {
      throw new Error('No tide location found. Specify location, station, stationId, or add Location property to frontmatter.');
    }

    logger.scope('Tides').debug('[TideDataService] finding nearest NOAA tide station', {
      latitude: settings.location.latitude,
      longitude: settings.location.longitude,
    });
    const station = await this.noaaService.findNearestTideStation(settings.location.longitude, settings.location.latitude);
    if (!station) {
      throw new Error('No tide station found near the specified location');
    }

    return station;
  }

  private async getTideDataForStation(settings: TideCodeBlockSettings, station: CoopsStation, sourceLocation?: Coordinate): Promise<TideData> {
    // Keyed on data parameters only, not display settings.
    const cacheKey = this.generateCacheKey(station.id, sourceLocation, settings.startDate!, settings.endDate!, settings.datum, settings.units);
    const startDate = DateParser.formatDateISO(settings.startDate!);
    const endDate = DateParser.formatDateISO(settings.endDate!);

    logger.scope('Tides').debug('[TideDataService] getTideData requested', {
      cacheKey,
      cacheEnabled: settings.cachePolicy.enabled,
      location: sourceLocation,
      stationId: station.id,
      stationName: station.name,
      startDate,
      endDate,
      datum: settings.datum,
      units: settings.units,
      cachePolicy: describeCachePolicy(settings.cachePolicy),
    });

    let staleCachedEntry: ReturnType<PlacesEnvironmentPlugin['get']> = null;
    if (settings.cachePolicy.enabled) {
      const cachedEntry = this.plugin.get(cacheKey, cachePolicyRetention(settings.cachePolicy));

      if (!settings.forceRefresh && cachedEntry !== null && !this.isCacheStale(cachedEntry.t, settings)) {
        logger.scope('Tides').debug('[TideDataService] cache hit', {
          cacheKey,
          cachedAt: new Date(cachedEntry.t).toISOString(),
        });
        return this.withFreshness(this.decodeCachedTideData(cacheKey, cachedEntry), cachedEntry.t, false);
      }

      staleCachedEntry = cachedEntry;
      logger.scope('Tides').debug('[TideDataService] cache miss', {
        cacheKey,
        cachedAt: cachedEntry ? new Date(cachedEntry.t).toISOString() : undefined,
        expired: cachedEntry !== null,
      });
    } else {
      logger.scope('Tides').debug('[TideDataService] cache disabled for request', { cacheKey });
    }

    const active = this.inFlightRequests.get(cacheKey);
    if (active !== undefined) return active;
    const request = this.fetchFreshTideData(settings, station, cacheKey, startDate, endDate, sourceLocation);
    this.inFlightRequests.set(cacheKey, request);
    try {
      return await request;
    } catch (error) {
      // stale-if-error: expired cached tides beat an error when the fetch
      // fails (offline, NOAA outage).
      if (staleCachedEntry !== null) {
        logger.scope('Tides').warn('[TideDataService] tide fetch failed; using stale cached data', {
          cacheKey,
          cachedAt: new Date(staleCachedEntry.t).toISOString(),
          error: getErrorMessage(error),
        });
        return this.withFreshness(this.decodeCachedTideData(cacheKey, staleCachedEntry), staleCachedEntry.t, true);
      }
      throw error;
    } finally {
      if (this.inFlightRequests.get(cacheKey) === request) this.inFlightRequests.delete(cacheKey);
    }
  }

  private async fetchFreshTideData(settings: TideCodeBlockSettings, station: CoopsStation, cacheKey: string, startDate: string, endDate: string, sourceLocation?: Coordinate): Promise<TideData> {
    logger.scope('Tides').debug('[TideDataService] NOAA tide station selected', {
      cacheKey,
      stationId: station.id,
      stationName: station.name,
      latitude: station.lat,
      longitude: station.lon,
    });

    logger.scope('Tides').debug('[TideDataService] fetching NOAA tide predictions', {
      cacheKey,
      stationId: station.id,
      startDate,
      endDate,
    });
    // Subordinate stations only publish high/low extremes; NOAA rejects interval=h for
    // them, and their hourly curve is synthesized from the extremes instead. The extra GMT
    // extremes request exists only to derive the station's UTC offset (used to shift solar
    // events into the station's wall-clock frame).
    const isSubordinate = normalizeStationType(station) === 'S';
    const [hourlyPredictions, extrema, gmtExtrema] = await Promise.all([
      isSubordinate ? Promise.resolve([] as TidePrediction[]) : this.noaaService.getTidePredictions(station.id, startDate, endDate, { interval: 'h' }),
      this.noaaService.getTidePredictions(station.id, startDate, endDate, { interval: 'hilo' }),
      this.noaaService.getTidePredictions(station.id, startDate, endDate, { interval: 'hilo', timeZone: 'gmt' })
    ]);
    const predictions = hourlyPredictions.length > 0 ? hourlyPredictions : synthesizeHourlyFromExtremes(extrema);
    const stationUtcOffsetMs = computeStationUtcOffsetMs(extrema, gmtExtrema);

    const capabilities = this.noaaService.getStationCapabilities(station);
    // Datum metadata is enrichment: subordinate stations have no datums endpoint, and the
    // predictions request itself rejects unsupported datums server-side.
    const supportedDatums = await this.noaaService.getSupportedDatums(station.id).catch((error) => {
      logger.scope('Tides').debug('[TideDataService] datum metadata unavailable', { stationId: station.id, error: getErrorMessage(error) });
      return [] as string[];
    });

    const tideStation: TideStation = {
      id: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      provider: 'NOAA',
      type: normalizeStationType(station),
      state: station.state,
      capabilities,
      datum_supported: supportedDatums,
      // The station stands in for the requested location.
      distance_km: sourceLocation
        ? DistanceCalculator.haversineDistance(sourceLocation.latitude, sourceLocation.longitude, station.lat, station.lon)
        : undefined
    };

    const tideData: TideData = {
      station: tideStation,
      datum: settings.datum,
      units: settings.units === 'imperial' ? 'ft' : 'm',
      provider: "NOAA",
      hourly: predictions.map(p => ({
        timestamp_local: p.t,
        type: 'hourly' as const,
        height: parseFloat(p.v),
        datum: settings.datum,
        units: settings.units === 'imperial' ? 'ft' : 'm'
      })),
      hilo: extrema.map(e => ({
        timestamp_local: e.t,
        type: e.type as 'H' | 'L',
        height: parseFloat(e.v),
        datum: settings.datum,
        units: settings.units === 'imperial' ? 'ft' : 'm'
      })),
      metadata: {
        requestDate: new Date().toISOString(),
        startDate: DateParser.formatDateISO(settings.startDate!),
        endDate: DateParser.formatDateISO(settings.endDate!),
        retrievedAt: Date.now(),
        stationUtcOffsetMs,
        requestedLocation: sourceLocation
      }
    };

    if (!tideData.hilo || tideData.hilo.length === 0) {
      throw new Error('No tide data available for this location and date range');
    }

    try {
      const solarLocation = sourceLocation ?? { latitude: station.lat, longitude: station.lon };
      const rawSolarEvents = await this.solarService.getSolarEvents(solarLocation, settings.startDate!, settings.endDate!);
      // Solar timestamps arrive as true UTC ISO strings; tides are station wall-clock.
      const toStationClock = (iso: string): string => (stationUtcOffsetMs !== undefined && iso
        ? stationWallClockString(new Date(iso).getTime(), stationUtcOffsetMs)
        : iso);
      const solarEvents = rawSolarEvents.map(event => ({
        ...event,
        sunrise: toStationClock(event.sunrise),
        sunset: toStationClock(event.sunset),
        solar_noon: toStationClock(event.solar_noon),
        civil_twilight_begin: toStationClock(event.civil_twilight_begin),
        civil_twilight_end: toStationClock(event.civil_twilight_end),
        nautical_twilight_begin: toStationClock(event.nautical_twilight_begin),
        nautical_twilight_end: toStationClock(event.nautical_twilight_end),
        astronomical_twilight_begin: toStationClock(event.astronomical_twilight_begin),
        astronomical_twilight_end: toStationClock(event.astronomical_twilight_end),
      }));
      tideData.solar = solarEvents;
      tideData.solarByDate = new Map(
        solarEvents.map(event => [event.date, event])
      );
    } catch (error) {
      logger.scope('Tides').debug('[TideDataService] solar data unavailable, continuing without it', { error: getErrorMessage(error) });
    }

    try {
      const tideDescriptions = this.tideDescriptionService.calculateTideDescriptions(tideData);
      tideData.tideDescriptions = tideDescriptions;
      tideData.descriptionByDate = new Map(
        tideDescriptions.map(desc => [desc.date, desc])
      );
    } catch (error) {
      logger.scope('Tides').debug('[TideDataService] tide descriptions unavailable, continuing without them', { error: getErrorMessage(error) });
    }

    if (settings.cachePolicy.enabled) {
      const compressedData = this.compressTideData(tideData);
      await this.plugin.set(cacheKey, compressedData, cachePolicyRetention(settings.cachePolicy));
      logger.scope('Tides').debug('[TideDataService] cached tide data', {
        cacheKey,
        hourlyRows: tideData.hourly.length,
        extremaRows: tideData.hilo.length,
      });
    }

    return tideData;
  }

  private generateCacheKey(stationId: string, location: Coordinate | undefined, startDate: Date, endDate: Date, datum: string, units: UnitsSystem): string {
    const locationKey = location ? `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}` : 'station';
    const start = DateParser.formatDateISO(startDate);
    const end = DateParser.formatDateISO(endDate);
    
    // v2: predictions switched from GMT to station-local (LST/LDT) timestamps.
    // v3: solar events converted to station wall-clock; stationUtcOffsetMs added.
    // Older cached entries hold other frames and must not be served.
    return `v3:${stationId}:${locationKey}:${start}-${end}:${datum}-${units}`;
  }

  // The decoded object is shared by reference across blocks; consumers treat
  // TideData as read-only.
  private decodedCache = new Map<string, { t: number; data: TideData }>();
  private static readonly DECODED_CACHE_MAX = 20;

  private decodeCachedTideData(cacheKey: string, entry: { t: number; d: unknown }): TideData {
    const memo = this.decodedCache.get(cacheKey);
    if (memo && memo.t === entry.t) {
      return memo.data;
    }
    const data = this.decompressTideData(entry.d as CompressedTideData);
    this.decodedCache.set(cacheKey, { t: entry.t, data });
    if (this.decodedCache.size > TideDataService.DECODED_CACHE_MAX) {
      const oldest = this.decodedCache.keys().next().value;
      if (oldest !== undefined) this.decodedCache.delete(oldest);
    }
    return data;
  }

  private withFreshness(data: TideData, retrievedAt: number, servedStale: boolean): TideData {
    data.metadata.retrievedAt = retrievedAt;
    data.metadata.servedStale = servedStale;
    return data;
  }

  private isCacheStale(cachedTimestamp: number, settings: TideCodeBlockSettings): boolean {
    return isCacheEntryStale(settings.cachePolicy, cachedTimestamp, TIDE_DEFAULT_MAX_AGE_MS);
  }

  getCacheExpiresAt(settings: TideCodeBlockSettings, asOf: number): number | undefined {
    return cachePolicyExpiresAt(settings.cachePolicy, asOf, TIDE_DEFAULT_MAX_AGE_MS);
  }

  private compressTideData(tideData: TideData): CompressedTideData {
    const compressed: CompressedTideData = {
      s: {
        i: tideData.station.id,
        n: tideData.station.name,
        lat: tideData.station.lat,
        lon: tideData.station.lon,
        d: tideData.station.distance_km,
        st: tideData.station.state,
        ty: tideData.station.type,
        cap: tideData.station.capabilities,
        ds: tideData.station.datum_supported
      },
      d: tideData.datum,
      u: tideData.units,
      m: {
        r: tideData.metadata.requestDate,
        s: tideData.metadata.startDate,
        e: tideData.metadata.endDate,
        o: tideData.metadata.stationUtcOffsetMs,
        rl: tideData.metadata.requestedLocation ? [tideData.metadata.requestedLocation.latitude, tideData.metadata.requestedLocation.longitude] : undefined
      },
      h: tideData.hilo.map(h => [
        parseNaiveTimestamp(h.timestamp_local).getTime(),
        h.type === 'H' ? 'H' : 'L',
        Math.round(h.height * 100) / 100
      ]),
      hr: tideData.hourly.map(h => [
        parseNaiveTimestamp(h.timestamp_local).getTime(),
        Math.round(h.height * 100) / 100
      ])
    };

    if (tideData.solar && tideData.solar.length > 0) {
      compressed.sol = tideData.solar.map(s => ({
        d: s.date,
        sr: s.sunrise,
        ss: s.sunset,
        sn: s.solar_noon,
        dl: s.day_length,
        ctb: s.civil_twilight_begin,
        cte: s.civil_twilight_end,
        ntb: s.nautical_twilight_begin,
        nte: s.nautical_twilight_end,
        atb: s.astronomical_twilight_begin,
        ate: s.astronomical_twilight_end
      }));
    }

    if (tideData.tideDescriptions && tideData.tideDescriptions.length > 0) {
      compressed.desc = tideData.tideDescriptions.map(d => ({
        d: d.date,
        lt: d.lunarTideTendency,
        tr: Math.round(d.tidalRange * 100) / 100,
        desc: d.description,
        mp: {
          p: d.moonPhase.phase,
          n: d.moonPhase.phaseName,
          e: d.moonPhase.emoji,
          i: d.moonPhase.illumination
        }
      }));
    }

    return compressed;
  }

  private decompressTideData(compressed: CompressedTideData): TideData {
    const formatLocalTimestamp = (unixTime: number): string => {
      return DateParser.formatTimestamp(new Date(unixTime));
    };

    const tideData: TideData = {
      station: {
        id: compressed.s.i,
        name: compressed.s.n,
        lat: compressed.s.lat,
        lon: compressed.s.lon,
        distance_km: compressed.s.d,
        provider: "NOAA",
        state: compressed.s.st,
        type: compressed.s.ty,
        // Old cache entries predate these fields.
        capabilities: compressed.s.cap ?? { predictions: true, hourly: true },
        datum_supported: compressed.s.ds ?? ["MLLW", "MHHW", "MTL", "MSL"]
      },
      datum: compressed.d,
      units: compressed.u,
      provider: "NOAA",
      metadata: {
        requestDate: compressed.m.r,
        startDate: compressed.m.s,
        endDate: compressed.m.e,
        stationUtcOffsetMs: compressed.m.o,
        // Absent in pre-existing cache entries; the map then shows the station only.
        requestedLocation: Array.isArray(compressed.m.rl) ? { latitude: compressed.m.rl[0], longitude: compressed.m.rl[1] } : undefined
      },
      hilo: compressed.h.map(h => ({
        timestamp_local: formatLocalTimestamp(h[0]),
        type: h[1],
        height: h[2],
        datum: compressed.d,
        units: compressed.u
      })),
      hourly: compressed.hr.map(h => ({
        timestamp_local: formatLocalTimestamp(h[0]),
        type: 'hourly' as const,
        height: h[1],
        datum: compressed.d,
        units: compressed.u
      }))
    };

    if (compressed.sol) {
      tideData.solar = compressed.sol.map(s => ({
        // Old cache entries lack the date field.
        date: s.d ?? s.sr?.split(' ')[0] ?? '',
        sunrise: s.sr,
        sunset: s.ss,
        solar_noon: s.sn,
        day_length: s.dl,
        civil_twilight_begin: s.ctb,
        civil_twilight_end: s.cte,
        // Undefined in old cache entries.
        nautical_twilight_begin: s.ntb ?? s.ctb,
        nautical_twilight_end: s.nte ?? s.cte,
        astronomical_twilight_begin: s.atb ?? s.ctb,
        astronomical_twilight_end: s.ate ?? s.cte
      }));

      tideData.solarByDate = new Map(
        tideData.solar.map(event => [event.date, event])
      );
    }

    if (compressed.desc) {
      tideData.tideDescriptions = compressed.desc.map(d => ({
        date: d.d,
        lunarTideTendency: d.lt ?? classifyLunarTideTendency(d.mp.p),
        tidalRange: d.tr,
        description: `${Number(d.tr).toFixed(1)} ${tideData.units} observed range. ${d.mp.e} ${d.mp.n} (${d.mp.i}% illuminated); ${(d.lt ?? classifyLunarTideTendency(d.mp.p)).toLowerCase()}-tide lunar tendency. Local bathymetry, weather, and station corrections determine actual heights and currents.`,
        moonPhase: {
          phase: d.mp.p,
          phaseName: d.mp.n,
          emoji: d.mp.e,
          illumination: d.mp.i,
          date: d.d
        }
      }));
      
      tideData.descriptionByDate = new Map(
        tideData.tideDescriptions.map(desc => [desc.date, desc])
      );
    }

    return tideData;
  }

  interpolateHeightAtTime(tideData: TideData, targetTime: Date): number | null {
    const timeline = getTideTimeline(tideData).hourly;
    if (timeline.length === 0) return null;
    const targetTimestamp = targetTime.getTime();
    let low = 0;
    let high = timeline.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (timeline[middle].timestamp <= targetTimestamp) low = middle + 1;
      else high = middle;
    }
    const beforePoint = low > 0 ? timeline[low - 1] : undefined;
    const afterPoint = low < timeline.length ? timeline[low] : undefined;
    if (beforePoint?.timestamp === targetTimestamp) return beforePoint.point.height;
    if (beforePoint && afterPoint) {
      const timeDiff = afterPoint.timestamp - beforePoint.timestamp;
      const targetDiff = targetTimestamp - beforePoint.timestamp;
      const ratio = targetDiff / timeDiff;
      const heightDiff = afterPoint.point.height - beforePoint.point.height;
      return Math.round((beforePoint.point.height + (heightDiff * ratio)) * 100) / 100;
    }
    if (beforePoint) return beforePoint.point.height;
    if (afterPoint) return afterPoint.point.height;
    return null;
  }
}
