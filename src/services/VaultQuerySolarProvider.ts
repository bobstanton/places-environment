import type {
  ProviderDefinitionCompletionConfig,
  ProviderRefreshContext,
  ProviderRefreshDefinition,
  ProviderRefreshResult,
  ProviderRowValue,
  ProviderTableDefinition,
  VaultQueryTableProvider,
} from 'vaultquery/api';
import type PlacesEnvironmentPlugin from '../main';
import { SolarApiService } from '../api-services/SolarApiService';
import type { SolarEvent } from '../types';
import { getLocationStringFromFrontmatter } from '../utilities/FrontmatterUtilities';
import { Coordinate, NamedCoordinate, parseCoordinateList } from "places-shared/geo";
import { CACHE_PARAMETER_DESCRIPTION, CACHE_VALUE_SUGGESTIONS, CodeBlockReader, DateParser, parseCacheSetting, type CachePolicy } from "places-shared/settings";
import { roundTo } from "places-shared/utils";
import { getSunPosition } from './SolarPositionService';
import { locationString, textColumn, integerColumn, realColumn, parseRequestedTableList } from './VaultQueryProviderShared';

const PLACES_SOLAR_PROVIDER_ID = 'places-environment.solar';

const SOLAR_TABLE = 'solar_events';
const SOLAR_POSITIONS_TABLE = 'solar_positions';
const SOLAR_DEFINITION_LANGUAGE = 'places-solar-vaultquery';
const SOLAR_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const SOLAR_TABLE_ALIASES: Record<string, string> = {
  events: SOLAR_TABLE,
  solar_events: SOLAR_TABLE,
  positions: SOLAR_POSITIONS_TABLE,
  solar_positions: SOLAR_POSITIONS_TABLE,
  hourly: SOLAR_POSITIONS_TABLE,
};

const SOLAR_COMPLETIONS: ProviderDefinitionCompletionConfig = {
  keys: [
    { label: 'id', detail: 'Stable definition id' },
    { label: 'name', detail: 'Display name' },
    { label: 'coordinates', detail: 'One or more locations, separated by ;' },
    { label: 'location', detail: 'One or more locations, separated by ;' },
    { label: 'timezone', detail: 'Optional IANA timezone override' },
    { label: 'startDate', detail: 'Start date' },
    { label: 'endDate', detail: 'End date' },
    { label: 'tables', detail: 'Which tables to fill: events, positions' },
    { label: 'cache', detail: CACHE_PARAMETER_DESCRIPTION },
  ],
  values: {
    cache: CACHE_VALUE_SUGGESTIONS.map(suggestion => ({ label: suggestion.value, detail: suggestion.detail })),
    tables: [
      { label: 'events', detail: 'Per-day sunrise, sunset and twilight rows' },
      { label: 'positions', detail: 'Hourly sun bearing and altitude rows' },
      { label: 'events, positions', detail: 'Both tables' },
    ],
  },
};

type SolarProviderRequest = {
  name: string;
  locations: NamedCoordinate[];
  timezone?: string;
  startDate: Date;
  endDate: Date;
  cachePolicy: CachePolicy;
};

export function createPlacesSolarProvider(plugin: PlacesEnvironmentPlugin, solarService: SolarApiService): VaultQueryTableProvider {

  return {
    id: PLACES_SOLAR_PROVIDER_ID,
    displayName: 'Places solar',
    tables: [createSolarTableDefinition(), createSolarPositionsTableDefinition()],
    definitionBlock: {
      language: SOLAR_DEFINITION_LANGUAGE,
      completions: SOLAR_COMPLETIONS,
      parse: (source, context) => parseSolarDefinition(source, context.path, plugin),
    },
    refresh: async context => refreshSolarDefinition(context, solarService),
  };
}

function parseSolarDefinition(source: string, sourcePath: string, plugin: PlacesEnvironmentPlugin): ProviderRefreshDefinition {
  // Named locations ("Scranton: 41.4, -75.6") put a colon inside the value,
  // which YAML would otherwise read as a nested mapping - the same declaration
  // the weather and tide definitions make.
  const block = new CodeBlockReader(source, { colonTextKeys: ['coordinates', 'location'] });
  const id = block.text('id')?.trim();
  if (!id) {
    throw new Error('places-solar-vaultquery requires an id. Example: id: scranton-pa');
  }

  const locationText = block.text('coordinates') || block.text('location') || getLocationStringFromFrontmatter(plugin.app, sourcePath);
  if (!locationText) {
    throw new Error('No location found. Requires coordinates/location in the block or a Location frontmatter property.');
  }

  const locations = parseCoordinateList(locationText);
  if (locations.length === 0) {
    throw new Error('Invalid location format. Expected "latitude, longitude", or several separated by ";".');
  }

  const [startDate, endDate] = DateParser.parseDateRange({
    startDate: block.text('startDate') ?? 'today',
    endDate: block.text('endDate') ?? '+1w',
  });
  const name = block.text('name')?.trim() || id;
  const timezone = block.text('timezone')?.trim() || undefined;
  const cachePolicy = parseCacheSetting(block.text('cache'));
  const requestedTables = parseRequestedTableList(
    block.text('tables'),
    SOLAR_TABLE_ALIASES,
    'solar',
    'events and/or positions',
  ) ?? [SOLAR_TABLE, SOLAR_POSITIONS_TABLE];

  return {
    id,
    displayName: name,
    requestedTables,
    request: { name, locations, timezone, startDate, endDate, cachePolicy },
  };
}

async function refreshSolarDefinition(context: ProviderRefreshContext, solarService: SolarApiService): Promise<ProviderRefreshResult> {
  const request = context.request as SolarProviderRequest | undefined;
  if (!request?.locations?.length || !request.startDate || !request.endDate) {
    throw new Error(`Missing solar request for definition: ${context.definitionId}`);
  }

  const requestedTables = context.requestedTables ?? [SOLAR_TABLE];
  const eventRows: Record<string, ProviderRowValue>[] = [];
  const positionRows: Record<string, ProviderRowValue>[] = [];

  for (const location of request.locations) {
    const events = await solarService.getSolarEvents(location, request.startDate, request.endDate, {
      timezone: request.timezone,
      cachePolicy: request.cachePolicy,
    });
    // One definition can carry several locations, and each row is named for its
    // own location, falling back to the definition name only when unnamed.
    const rowName = location.name ?? request.name;

    for (const event of events) {
      eventRows.push(buildSolarRow(context.definitionId, rowName, location, event));
      if (requestedTables.includes(SOLAR_POSITIONS_TABLE)) {
        positionRows.push(...buildPositionRows(context.definitionId, rowName, location, event));
      }
    }
  }

  const tables: ProviderRefreshResult['tables'] = {};
  if (requestedTables.includes(SOLAR_TABLE)) {
    tables[SOLAR_TABLE] = { replaceWhere: { id: context.definitionId }, rows: eventRows };
  }
  if (requestedTables.includes(SOLAR_POSITIONS_TABLE)) {
    tables[SOLAR_POSITIONS_TABLE] = { replaceWhere: { id: context.definitionId }, rows: positionRows };
  }

  return { tables };
}

// The sun's bearing and altitude for every hour of one day, computed locally
// rather than fetched.
//
// Hours are the location's own wall clock, matching `weather_hourly`: an
// `hour` filter means the same thing when the two tables are read together. The
// day's UTC offset is taken from the event timestamps the API already returned,
// which stays correct across a daylight-saving change.
function buildPositionRows(id: string, name: string, location: Coordinate, event: SolarEvent): Record<string, ProviderRowValue>[] {
  const offset = utcOffsetSuffix(event.sunrise) ?? utcOffsetSuffix(event.solar_noon);
  const rows: Record<string, ProviderRowValue>[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const wallClock = `${event.date}T${String(hour).padStart(2, '0')}:00:00`;
    const instant = new Date(offset ? `${wallClock}${offset}` : wallClock);
    if (Number.isNaN(instant.getTime())) continue;

    const position = getSunPosition(instant, location.latitude, location.longitude);
    rows.push({
      id,
      name,
      location: locationString(location.latitude, location.longitude),
      latitude: location.latitude,
      longitude: location.longitude,
      icon: position.altitudeDeg > 0 ? '☀️' : '🌙',
      date: event.date,
      hour,
      time: wallClock,
      azimuth: roundTo(position.azimuthDeg, 1),
      altitude: roundTo(position.altitudeDeg, 1),
      // The bearing sunlight travels along, which is also where shadows fall -
      // the opposite of the bearing looked along to see the sun.
      light_direction: roundTo((position.azimuthDeg + 180) % 360, 1),
      is_daylight: position.altitudeDeg > 0 ? 1 : 0,
    });
  }

  return rows;
}

// The `+HH:MM`, `-HH:MM` or `Z` tail of an ISO timestamp, if it carries one.
function utcOffsetSuffix(timestamp: string | undefined): string | undefined {
  const match = timestamp?.match(/(Z|[+-]\d{2}:?\d{2})$/);
  return match ? match[1] : undefined;
}

function buildSolarRow(id: string, name: string, location: Coordinate, event: SolarEvent): Record<string, ProviderRowValue> {
  const bearingAt = (timestamp: string | undefined): number | null => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return roundTo(getSunPosition(date, location.latitude, location.longitude).azimuthDeg, 1);
  };
  const noon = event.solar_noon ? new Date(event.solar_noon) : undefined;
  const noonPosition = noon && !Number.isNaN(noon.getTime())
    ? getSunPosition(noon, location.latitude, location.longitude)
    : undefined;

  return {
    id,
    name,
    location: locationString(location.latitude, location.longitude),
    latitude: location.latitude,
    longitude: location.longitude,
    icon: '☀️',
    description: solarDescription(event),
    date: event.date,
    sunrise: event.sunrise,
    sunset: event.sunset,
    solar_noon: event.solar_noon,
    day_length: event.day_length,
    civil_twilight_begin: event.civil_twilight_begin,
    civil_twilight_end: event.civil_twilight_end,
    nautical_twilight_begin: event.nautical_twilight_begin,
    nautical_twilight_end: event.nautical_twilight_end,
    astronomical_twilight_begin: event.astronomical_twilight_begin,
    astronomical_twilight_end: event.astronomical_twilight_end,
    sunrise_azimuth: bearingAt(event.sunrise),
    sunset_azimuth: bearingAt(event.sunset),
    solar_noon_azimuth: noonPosition ? roundTo(noonPosition.azimuthDeg, 1) : null,
    solar_noon_altitude: noonPosition ? roundTo(noonPosition.altitudeDeg, 1) : null,
    data_json: JSON.stringify(event),
  };
}

function solarDescription(event: SolarEvent): string {
  return `Sunrise ${event.sunrise}, sunset ${event.sunset}`;
}

// The solar tables' schemas, exported for the VaultQuery tables help page.
export function solarTableDefinitions(): ProviderTableDefinition[] {
  return [createSolarTableDefinition(), createSolarPositionsTableDefinition()];
}

function createSolarTableDefinition(): ProviderTableDefinition {
  return {
    name: SOLAR_TABLE,
    description: 'Solar events populated by Places Environment solar definitions.',
    // Latitude and longitude are part of the key because one definition can
    // carry several locations, which would otherwise collide on (id, date).
    primaryKey: ['id', 'latitude', 'longitude', 'date'],
    defaultStaleAfterMs: SOLAR_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('name'),
      textColumn('location', false),
      realColumn('latitude', false),
      realColumn('longitude', false),
      textColumn('icon'),
      textColumn('description'),
      textColumn('date', false),
      textColumn('sunrise'),
      textColumn('sunset'),
      textColumn('solar_noon'),
      realColumn('day_length'),
      textColumn('civil_twilight_begin'),
      textColumn('civil_twilight_end'),
      textColumn('nautical_twilight_begin'),
      textColumn('nautical_twilight_end'),
      textColumn('astronomical_twilight_begin'),
      textColumn('astronomical_twilight_end'),
      // Sun direction, degrees clockwise from true north - the same convention
      // as wind_direction_10m and the map's iconRotation. The bearing at any
      // other moment moves continuously, and lives in `solar_positions` by hour.
      realColumn('sunrise_azimuth'),
      realColumn('sunset_azimuth'),
      realColumn('solar_noon_azimuth'),
      // Peak sun altitude for the day, degrees above the horizon.
      realColumn('solar_noon_altitude'),
      textColumn('data_json'),
    ],
    indexes: [
      { name: 'idx_solar_events_date', columns: ['date'] },
      { name: 'idx_solar_events_id_date', columns: ['id', 'date'] },
    ],
  };
}

function createSolarPositionsTableDefinition(): ProviderTableDefinition {
  return {
    name: SOLAR_POSITIONS_TABLE,
    description: 'Hourly sun bearing and altitude, computed from the solar definition locations.',
    primaryKey: ['id', 'latitude', 'longitude', 'time'],
    defaultStaleAfterMs: SOLAR_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('name'),
      textColumn('location', false),
      realColumn('latitude', false),
      realColumn('longitude', false),
      textColumn('icon'),
      textColumn('date', false),
      // Hour of the location's own day, 0-23, matching `weather_hourly.hour`.
      integerColumn('hour'),
      textColumn('time', false),
      // Bearing to the sun, degrees clockwise from true north.
      realColumn('azimuth'),
      // Height above the horizon in degrees; negative when the sun is down.
      realColumn('altitude'),
      // Bearing sunlight travels along - `azimuth` turned 180°, where shadows point.
      realColumn('light_direction'),
      integerColumn('is_daylight'),
    ],
    indexes: [
      { name: 'idx_solar_positions_time', columns: ['time'] },
      { name: 'idx_solar_positions_id_hour', columns: ['id', 'hour'] },
    ],
  };
}
