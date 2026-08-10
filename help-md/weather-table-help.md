---
id: weather-table-help
title: Weather Table Help
---

# Weather Table Help

Display weather data in a configurable table format. Supports both hourly and daily data with customizable columns.

## Basic Usage

~~~places-weather-table
coordinates: 41.408, -75.662
~~~

## Hourly Table

~~~places-weather-table
coordinates: 41.408, -75.662
mode: hourly
columns: time, weather, temp, feels_like, precip_prob, precip_amt, wind, humidity
days: 2
~~~

## Daily Table

~~~places-weather-table
coordinates: 41.408, -75.662
mode: daily
columns: date, weather, high_low, precip_prob, precip_amt, sunrise, sunset, uv
days: 7
~~~

## Settings

| Setting | Description | Examples |
| ------- | ----------- | -------- |
| coordinates | `lat, lon` or `Name: lat, lon` (or use frontmatter Location) | 41.408, -75.662 |
| mode | Display mode | **hourly**, daily |
| columns | Comma-separated list of columns to display |  |
| days | Calendar days to display | **7**, 2 |
| startDate | Start date | **today**, +3, 2025-08-15 |
| endDate | Inclusive end date (alternative to days) | +1, +3d, 2025-08-22 |
| units | Unit system. Defaults to the global units setting | metric, imperial |
| cache | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever` | **true**, false, forever, 30m, 7d, 2027-01-01 |
| cellSelection | Grid cell preference | **land**, sea, nearest |

## Hourly Columns

| Column        | Description                                    |
| ------------- | ---------------------------------------------- |
| `time`        | Hour (9 AM, 10 AM, etc.)                       |
| `weather`     | Weather emoji                                  |
| `temp`        | Temperature                                    |
| `feels_like`  | Apparent temperature                           |
| `precip_prob` | Precipitation probability %                    |
| `precip_type` | Precipitation type (Rain, Snow, Drizzle, etc.) |
| `precip_amt`  | Precipitation amount                           |
| `wind`        | Wind speed                                     |
| `wind_gusts`  | Wind gusts                                     |
| `wind_dir`    | Wind direction (N, NE, E, etc.)                |
| `humidity`    | Relative humidity %                            |
| `cloud`       | Cloud cover %                                  |
| `pressure`    | Surface pressure (hPa)                         |
| `visibility`  | Visibility distance                            |
| `dew_point`   | Dew point temperature                          |

**Default hourly columns:** time, weather, temp, precip_prob, precip_type, precip_amt, wind

## Daily Columns

| Column        | Description                                    |
| ------------- | ---------------------------------------------- |
| `date`        | Date (Mon 1/20, etc.)                          |
| `weather`     | Weather emoji                                  |
| `high`        | High temperature                               |
| `low`         | Low temperature                                |
| `high_low`    | Combined high/low                              |
| `precip_prob` | Precipitation probability %                    |
| `precip_type` | Precipitation type (Rain, Snow, Drizzle, etc.) |
| `precip_amt`  | Total precipitation                            |
| `wind`        | Max wind speed                                 |
| `wind_gusts`  | Max wind gusts                                 |
| `wind_dir`    | Dominant wind direction                        |
| `sunrise`     | Sunrise time                                   |
| `sunset`      | Sunset time                                    |
| `daylight`    | Daylight duration                              |
| `uv`          | UV index                                       |

**Default daily columns:** date, weather, high_low, precip_prob, precip_type, precip_amt, sunrise, sunset

## Column Aliases

Supported aliases:

| Alias                | Resolves to   |
| -------------------- | ------------- |
| `temperature`        | `temp`        |
| `apparent`           | `feels_like`  |
| `precip_probability` | `precip_prob` |
| `precip_amount`      | `precip_amt`  |
| `precipitation`      | `precip_amt`  |
| `precipitation_type` | `precip_type` |
| `wind_speed`         | `wind`        |
| `wind_direction`     | `wind_dir`    |
| `cloud_cover`        | `cloud`       |
| `uv_index`           | `uv`          |

## Date Formats

- **Relative keywords:** `today`, `tomorrow`, `yesterday`
- **Relative offsets:** `+3d` (3 days ahead), `-2d`, `+1w` (1 week)
- **Absolute dates:** `2025-08-15`, `08/15/2025`

## Row Highlighting

Rows are automatically highlighted based on weather severity:

| Severity | Color      | Weather Conditions                              |
| -------- | ---------- | ----------------------------------------------- |
| Clear    | None       | Clear sky, partly cloudy, overcast              |
| Mild     | Light blue | Fog, drizzle, light rain, light snow            |
| Moderate | Yellow     | Freezing drizzle/rain, heavy rain/snow, showers |
| Severe   | Red        | Thunderstorms, hail                             |

