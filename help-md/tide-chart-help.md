---
id: tide-chart-help
title: Tide Chart Help
---

# Tide Chart Help

Display tide data as an interactive chart: a filled tide curve with high/low markers, a summary row of the next high, next low, and tidal range, and a live "now" marker when the current time is in range. The plot background is shaded by twilight stage, using the same palette as the solar chart.

## Basic Usage

~~~places-tide-chart
location: "Atlantic City: 39.355, -74.418"
startDate: today
endDate: +1
~~~

## Extended Example

~~~places-tide-chart
location: 39.355, -74.418
startDate: today
endDate: +7d
height: 600px
units: metric
~~~

## Settings

| Setting         | Description                                                                                                                                                                            | Examples                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| location        | Coordinates used to find the nearest tide station                                                                                                                                      | 39.355, -74.418                               |
| station         | Station name                                                                                                                                                                           | Atlantic City                                 |
| stationId       | NOAA station ID                                                                                                                                                                        | 8534720                                       |
| datum           | Tidal datum                                                                                                                                                                            | **MLLW**, NAVD88, STND                        |
| units           | Unit system. Defaults to the global units setting                                                                                                                                      | metric, imperial                              |
| days            | Calendar days to display when `endDate` is omitted                                                                                                                                     | **2**, 7                                      |
| startDate       | Start date                                                                                                                                                                             | **today**, +3, 2025-08-15                     |
| endDate         | Inclusive end date, such as `+1`, `+1d`, or `2025-08-22`                                                                                                                               | +1, +3d, 2025-08-22                           |
| showStation     | Show station information                                                                                                                                                               | **true**, false                               |
| showMap         | Show a map of the requested coordinates and the answering station                                                                                                                      | true, **false**                               |
| mapProvider     | Map provider for `showMap` (defaults to the global map provider)                                                                                                                       | any installed map provider                    |
| showMoonPhases  | Show moon phase context                                                                                                                                                                | true, **false**                               |
| height          | Chart height                                                                                                                                                                           | **400px**, 50vh                               |
| width           | Width of everything the block renders, its legend and info included. A percentage measures the note's width, vw the window's                                                           | 100%, 400px                                   |
| cache           | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                                                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| debug           | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                                                                           | settings                                      |
| queryParameters | UI controls that adjust the block without editing it; `queryParametersPosition`, `queryParametersLayout`, and `queryParametersCollapsed` place them. See `places-queryparameters-help` | `- name: limit`                               |

