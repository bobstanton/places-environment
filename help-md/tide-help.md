---
id: tide-help
title: Tide Help
---

# Tide Help

Display NOAA tide predictions as tables or charts, with optional sunrise/sunset and moon phase context.

## Available Code Blocks

| Code Block                      | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `places-tide-table`             | Display tide events as a Markdown-style table    |
| `places-tide-cards`             | Display high/low tide predictions as daily cards |
| `places-tide-chart`             | Display tide predictions as an interactive chart |
| `places-tides-vaultquery`       | Define materialized tide tables for VaultQuery   |
| `places-tide-help`              | Show this general help                           |
| `places-tide-table-help`        | Show detailed table help                         |
| `places-tide-cards-help`        | Show detailed card help                          |
| `places-tide-chart-help`        | Show detailed chart help                         |
| `places-vaultquery-tables-help` | Show VaultQuery table-provider help              |

## Basic Usage

Add a `Location` property to the note frontmatter, then use a tide code block:

~~~yaml
---
Location: "Atlantic City: 39.355, -74.418"
---
~~~

~~~places-tide-table
startDate: today
endDate: +1
~~~

## Settings

| Setting        | Description                                                                                                                 | Examples                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| location       | `lat, lon` or `Name: lat, lon` used to find the nearest tide station                                                        | 39.355, -74.418                               |
| station        | Station name                                                                                                                | Atlantic City                                 |
| stationId      | NOAA station ID                                                                                                             | 8534720                                       |
| datum          | Tidal datum                                                                                                                 | **MLLW**, NAVD88, STND                        |
| units          | Unit system. Defaults to the global units setting                                                                           | metric, imperial                              |
| startDate      | Start date                                                                                                                  | **today**, +3, 2025-08-15                     |
| days           | Calendar days to display when `endDate` is omitted                                                                          | **2**, 7                                      |
| endDate        | Inclusive end date, such as `+1`, `+1d`, or `2025-08-22`                                                                    | +1, +3d, 2025-08-22                           |
| showStation    | Show tide station metadata                                                                                                  | **true**, false                               |
| showMap        | Show a map of the requested coordinates and the answering station                                                           | true, **false**                               |
| mapProvider    | Map provider for `showMap` (defaults to the global map provider)                                                            | any installed map provider                    |
| showSolar      | Solar event rows in tables and cards (charts always shade twilight stages)                                                  | true, **false**                               |
| showMoonPhases | Show moon phase context                                                                                                     | true, **false**                               |
| cache          | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever` | **true**, false, forever, 30m, 7d, 2027-01-01 |

Location can come from a query parameter:

~~~places-tide-cards
location: {parameter.tidePoint}
queryParameters:
  - name: tidePoint
    type: location
    default: 39.355, -74.418
~~~

## Times and Stations

- All times are station local time (LST/LDT), matching NOAA's published tide tables.
- Headers show the station as `Name (station ID)` with its type: a **reference station** carries NOAA harmonic predictions; a **subordinate station** derives its predictions from a reference station via offsets - estimates, labeled "derived predictions". Subordinate charts draw a curve interpolated between the predicted highs and lows.
- When the station is selected by `location:`, the header shows its distance from the requested coordinates.

## Date Formats

- Relative keywords: `today`, `tomorrow`, `yesterday`, `this weekend`
- Relative offsets: `+3`, `+3d`, `-2d`, `+1w`
- Absolute dates: `2025-08-15`, `08/15/2025`, `20250815`

## VaultQuery

Use `places-tides-vaultquery` to make tide data queryable from VaultQuery instead of rendering it in the note. See `places-vaultquery-tables-help` for examples and table names.
