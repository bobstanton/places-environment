const WEATHER_VARIABLE_MEANINGS: Record<string, string> = {
  temperature_2m: 'Air temperature 2 m above ground',
  temperature_80m: 'Air temperature 80 m above ground',
  temperature_120m: 'Air temperature 120 m above ground',
  temperature_180m: 'Air temperature 180 m above ground',
  apparent_temperature: "Apparent temperature",
  wet_bulb_temperature_2m: 'Wet-bulb temperature 2 m above ground',
  relative_humidity_2m: 'Relative humidity 2 m above ground',
  dew_point_2m: 'Dew point 2 m above ground',
  vapour_pressure_deficit: "Vapor pressure deficit",
  is_day: '1 while the sun is up, 0 at night',
  weather_code: 'WMO condition code behind the icon and wording',
  precipitation: 'Rain, showers, and snow together',
  precipitation_probability: 'Chance of any precipitation',
  precipitation_hours: 'Hours of the day with precipitation',
  rain: 'Rain only',
  showers: 'Convective showers only',
  snowfall: 'Snow that fell in the period',
  snowfall_height: 'Altitude where falling snow turns to rain',
  snow_depth: 'Snow lying on the ground',
  cloud_cover: 'Sky covered by cloud',
  cloud_cover_low: 'Cloud below 3 km',
  cloud_cover_mid: 'Cloud between 3 and 8 km',
  cloud_cover_high: 'Cloud above 8 km',
  pressure_msl: 'Air pressure reduced to sea level',
  surface_pressure: 'Air pressure at this altitude',
  wind_speed_10m: 'Wind speed 10 m above ground',
  wind_speed_80m: 'Wind speed 80 m above ground',
  wind_speed_120m: 'Wind speed 120 m above ground',
  wind_speed_180m: 'Wind speed 180 m above ground',
  wind_direction_10m: 'Wind direction 10 m above ground',
  wind_direction_80m: 'Wind direction 80 m above ground',
  wind_direction_120m: 'Wind direction 120 m above ground',
  wind_direction_180m: 'Wind direction 180 m above ground',
  wind_gusts_10m: 'Peak gust 10 m above ground',
  uv_index_max: 'Daily maximum UV index',
  uv_index_clear_sky_max: 'Daily maximum clear-sky UV index',
  uv_index_clear_sky: "Clear-sky UV index",
  cape: "Convective available potential energy",
  freezing_level_height: "Freezing-level altitude (0 C)",
  sunshine_duration: 'Time the sun was not blocked by cloud',
  daylight_duration: 'Time between sunrise and sunset',
  et0_fao_evapotranspiration: "FAO-56 reference evapotranspiration",
  soil_temperature_0cm: 'Soil temperature at the surface',
  soil_temperature_6cm: 'Soil temperature 6 cm down',
  soil_temperature_18cm: 'Soil temperature 18 cm down',
  soil_temperature_54cm: 'Soil temperature 54 cm down',
  soil_moisture_0_to_1cm: 'Soil moisture in the top centimeter',
  soil_moisture_1_to_3cm: 'Soil moisture 1 to 3 cm down',
  soil_moisture_3_to_9cm: 'Soil moisture 3 to 9 cm down',
  soil_moisture_9_to_27cm: 'Soil moisture 9 to 27 cm down',
  soil_moisture_27_to_81cm: 'Soil moisture 27 to 81 cm down',
  shortwave_radiation: 'Solar energy reaching a flat surface',
  direct_radiation: "Direct solar radiation on a horizontal surface",
  diffuse_radiation: "Diffuse solar radiation on a horizontal surface",
  direct_normal_irradiance: 'Direct beam measured facing the sun',
  global_tilted_irradiance: 'Solar energy reaching a tilted panel',
  terrestrial_radiation: 'Solar energy above the atmosphere, before any loss',
};

const DAILY_AGGREGATES: ReadonlyArray<readonly [string, string]> = [
  ['_max', 'Daily high'],
  ['_min', 'Daily low'],
  ['_mean', 'Daily mean'],
  ['_sum', 'Daily total'],
  ['_dominant', 'Prevailing'],
];

export function weatherVariableDetail(variable: string): string | undefined {
  const direct = WEATHER_VARIABLE_MEANINGS[variable];

  if (direct) return direct;
  const aggregate = DAILY_AGGREGATES.find(([suffix]) => variable.endsWith(suffix));
  const base = aggregate ? WEATHER_VARIABLE_MEANINGS[variable.slice(0, -aggregate[0].length)] : undefined;

  return aggregate && base ? `${aggregate[1]}: ${base}` : undefined;
}
