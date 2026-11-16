---
id: solar-chart-help
title: Solar Chart Help
---

# Solar Chart Help

Show the Sun's path for a day - or one section per day across a range - as an **altitude arc** (how high the Sun climbs through the day, with sunrise and sunset markers, a thin solar-noon line, and a live "now" marker), with the plot background shaded by **twilight stage** (night, astronomical, nautical, civil twilight, daylight, and back).

Altitude is computed locally for the location. Sunrise, sunset, solar noon, and the twilight boundaries come from [sunrise-sunset.org](https://sunrise-sunset.org).

## Basic Usage

~~~places-solar-chart
location: "Scranton: 41.408, -75.662"
startDate: today
height: 320px
~~~

## Settings

| Setting         | Description                                                                                                                                                                            | Examples                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| location        | Coordinates, or omit to use note `Location` frontmatter                                                                                                                                | 41.408, -75.662                               |
| startDate       | Start date                                                                                                                                                                             | **today**, +3, 2025-08-15                     |
| endDate         | End day - renders one section per day across the range                                                                                                                                 | +1, +3d, 2025-08-22                           |
| layout          | Multi-day layout: `rows` stacks one chart per day; `continuous` draws one                                                                                                              | **rows**, continuous                          |
| showHeader      | Show the title/location header                                                                                                                                                         | **true**, false                               |
| showSummary     | Show the sunrise/noon/sunset summary row                                                                                                                                               | **true**, false                               |
| showLegend      | Show the twilight shading legend                                                                                                                                                       | **true**, false                               |
| height          | Height of the altitude arc                                                                                                                                                             | 400px, 50vh                                   |
| width           | Width of everything the block renders, its legend and info included. A percentage measures the note's width, vw the window's                                                           | 100%, 400px                                   |
| cache           | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                                                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| timezone        | IANA timezone for solar event times                                                                                                                                                    | America/New_York, UTC                         |
| debug           | `settings` shows a table of how every setting resolved across default, global, frontmatter, and block layers                                                                           | settings                                      |
| queryParameters | UI controls that adjust the block without editing it; `queryParametersPosition`, `queryParametersLayout`, and `queryParametersCollapsed` place them. See `places-queryparameters-help` | `- name: limit`                               |

Use `startDate:` for a single day, or add `endDate:` to render one section per day across a range; the summary row shows sunrise/sunset times with their compass bearing, solar noon with the Sun's peak altitude, and the total day length. "Now" markers only appear on today.
