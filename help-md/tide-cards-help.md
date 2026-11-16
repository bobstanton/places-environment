---
id: tide-cards-help
title: Tide Cards Help
---

# Tide Cards Help

Display tide data as daily cards with high/low times and heights, station details, and optional solar or moon data. For a compact Markdown-style table instead, use `places-tide-table`.

## Basic Usage

~~~places-tide-cards
location: "Atlantic City: 39.355, -74.418"
startDate: today
endDate: +1
~~~

## Extended Example

~~~places-tide-cards
location: 39.355, -74.418
startDate: 2025-08-15
endDate: 2025-08-18
datum: MLLW
units: metric
showSolar: true
showMoonPhases: true
~~~

## Settings

| Setting               | Description                                                                                                                                                                            | Examples                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| location              | Coordinates used to find the nearest tide station                                                                                                                                      | 39.355, -74.418                               |
| station               | Station name                                                                                                                                                                           | Atlantic City                                 |
| stationId             | NOAA station ID                                                                                                                                                                        | 8534720                                       |
| datum                 | Tidal datum                                                                                                                                                                            | **MLLW**, NAVD88, STND                        |
| units                 | Unit system. Defaults to the global units setting                                                                                                                                      | metric, imperial                              |
| startDate             | Start date                                                                                                                                                                             | **today**, +3, 2025-08-15                     |
| endDate               | Inclusive end date, such as `+1`, `+1d`, or `2025-08-18`                                                                                                                               | +1, +3d, 2025-08-22                           |
| showStation           | Show station information                                                                                                                                                               | **true**, false                               |
| showMap               | Show a map of the requested coordinates and the answering station                                                                                                                      | true, **false**                               |
| mapProvider           | Map provider for `showMap` (defaults to the global map provider)                                                                                                                       | any installed map provider                    |
| showSolar             | Show sunrise/sunset times per day                                                                                                                                                      | true, **false**                               |
| showMoonPhases        | Show observed range and moon phase context per day                                                                                                                                     | true, **false**                               |
| exportHourlyEstimates | Include hourly tide estimates in copied data                                                                                                                                           | true, **false**                               |
| height                | Optional rendered block height                                                                                                                                                         | **400px**, 50vh                               |
| width                 | Width of everything the block renders, its legend and info included. A percentage measures the note's width, vw the window's                                                           | 100%, 400px                                   |
| cache                 | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                                                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| days                  | Calendar days to display when `endDate` is omitted                                                                                                                                     | **2**, 1, 7, 14                               |
| debug                 | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                                                                           | settings                                      |
| queryParameters       | UI controls that adjust the block without editing it; `queryParametersPosition`, `queryParametersLayout`, and `queryParametersCollapsed` place them. See `places-queryparameters-help` | `- name: limit`                               |

