import { CACHE_VALUE_SUGGESTIONS, CodeBlockReader } from "places-shared/settings";
import { locationString, textColumn, integerColumn, realColumn, parseRequestedTableList, sharedValueCompletions } from './VaultQueryProviderShared';
import type {
  ProviderDefinitionCompletionConfig,
  ProviderRefreshContext,
  ProviderRefreshDefinition,
  ProviderRefreshResult,
  ProviderRowValue,
  ProviderTableDefinition,
  VaultQueryTableProvider,
} from 'vaultquery/api';
import type { WeatherCodeBlockSettings, WeatherData, WeatherDataService } from './WeatherDataService';
import { getWeatherDescription, getWeatherEmoji } from '../utilities/WeatherCodeUtilities';

const PLACES_WEATHER_PROVIDER_ID = 'places-environment.weather';

const DAILY_TABLE = 'weather_daily';
const HOURLY_TABLE = 'weather_hourly';
const WEATHER_DEFINITION_LANGUAGE = 'places-weather-vaultquery';
const DAILY_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const HOURLY_STALE_AFTER_MS = 60 * 60 * 1000;

const DEFAULT_DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'sunrise',
  'sunset',
];

const DEFAULT_HOURLY_VARIABLES = [
  'temperature_2m',
  'apparent_temperature',
  'weather_code',
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
];

const WEATHER_COMPLETIONS: ProviderDefinitionCompletionConfig = {
  keys: [
    { label: 'id', detail: 'Stable definition id' },
    { label: 'name', detail: 'Display name' },
    { label: 'location', detail: 'Location name or coordinates' },
    { label: 'coordinates', detail: 'Latitude and longitude' },
    { label: 'startDate', detail: 'Start date' },
    { label: 'endDate', detail: 'Inclusive end date' },
    { label: 'days', detail: 'Calendar days to populate when endDate is omitted' },
    { label: 'startTime', detail: 'Start hour filter for hourly data' },
    { label: 'endTime', detail: 'End hour filter for hourly data' },
    { label: 'tables', detail: 'Tables to populate' },
    { label: 'daily', detail: 'Daily weather variables' },
    { label: 'hourly', detail: 'Hourly weather variables' },
    { label: 'units', detail: 'Measurement units' },
    { label: 'cache', detail: 'Cache duration' },
    { label: 'cellSelection', detail: 'Weather grid cell preference for coastal areas' },
  ],
  values: {
    tables: [
      { label: 'daily', detail: 'Populate weather_daily' },
      { label: 'hourly', detail: 'Populate weather_hourly' },
    ],
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
      'sunrise',
      'sunset',
    ].map(label => ({ label, detail: 'Daily weather field' })),
    // Mirrors the weather_hourly column set; other requested variables land in data_json.
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'dew_point_2m',
      'relative_humidity_2m',
      'weather_code',
      'precipitation',
      'precipitation_probability',
      'rain',
      'showers',
      'snowfall',
      'snow_depth',
      'surface_pressure',
      'cloud_cover',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].map(label => ({ label, detail: 'Hourly weather field' })),
    units: sharedValueCompletions('units'),
    cache: CACHE_VALUE_SUGGESTIONS.map(suggestion => ({ label: suggestion.value, detail: suggestion.detail })),
    cellselection: sharedValueCompletions('cellSelection'),
  },
  multiValueKeys: ['daily', 'hourly', 'tables'],
};

type WeatherProviderRequest = {
  name: string;
  settings: WeatherCodeBlockSettings;
};

type WeatherSeries = {
  time: Date[];
  [variable: string]: Date[] | (Date | number | null)[] | undefined;
};

export function createPlacesWeatherProvider(weatherDataService: WeatherDataService): VaultQueryTableProvider {
  return {
    id: PLACES_WEATHER_PROVIDER_ID,
    displayName: 'Places weather',
    tables: [createDailyTableDefinition(), createHourlyTableDefinition()],
    definitionBlock: {
      language: WEATHER_DEFINITION_LANGUAGE,
      completions: WEATHER_COMPLETIONS,
      parse: (source, context) => parseWeatherDefinition(source, context.path, weatherDataService),
    },
    refresh: async context => refreshWeatherDefinition(context, weatherDataService),
  };
}

function parseWeatherDefinition(source: string, sourcePath: string, weatherDataService: WeatherDataService): ProviderRefreshDefinition {
  const block = new CodeBlockReader(source, { colonTextKeys: ['coordinates', 'location'] });
  const id = block.text('id')?.trim();
  if (!id) {
    throw new Error('places-weather-vaultquery requires an id. Example: id: scranton-pa');
  }

  const settings = weatherDataService.parseCodeBlockSettings(source, { sourcePath } as never);
  const requestedTables = parseRequestedTables(block.textList('tables').join(','), settings);

  if (requestedTables.includes(DAILY_TABLE) && !settings.daily?.length) {
    settings.daily = [...DEFAULT_DAILY_VARIABLES];
  }
  if (requestedTables.includes(DAILY_TABLE)) {
    settings.daily = withWeatherSummaryDailyVariables(settings.daily);
  }

  if (requestedTables.includes(HOURLY_TABLE) && !settings.hourly?.length) {
    settings.hourly = [...DEFAULT_HOURLY_VARIABLES];
  }
  if (requestedTables.includes(HOURLY_TABLE)) {
    settings.hourly = withWeatherSummaryHourlyVariables(settings.hourly);
  }

  const name = block.text('name')?.trim() || settings.coordinates[0]?.name || id;

  return {
    id,
    displayName: name,
    requestedTables,
    request: {
      name,
      settings,
    },
  };
}

async function refreshWeatherDefinition(context: ProviderRefreshContext, weatherDataService: WeatherDataService): Promise<ProviderRefreshResult> {
  const request = context.request as WeatherProviderRequest | undefined;
  if (!request?.settings) {
    throw new Error(`Missing weather request for definition: ${context.definitionId}`);
  }

		const weatherData = await weatherDataService.getWeatherData(request.settings);
		const requestedTables = context.requestedTables ?? [DAILY_TABLE];
		const tables: ProviderRefreshResult['tables'] = {};
		const asOf = Date.parse(weatherData.metadata.requestDate);
	const expiresAt = weatherDataService.getCacheExpiresAt(request.settings, asOf);

		if (requestedTables.includes(DAILY_TABLE)) {
			tables[DAILY_TABLE] = {
				replaceWhere: { id: context.definitionId },
				rows: buildDailyRows(context.definitionId, request.name, request.settings, weatherData),
				asOf,
				expiresAt,
			};
		}

		if (requestedTables.includes(HOURLY_TABLE)) {
			tables[HOURLY_TABLE] = {
				replaceWhere: { id: context.definitionId },
				rows: buildHourlyRows(context.definitionId, request.name, request.settings, weatherData),
				asOf,
				expiresAt,
			};
		}

  return { tables };
}

function parseRequestedTables(pairsValue: string | undefined, settings: WeatherCodeBlockSettings): string[] {
  const tables = parseRequestedTableList(pairsValue, {
    daily: DAILY_TABLE, [DAILY_TABLE]: DAILY_TABLE,
    hourly: HOURLY_TABLE, [HOURLY_TABLE]: HOURLY_TABLE,
  }, 'weather', 'daily or hourly');
  return tables ?? inferRequestedTables(settings);
}

function inferRequestedTables(settings: WeatherCodeBlockSettings): string[] {
  if (settings.hourly?.length && !settings.daily?.length) return [HOURLY_TABLE];
  if (settings.hourly?.length && settings.daily?.length) return [DAILY_TABLE, HOURLY_TABLE];
  return [DAILY_TABLE];
}

function withWeatherSummaryDailyVariables(variables: string[] | undefined): string[] {
  return withRequiredVariables(variables, [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'precipitation_probability_max',
  ]);
}

function withWeatherSummaryHourlyVariables(variables: string[] | undefined): string[] {
  return withRequiredVariables(variables, [
    'weather_code',
    'temperature_2m',
    'precipitation',
    'precipitation_probability',
  ]);
}

function withRequiredVariables(variables: string[] | undefined, required: string[]): string[] {
  const result = [...(variables ?? [])];
  for (const variable of required) {
    if (!result.includes(variable)) {
      result.push(variable);
    }
  }
  return result;
}

function buildDailyRows(id: string, name: string, settings: WeatherCodeBlockSettings, weatherData: WeatherData): Record<string, ProviderRowValue>[] {
  return weatherData.responses.flatMap(response => {
    if (!response.daily) return [];
    const rowName = response.coordinates.name || name;

    return response.daily.time.map((time, index) => {
      const date = formatDateForZone(time, response.timezone);
      const weatherCode = numericValueAt(response.daily!, 'weather_code', index);
      const precipitationSum = numericValueAt(response.daily!, 'precipitation_sum', index);
      const precipitationProbability = numericValueAt(response.daily!, 'precipitation_probability_max', index);
      const temperatureMax = numericValueAt(response.daily!, 'temperature_2m_max', index);
      const temperatureMin = numericValueAt(response.daily!, 'temperature_2m_min', index);
      const icon = weatherIcon(weatherCode);
      const summary = dailyWeatherSummary({
        weatherCode,
        precipitationSum,
        precipitationProbability,
        temperatureMax,
        temperatureMin,
        units: settings.units,
      });
      return {
        id,
        name: rowName,
        location: locationString(response.coordinates.latitude, response.coordinates.longitude),
        latitude: response.coordinates.latitude,
        longitude: response.coordinates.longitude,
        icon,
        description: summary,
        units: settings.units,
        date,
        timezone: response.timezone,
        timezone_abbreviation: response.timezoneAbbreviation,
        utc_offset_seconds: response.utcOffsetSeconds,
        weather_summary: summary,
        weather_code: valueAt(response.daily!, 'weather_code', index),
        temperature_2m_max: valueAt(response.daily!, 'temperature_2m_max', index),
        temperature_2m_min: valueAt(response.daily!, 'temperature_2m_min', index),
        apparent_temperature_max: valueAt(response.daily!, 'apparent_temperature_max', index),
        apparent_temperature_min: valueAt(response.daily!, 'apparent_temperature_min', index),
        precipitation_sum: valueAt(response.daily!, 'precipitation_sum', index),
        precipitation_probability_max: valueAt(response.daily!, 'precipitation_probability_max', index),
        rain_sum: valueAt(response.daily!, 'rain_sum', index),
        showers_sum: valueAt(response.daily!, 'showers_sum', index),
        snowfall_sum: valueAt(response.daily!, 'snowfall_sum', index),
        wind_speed_10m_max: valueAt(response.daily!, 'wind_speed_10m_max', index),
        wind_gusts_10m_max: valueAt(response.daily!, 'wind_gusts_10m_max', index),
        wind_direction_10m_dominant: valueAt(response.daily!, 'wind_direction_10m_dominant', index),
        sunrise: valueAt(response.daily!, 'sunrise', index),
        sunset: valueAt(response.daily!, 'sunset', index),
        data_json: dataJsonForIndex(response.daily!, index),
      };
    });
  });
}

function buildHourlyRows(id: string, name: string, settings: WeatherCodeBlockSettings, weatherData: WeatherData): Record<string, ProviderRowValue>[] {
  return weatherData.responses.flatMap(response => {
    if (!response.hourly) return [];
    const rowName = response.coordinates.name || name;

    return response.hourly.time.map((time, index) => {
      const localTime = formatDateTimeForZone(time, response.timezone);
      const weatherCode = numericValueAt(response.hourly!, 'weather_code', index);
      const precipitation = numericValueAt(response.hourly!, 'precipitation', index);
      const precipitationProbability = numericValueAt(response.hourly!, 'precipitation_probability', index);
      const temperature = numericValueAt(response.hourly!, 'temperature_2m', index);
      const icon = weatherIcon(weatherCode);
      const summary = hourlyWeatherSummary({
        weatherCode,
        precipitation,
        precipitationProbability,
        temperature,
        units: settings.units,
      });
      return {
        id,
        name: rowName,
        location: locationString(response.coordinates.latitude, response.coordinates.longitude),
        latitude: response.coordinates.latitude,
        longitude: response.coordinates.longitude,
        icon,
        description: summary,
        units: settings.units,
        date: formatDateForZone(time, response.timezone),
        time: localTime,
        hour: hourForZone(time, response.timezone),
        timezone: response.timezone,
        timezone_abbreviation: response.timezoneAbbreviation,
        utc_offset_seconds: response.utcOffsetSeconds,
        weather_summary: summary,
        weather_code: valueAt(response.hourly!, 'weather_code', index),
        temperature_2m: valueAt(response.hourly!, 'temperature_2m', index),
        apparent_temperature: valueAt(response.hourly!, 'apparent_temperature', index),
        dew_point_2m: valueAt(response.hourly!, 'dew_point_2m', index),
        relative_humidity_2m: valueAt(response.hourly!, 'relative_humidity_2m', index),
        precipitation: valueAt(response.hourly!, 'precipitation', index),
        precipitation_probability: valueAt(response.hourly!, 'precipitation_probability', index),
        rain: valueAt(response.hourly!, 'rain', index),
        showers: valueAt(response.hourly!, 'showers', index),
        snowfall: valueAt(response.hourly!, 'snowfall', index),
        snow_depth: valueAt(response.hourly!, 'snow_depth', index),
        surface_pressure: valueAt(response.hourly!, 'surface_pressure', index),
        cloud_cover: valueAt(response.hourly!, 'cloud_cover', index),
        wind_speed_10m: valueAt(response.hourly!, 'wind_speed_10m', index),
        wind_direction_10m: valueAt(response.hourly!, 'wind_direction_10m', index),
        wind_gusts_10m: valueAt(response.hourly!, 'wind_gusts_10m', index),
        data_json: dataJsonForIndex(response.hourly!, index),
      };
    });
  });
}

function valueAt(series: WeatherSeries, variable: string, index: number): ProviderRowValue {
  const values = series[variable];
  if (!Array.isArray(values)) return null;
  return toProviderValue(values[index]);
}

function numericValueAt(series: WeatherSeries, variable: string, index: number): number | null {
  const value = valueAt(series, variable, index);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function weatherIcon(weatherCode: number | null): string | null {
  return weatherCode === null ? null : getWeatherEmoji(weatherCode);
}

function dailyWeatherSummary(options: {
  weatherCode: number | null;
  precipitationSum: number | null;
  precipitationProbability: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  units: WeatherCodeBlockSettings['units'];
}): string | null {
  const parts: string[] = [];
  // Temperature leads the label. The non-breaking hyphen (U+2011) keeps the
  // low-high range together on a single line.
  if (options.temperatureMin !== null && options.temperatureMax !== null) {
    parts.push(`${formatTemperature(options.temperatureMin)}-${formatTemperature(options.temperatureMax)}`);
  }
  parts.push(...baseWeatherSummaryParts(options.weatherCode));
  appendPrecipitationSummary(parts, {
    amount: options.precipitationSum,
    probability: options.precipitationProbability,
    units: options.units,
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

function hourlyWeatherSummary(options: {
  weatherCode: number | null;
  precipitation: number | null;
  precipitationProbability: number | null;
  temperature: number | null;
  units: WeatherCodeBlockSettings['units'];
}): string | null {
  const parts: string[] = [];
  // Lead with temperature, mirroring the daily summary ordering.
  if (options.temperature !== null) {
    parts.push(formatTemperature(options.temperature));
  }
  parts.push(...baseWeatherSummaryParts(options.weatherCode));
  appendPrecipitationSummary(parts, {
    amount: options.precipitation,
    probability: options.precipitationProbability,
    units: options.units,
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

function baseWeatherSummaryParts(weatherCode: number | null): string[] {
  return weatherCode === null ? [] : [getWeatherDescription(weatherCode)];
}

function appendPrecipitationSummary(parts: string[], options: {
  amount: number | null;
  probability: number | null;
  units: WeatherCodeBlockSettings['units'];
}): void {
  const amount = options.amount ?? 0;
  const probability = options.probability ?? 0;
  const hasAmount = amount > 0;
  const hasProbability = probability > 0;
  if (!hasAmount && !hasProbability) {
    return;
  }

  if (hasAmount && hasProbability) {
    parts.push(`${formatPrecipitation(amount, options.units)} precip (${Math.round(probability)}%)`);
  } else if (hasAmount) {
    parts.push(`${formatPrecipitation(amount, options.units)} precip`);
  } else {
    parts.push(`${Math.round(probability)}% precip`);
  }
}

function formatTemperature(value: number): string {
  return `${Math.round(value)}°`;
}

function formatPrecipitation(value: number, units: WeatherCodeBlockSettings['units']): string {
  const unit = units === 'imperial' ? 'in' : 'mm';
  const precision = units === 'imperial' ? 2 : 1;
  return `${trimFixed(value, precision)} ${unit}`;
}

function trimFixed(value: number, precision: number): string {
  return value.toFixed(precision).replace(/\.?0+$/, '');
}

function dataJsonForIndex(series: WeatherSeries, index: number): string {
  const values = Object.fromEntries(
    Object.entries(series)
      .filter(([key]) => key !== 'time')
      .map(([key, seriesValues]) => [key, Array.isArray(seriesValues) ? toProviderValue(seriesValues[index]) : null])
  );

  return JSON.stringify(values);
}

function toProviderValue(value: unknown): ProviderRowValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value) ?? null;
}

function formatDateForZone(date: Date, timeZone: string): string {
  const parts = datePartsForZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateTimeForZone(date: Date, timeZone: string): string {
  const parts = datePartsForZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function hourForZone(date: Date, timeZone: string): number {
  return Number(datePartsForZone(date, timeZone).hour);
}

function datePartsForZone(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
}

// The weather tables' schemas, exported for the VaultQuery tables help page.
export function weatherTableDefinitions(): ProviderTableDefinition[] {
  return [createDailyTableDefinition(), createHourlyTableDefinition()];
}

function createDailyTableDefinition(): ProviderTableDefinition {
  return {
    name: DAILY_TABLE,
    description: 'Daily weather data populated by Places Environment weather definitions.',
    primaryKey: ['id', 'latitude', 'longitude', 'date'],
    defaultStaleAfterMs: DAILY_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('name'),
      textColumn('location', false),
      realColumn('latitude', false),
      realColumn('longitude', false),
      textColumn('icon'),
      textColumn('description'),
      textColumn('units', false),
      textColumn('date', false),
      textColumn('timezone'),
      textColumn('timezone_abbreviation'),
      integerColumn('utc_offset_seconds'),
      textColumn('weather_summary'),
      realColumn('weather_code'),
      realColumn('temperature_2m_max'),
      realColumn('temperature_2m_min'),
      realColumn('apparent_temperature_max'),
      realColumn('apparent_temperature_min'),
      realColumn('precipitation_sum'),
      realColumn('precipitation_probability_max'),
      realColumn('rain_sum'),
      realColumn('showers_sum'),
      realColumn('snowfall_sum'),
      realColumn('wind_speed_10m_max'),
      realColumn('wind_gusts_10m_max'),
      realColumn('wind_direction_10m_dominant'),
      textColumn('sunrise'),
      textColumn('sunset'),
      textColumn('data_json'),
    ],
    indexes: [
      { name: 'idx_weather_daily_date', columns: ['date'] },
      { name: 'idx_weather_daily_id_date', columns: ['id', 'date'] },
      { name: 'idx_weather_daily_id_location_date', columns: ['id', 'latitude', 'longitude', 'date'] },
    ],
  };
}

function createHourlyTableDefinition(): ProviderTableDefinition {
  return {
    name: HOURLY_TABLE,
    description: 'Hourly weather data populated by Places Environment weather definitions.',
    primaryKey: ['id', 'latitude', 'longitude', 'time'],
    defaultStaleAfterMs: HOURLY_STALE_AFTER_MS,
    columns: [
      textColumn('id', false),
      textColumn('name'),
      textColumn('location', false),
      realColumn('latitude', false),
      realColumn('longitude', false),
      textColumn('icon'),
      textColumn('description'),
      textColumn('units', false),
      textColumn('date', false),
      textColumn('time', false),
      integerColumn('hour'),
      textColumn('timezone'),
      textColumn('timezone_abbreviation'),
      integerColumn('utc_offset_seconds'),
      textColumn('weather_summary'),
      realColumn('weather_code'),
      realColumn('temperature_2m'),
      realColumn('apparent_temperature'),
      realColumn('dew_point_2m'),
      realColumn('relative_humidity_2m'),
      realColumn('precipitation'),
      realColumn('precipitation_probability'),
      realColumn('rain'),
      realColumn('showers'),
      realColumn('snowfall'),
      realColumn('snow_depth'),
      realColumn('surface_pressure'),
      realColumn('cloud_cover'),
      realColumn('wind_speed_10m'),
      realColumn('wind_direction_10m'),
      realColumn('wind_gusts_10m'),
      textColumn('data_json'),
    ],
    indexes: [
      { name: 'idx_weather_hourly_date', columns: ['date'] },
      { name: 'idx_weather_hourly_id_time', columns: ['id', 'time'] },
      { name: 'idx_weather_hourly_id_location_time', columns: ['id', 'latitude', 'longitude', 'time'] },
    ],
  };
}
