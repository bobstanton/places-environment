---
id: vaultquery-tables-help
title: VaultQuery Tables Help
---

# VaultQuery Tables

Places Environment can feed weather, tide, and solar data into VaultQuery, Definition blocks materialize the data as VaultQuery tables instead of rendering it in the note.

> [!important] Requirements
> **Setting:** **Settings > VaultQuery > Integrations > Plugin integrations > Third-party provider tables**.
>
> **Also requires:** VaultQuery and Places - Environment installed and enabled, with the weather, tide, or solar definitions below.
>
> **Plugin default:** Off. **Scranton sample:** On.

## Refreshing

`cache` decides when a definition's data goes stale, and VaultQuery refreshes the
definition once it does. The refresh button on the definition block fetches again
whatever the setting says, and replaces what was cached when the fetch succeeds -
which is the only way a `cache: forever` definition is ever updated. A fetch that
fails leaves the cached data and its rows in place.

## Weather Definition

~~~places-weather-vaultquery
id: scranton-pa
name: Scranton, PA
coordinates: 41.409, -75.662
tables: daily, hourly
daily: weather_code, temperature_2m_max, temperature_2m_min, precipitation_sum, sunrise, sunset
hourly: temperature_2m, apparent_temperature, precipitation_probability, wind_speed_10m
startDate: today
endDate: +7d
units: imperial
~~~

Weather tables:

| Table            | Description                        |
| ---------------- | ---------------------------------- |
| `weather_daily`  | One row per day and definition id  |
| `weather_hourly` | One row per hour and definition id |

### Settings

| Setting       | Description                                                                                                                 | Examples                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| id            | Required. Stable identifier carried on every row the definition writes                                                      | scranton-pa                                   |
| coordinates   | Required unless `location` is set. Optional name, then latitude and longitude; semicolons separate multiple locations       | Scranton: 41.408, -75.662                     |
| location      | Alternative to `coordinates`, same format; falls back to the note's Location property                                       | Scranton: 41.408, -75.662                     |
| name          | Display name. Defaults to the first coordinate's name, then the id                                                          | Scranton, PA                                  |
| tables        | Tables to populate                                                                                                          | **daily**, hourly                             |
| daily         | Daily weather variables for `weather_daily`                                                                                 | weather_code, temperature_2m_max              |
| hourly        | Hourly weather variables for `weather_hourly`                                                                               | temperature_2m, precipitation_probability     |
| startDate     | Start date                                                                                                                  | **today**, tomorrow, 2025-08-15               |
| endDate       | Inclusive end date                                                                                                          | **+6**, +6d, 2025-08-20                       |
| days          | Calendar days when `endDate` is omitted                                                                                     | 1, 3, **7**, 14                               |
| startTime     | Start hour filter for hourly data                                                                                           | 6am, 06:00                                    |
| endTime       | End hour filter for hourly data                                                                                             | 10pm, 22:00                                   |
| units         | Unit system. Defaults to the global units setting                                                                           | metric, imperial                              |
| cellSelection | Weather grid cell preference for coastal areas                                                                              | **land**, sea, nearest                        |
| cache         | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever` | **true**, false, forever, 30m, 7d, 2027-01-01 |
| debug         | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                | settings                                      |

## Tide Definition

~~~places-tides-vaultquery
id: battery-park
name: Atlantic City
location: 39.355, -74.418
tables: stations, predictions, daily
startDate: today
endDate: +7d
units: imperial
~~~

Tide tables:

| Table              | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `tide_stations`    | Station metadata                                                                |
| `tide_predictions` | High/low and hourly prediction rows                                             |
| `tide_daily`       | Daily tide summary with high/low tide times, solar context, and moon phase data |

### Settings

| Setting     | Description                                                                                                                                            | Examples                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| id          | Required. Stable identifier carried on every row the definition writes                                                                                 | battery-park                                  |
| location    | Coordinates resolved to the nearest station; one of `location`, `station`, or `stationId` is required. Semicolons separate up to 10 total tide sources | 39.355, -74.418                               |
| station     | Station name to search; semicolons separate multiple                                                                                                   | Atlantic City                                 |
| stationId   | NOAA station ID; semicolons separate multiple                                                                                                          | 8534720                                       |
| name        | Display name. Defaults to the id                                                                                                                       | Atlantic City                                 |
| maxStations | Nearby stations to pull per location (total capped at 10)                                                                                              | **1**, 3, 5                                   |
| datum       | Tidal datum                                                                                                                                            | **MLLW**, NAVD88, STND                        |
| units       | Unit system. Defaults to the global units setting                                                                                                      | metric, imperial                              |
| days        | Calendar days when `endDate` is omitted                                                                                                                | **2**, 7                                      |
| startDate   | Start date                                                                                                                                             | **today**, 2025-08-15                         |
| endDate     | Inclusive end date                                                                                                                                     | **+1**, +1d, 2025-08-22                       |
| tables      | Tables to populate                                                                                                                                     | **stations, predictions, daily**              |
| cache       | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| debug       | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                                           | settings                                      |

### Multiple Tide Locations

Tide VaultQuery definitions can use up to 10 total semicolon-separated tide sources across `location`, `stationId`, and `station`. Explicit `stationId` and `station` values fetch those stations. Each location resolves to its nearest NOAA tide station, and `maxStations` controls how many nearby stations to pull *per location* (default 1). N locations give N stations even at the default. Duplicate stations are only fetched once, and the total is capped at 10.

`tide_daily` includes map-ready daily fields (`tide_summary`, `high_tides`, `low_tides`, `high_tide_count`, `low_tide_count`, `high_tides_json`, and `low_tides_json`). `tide_summary AS description` in a `places` query puts high and low tide times straight into the marker popup.

~~~places-tides-vaultquery
id: northeast-tides
name: Northeast tides
location: 39.355, -74.418; 40.7003, -74.0142; 41.2835, -70.0995
stationId: 8410140; 8418150
maxStations: 5
tables: stations, daily
startDate: today
endDate: +7d
units: imperial
~~~

## Solar Definition

~~~places-solar-vaultquery
id: scranton-pa
name: Scranton, PA
coordinates: 41.409, -75.662
startDate: today
endDate: +30d
~~~

Solar tables:

| Table             | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `solar_events`    | One row per day: sun times, twilight, and solar bearings |
| `solar_positions` | One row per hour: the sun's live position                |

In `solar_positions`, `azimuth` is the bearing to the sun and `light_direction` the bearing sunlight travels (180 degrees opposed - where shadows fall). `solar_positions` is computed from the time and coordinates rather than fetched. It costs no extra API request. Its `hour` is the location's own wall clock, matching `weather_hourly.hour`. `solar_events` costs one request per day **per location**.

Bearings in both tables run clockwise from true north, the same convention as `wind_direction_10m` and the map's `iconRotation`. Any of these columns can drive a marker directly.

### Settings

| Setting     | Description                                                                                                                 | Examples                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| id          | Required. Stable identifier carried on every row the definition writes                                                      | scranton-pa                                   |
| coordinates | Required unless `location` is set. Optional name, then latitude and longitude; semicolons separate multiple locations       | Scranton: 41.408, -75.662                     |
| location    | Alternative to `coordinates`, same format; falls back to the note's Location property                                       | Scranton: 41.408, -75.662                     |
| name        | Display name. Defaults to the id                                                                                            | Scranton, PA                                  |
| startDate   | Start date                                                                                                                  | **today**, 2025-08-15                         |
| endDate     | End date                                                                                                                    | **+1w**, +7d, 2025-08-22                      |
| tables      | Tables to populate                                                                                                          | **events, positions**                         |
| timezone    | IANA timezone overriding the coordinate lookup                                                                              | America/New_York                              |
| cache       | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever` | **true**, false, forever, 30m, 7d, 2027-01-01 |
| debug       | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                | settings                                      |

### Multiple Solar Locations

Solar definitions take a semicolon-separated list of locations, like the weather ones, and name each row for its own location:

~~~places-solar-vaultquery
id: northeast-solar
coordinates: "Scranton: 41.4089, -75.6624; Philly: 39.9547, -75.1639; New York: 40.7124, -74.0057"
startDate: today
endDate: +6d
tables: events, positions
~~~

Because `solar_events` costs one request per day per location, prefer a shorter date range when listing several locations. `solar_positions` scales for free.

## Table Columns

Every column of every materialized table, rendered from the live table definitions:

{{dynamic:vaultqueryTables}}

## Table Selection

Use `tables:` to limit which tables are filled.

Weather accepts `daily` and `hourly`, tide accepts `stations`, `predictions`, and `daily`, solar accepts `events` and `positions`. Solar fills both by default.
