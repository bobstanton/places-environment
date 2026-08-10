import type {
  ProviderDefinitionCompletionConfig,
  ProviderRefreshContext,
  ProviderRefreshDefinition,
  ProviderRefreshResult,
  ProviderRowValue,
  ProviderTableDefinition,
  VaultQueryTableProvider,
} from 'vaultquery/api';
import type { TideDataService } from './TideDataService';
import type { TideCodeBlockSettings, TideData, TidePoint } from '../types';
import { logger, roundTo } from "places-shared/utils";
import { CACHE_VALUE_SUGGESTIONS, CodeBlockReader, describeCachePolicy } from "places-shared/settings";
import { locationString, textColumn, integerColumn, realColumn, parseRequestedTableList, sharedValueCompletions } from './VaultQueryProviderShared';

const PLACES_TIDE_PROVIDER_ID = 'places-environment.tides';

const STATIONS_TABLE = 'tide_stations';
const PREDICTIONS_TABLE = 'tide_predictions';
const DAILY_TABLE = 'tide_daily';
const TIDE_DEFINITION_LANGUAGE = 'places-tides-vaultquery';
const TIDE_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const TIDE_DAILY_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const TIDE_COMPLETIONS: ProviderDefinitionCompletionConfig = {
  keys: [
    { label: 'id', detail: 'Stable definition id' },
    { label: 'name', detail: 'Display name' },
    { label: 'location', detail: 'Location name or coordinates' },
    { label: 'station', detail: 'Tide station name' },
    { label: 'stationId', detail: 'Tide station id' },
    { label: 'maxStations', detail: 'Nearby stations to pull per location' },
    { label: 'datum', detail: 'Prediction datum' },
    { label: 'units', detail: 'Measurement units' },
    { label: 'startDate', detail: 'Start date' },
    { label: 'endDate', detail: 'End date' },
    { label: 'tables', detail: 'Tables to populate' },
    { label: 'cache', detail: 'Cache duration' },
  ],
  values: {
    tables: [
      { label: 'stations', detail: 'Populate tide_stations' },
      { label: 'predictions', detail: 'Populate tide_predictions' },
      { label: 'daily', detail: 'Populate tide_daily' },
    ],
    datum: sharedValueCompletions('datum'),
    units: sharedValueCompletions('units'),
    cache: CACHE_VALUE_SUGGESTIONS.map(suggestion => ({ label: suggestion.value, detail: suggestion.detail })),
    maxStations: [
      { label: '1', detail: 'Nearest station per location' },
      { label: '3', detail: 'Up to 3 nearby stations per location' },
      { label: '5', detail: 'Up to 5 nearby stations per location' },
      { label: '10', detail: 'Up to 10 nearby stations per location' },
    ],
  },
  multiValueKeys: ['tables'],
};

type TideProviderRequest = {
  name: string;
  settings: TideCodeBlockSettings;
};

export function createPlacesTideProvider(tideDataService: TideDataService): VaultQueryTableProvider {
  return {
    id: PLACES_TIDE_PROVIDER_ID,
    displayName: 'Places tides',
    tables: [createStationTableDefinition(), createPredictionTableDefinition(), createDailyTableDefinition()],
    definitionBlock: {
      language: TIDE_DEFINITION_LANGUAGE,
      completions: TIDE_COMPLETIONS,
      parse: (source, context) => parseTideDefinition(source, context.path, tideDataService),
    },
    refresh: async context => refreshTideDefinition(context, tideDataService),
  };
}

function parseTideDefinition(source: string, sourcePath: string, tideDataService: TideDataService): ProviderRefreshDefinition {
  const block = new CodeBlockReader(source, { colonTextKeys: ['location'] });
  const id = block.text('id')?.trim();
  if (!id) {
    throw new Error('places-tides-vaultquery requires an id. Example: id: battery-park');
  }

  const settings = tideDataService.parseCodeBlockSettings(source, { sourcePath } as never);
  const requestedTables = parseRequestedTables(block.textList('tables').join(','));
  const name = block.text('name')?.trim() || id;

  return {
    id,
    displayName: name,
    requestedTables,
    request: { name, settings },
  };
}

async function refreshTideDefinition(context: ProviderRefreshContext, tideDataService: TideDataService): Promise<ProviderRefreshResult> {
  const request = context.request as TideProviderRequest | undefined;
  if (!request?.settings) {
    throw new Error(`Missing tide request for definition: ${context.definitionId}`);
  }

  logger.scope('Tides').debug('[VaultQueryTideProvider] refresh requested', {
    providerId: context.providerId,
    definitionId: context.definitionId,
    requestedTables: context.requestedTables,
    cachePolicy: describeCachePolicy(request.settings.cachePolicy),
  });

	const tideDataList = await tideDataService.getTideDataBatch(request.settings);
	const requestedTables = context.requestedTables ?? [STATIONS_TABLE, PREDICTIONS_TABLE, DAILY_TABLE];
	const tables: ProviderRefreshResult['tables'] = {};
	const asOf = Date.parse(tideDataList[0]?.metadata.requestDate ?? new Date().toISOString());
	const expiresAt = tideDataService.getCacheExpiresAt(request.settings, asOf);

	if (requestedTables.includes(STATIONS_TABLE)) {
		tables[STATIONS_TABLE] = {
			rows: tideDataList.map(buildStationRow),
			asOf,
			expiresAt,
		};
	}

	if (requestedTables.includes(PREDICTIONS_TABLE)) {
		tables[PREDICTIONS_TABLE] = {
			replaceWhere: { id: context.definitionId },
			rows: tideDataList.flatMap(tideData => buildPredictionRows(context.definitionId, tideData)),
			asOf,
			expiresAt,
		};
	}

	if (requestedTables.includes(DAILY_TABLE)) {
		tables[DAILY_TABLE] = {
			replaceWhere: { id: context.definitionId },
			rows: tideDataList.flatMap(tideData => buildDailyRows(context.definitionId, tideData)),
			asOf,
			expiresAt,
		};
	}

  return { tables };
}

function parseRequestedTables(value: string | undefined): string[] {
  const tables = parseRequestedTableList(value, {
    stations: STATIONS_TABLE, [STATIONS_TABLE]: STATIONS_TABLE,
    predictions: PREDICTIONS_TABLE, [PREDICTIONS_TABLE]: PREDICTIONS_TABLE,
    daily: DAILY_TABLE, [DAILY_TABLE]: DAILY_TABLE,
  }, 'tide', 'stations, predictions, or daily');
  return tables ?? [STATIONS_TABLE, PREDICTIONS_TABLE, DAILY_TABLE];
}

// Station UTC offset in minutes - `time` columns are station-local wall clock.
function utcOffsetMinutes(tideData: TideData): number | null {
  const offsetMs = tideData.metadata.stationUtcOffsetMs;
  return offsetMs === undefined ? null : Math.round(offsetMs / 60000);
}

function buildStationRow(tideData: TideData): Record<string, ProviderRowValue> {
  const requested = tideData.metadata.requestedLocation;
  return {
    id: tideData.station.id,
    name: tideData.station.name,
    location: locationString(tideData.station.lat, tideData.station.lon),
    latitude: tideData.station.lat,
    longitude: tideData.station.lon,
    icon: '🌊',
    provider: tideData.station.provider,
    station_type: tideData.station.type ?? null,
    utc_offset_minutes: utcOffsetMinutes(tideData),
    state: tideData.station.state,
    // Where the user asked, and how far away the answering station actually is
    // (metric; consumers convert for display via the units setting).
    requested_location: requested ? locationString(requested.latitude, requested.longitude) : null,
    distance_km: tideData.station.distance_km ?? null,
    capabilities_json: JSON.stringify(tideData.station.capabilities),
    datum_supported_json: JSON.stringify(tideData.station.datum_supported),
  };
}

function buildPredictionRows(id: string, tideData: TideData): Record<string, ProviderRowValue>[] {
  return [...tideData.hilo, ...tideData.hourly].map(point => ({
    id,
    station_id: tideData.station.id,
    station_name: tideData.station.name,
    name: tidePredictionTitle(tideData.station.name, point.type),
    location: locationString(tideData.station.lat, tideData.station.lon),
    latitude: tideData.station.lat,
    longitude: tideData.station.lon,
    icon: tideIcon(point.type),
    provider: tideData.provider,
    station_type: tideData.station.type ?? null,
    utc_offset_minutes: utcOffsetMinutes(tideData),
    date: point.timestamp_local.slice(0, 10),
    time: point.timestamp_local,
    type: point.type,
    height: point.height,
    datum: point.datum,
    units: point.units,
  }));
}

function buildDailyRows(id: string, tideData: TideData): Record<string, ProviderRowValue>[] {
  const dates = new Set<string>();
  for (const point of [...tideData.hilo, ...tideData.hourly]) {
    dates.add(point.timestamp_local.slice(0, 10));
  }
  for (const solar of tideData.solar ?? []) dates.add(solar.date);
  for (const description of tideData.tideDescriptions ?? []) dates.add(description.date);

  return Array.from(dates).sort().map(date => {
    const description = tideData.descriptionByDate?.get(date);
    const solar = tideData.solarByDate?.get(date);
    const dailyTides = tideData.hilo
      .filter(point => point.timestamp_local.slice(0, 10) === date)
      .sort((a, b) => a.timestamp_local.localeCompare(b.timestamp_local));
    const highTides = dailyTides.filter(point => point.type === 'H');
    const lowTides = dailyTides.filter(point => point.type === 'L');
    const tideSummary = formatDailyTideSummary(highTides, lowTides);
    return {
      id,
      station_id: tideData.station.id,
      station_name: tideData.station.name,
      name: tideData.station.name,
      location: locationString(tideData.station.lat, tideData.station.lon),
      latitude: tideData.station.lat,
      longitude: tideData.station.lon,
      icon: '🌊',
      station_type: tideData.station.type ?? null,
      date,
      lunar_tide_tendency: description?.lunarTideTendency ?? null,
      tidal_range: description?.tidalRange ?? null,
      description: formatDailyTideLabel(highTides, lowTides),
      tide_summary: tideSummary,
      high_tides: formatTideEventList(highTides),
      low_tides: formatTideEventList(lowTides),
      high_tide_count: highTides.length,
      low_tide_count: lowTides.length,
      high_tides_json: JSON.stringify(highTides.map(serializeTidePoint)),
      low_tides_json: JSON.stringify(lowTides.map(serializeTidePoint)),
      moon_phase: description?.moonPhase.phase ?? null,
      moon_phase_name: description?.moonPhase.phaseName ?? null,
      moon_illumination: description?.moonPhase.illumination ?? null,
      sunrise: solar?.sunrise ?? null,
      sunset: solar?.sunset ?? null,
      data_json: JSON.stringify({
        description,
        solar,
        highTides: highTides.map(serializeTidePoint),
        lowTides: lowTides.map(serializeTidePoint),
      }),
    };
  });
}

function tidePredictionTitle(stationName: string, type: string): string {
  if (type === 'H') return `${stationName} high tide`;
  if (type === 'L') return `${stationName} low tide`;
  return `${stationName} tide`;
}

function tideIcon(type: string): string {
  if (type === 'H') return '⬆️';
  if (type === 'L') return '⬇️';
  return '🌊';
}

// One-line label for the tide_daily `description` column, used as the map marker
// label: the day's extreme low then high tide with the time each occurs, e.g.
// "Low 0.34 ft at 1:13 PM, High 8.22 ft at 6:16 AM". Non-breaking spaces keep each
// height and clock time intact, never splitting mid-value on a label.
function formatDailyTideLabel(highTides: TidePoint[], lowTides: TidePoint[]): string | null {
  const parts: string[] = [];
  if (lowTides.length > 0) {
    const lowest = lowTides.reduce((min, point) => (point.height < min.height ? point : min));
    parts.push(`Low ${nonBreaking(formatTideHeight(lowest))} at ${formatTideClock(lowest.timestamp_local)}`);
  }
  if (highTides.length > 0) {
    const highest = highTides.reduce((max, point) => (point.height > max.height ? point : max));
    parts.push(`High ${nonBreaking(formatTideHeight(highest))} at ${formatTideClock(highest.timestamp_local)}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

// Replace spaces with non-breaking spaces, keeping a value/time on one line.
function nonBreaking(value: string): string {
  return value.replace(/ /g, " ");
}

// 12-hour clock time (e.g. "6:16 AM") from a local timestamp; kept non-breaking.
function formatTideClock(timestamp: string): string {
  const timeMatch = timestamp.match(/[T\s](\d{2}):(\d{2})/);
  if (!timeMatch) return timestamp;
  let hour = parseInt(timeMatch[1], 10);
  const minute = timeMatch[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`.replace(/ /g, " ");
}

function formatDailyTideSummary(highTides: TidePoint[], lowTides: TidePoint[]): string {
  const parts = [
    `High: ${formatTideEventList(highTides) || 'none'}`,
    `Low: ${formatTideEventList(lowTides) || 'none'}`,
  ];
  return parts.join('\n');
}

function formatTideEventList(points: TidePoint[]): string {
  return points
    .map(point => `${formatTideTime(point.timestamp_local)} (${formatTideHeight(point)})`)
    .join(', ');
}

function formatTideTime(timestamp: string): string {
  const timeMatch = timestamp.match(/[T\s](\d{2}):(\d{2})/);
  return timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : timestamp;
}

function formatTideHeight(point: TidePoint): string {
  return `${roundTo(point.height, 2)} ${point.units}`;
}

function serializeTidePoint(point: TidePoint): Record<string, ProviderRowValue> {
  return {
    time: point.timestamp_local,
    height: point.height,
    datum: point.datum,
    units: point.units,
  };
}

// The tide tables' schemas, exported for the VaultQuery tables help page.
export function tideTableDefinitions(): ProviderTableDefinition[] {
  return [createStationTableDefinition(), createPredictionTableDefinition(), createDailyTableDefinition()];
}

function createStationTableDefinition(): ProviderTableDefinition {
  return {
    name: STATIONS_TABLE,
    description: 'Tide station metadata populated by Places Environment tide definitions.',
    primaryKey: ['id'],
    defaultStaleAfterMs: TIDE_DAILY_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('name'),
      textColumn('location'),
      realColumn('latitude'),
      realColumn('longitude'),
      textColumn('icon'),
      textColumn('provider'),
      textColumn('station_type'),
      realColumn('utc_offset_minutes'),
      textColumn('state'),
      textColumn('requested_location'),
      realColumn('distance_km'),
      textColumn('capabilities_json'),
      textColumn('datum_supported_json'),
    ],
  };
}

function createPredictionTableDefinition(): ProviderTableDefinition {
  return {
    name: PREDICTIONS_TABLE,
    description: 'Tide predictions populated by Places Environment tide definitions.',
    primaryKey: ['id', 'station_id', 'time', 'type'],
    defaultStaleAfterMs: TIDE_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('station_id', false),
      textColumn('station_name'),
      textColumn('name'),
      textColumn('location'),
      realColumn('latitude'),
      realColumn('longitude'),
      textColumn('icon'),
      textColumn('provider'),
      textColumn('station_type'),
      realColumn('utc_offset_minutes'),
      textColumn('date', false),
      textColumn('time', false),
      textColumn('type', false),
      realColumn('height'),
      textColumn('datum'),
      textColumn('units'),
    ],
    indexes: [
      { name: 'idx_tide_predictions_station_time', columns: ['station_id', 'time'] },
      { name: 'idx_tide_predictions_id_date', columns: ['id', 'date'] },
    ],
  };
}

function createDailyTableDefinition(): ProviderTableDefinition {
  return {
    name: DAILY_TABLE,
    description: 'Daily tide summaries populated by Places Environment tide definitions.',
    primaryKey: ['id', 'station_id', 'date'],
    defaultStaleAfterMs: TIDE_DAILY_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('station_id', false),
      textColumn('station_name'),
      textColumn('name'),
      textColumn('location'),
      realColumn('latitude'),
      realColumn('longitude'),
      textColumn('icon'),
      textColumn('station_type'),
      textColumn('date', false),
      textColumn('lunar_tide_tendency'),
      realColumn('tidal_range'),
      textColumn('description'),
      textColumn('tide_summary'),
      textColumn('high_tides'),
      textColumn('low_tides'),
      integerColumn('high_tide_count'),
      integerColumn('low_tide_count'),
      textColumn('high_tides_json'),
      textColumn('low_tides_json'),
      realColumn('moon_phase'),
      textColumn('moon_phase_name'),
      realColumn('moon_illumination'),
      textColumn('sunrise'),
      textColumn('sunset'),
      textColumn('data_json'),
    ],
    indexes: [
      { name: 'idx_tide_daily_id_date', columns: ['id', 'date'] },
      { name: 'idx_tide_daily_station_date', columns: ['station_id', 'date'] },
    ],
  };
}
