import { UnitsSystem } from "places-shared/units";
import { Coordinate } from "places-shared/geo";
import { CACHE_DEFAULT, type CachePolicy } from "places-shared/settings";

export type TideHeightUnit = 'ft' | 'm';

export function tideUnitToUnitsSystem(unit: TideHeightUnit): UnitsSystem {
  return unit === 'ft' ? 'imperial' : 'metric';
}

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distance_km?: number;
  provider: string;
  type?: 'R' | 'S'; // R = Reference, S = Subordinate
  reference_id?: string; // For subordinate stations
  state: string; // State abbreviation
  timeZone?: string; // Time zone abbreviation
  capabilities: {
    predictions: boolean;
    hourly: boolean;
  };
  datum_supported: string[];
}

export interface TidePoint {
  timestamp_local: string;
  type: 'H' | 'L' | 'hourly';
  height: number;
  datum: string;
  units: TideHeightUnit;
}

// Timestamps are ISO strings in the requested timezone.
export interface SolarEvent {
  // YYYY-MM-DD
  date: string;
  sunrise: string;
  sunset: string;
  solar_noon: string;
  // Seconds
  day_length: number;
  // Civil: sun 6 degrees below horizon; nautical: 12; astronomical: 18.
  civil_twilight_begin: string;
  civil_twilight_end: string;
  nautical_twilight_begin: string;
  nautical_twilight_end: string;
  astronomical_twilight_begin: string;
  astronomical_twilight_end: string;
}

export interface MoonPhase {
  phase: number;           // 0-1, where 0 = new moon, 0.5 = full moon
  phaseName: string;
  emoji: string;
  illumination: number;    // Percent illuminated (0-100)
  date: string;            // YYYY-MM-DD
}

export interface TideDescription {
  date: string;
  lunarTideTendency: 'Neap' | 'Intermediate' | 'Spring';
  moonPhase: MoonPhase;
  tidalRange: number;
  description: string;
}

export interface TideData {
  station: TideStation;
  datum: string;
  units: TideHeightUnit;
  provider: string;
  hourly: TidePoint[];
  hilo: TidePoint[];
  solar?: SolarEvent[];    // One per day in date range
  tideDescriptions?: TideDescription[]; // One per day in date range
  // Keyed by YYYY-MM-DD.
  solarByDate?: Map<string, SolarEvent>;
  descriptionByDate?: Map<string, TideDescription>;
  metadata: {
    requestDate: string;
    startDate: string;
    endDate: string;
    // Epoch ms of the fetch.
    retrievedAt?: number;
    // True when a fetch failed and cached data was served instead.
    servedStale?: boolean;
    // Station's UTC offset for the requested window (derived from NOAA lst_ldt vs gmt).
    stationUtcOffsetMs?: number;
    // Present when the station was chosen for a location.
    requestedLocation?: Coordinate;
  };
}

export interface TideCodeBlockSettings {
  location?: Coordinate;
  locations?: Coordinate[];
  station?: string;
  stations?: string[];
  stationId?: string;
  stationIds?: string[];
  maxStations: number;
  days: number;
  startDate?: Date;
  endDate?: Date;
  datum: string;
  units: UnitsSystem;
  height: string;
  showStation: boolean;
  showMap: boolean;
  mapProvider?: string;
  showSolar: boolean;
  showMoonPhases: boolean;
  exportHourlyEstimates: boolean;
  cachePolicy: CachePolicy;
  // Refresh button: skip the cache read but still store the fresh result.
  forceRefresh?: boolean;
}

// Units intentionally absent: the default comes from the main plugin settings
// via getDefaultUnits().
export const TideCodeBlockDefaultSettings: Omit<TideCodeBlockSettings, 'units'> = {
  datum: 'MLLW',
  showStation: true,
  showMap: false,
  showSolar: false,
  showMoonPhases: false,
  exportHourlyEstimates: false,
  height: '400px',
  maxStations: 1,
  days: 2,
  cachePolicy: CACHE_DEFAULT
};

export interface NoaaTideResponse {
  predictions?: Array<{
    t: string; // timestamp
    v: string; // value (height)
    type?: string; // H or L for high/low
  }>;
  metadata?: {
    id: string;
    name: string;
    lat: string;
    lon: string;
  };
}
