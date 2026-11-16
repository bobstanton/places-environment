---
id: weather-template-help
title: Weather Template Help
---

# 🎨 Weather Template Help

Create custom weather displays with Knap Markdown or JavaScript HTML templates. Both receive the requested weather data; Knap adds filters and template logic, while JavaScript templates provide helper functions.

## Knap Markdown templates

Set `templateEngine: knap` and `templateFile` to render a vault template with [Knap](https://knap.md/). JavaScript templates remain the default when this setting is omitted.

~~~places-weather-template
coordinates: 41.408, -75.662
current: temperature_2m, weather_code
hourly: temperature_2m
units: metric
templateEngine: knap
templateFile: Places Templates/Weather.knap.md
~~~

Save the template in `Places Templates/Weather.knap.md`:

~~~markdown
## Current weather
{{ current.weather_code | weather_emoji }} {{ current.temperature_2m | format_temp }}

{% if hourly %}
| Time | Temperature |
| ---- | ----------- |
{% for time in hourly.time %}
{% if loop.index0 < 6 %}
| {{ time | format_time }} | {{ hourly.temperature_2m[loop.index0] | format_temp }} |
{% endif %}
{% endfor %}
{% endif %}
~~~

### Template data

Weather templates receive data for the first requested location.

| Variable      | Value supplied                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `current`     | Requested current measurements as an object, such as `current.temperature_2m`; null when unavailable.                         |
| `hourly`      | Hourly arrays: `hourly.time` and one array per returned measurement; null when unavailable.                                   |
| `daily`       | Daily arrays: `daily.time` and one array per returned measurement, such as `daily.temperature_2m_max`; null when unavailable. |
| `minutely15`  | 15-minute arrays: `minutely15.time` and one array per returned measurement; null when unavailable.                            |
| `coordinates` | Location object with numeric `latitude` and `longitude`, plus `name` when supplied.                                           |
| `units`       | Resolved unit system: `metric` or `imperial`.                                                                                 |
| `timezone`    | Forecast timezone, such as `America/New_York`.                                                                                |

Each series aligns its measurement arrays with its `time` array. Series dates, including sunrise and sunset, are ISO strings; measurements are numbers or null. Returned fields depend on the requested variables and available data. The Places date filters format dates in `timezone`; measurement filters use `units`.

Alongside standard Knap filters, Places provides:

| Filter                | Output                                                |
| --------------------- | ----------------------------------------------------- |
| `format_temp`         | Temperature with the selected Celsius/Fahrenheit unit |
| `format_speed`        | Wind speed with km/h or mph                           |
| `format_precip`       | Precipitation with mm or inches                       |
| `weather_emoji`       | Emoji for a WMO weather code                          |
| `weather_description` | Description for a WMO weather code                    |
| `format_date`         | Date in the forecast timezone                         |
| `format_time`         | Time in the forecast timezone                         |
| `format_datetime`     | Date and time in the forecast timezone                |

These filters display the values already returned in the requested units. Missing measurements render as empty text. Markdown links and embeds resolve relative to the containing note. Refresh reads the template file again and renders it with refreshed data. Template errors are displayed in the block; Knap is never evaluated as JavaScript. Regex searches in Knap filters are disabled. Knap requires a `templateFile` referencing a vault file (`.knap.md`, `.md`, or `.knap`); Markdown template notes also support quoted wikilinks.

## JavaScript templates

~~~places-weather-template
coordinates: 41.408, -75.662
current: temperature_2m, weather_code
---
<div class="my-weather">
  ${h.weatherEmoji(current.weather_code)}
  ${h.formatTemp(current.temperature_2m)}
</div>
~~~

~~~places-weather-template
coordinates: 41.408, -75.662
hourly: temperature_2m, weather_code
startDate: today
endDate: +1d
---
<div class="hourly-forecast">
  ${hourly.time.slice(0, 24).map((t, i) => `
    <div class="hour">
      <span>${h.formatTime(t)}</span>
      <span>${h.weatherEmoji(hourly.weather_code[i])}</span>
      <span>${h.formatTemp(hourly.temperature_2m[i])}</span>
    </div>
  `).join('')}
</div>
~~~

## Settings

| Setting         | Description                                                                                                                                                                            | Examples                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| templateFile    | Vault template file, required for Knap                                                                                                                                                 | Places Templates/Weather.knap.md              |
| templateEngine  | Template language: `knap` for Markdown, or `javascript` for existing HTML templates                                                                                                    | knap, **javascript**                          |
| coordinates     | `lat, lon` or `Name: lat, lon` (or use frontmatter Location)                                                                                                                           | 41.408, -75.662                               |
| location        | Alternative to coordinates using the same named-coordinate format                                                                                                                      | 41.408, -75.662                               |
| current         | Current weather variables to include                                                                                                                                                   |                                               |
| minutely15      | 15-minute resolution variables                                                                                                                                                         |                                               |
| hourly          | Hourly weather variables to include                                                                                                                                                    |                                               |
| daily           | Daily weather variables to include                                                                                                                                                     |                                               |
| startDate       | Start date for hourly/daily data                                                                                                                                                       | today, +3, 2025-08-15                         |
| endDate         | End date for hourly/daily data                                                                                                                                                         | +1, +3d, 2025-08-22                           |
| startTime       | Filter hours from this time (e.g., `6`, `6am`, `06:00`)                                                                                                                                | 6am, 14:00                                    |
| endTime         | Filter hours until this time (e.g., `21`, `9pm`, `21:00`)                                                                                                                              | 6pm, 18:00                                    |
| units           | Unit system. Defaults to the global units setting                                                                                                                                      | metric, imperial                              |
| cache           | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever`                                                            | **true**, false, forever, 30m, 7d, 2027-01-01 |
| cellSelection   | Grid cell preference                                                                                                                                                                   | **land**, sea, nearest                        |
| days            | Calendar days to display when `endDate` is omitted                                                                                                                                     | 1, 3, **7**, 14                               |
| queryParameters | UI controls that adjust the block without editing it; `queryParametersPosition`, `queryParametersLayout`, and `queryParametersCollapsed` place them. See `places-queryparameters-help` | `- name: limit`                               |

## Available Data Objects

| Object        | Description                                        |
| ------------- | -------------------------------------------------- |
| `current`     | Current weather values (object with variable keys) |
| `hourly`      | Hourly data with time array and variable arrays    |
| `daily`       | Daily data with time array and variable arrays     |
| `coordinates` | Location coordinates { latitude, longitude }       |
| `h`           | Helper functions object                            |

## Helper Functions (h.*)

| Function                              | Description                           |
| ------------------------------------- | ------------------------------------- |
| `h.formatDate(date)`                  | Format date as "Monday, Jan 1"        |
| `h.formatTime(date)`                  | Format time as "2:30 PM"              |
| `h.formatDateTime(date)`              | Format full date and time             |
| `h.formatTemp(value)`                 | Format temperature with unit          |
| `h.formatSpeed(value)`                | Format wind speed with unit           |
| `h.formatPrecip(value)`               | Format precipitation with unit        |
| `h.weatherEmoji(code)`                | Get emoji for WMO weather code        |
| `h.weatherDescription(code)`          | Get text description for WMO code     |
| `h.range(start, end)`                 | Generate array of numbers             |
| `h.filterByHour(times, start?, end?)` | Get indices for hours in time range   |
| `h.getHour(date)`                     | Get hour (0-23) from a date           |
| `h.escape(string)`                    | HTML escape a string                  |
| `h.units`                             | Current unit system (metric/imperial) |
| `h.startTime`                         | Configured start hour (if set)        |
| `h.endTime`                           | Configured end hour (if set)          |

## WMO Weather Codes

The `weather_code` variable returns WMO standard codes, which `h.weatherEmoji(code)` and `h.weatherDescription(code)` convert to an emoji and a text description:

| Code  | Emoji | Description              |
| ----- | ----- | ------------------------ |
| 0     | ☀️    | Clear sky                |
| 1-3   | 🌤️⛅☁️ | Mainly clear to overcast |
| 45-48 | 🌫️    | Fog                      |
| 51-55 | 🌧️    | Drizzle                  |
| 61-65 | 🌧️    | Rain                     |
| 71-77 | 🌨️❄️  | Snow                     |
| 80-82 | 🌦️    | Rain showers             |
| 85-86 | 🌨️    | Snow showers             |
| 95-99 | ⛈️    | Thunderstorm             |

