// WMO weather codes (0-99); reference: https://open-meteo.com/en/docs (weather_code variable).

export interface WMOCodeInfo {
  emoji: string;
  description: string;
}

const WMO_CODES: Record<number, WMOCodeInfo> = {
  0: { emoji: '☀️', description: 'Clear sky' },
  1: { emoji: '🌤️', description: 'Mainly clear' },
  2: { emoji: '⛅', description: 'Partly cloudy' },
  3: { emoji: '☁️', description: 'Overcast' },

  45: { emoji: '🌫️', description: 'Fog' },
  48: { emoji: '🌫️', description: 'Depositing rime fog' },

  51: { emoji: '🌧️', description: 'Light drizzle' },
  53: { emoji: '🌧️', description: 'Moderate drizzle' },
  55: { emoji: '🌧️', description: 'Dense drizzle' },

  56: { emoji: '🌧️', description: 'Light freezing drizzle' },
  57: { emoji: '🌧️', description: 'Dense freezing drizzle' },

  61: { emoji: '🌧️', description: 'Slight rain' },
  63: { emoji: '🌧️', description: 'Moderate rain' },
  65: { emoji: '🌧️', description: 'Heavy rain' },

  66: { emoji: '🌧️', description: 'Light freezing rain' },
  67: { emoji: '🌧️', description: 'Heavy freezing rain' },

  71: { emoji: '🌨️', description: 'Slight snow' },
  73: { emoji: '🌨️', description: 'Moderate snow' },
  75: { emoji: '❄️', description: 'Heavy snow' },

  77: { emoji: '🌨️', description: 'Snow grains' },

  80: { emoji: '🌦️', description: 'Slight rain showers' },
  81: { emoji: '🌦️', description: 'Moderate rain showers' },
  82: { emoji: '🌧️', description: 'Violent rain showers' },

  85: { emoji: '🌨️', description: 'Slight snow showers' },
  86: { emoji: '🌨️', description: 'Heavy snow showers' },

  95: { emoji: '⛈️', description: 'Thunderstorm' },
  96: { emoji: '⛈️', description: 'Thunderstorm with slight hail' },
  99: { emoji: '⛈️', description: 'Thunderstorm with heavy hail' }
};

const NIGHT_EMOJIS: Record<number, string> = {
  0: '🌙',
  1: '🌙',
  2: '☁️',
};

export function getWeatherEmoji(code: number): string {
  return WMO_CODES[code]?.emoji ?? '❓';
}

export function getTimeAwareWeatherEmoji(code: number, time: Date, sunrise: Date | null, sunset: Date | null): string {
  if (!isDaytime(time, sunrise, sunset) && code in NIGHT_EMOJIS) {
    return NIGHT_EMOJIS[code];
  }
  return getWeatherEmoji(code);
}

function isDaytime(time: Date, sunrise: Date | null, sunset: Date | null): boolean {
  if (!sunrise || !sunset) return true;
  return time >= sunrise && time < sunset;
}

export function getWeatherDescription(code: number): string {
  return WMO_CODES[code]?.description ?? 'Unknown';
}

export function getWeatherInfo(code: number): WMOCodeInfo {
  return WMO_CODES[code] ?? { emoji: '❓', description: 'Unknown' };
}

export function isPrecipitation(code: number): boolean {
  // Codes 51-99 all indicate precipitation.
  return code >= 51;
}

export function isFrozenPrecipitation(code: number): boolean {
  // Freezing drizzle, freezing rain, snow, snow showers, hail
  return (code >= 56 && code <= 57) ||
         (code >= 66 && code <= 67) ||
         (code >= 71 && code <= 77) ||
         (code >= 85 && code <= 86) ||
         code === 96 ||
         code === 99;
}

export function isThunderstorm(code: number): boolean {
  return code >= 95;
}

export function getWeatherSeverity(code: number): number {
  if (code <= 3) return 0; // Clear to overcast
  if (code <= 48) return 1; // Fog
  if (code <= 55) return 1; // Drizzle
  if (code <= 57) return 2; // Freezing drizzle
  if (code <= 63) return 1; // Light to moderate rain
  if (code <= 67) return 2; // Heavy/freezing rain
  if (code <= 73) return 1; // Light to moderate snow
  if (code <= 77) return 2; // Heavy snow
  if (code <= 81) return 1; // Light to moderate showers
  if (code <= 86) return 2; // Heavy showers
  if (code >= 95) return 3; // Thunderstorms
  return 0;
}

export function getWeatherSeverityClass(code: number): string {
  const severity = getWeatherSeverity(code);
  const classes = ['clear', 'mild', 'moderate', 'severe'];
  return classes[severity];
}

export function getPrecipitationType(code: number): string | null {
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 56 && code <= 57) return 'Freezing drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing rain';
  if (code >= 71 && code <= 75) return 'Snow';
  if (code === 77) return 'Snow grains';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'T-storm + hail';
  return null;
}
