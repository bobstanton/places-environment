# Places Environment

Environmental data for [Places](https://community.obsidian.md/plugins/places): tides, solar events, and weather, as charts, tables, cards, and user templates.

This is not a stand-alone plugin, to use, install along side [Places](https://community.obsidian.md/plugins/places). Refer to the [sandbox](https://sandbox.obsidian.stanton.dev/places/) for examples.

## Network requests

| Area              | Request                                                    |
| ----------------- | ---------------------------------------------------------- |
| Tides             | Finds the nearest station and reads its tide predictions   |
| Solar events      | Reads sunrise, sunset, and twilight times for a coordinate |
| Weather           | Reads current, hourly, and daily forecast values           |
| Seasonal forecast | Reads forecast values beyond the 16 day forecast window    |

Requests go to `api.tidesandcurrents.noaa.gov`, `api.sunrise-sunset.org`, `api.open-meteo.com`,
and `seasonal-api.open-meteo.com`. Responses are cached in the note's
frontmatter or in plugin data, with a lifetime set by each block's `cache:` setting.

## Background tasks

None.

## Dependencies

| Library                                                                         | Purpose                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Chart.js](https://github.com/chartjs/Chart.js)                                 | Tide, solar, and weather charts                     |
| [chartjs-adapter-date-fns](https://github.com/chartjs/chartjs-adapter-date-fns) | Time axis support for Chart.js                      |
| [date-fns](https://github.com/date-fns/date-fns)                                | Date arithmetic and formatting                      |
| [lunarphase-js](https://github.com/nikolaijjensen/lunarphase-js)                | Moon phase for solar output                         |
| [markdown-table](https://github.com/wooorm/markdown-table)                      | Renders generated tables                            |
| [openmeteo](https://github.com/open-meteo/typescript)                           | Weather and seasonal forecasts                      |
| [user-template-renderer](https://github.com/bobstanton/user-template-renderer)  | Runs the user template in `places-weather-template` |
| [places-shared](https://github.com/bobstanton/places-shared)                    | Shared map, overlay, routing, and utility code      |
