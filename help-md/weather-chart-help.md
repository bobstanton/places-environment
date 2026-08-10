---
id: weather-chart-help
title: Weather Chart Help
---

# 📈 Weather Chart Help

Display hourly weather data as an interactive chart: multiple variables, dual Y-axes, and multiple locations on one canvas.

## Basic Usage

~~~places-weather-chart
coordinates: 41.408, -75.662
hourly: temperature_2m
~~~


## Hourly

~~~places-weather-chart
coordinates: 41.408, -75.662
hourly: temperature_2m, precipitation
startDate: today
endDate: +5d
height: 500px
units: imperial
~~~

## Multiple Locations

~~~places-weather-chart
coordinates: 41.408, -75.662; 40.986, -75.195
hourly: temperature_2m
~~~

## Daytime Hours Only

~~~places-weather-chart
coordinates: 41.408, -75.662
hourly: temperature_2m
startTime: 6am
endTime: 9pm
~~~

## High-Resolution (15-minute) Data

`minutely15:` plots 15-minute resolution data.

~~~places-weather-chart
coordinates: 41.408, -75.662
minutely15: temperature_2m, precipitation
startDate: today
endDate: +1d
~~~

Hourly and minutely15 series can share one chart; the minutely15 labels pick up a "(15min)" suffix.


## Settings

| Setting | Description | Examples |
| ------- | ----------- | -------- |
| coordinates | `lat, lon` or `Name: lat, lon` (or use frontmatter Location) | 41.408, -75.662 |
| location | Alternative to coordinates using the same named-coordinate format | 41.408, -75.662 |
| hourly | Hourly variables to chart | **temperature_2m** |
| minutely15 | 15-minute resolution variables for higher precision |  |
| startDate | Start date | **today**, tomorrow, +3d, 2025-08-15 |
| endDate | End date | **+3d**, +5d, +1w, 2025-08-20 |
| startTime | Filter hours from this time (e.g., `6`, `6am`, `06:00`) | 6am, 14:00 |
| endTime | Filter hours until this time (e.g., `21`, `9pm`, `21:00`) | 6pm, 18:00 |
| height | Chart height | **400px**, 50vh |
| width | Chart width | **100%**, 400px |
| units | Unit system. Defaults to the global units setting | metric, imperial |
| cache | How long cached data stays fresh: a duration, an expiration date (a bare date expires at the end of that day), or `forever` | **true**, false, forever, 30m, 7d, 2027-01-01 |
| cellSelection | Grid cell preference | **land**, sea, nearest |

## Hourly Variables

Common hourly variables for charting:

- `temperature_2m` - Air temperature at 2m
- `apparent_temperature` - Feels like temperature
- `precipitation` - Total precipitation
- `rain` - Rain amount
- `showers` - Shower precipitation
- `snowfall` - Snowfall amount
- `wind_speed_10m` - Wind speed at 10m
- `wind_gusts_10m` - Wind gust speed
- `relative_humidity_2m` - Relative humidity
- `dew_point_2m` - Dew point temperature
- `cloud_cover` - Total cloud cover
- `surface_pressure` - Surface air pressure
- `weather_code` - WMO weather condition code

For the complete list, see [Open-Meteo Hourly Variables](https://open-meteo.com/en/docs).


