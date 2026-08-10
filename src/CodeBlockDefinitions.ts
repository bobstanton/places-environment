import { COMMON_CACHE_PARAM, COMMON_SIZE_PARAMS, COMMON_SIZE_KEYS, BOOLEAN_VALUES, QUERY_PARAMETER_NESTED_KEYS, UNIT_VALUES } from "places-shared/settings";
import { CodeBlockDefinition, CodeBlockHighlightConfig } from "places-shared/services";

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
  { name: "days", description: "Calendar days to display when endDate is omitted", values: "1, 3, **7**, 14" },
  { name: "startDate", description: "First day to fetch. Defaults to today", values: "**today**, tomorrow, 2024-01-01" },
  { name: "endDate", description: "Last day to fetch, inclusive", values: "**+6**, +6d, 2024-01-07" },
  { name: "startTime", description: "Start hour filter for hourly data", values: "6am, 8, 06:00" },
  { name: "endTime", description: "End hour filter for hourly data", values: "10pm, 22, 22:00" },
  { name: "units", description: "Unit system. Defaults to the global units setting", values: "metric, imperial" },
  COMMON_CACHE_PARAM,
  { name: "cellSelection", description: "Weather grid cell preference for coastal areas", values: "**land**, sea, nearest" },
];

const WEATHER_VARIABLE_PARAMS = [
  { name: "current", description: "Current weather variables", values: "temperature_2m, weather_code" },
  { name: "minutely15", description: "15-minute weather variables", values: "temperature_2m, precipitation" },
  { name: "hourly", description: "Hourly weather variables", values: "temperature_2m, precipitation" },
  { name: "daily", description: "Daily weather variables", values: "temperature_2m_max, weather_code" },
];

const DEBUG_PARAM = { name: "debug", description: "Show a table of how every setting resolved across default, global, frontmatter, and block layers", values: "settings" };
const PARAMETER_KEYS = ['queryParameters', 'queryParametersPosition', 'queryParametersLayout', 'queryParametersCollapsed'];
const PARAMETER_NESTED_KEYS = { queryParameters: QUERY_PARAMETER_NESTED_KEYS };

const COMMON_TIDE_PARAMS = [
  ...COMMON_SIZE_PARAMS,
  { name: "location", description: "Coordinates for nearest station", values: "39.355,-74.418" },
  { name: "station", description: "Station name to search", values: "\"Battery Park\"" },
  { name: "stationId", description: "Fetches this station directly, skipping the nearest-station lookup", values: "8518750" },
  { name: "datum", description: "Reference level heights are measured from", values: "**MLLW**, NAVD88, STND" },
  { name: "units", description: "Unit system. Defaults to the global units setting", values: "metric, imperial" },
  { name: "days", description: "Calendar days to display when endDate is omitted", values: "**2**, 1, 7, 14" },
  { name: "startDate", description: "First day to fetch. Defaults to today", values: "**today**, 2024-01-01" },
  { name: "endDate", description: "Last day to fetch, inclusive", values: "**+1**, +1d, 2024-01-02" },
  { name: "showStation", description: "Show the station header (name, type, distance, datum)", values: "**true**, false" },
  { name: "showMap", description: "Show a map of the requested coordinates and the answering station", values: "**false**, true" },
  { name: "mapProvider", description: "Map provider for showMap", values: "openfreemap, leaflet" },
];

const TIDES_CODE_BLOCK_DEFINITIONS: CodeBlockDefinition[] = [
  {
    type: "places-tide-table",
    description: "Tide events as a Markdown-style table",
    parameters: [
      ...COMMON_TIDE_PARAMS,
      DEBUG_PARAM,
      { name: "showSolar", description: "Solar event rows (sunrise, sunset, dawn, dusk)", values: "**false**, true" },
      { name: "showMoonPhases", description: "Observed tidal range and moon phase rows", values: "**false**, true" },
      { name: "exportHourlyEstimates", description: "Include hourly data", values: "**false**, true" },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-tide-cards",
    description: "Tide predictions as daily cards",
    parameters: [
      ...COMMON_TIDE_PARAMS,
      DEBUG_PARAM,
      { name: "showSolar", description: "Solar events on cards", values: "**false**, true" },
      { name: "showMoonPhases", description: "Moon phase context on cards", values: "**false**, true" },
      { name: "exportHourlyEstimates", description: "Include hourly data", values: "**false**, true" },
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
      { name: "id", description: "Stable query identifier", values: "battery-park" },
      { name: "name", description: "Display name", values: "Battery Park" },
      { name: "location", description: "Coordinates for nearest station; supports up to 10 total tide sources separated by ;", values: "39.355,-74.418; 40.7003,-74.0142" },
      { name: "station", description: "Station name to search; supports multiple separated by ;", values: "\"Battery Park\"; Boston" },
      { name: "stationId", description: "NOAA station ID; supports multiple separated by ;", values: "8518750; 8443970" },
      { name: "maxStations", description: "Nearby stations to pull per location (total capped at 10)", values: "**1**, 3, 5, 10" },
      { name: "datum", description: "Reference level heights are measured from", values: "**MLLW**, NAVD88, STND" },
      { name: "units", description: "Unit system. Defaults to the global units setting", values: "metric, imperial" },
      { name: "days", description: "Calendar days to display when endDate is omitted", values: "**2**, 1, 7, 14" },
      { name: "startDate", description: "First day to fetch. Defaults to today", values: "**today**, 2024-01-01" },
      { name: "endDate", description: "Last day to fetch, inclusive", values: "**+1**, +1d, 2024-01-02" },
      { name: "tables", description: "Tables to populate", values: "**stations, predictions, daily**" },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-solar-table",
    description: "Solar event tables",
    parameters: [
      ...COMMON_SIZE_PARAMS,
      { name: "location", description: "Coordinates", values: "41.408,-75.662 or note's Location" },
      { name: "timezone", description: "IANA timezone for solar event times", values: "America/New_York, UTC" },
      { name: "startDate", description: "First day to fetch. Defaults to today", values: "**today**, 2024-01-01" },
      { name: "endDate", description: "Last day to fetch, inclusive", values: "**today+7**, 2024-01-07" },
      { name: "showTwilight", description: "Adds the civil, nautical, and astronomical twilight rows", values: "**false**, true" },
      { name: "showDayLength", description: "Adds the daylight duration row", values: "**false**, true" },
      { name: "showSolarNoon", description: "Adds the solar noon row", values: "**false**, true" },
      { name: "showAzimuth", description: "Show where on the horizon the sun rises and sets, as a bearing clockwise from north with its compass point (62° ENE)", values: "**false**, true" },
      { name: "showAltitude", description: "Show the sun's peak altitude above the horizon at solar noon", values: "**false**, true" },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-solar-chart",
    description: "Sun-altitude arc and twilight/daylight band for a single day",
    parameters: [
      ...COMMON_SIZE_PARAMS,
      { name: "location", description: "Coordinates", values: "41.408,-75.662 or note's Location" },
      { name: "timezone", description: "IANA timezone for solar event times", values: "America/New_York, UTC" },
      { name: "startDate", description: "Start day", values: "**today**, 2024-06-21, today+1" },
      { name: "endDate", description: "End day - renders one section per day across the range", values: "+2d, 2024-06-23" },
      { name: "layout", description: "Multi-day layout: stacked rows or one continuous chart", values: "**rows**, continuous" },
      { name: "showHeader", description: "Show the title/location header", values: "**true**, false" },
      { name: "showSummary", description: "Show the sunrise/noon/sunset summary row", values: "**true**, false" },
      { name: "showLegend", description: "Show the twilight shading legend", values: "**true**, false" },
      COMMON_CACHE_PARAM
    ]
  },
  {
    type: "places-solar-vaultquery",
    description: "Solar materialized table definition for VaultQuery",
    parameters: [
      { name: "id", description: "Stable query identifier", values: "scranton-pa" },
      { name: "name", description: "Display name", values: "Scranton, PA" },
      { name: "coordinates", description: "Coordinates", values: "41.408,-75.662" },
      { name: "location", description: "Alternative coordinates key", values: "41.408,-75.662" },
      { name: "startDate", description: "First day to fetch. Defaults to today", values: "**today**, 2024-01-01" },
      { name: "endDate", description: "Last day to fetch, inclusive", values: "**+1w**, +7d, 2024-01-07" },
      { name: "tables", description: "Tables to populate", values: "**events, positions**" },
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
      { name: "mode", values: "**current**, minutely15, hourly, daily" },
      { name: "showSunriseSunset", description: "Show sunrise and sunset times in daily mode", values: "**false**, true" },
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
      { name: "hourly", description: "Hourly variables to chart", values: "temperature_2m, precipitation" },
      { name: "minutely15", description: "15-minute weather variables to chart", values: "temperature_2m, precipitation" },
      { name: "daily", description: "Daily weather variables to chart", values: "temperature_2m_max, precipitation_sum" },
    ]
  },
  {
    type: "places-weather-table",
    description: "Weather data table (hourly or daily)",
    parameters: [
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      { name: "mode", values: "**hourly**, daily" },
      { name: "columns", description: "Which columns appear, in the order written", values: "time, weather, temp, precip_prob, wind" },
    ]
  },
  {
    type: "places-weather-template",
    description: "Custom weather template with JavaScript",
    parameters: [
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      ...WEATHER_VARIABLE_PARAMS,
    ]
  },
  {
    type: "places-weather-vaultquery",
    description: "Weather materialized table definition for VaultQuery",
    parameters: [
      { name: "id", description: "Stable query identifier", values: "scranton-pa" },
      { name: "name", description: "Display name", values: "Scranton, PA" },
      ...COMMON_WEATHER_PARAMS,
      DEBUG_PARAM,
      { name: "daily", description: "Daily weather variables", values: "weather_code, temperature_2m_max, temperature_2m_min" },
      { name: "hourly", description: "Hourly weather variables", values: "temperature_2m, apparent_temperature, precipitation_probability" },
      { name: "tables", description: "Tables to populate", values: "**daily**, hourly" },
    ]
  }
];

const TIDES_HIGHLIGHT_CONFIGS: CodeBlockHighlightConfig[] = [
  {
    blockType: 'places-tide-table',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'station', 'stationId', 'datum', 'units', 'days', 'startDate', 'endDate', 'showStation', 'showSolar', 'showMoonPhases', 'exportHourlyEstimates', 'cache', 'debug'],
    knownValues: {
      datum: ['mllw', 'navd88', 'stnd'],
      units: UNIT_VALUES,
      showStation: BOOLEAN_VALUES,
      showSolar: BOOLEAN_VALUES,
      showMoonPhases: BOOLEAN_VALUES,
      exportHourlyEstimates: BOOLEAN_VALUES,
    }
  },
  {
    blockType: 'places-tide-cards',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'station', 'stationId', 'datum', 'units', 'days', 'startDate', 'endDate', 'showStation', 'showSolar', 'showMoonPhases', 'exportHourlyEstimates', 'cache', 'debug'],
    knownValues: {
      datum: ['mllw', 'navd88', 'stnd'],
      units: UNIT_VALUES,
      showStation: BOOLEAN_VALUES,
      showSolar: BOOLEAN_VALUES,
      showMoonPhases: BOOLEAN_VALUES,
      exportHourlyEstimates: BOOLEAN_VALUES,
    }
  },
  {
    blockType: 'places-tide-chart',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'station', 'stationId', 'datum', 'units', 'days', 'startDate', 'endDate', 'showStation', 'cache', 'debug'],
    knownValues: {
      datum: ['mllw', 'navd88', 'stnd'],
      units: UNIT_VALUES,
      showStation: BOOLEAN_VALUES,
    }
  },
  {
    blockType: 'places-tides-vaultquery',
    validKeys: ['id', 'name', 'location', 'station', 'stationId', 'maxStations', 'datum', 'units', 'days', 'startDate', 'endDate', 'tables', 'cache', 'debug'],
    multiValueKeys: ['tables'],
    knownValues: {
      maxStations: ['1', '3', '5', '10'],
      datum: ['mllw', 'navd88', 'stnd'],
      units: UNIT_VALUES,
      tables: ['stations', 'predictions', 'daily'],
    }
  },
  {
    blockType: 'places-solar-table',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'timezone', 'startDate', 'endDate', 'showTwilight', 'showDayLength', 'showSolarNoon', 'showAzimuth', 'showAltitude', 'cache', 'debug'],
    knownValues: {
      showTwilight: BOOLEAN_VALUES,
      showDayLength: BOOLEAN_VALUES,
      showSolarNoon: BOOLEAN_VALUES,
      showAzimuth: BOOLEAN_VALUES,
      showAltitude: BOOLEAN_VALUES,
    }
  },
  {
    blockType: 'places-solar-chart',
    validKeys: [...COMMON_SIZE_KEYS, 'location', 'timezone', 'startDate', 'endDate', 'layout', 'showHeader', 'showSummary', 'showLegend', 'cache', 'debug'],
    knownValues: {
      layout: ['rows', 'continuous'],
      showHeader: BOOLEAN_VALUES,
      showSummary: BOOLEAN_VALUES,
      showLegend: BOOLEAN_VALUES,
    }
  },
  {
    blockType: 'places-solar-vaultquery',
    validKeys: ['id', 'name', 'coordinates', 'location', 'timezone', 'startDate', 'endDate', 'tables', 'cache'],
    multiValueKeys: ['tables'],
    knownValues: {
      tables: ['events', 'positions'],
    }
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
      units: UNIT_VALUES,
      showSunriseSunset: ['false', 'true'],
      cellSelection: ['land', 'sea', 'nearest']
    }
  },
  {
    blockType: 'places-weather-chart',
    validKeys: [...COMMON_SIZE_KEYS, 'coordinates', 'location', 'hourly', 'minutely15', 'daily', 'startDate', 'endDate', 'startTime', 'endTime', 'days', 'units', 'cache', 'cellSelection'],
    multiValueKeys: ['hourly', 'minutely15', 'daily'],
    knownValues: {
      hourly: WEATHER_HOURLY_VARIABLES,
      minutely15: WEATHER_MINUTELY15_VARIABLES,
      daily: WEATHER_DAILY_VARIABLES,
      units: UNIT_VALUES,
      cellSelection: ['land', 'sea', 'nearest']
    }
  },
  {
    blockType: 'places-weather-table',
    validKeys: ['coordinates', 'location', 'mode', 'columns', 'days', 'startDate', 'endDate', 'startTime', 'endTime', 'units', 'cache', 'cellSelection'],
    multiValueKeys: ['columns'],
    knownValues: {
      mode: ['hourly', 'daily', 'h', 'd'],
      columns: WEATHER_TABLE_COLUMNS,
      units: UNIT_VALUES,
      cellSelection: ['land', 'sea', 'nearest']
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
    validKeys: ['coordinates', 'location', 'current', 'minutely15', 'hourly', 'daily', 'startDate', 'endDate', 'startTime', 'endTime', 'days', 'units', 'cache', 'cellSelection'],
    multiValueKeys: ['current', 'minutely15', 'hourly', 'daily'],
    knownValues: {
      current: WEATHER_CURRENT_VARIABLES,
      minutely15: WEATHER_MINUTELY15_VARIABLES,
      hourly: WEATHER_HOURLY_VARIABLES,
      daily: WEATHER_DAILY_VARIABLES,
      units: UNIT_VALUES,
      cellSelection: ['land', 'sea', 'nearest']
    }
  },
  {
    blockType: 'places-weather-vaultquery',
    validKeys: ['id', 'name', 'coordinates', 'location', 'daily', 'hourly', 'tables', 'startDate', 'endDate', 'days', 'units', 'cache', 'cellSelection', 'startTime', 'endTime'],
    multiValueKeys: ['daily', 'hourly', 'tables'],
    knownValues: {
      daily: WEATHER_DAILY_VARIABLES,
      hourly: WEATHER_HOURLY_VARIABLES,
      tables: ['daily', 'hourly'],
      units: UNIT_VALUES,
      cellSelection: ['land', 'sea', 'nearest']
    }
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
