import { weatherVariableDetail, TIDE_UNIT_DETAILS } from "places-environment/core";
import { COMMON_CACHE_PARAM, COMMON_SIZE_PARAMS, COMMON_SIZE_KEYS, QUERY_PARAMETER_NESTED_KEYS } from "places-shared/settings";
import { CodeBlockDefinition, CodeBlockHighlightConfig } from "places-shared/obsidian/services";

const WEATHER_CURRENT_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
];
const WEATHER_MINUTELY15_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'snowfall_height',
  'freezing_level_height',
  'sunshine_duration',
  'weather_code',
  'wind_speed_10m',
  'wind_speed_80m',
  'wind_direction_10m',
  'wind_direction_80m',
  'wind_gusts_10m',
  'visibility',
  'cape',
  'lightning_potential',
  'is_day',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'terrestrial_radiation',
];
const WEATHER_HOURLY_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'snow_depth',
  'weather_code',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'visibility',
  'wind_speed_10m',
  'wind_speed_80m',
  'wind_speed_120m',
  'wind_speed_180m',
  'wind_direction_10m',
  'wind_direction_80m',
  'wind_direction_120m',
  'wind_direction_180m',
  'wind_gusts_10m',
  'pressure_msl',
  'surface_pressure',
  'vapour_pressure_deficit',
  'evapotranspiration',
  'et0_fao_evapotranspiration',
  'uv_index',
  'uv_index_clear_sky',
  'is_day',
  'sunshine_duration',
  'cape',
  'freezing_level_height',
  'wet_bulb_temperature_2m',
  'temperature_80m',
  'temperature_120m',
  'temperature_180m',
  'soil_temperature_0cm',
  'soil_temperature_6cm',
  'soil_temperature_18cm',
  'soil_temperature_54cm',
  'soil_moisture_0_to_1cm',
  'soil_moisture_1_to_3cm',
  'soil_moisture_3_to_9cm',
  'soil_moisture_9_to_27cm',
  'soil_moisture_27_to_81cm',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'global_tilted_irradiance',
  'terrestrial_radiation',
];
const WEATHER_DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_mean',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_mean',
  'apparent_temperature_min',
  'relative_humidity_2m_max',
  'relative_humidity_2m_mean',
  'relative_humidity_2m_min',
  'dew_point_2m_max',
  'dew_point_2m_mean',
  'dew_point_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'rain_sum',
  'showers_sum',
  'snowfall_sum',
  'sunrise',
  'sunset',
  'cloud_cover_max',
  'cloud_cover_mean',
  'cloud_cover_min',
  'wind_speed_10m_max',
  'wind_speed_10m_mean',
  'wind_speed_10m_min',
  'wind_gusts_10m_max',
  'wind_gusts_10m_mean',
  'wind_gusts_10m_min',
  'wind_direction_10m_dominant',
  'uv_index_max',
  'uv_index_clear_sky_max',
  'precipitation_hours',
  'sunshine_duration',
  'daylight_duration',
  'shortwave_radiation_sum',
  'et0_fao_evapotranspiration',
];
const WEATHER_VARIABLE_DETAILS: Record<string, Record<string, string>> = (() => {
  const details = Object.fromEntries([
    ...WEATHER_CURRENT_VARIABLES, ...WEATHER_MINUTELY15_VARIABLES, ...WEATHER_HOURLY_VARIABLES, ...WEATHER_DAILY_VARIABLES,
  ].flatMap(variable => {
    const detail = weatherVariableDetail(variable);

    return detail ? [[variable, detail]] : [];
  }));

  return { current: details, minutely15: details, hourly: details, daily: details };
})();

const WEATHER_TABLE_COLUMNS = [
  'time',
  'date',
  'weather',
  'temp',
  'high',
  'low',
  'high_low',
  'feels_like',
  'precip_prob',
  'precip_amt',
  'precip_type',
  'wind',
  'wind_gusts',
  'wind_dir',
  'humidity',
  'cloud',
  'pressure',
  'visibility',
  'dew_point',
  'sunrise',
  'sunset',
  'uv',
];
const WEATHER_TABLE_HOURLY_COLUMNS = [
  'time',
  'weather',
  'temp',
  'feels_like',
  'precip_prob',
  'precip_amt',
  'precip_type',
  'wind',
  'wind_gusts',
  'wind_dir',
  'humidity',
  'cloud',
  'pressure',
  'visibility',
  'dew_point',
];
const WEATHER_TABLE_DAILY_COLUMNS = [
  'date',
  'weather',
  'high',
  'low',
  'high_low',
  'precip_prob',
  'precip_amt',
  'precip_type',
  'wind',
  'wind_gusts',
  'wind_dir',
  'sunrise',
  'sunset',
  'uv',
];

const COMMON_WEATHER_PARAMS = [
  { name: "coordinates", description: "Optional name followed by latitude and longitude; separate multiple locations with semicolons", values: "Scranton: 41.408,-75.662" },
  { name: "location", description: "Alternative location key; accepts Name: lat, lon and falls back to the note's Location property", values: "Scranton: 41.408,-75.662 or note's Location" },
  { name: "days", description: "Calendar days to display when endDate is omitted", values: { examples: ["1", "3", "7", "14"], default: "7" } },
  { name: "startDate", description: "First day to fetch. Defaults to today", values: { examples: ["today", "tomorrow", "2024-01-01"], default: "today" } },
  { name: "endDate", description: "Last day to fetch, inclusive", values: { examples: ["+6", "+6d", "2024-01-07"], default: "+6" } },
  { name: "startTime", description: "Start hour filter for hourly data", values: { examples: ["6am", "8", "06:00"] } },
  { name: "endTime", description: "End hour filter for hourly data", values: { examples: ["10pm", "22", "22:00"] } },
  { name: "units", description: "Unit system. Defaults to the global units setting", values: { choices: ["metric", "imperial"] } },
  COMMON_CACHE_PARAM,
  { name: "cellSelection", description: "Weather grid cell preference for coastal areas", values: { choices: ["land", "sea", "nearest"], default: "land" } },
];

const WEATHER_VARIABLE_PARAMS = [
  { name: "current", description: "Current weather variables", values: { examples: ["temperature_2m", "weather_code"] } },
  { name: "minutely15", description: "15-minute weather variables", values: { examples: ["temperature_2m", "precipitation"] } },
  { name: "hourly", values: { examples: ["temperature_2m", "precipitation"] } },
  { name: "daily", description: "Daily weather variables", values: { examples: ["temperature_2m_max", "weather_code"] } },
];

const DEBUG_PARAM = { name: "debug", description: "Show a table of how every setting resolved across default, global, frontmatter, and block layers", values: { examples: ["settings"] } };
const PARAMETER_KEYS = ['queryParameters', 'queryParametersPosition', 'queryParametersLayout', 'queryParametersCollapsed'];
const PARAMETER_NESTED_KEYS = { queryParameters: QUERY_PARAMETER_NESTED_KEYS };

const COMMON_TIDE_PARAMS = [
  ...COMMON_SIZE_PARAMS,
  { name: "location", description: "Coordinates for nearest station", values: { examples: ["39.355,-74.418"] } },
  { name: "station", description: "Station name to search", values: { examples: ["\"Atlantic City\""] } },
  { name: "stationId", description: "Fetches this station directly, skipping the nearest-station lookup", values: { examples: ["8534720"] } },
  { name: "datum", description: "Reference level heights are measured from", values: { choices: ["MLLW", "NAVD88", "STND"], default: "MLLW" } },
  { name: "units", description: "Unit system. Defaults to the global units setting", values: { choices: ["metric", "imperial"] } },
  { name: "days", description: "Calendar days to display when endDate is omitted", values: { examples: ["2", "1", "7", "14"], default: "2" } },
  { name: "startDate", description: "First day to fetch. Defaults to today", values: { examples: ["today", "2024-01-01"], default: "today" } },
  { name: "endDate", description: "Last day to fetch, inclusive", values: { examples: ["+1", "+1d", "2024-01-02"], default: "+1" } },
  { name: "showStation", description: "Show the station header (name, type, distance, datum)", values: { choices: ["true", "false"], default: "true" } },
  { name: "showMap", description: "Show a map of the requested coordinates and the answering station", values: { examples: ["false", "true"], default: "false" } },
  { name: "mapProvider", description: "Map provider for showMap", values: "any installed map provider" },
];

const TIDES_CODE_BLOCK_DEFINITIONS: CodeBlockDefinition[] = [
  {
    type: "places-tide-table",
    description: "Tide events as a Markdown-style table",
    parameters: [
      ...COMMON_TIDE_PARAMS,
      DEBUG_PARAM,
      { name: "showSolar", description: "Solar event rows (sunrise, sunset, dawn, dusk)", values: { choices: ["false", "true"], default: "false" } },
      { name: "showMoonPhases", description: "Observed tidal range and moon phase rows", values: { choices: ["false", "true"], default: "false" } },
      { name: "exportHourlyEstimates", description: "Include hourly data", values: { choices: ["false", "true"], default: "false" } },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-tide-cards",
    description: "Tide predictions as daily cards",
    parameters: [
      ...COMMON_TIDE_PARAMS,
      DEBUG_PARAM,
      { name: "showSolar", description: "Solar events on cards", values: { choices: ["false", "true"], default: "false" } },
      { name: "showMoonPhases", description: "Moon phase context on cards", values: { choices: ["false", "true"], default: "false" } },
      { name: "exportHourlyEstimates", description: "Include hourly data", values: { choices: ["false", "true"], default: "false" } },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-tide-chart",
    description: "Tide prediction charts",
    parameters: [
      ...COMMON_TIDE_PARAMS,
      DEBUG_PARAM,
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-tides-vaultquery",
    description: "Tide materialized table definition for VaultQuery",
    parameters: [
      { name: "id", description: "Required identifier for the materialized definition", values: { examples: ["atlantic-city"] } },
      { name: "name", values: { examples: ["Atlantic City"] } },
      { name: "location", description: "Coordinates for nearest station; supports up to 10 total tide sources separated by ;", values: { examples: ["39.355,-74.418"] } },
      { name: "station", description: "Station name to search; supports multiple separated by ;", values: { examples: ["\"Atlantic City\""] } },
      { name: "stationId", description: "NOAA station ID; supports multiple separated by ;", values: { examples: ["8534720"] } },
      { name: "maxStations", description: "Nearby stations to pull per location (total capped at 10)", values: { choices: ["1", "3", "5", "10"], default: "1" } },
      { name: "datum", description: "Reference level heights are measured from", values: { choices: ["MLLW", "NAVD88", "STND"], default: "MLLW" } },
      { name: "units", description: "Unit system. Defaults to the global units setting", values: { choices: ["metric", "imperial"] } },
      { name: "days", description: "Calendar days to display when endDate is omitted", values: { examples: ["2", "1", "7", "14"], default: "2" } },
      { name: "startDate", description: "First day to fetch. Defaults to today", values: { examples: ["today", "2024-01-01"], default: "today" } },
      { name: "endDate", description: "Last day to fetch, inclusive", values: { examples: ["+1", "+1d", "2024-01-02"], default: "+1" } },
      { name: "tables", values: { choices: ["stations", "predictions", "daily"], default: ["stations", "predictions", "daily"] } },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-solar-table",
    description: "Solar event tables",
    parameters: [
      ...COMMON_SIZE_PARAMS,
      { name: "location", values: "41.408,-75.662 or note's Location" },
      { name: "timezone", description: "IANA timezone for solar event times", values: "America/New_York, UTC" },
      { name: "startDate", description: "First day to fetch. Defaults to today", values: { examples: ["today", "2024-01-01"], default: "today" } },
      { name: "endDate", description: "Last day to fetch, inclusive", values: { examples: ["today+7", "2024-01-07"], default: "today+7" } },
      { name: "showTwilight", description: "Adds the civil, nautical, and astronomical twilight rows", values: { choices: ["false", "true"], default: "false" } },
      { name: "showDayLength", description: "Adds the daylight duration row", values: { choices: ["false", "true"], default: "false" } },
      { name: "showSolarNoon", description: "Adds the solar noon row", values: { choices: ["false", "true"], default: "false" } },
      { name: "showAzimuth", description: "Show where on the horizon the sun rises and sets, as a bearing clockwise from north with its compass point (62 degrees ENE)", values: { choices: ["false", "true"], default: "false" } },
      { name: "showAltitude", description: "Show the sun's peak altitude above the horizon at solar noon", values: { choices: ["false", "true"], default: "false" } },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-solar-chart",
    description: "Sun-altitude arc and twilight/daylight band for a single day",
    parameters: [
      ...COMMON_SIZE_PARAMS,
      { name: "location", values: "41.408,-75.662 or note's Location" },
      { name: "timezone", description: "IANA timezone for solar event times", values: "America/New_York, UTC" },
      { name: "startDate", description: "Start day", values: { examples: ["today", "2024-06-21", "today+1"], default: "today" } },
      { name: "endDate", description: "End day - renders one section per day across the range", values: { examples: ["+2d", "2024-06-23"] } },
      { name: "layout", description: "Multi-day layout: stacked rows or one continuous chart", values: { choices: ["rows", "continuous"], default: "rows" } },
      { name: "showHeader", description: "Show the title/location header", values: { choices: ["true", "false"], default: "true" } },
      { name: "showSummary", description: "Show the sunrise/noon/sunset summary row", values: { choices: ["true", "false"], default: "true" } },
      { name: "showLegend", description: "Show the twilight shading legend", values: { choices: ["true", "false"], default: "true" } },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-solar-vaultquery",
    description: "Solar materialized table definition for VaultQuery",
    parameters: [
      { name: "id", description: "Required identifier for the materialized definition", values: { examples: ["scranton-pa"] } },
      { name: "name", values: { examples: ["Scranton, PA"] } },
      { name: "coordinates", values: "41.408,-75.662" },
      { name: "location", description: "Alternative coordinates key", values: "41.408,-75.662" },
      { name: "startDate", description: "First day to fetch. Defaults to today", values: { examples: ["today", "2024-01-01"], default: "today" } },
      { name: "endDate", description: "Last day to fetch, inclusive", values: { examples: ["+1w", "+7d", "2024-01-07"], default: "+1w" } },
      { name: "tables", values: { choices: ["events", "positions"], default: ["events", "positions"] } },
      { name: "timezone", description: "IANA timezone overriding the coordinate lookup", values: "America/New_York" },
      COMMON_CACHE_PARAM
    ]
  }
];

const WEATHER_CODE_BLOCK_DEFINITIONS: CodeBlockDefinition[] = [
  {
    type: "places-weather",
    description: "Weather display (current, minutely15, hourly, or daily modes)",
    parameters: [
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      { name: "mode", values: { examples: ["current", "minutely15", "hourly", "daily"], default: "current" } },
      { name: "showSunriseSunset", description: "Show sunrise and sunset times in minutely15, hourly, and daily modes", values: { choices: ["false", "true"], default: "false" } },
      ...WEATHER_VARIABLE_PARAMS,
    ]
  },
  {
    type: "places-weather-chart",
    description: "Weather chart visualization",
    parameters: [
      ...COMMON_SIZE_PARAMS,
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      { name: "hourly", description: "Hourly variables to chart", values: { examples: ["temperature_2m", "precipitation"] } },
      { name: "minutely15", description: "15-minute weather variables to chart", values: { examples: ["temperature_2m", "precipitation"] } },
      { name: "daily", description: "Daily weather variables to chart", values: { examples: ["temperature_2m_max", "precipitation_sum"] } },
    ]
  },
  {
    type: "places-weather-table",
    description: "Weather data table (hourly or daily)",
    parameters: [
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      { name: "mode", values: { examples: ["hourly", "daily"], default: "hourly" } },
      { name: "columns", description: "Which columns appear, in the order written", values: { examples: ["time", "weather", "temp", "precip_prob", "wind"] } },
    ]
  },
  {
    type: "places-weather-template",
    description: "Custom weather display with Knap or JavaScript",
    parameters: [
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      ...WEATHER_VARIABLE_PARAMS,
      { name: "templateFile", description: "Vault Knap template file", values: { examples: ["Places Templates/Weather.knap.md"] } },
      { name: "templateEngine", description: "Knap Markdown or JavaScript HTML (default)", values: { choices: ["knap", "javascript"], default: "javascript" } },
    ]
  },
  {
    type: "places-weather-vaultquery",
    description: "Weather materialized table definition for VaultQuery",
    parameters: [
      { name: "id", description: "Required identifier for the materialized definition", values: { examples: ["scranton-pa"] } },
      { name: "name", values: { examples: ["Scranton, PA"] } },
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      { name: "daily", description: "Daily weather variables", values: { examples: ["weather_code", "temperature_2m_max", "temperature_2m_min"] } },
      { name: "hourly", values: { examples: ["temperature_2m", "apparent_temperature", "precipitation_probability"] } },
      { name: "tables", values: { choices: ["daily", "hourly"], default: "daily" } },
    ]
  }
];

const TIDES_HIGHLIGHT_CONFIGS: CodeBlockHighlightConfig[] = [
  {
    blockType: 'places-tide-table',
    valueDetails: { units: TIDE_UNIT_DETAILS },
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'station', 'stationId', 'datum', 'units', 'days', 'startDate', 'endDate', 'showStation', 'showSolar', 'showMoonPhases', 'exportHourlyEstimates', 'cache', 'debug'],
  },
  {
    blockType: 'places-tide-cards',
    valueDetails: { units: TIDE_UNIT_DETAILS },
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'station', 'stationId', 'datum', 'units', 'days', 'startDate', 'endDate', 'showStation', 'showSolar', 'showMoonPhases', 'exportHourlyEstimates', 'cache', 'debug'],
  },
  {
    blockType: 'places-tide-chart',
    valueDetails: { units: TIDE_UNIT_DETAILS },
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'station', 'stationId', 'datum', 'units', 'days', 'startDate', 'endDate', 'showStation', 'cache', 'debug'],
  },
  {
    blockType: 'places-tides-vaultquery',
    valueDetails: { units: TIDE_UNIT_DETAILS },
    validKeys: ['id', 'name', 'location', 'station', 'stationId', 'maxStations', 'datum', 'units', 'days', 'startDate', 'endDate', 'tables', 'cache', 'debug'],
    multiValueKeys: ['tables'],
  },
  {
    blockType: 'places-solar-table',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'timezone', 'startDate', 'endDate', 'showTwilight', 'showDayLength', 'showSolarNoon', 'showAzimuth', 'showAltitude', 'cache', 'debug'],
  },
  {
    blockType: 'places-solar-chart',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'timezone', 'startDate', 'endDate', 'layout', 'showHeader', 'showSummary', 'showLegend', 'cache', 'debug'],
  },
  {
    blockType: 'places-solar-vaultquery',
    validKeys: ['id', 'name', 'coordinates', 'location', 'timezone', 'startDate', 'endDate', 'tables', 'cache'],
    multiValueKeys: ['tables'],
  }
];

const WEATHER_HIGHLIGHT_CONFIGS: CodeBlockHighlightConfig[] = [
  {
    blockType: 'places-weather',
    validKeys: ['coordinates', 'location', 'mode', 'days', 'startDate', 'endDate', 'startTime', 'endTime', 'units', 'cache', 'cellSelection', 'showSunriseSunset', 'minutely15', 'current', 'hourly', 'daily'],
    multiValueKeys: ['current', 'minutely15', 'hourly', 'daily'],
    knownValues: {
      mode: ['current', 'minutely15', 'hourly', 'daily', 'h', 'd', '15min', '15m'],
      current: WEATHER_CURRENT_VARIABLES,
      minutely15: WEATHER_MINUTELY15_VARIABLES,
      hourly: WEATHER_HOURLY_VARIABLES,
      daily: WEATHER_DAILY_VARIABLES,
    },
    valueDetails: WEATHER_VARIABLE_DETAILS,
  },
  {
    blockType: 'places-weather-chart',
    validKeys: [...COMMON_SIZE_KEYS, 'coordinates', 'location', 'hourly', 'minutely15', 'daily', 'startDate', 'endDate', 'startTime', 'endTime', 'days', 'units', 'cache', 'cellSelection'],
    multiValueKeys: ['hourly', 'minutely15', 'daily'],
    knownValues: {
      hourly: WEATHER_HOURLY_VARIABLES,
      minutely15: WEATHER_MINUTELY15_VARIABLES,
      daily: WEATHER_DAILY_VARIABLES,
    },
    valueDetails: WEATHER_VARIABLE_DETAILS,
  },
  {
    blockType: 'places-weather-table',
    validKeys: ['coordinates', 'location', 'mode', 'columns', 'days', 'startDate', 'endDate', 'startTime', 'endTime', 'units', 'cache', 'cellSelection'],
    multiValueKeys: ['columns'],
    knownValues: {
      mode: ['hourly', 'daily', 'h', 'd'],
      columns: WEATHER_TABLE_COLUMNS,
    },
    contextualKnownValues: [
      {
        key: 'columns',
        dependsOn: 'mode',
        valuesByContext: {
          hourly: WEATHER_TABLE_HOURLY_COLUMNS,
          h: WEATHER_TABLE_HOURLY_COLUMNS,
          daily: WEATHER_TABLE_DAILY_COLUMNS,
          d: WEATHER_TABLE_DAILY_COLUMNS,
        }
      }
    ]
  },
  {
    blockType: 'places-weather-template',
    validKeys: ['coordinates', 'location', 'current', 'minutely15', 'hourly', 'daily', 'startDate', 'endDate', 'startTime', 'endTime', 'days', 'units', 'cache', 'cellSelection', 'templateEngine', 'templateFile'],
    multiValueKeys: ['current', 'minutely15', 'hourly', 'daily'],
    knownValues: {
      templateEngine: ['knap', 'javascript'],
      current: WEATHER_CURRENT_VARIABLES,
      minutely15: WEATHER_MINUTELY15_VARIABLES,
      hourly: WEATHER_HOURLY_VARIABLES,
      daily: WEATHER_DAILY_VARIABLES,
    },
    valueDetails: {
      ...WEATHER_VARIABLE_DETAILS,
      templateEngine: {
        knap: 'Render Markdown from an external Knap template file',
        javascript: 'Render HTML from a JavaScript template literal in the block body',
      },
    },
  },
  {
    blockType: 'places-weather-vaultquery',
    validKeys: ['id', 'name', 'coordinates', 'location', 'daily', 'hourly', 'tables', 'startDate', 'endDate', 'days', 'units', 'cache', 'cellSelection', 'startTime', 'endTime'],
    multiValueKeys: ['daily', 'hourly', 'tables'],
    knownValues: {
      daily: WEATHER_DAILY_VARIABLES,
      hourly: WEATHER_HOURLY_VARIABLES,
    },
    valueDetails: WEATHER_VARIABLE_DETAILS,
  }
];

export const ALL_CODE_BLOCK_DEFINITIONS: CodeBlockDefinition[] = [
  ...TIDES_CODE_BLOCK_DEFINITIONS,
  ...WEATHER_CODE_BLOCK_DEFINITIONS
];

export const ALL_HIGHLIGHT_CONFIGS: CodeBlockHighlightConfig[] = [
  ...TIDES_HIGHLIGHT_CONFIGS,
  ...WEATHER_HIGHLIGHT_CONFIGS
].map(config => config.blockType.includes('vaultquery') ? config : ({
  ...config,
  validKeys: [...config.validKeys, ...PARAMETER_KEYS],
  rootKeys: [...(config.rootKeys ?? config.validKeys), ...PARAMETER_KEYS],
  nestedKeys: { ...(config.nestedKeys ?? {}), ...PARAMETER_NESTED_KEYS },
  knownValues: {
    ...(config.knownValues ?? {}),
    type: ['string', 'int', 'float', 'boolean', 'enum', 'date', 'datetime', 'time', 'location'],
    control: ['slider', 'range', 'number', 'text', 'combobox', 'dropdown', 'segmented', 'toggle', 'date', 'datetime', 'time', 'multiselect', 'location', 'custom'],
    queryParametersPosition: ['below', 'above', 'floating'],
    queryParametersLayout: ['horizontal', 'vertical'],
    queryParametersCollapsed: ['true', 'false'],
  },
}));
