import type { UnitsSystem } from 'places-shared/units';

export const WEATHER_UNITS = {
  imperial: {
    temperature: '°F', windSpeed: 'mph', precipitation: 'in',
    request: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' },
  },
  metric: {
    temperature: '°C', windSpeed: 'km/h', precipitation: 'mm',
    request: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm' },
  },
} as const satisfies Record<UnitsSystem, { temperature: string; windSpeed: string; precipitation: string; request: Record<string, string> }>;
