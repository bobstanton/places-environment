---
id: weather-template-help
title: Weather Template Help
---

# 🎨 Weather Template Help

Create custom weather displays with JavaScript template literals. The template sees the raw weather data plus a set of helper functions, and whatever string it produces is what renders.

## Basic Usage

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

| Setting | Description | Examples |
| ------- | ----------- | -------- |
| coordinates | `lat, lon` or `Name: lat, lon` (or use frontmatter Location) | 41.408, -75.662 |
| location | Alternative to coordinates using the same named-coordinate format | 41.408, -75.662 |
| current | Current weather variables to include |  |
| minutely15 | 15-minute resolution variables (more accurate) |  |
| hourly | Hourly weather variables to include |  |
| daily | Daily weather variables to include |  |
| startDate | Start date for hourly/daily data | today, +3, 2025-08-15 |
| endDate | End date for hourly/daily data | +1, +3d, 2025-08-22 |
| startTime | Filter hours from this time (e.g., `6`, `6am`, `06:00`) | 6am, 14:00 |
| endTime | Filter hours until this time (e.g., `21`, `9pm`, `21:00`) | 6pm, 18:00 |
| units | Unit system. Defaults to the global units setting | metric, imperial |
| cache | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever` | **true**, false, forever, 30m, 7d, 2027-01-01 |
| cellSelection | Grid cell preference | **land**, sea, nearest |

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

| Code  | Emoji  | Description              |
| ----- | ------ | ------------------------ |
| 0     | ☀️     | Clear sky                |
| 1-3   | 🌤️⛅☁️ | Mainly clear to overcast |
| 45-48 | 🌫️     | Fog                      |
| 51-55 | 🌧️     | Drizzle                  |
| 61-65 | 🌧️     | Rain                     |
| 71-77 | 🌨️❄️   | Snow                     |
| 80-82 | 🌦️     | Rain showers             |
| 85-86 | 🌨️     | Snow showers             |
| 95-99 | ⛈️     | Thunderstorm             |

