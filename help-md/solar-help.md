---
id: solar-help
title: Solar Help
---

# Solar Help

Display sunrise, sunset, solar noon, day length, and twilight events for a location and date range.

## Available Code Blocks

| Code Block                      | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| `places-solar-table`            | Display solar events in a table                 |
| `places-solar-chart`            | Display solar events as a chart                 |
| `places-solar-vaultquery`       | Define materialized solar tables for VaultQuery |
| `places-solar-help`             | Show this general help                          |
| `places-solar-table-help`       | Show detailed table help                        |
| `places-solar-chart-help`       | Show detailed chart help                        |
| `places-vaultquery-tables-help` | Show VaultQuery table-provider help             |

## Basic Usage

~~~places-solar-table
location: "Scranton: 41.408, -75.662"
startDate: today
endDate: +7d
showTwilight: true
~~~

## Settings

| Setting       | Description                                                                                                                  | Examples                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| location      | `lat, lon` or `Name: lat, lon`; omit to use note `Location` frontmatter                                                      | 41.408, -75.662           |
| startDate     | Start date                                                                                                                   | **today**, +3, 2025-08-15 |
| endDate       | End date                                                                                                                     | +1, +3d, 2025-08-22       |
| showTwilight  | Show civil, nautical, and astronomical twilight                                                                              | **true**, false           |
| showDayLength | Show day length                                                                                                              | **true**, false           |
| showSolarNoon | Show solar noon                                                                                                              | true, **false**           |
| height        | Optional chart/table height                                                                                                  | 400px, 50vh               |
| width         | Width of everything the block renders, its legend and info included. A percentage measures the note's width, vw the window's | 100%, 400px               |

`location` may reference a query parameter, for example `location: {parameter.solarPoint}` with a `location`-typed parameter named `solarPoint`.

## VaultQuery

Use `places-solar-vaultquery` to make sunrise/sunset and twilight data queryable from VaultQuery. See `places-vaultquery-tables-help` for examples and table names.
