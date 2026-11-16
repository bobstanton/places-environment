import type { UnitsSystem } from "places-shared/units";
import type { ApiUsageRecorder } from "places-shared/services";

export interface EnvironmentCacheEntry {
  t: number;
  d: unknown;
}

export interface EnvironmentHost {
  get(cacheKey: string, retention?: 'forever'): EnvironmentCacheEntry | null;
  set(cacheKey: string, data: unknown, retention?: 'forever'): Promise<void>;
  getDefaultUnits(): UnitsSystem;
  locationFromNote(sourcePath: string | undefined): string | null;
  apiUsage?: ApiUsageRecorder;
}

export interface BlockContext {
  sourcePath: string;
}
