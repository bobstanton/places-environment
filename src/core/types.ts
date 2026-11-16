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
  type?: 'R' | 'S';  
  reference_id?: string;  
  state: string;  
  timeZone?: string;  
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

export interface SolarEvent {
  date: string;
  sunrise: string;
  sunset: string;
  solar_noon: string;
  day_length: number;
  civil_twilight_begin: string;
  civil_twilight_end: string;
  nautical_twilight_begin: string;
  nautical_twilight_end: string;
  astronomical_twilight_begin: string;
  astronomical_twilight_end: string;
}

export interface MoonPhase {
  phase: number;            
  phaseName: string;
  emoji: string;
  illumination: number;     
  date: string;             
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
  solar?: SolarEvent[];     
  tideDescriptions?: TideDescription[];  
  solarByDate?: Map<string, SolarEvent>;
  descriptionByDate?: Map<string, TideDescription>;
  metadata: {
    requestDate: string;
    startDate: string;
    endDate: string;
    retrievedAt?: number;
    servedStale?: boolean;
    stationUtcOffsetMs?: number;
    requestedLocation?: Coordinate;
  };
}

export interface TideCodeBlockSettings {
  sourcePath?: string;
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
  forceRefresh?: boolean;
}

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
    t: string;  
    v: string;  
    type?: string;  
  }>;
  metadata?: {
    id: string;
    name: string;
    lat: string;
    lon: string;
  };
}
