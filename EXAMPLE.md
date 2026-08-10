# Places Tides Plugin Examples

This file demonstrates the usage of the Places Tides plugin with various configuration options.

## Basic Tide Table

```places-tide-table
location: 42.73, -70.81
startDate: today
endDate: +1
```

## Tide Graph with Custom Height

```places-tide-graph
location: 42.73, -70.81
date: today
height: 500px
datum: MLLW
units: english
```

## Using Frontmatter Location

If you have `Location: 42.73, -70.81` in your frontmatter, you can omit the location parameter:

```places-tide-table
startDate: tomorrow
days: 2
showStation: true
```

## Relative Date Examples

```places-tide-table
location: 40.7589, -73.9851
startDate: +1d
endDate: +1w
units: metric
```

## Single Day View

```places-tide-graph
location: 37.7749, -122.4194
date: +2d
height: 400px
```

## Extended Range

```places-tide-table
location: 25.7617, -80.1918
startDate: today
endDate: +30d
datum: MHHW
```

## Test Locations

Here are some coastal locations you can test with:

- **Boston Harbor**: `42.73, -70.81`
- **New York Harbor**: `40.7589, -73.9851`
- **San Francisco Bay**: `37.7749, -122.4194`
- **Miami**: `25.7617, -80.1918`
- **Seattle**: `47.6062, -122.3321`
- **Charleston, SC**: `32.7767, -79.9311`

## Error Examples

These will show error handling:

```places-tide-table
location: invalid_location
```

```places-tide-graph
location: 0, 0
startDate: today
```

## Parameters Reference

### Required
- **location**: `lat, lon` coordinates (or use frontmatter)

### Dates
- **startDate/endDate**: Date range
- **date**: Single date (creates 1-day range)

### Optional
- **datum**: MLLW (default), MHHW, MTL, MSL, NAVD88
- **units**: english (default) or metric
- **height**: Chart height (graph only, default 400px)
- **showStation**: true (default) or false
- **timezone**: lst_ldt (default), gmt
- **provider**: noaa (default) or auto

### Date Formats
- Absolute: `2025-08-12`, `08/12/2025`
- Relative: `today`, `tomorrow`, `+3`, `+3d`, `+1w`, `-2d`
