---
id: solar-table-help
title: Solar Table Help
---

# Solar Table Help

Display daily solar events for a location as a table.

## Basic Usage

~~~places-solar-table
location: "Scranton: 41.408, -75.662"
startDate: today
endDate: +7d
~~~

## Detailed Example

~~~places-solar-table
location: 41.408, -75.662
startDate: today
endDate: +14d
showTwilight: true
showDayLength: true
showSolarNoon: true
showAzimuth: true
showAltitude: true
~~~

## Settings

| Setting         | Description                                                                                                                                                                            | Examples                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| location        | Coordinates, or omit to use note `Location` frontmatter                                                                                                                                | 41.408, -75.662                               |
| startDate       | Start date                                                                                                                                                                             | **today**, +3, 2025-08-15                     |
| endDate         | End date                                                                                                                                                                               | **+1w**, +3d, 2025-08-22                      |
| showTwilight    | Show twilight times                                                                                                                                                                    | **true**, false                               |
| showDayLength   | Show day length                                                                                                                                                                        | **true**, false                               |
| showSolarNoon   | Show solar noon                                                                                                                                                                        | true, **false**                               |
| showAzimuth     | Show where on the horizon the sun rises and sets, as a bearing clockwise from north with its compass point (`62° ENE`)                                                                 | true, **false**                               |
| showAltitude    | Show the sun's peak altitude above the horizon at solar noon                                                                                                                           | true, **false**                               |
| height          | Optional rendered block height                                                                                                                                                         | 400px, 50vh                                   |
| width           | Width of everything the block renders, its legend and info included. A percentage measures the note's width, vw the window's                                                           | 100%, 400px                                   |
| cache           | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                                                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| timezone        | IANA timezone for solar event times                                                                                                                                                    | America/New_York, UTC                         |
| debug           | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                                                                           | settings                                      |
| queryParameters | UI controls that adjust the block without editing it; `queryParametersPosition`, `queryParametersLayout`, and `queryParametersCollapsed` place them. See `places-queryparameters-help` | `- name: limit`                               |
