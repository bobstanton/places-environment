---
id: weather-help
title: Weather Help
---

# Weather Help

## Overview

Weather blocks use the [Open-Meteo API](https://open-meteo.com).

## Available Code Blocks

| Code Block                      | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `places-weather`                | Weather display with mode: current, minutely15, hourly, or daily |
| `places-weather-chart`          | Display hourly weather data as an interactive chart              |
| `places-weather-table`          | Display weather data as a configurable table                     |
| `places-weather-template`       | Create custom displays with JavaScript templates                 |
| `places-weather-vaultquery`     | Define materialized weather tables for VaultQuery                |
| `places-weather-help`           | Show this general help                                           |
| `places-weather-chart-help`     | Show detailed help for chart blocks                              |
| `places-weather-table-help`     | Show detailed help for table blocks                              |
| `places-weather-template-help`  | Show detailed help for template blocks                           |
| `places-vaultquery-tables-help` | Show VaultQuery table-provider help                              |

## Basic Usage

Add a Location property to the note frontmatter, then use a weather code block:

~~~yaml
---
Location: "Scranton: 41.408, -75.662"
---
~~~

~~~places-weather
~~~

## places-weather Modes

The `places-weather` block supports four display modes:

### Current Mode (default)

Compact current conditions.

When 15-minute data is available, the card adds a **temperature trend sparkline**. It shows roughly the last hour and the next three hours, with now marked on the line.

~~~places-weather
coordinates: 41.408, -75.662
mode: current
~~~

### Minutely15 Mode

Day rows, 15-minute cards.

~~~places-weather
coordinates: 41.408, -75.662
mode: minutely15
days: 1
~~~

Minutely15 mode requires minutely_15 data, which only exists for Central Europe and North America; other regions get an error message.

### Hourly Mode

Day-by-day rows with horizontal scrolling hour cards. When 15-minute data is available and there's weather variation within an hour, a **trend indicator** appears showing the upcoming weather change.

~~~places-weather
coordinates: 41.408, -75.662
mode: hourly
days: 3
startTime: 6am
endTime: 10pm
~~~

### Daily Mode

Forecast cards grid:

~~~places-weather
coordinates: 41.408, -75.662
mode: daily
days: 7
~~~

## Settings

| Setting           | Description                                                                                                                                                                            | Examples                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| coordinates       | `lat, lon` or `Name: lat, lon`; separate multiple locations with semicolons                                                                                                            | 41.408, -75.662                               |
| location          | Alternative to coordinates using the same named-coordinate format                                                                                                                      | 41.408, -75.662                               |
| mode              | Display mode                                                                                                                                                                           | **current**, minutely15, hourly, daily        |
| days              | Calendar days to display (default: 1 for minutely15, 7 for hourly/daily)                                                                                                               | 2, 7                                          |
| startDate         | First day to fetch. Defaults to today                                                                                                                                                  | **today**, tomorrow, 2024-01-01               |
| endDate           | Last day to fetch, inclusive                                                                                                                                                           | **+6**, +6d, 2024-01-07                       |
| units             | Unit system. Defaults to the global units setting                                                                                                                                      | metric, imperial                              |
| cache             | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                                                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| startTime         | Filter data from this hour (0-23, or `6am`, `14:00`)                                                                                                                                   | 6am, 14:00                                    |
| endTime           | Filter data until this hour (0-23, or `6pm`, `18:00`)                                                                                                                                  | 6pm, 18:00                                    |
| cellSelection     | Grid cell preference                                                                                                                                                                   | **land**, sea, nearest                        |
| showSunriseSunset | Show sunrise and sunset times in minutely15, hourly, and daily modes                                                                                                                   | true, **false**                               |
| minutely15        | 15-minute resolution variables (more accurate current conditions)                                                                                                                      |                                               |
| queryParameters   | UI controls that adjust the block without editing it; `queryParametersPosition`, `queryParametersLayout`, and `queryParametersCollapsed` place them. See `places-queryparameters-help` | `- name: forecastPoint`                       |

`coordinates` and `location` accept query-parameter references like every other extension setting:

~~~places-weather
coordinates: {parameter.forecastPoint}
mode: daily
queryParameters:
  - name: forecastPoint
    type: location
    default: 41.408, -75.662
~~~

## Additional Settings

### Sunrise and Sunset

`showSunriseSunset` defaults to `false`. It controls the sunrise and sunset times in hourly and minutely15 day headers and daily cards, including seasonal estimates:

~~~places-weather
mode: hourly
days: 3
showSunriseSunset: false
~~~

Set it to `true` to display those times. It does not hide weather condition icons or change separate solar blocks.

### Mobile Controls

On mobile and other touch devices, the action buttons stay visible in a row above the weather content. This leaves the dates, sunrise/sunset times, and forecast summaries clear. Desktop controls appear on hover or keyboard focus.

### Cell Selection

For coastal locations, `cellSelection` controls which grid cell is used:

- `land` (default) - Prefer land-based measurements
- `sea` - Prefer sea-based measurements
- `nearest` - Use nearest grid cell regardless of land/sea

~~~places-weather
coordinates: 41.408, -75.662
cellSelection: land
~~~

### 15-Minute Data

For more accurate current conditions, use `minutely15:` to request 15-minute resolution data. Available in Central Europe and North America.

~~~places-weather
coordinates: 41.408, -75.662
minutely15: temperature_2m, precipitation
~~~

## Available Variables

Common variables:

| Category      | Variables                                           |
| ------------- | --------------------------------------------------- |
| Temperature   | temperature_2m, apparent_temperature, dew_point_2m  |
| Precipitation | precipitation, rain, showers, snowfall              |
| Wind          | wind_speed_10m, wind_direction_10m, wind_gusts_10m  |
| Atmosphere    | relative_humidity_2m, surface_pressure, cloud_cover |
| Condition     | weather_code (WMO codes with emoji support)         |

For a complete list of variables, see the [Open-Meteo API Documentation](https://open-meteo.com/en/docs).

## VaultQuery

Use `places-weather-vaultquery` to make weather data queryable from VaultQuery instead of rendering it in the note. See `places-vaultquery-tables-help` for examples and table names.

## Date Formats

- **Absolute:** `2025-08-15`, `08/15/2025`, `20250815`
- **Relative:** `today`, `tomorrow`, `yesterday`, `this weekend`
- **Offsets:** `+3d`, `+1w`, `-2d`, `+1m`

## Time Formats (for startTime/endTime)

- **24-hour:** `0`, `6`, `14`, `23`
- **With minutes:** `6:00`, `14:30`
- **12-hour:** `6am`, `2pm`, `6:30am`

## Attribution

Weather data provided by [Open-Meteo](https://open-meteo.com).
