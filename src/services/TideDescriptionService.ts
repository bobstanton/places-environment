import { MoonPhaseService } from './MoonPhaseService';
import { TideData, TidePoint, TideDescription, TideHeightUnit } from '../types';
import { groupTidesByDay } from '../utilities/TideUtilities';
import { parseNaiveTimestamp } from '../utilities/TideTime';

export type LunarTideTendency = TideDescription['lunarTideTendency'];

export function classifyLunarTideTendency(phase: number): LunarTideTendency {
  const normalized = ((phase % 1) + 1) % 1;
  const distanceToSyzygy = Math.min(normalized, Math.abs(normalized - 0.5), 1 - normalized);
  const distanceToQuarter = Math.min(Math.abs(normalized - 0.25), Math.abs(normalized - 0.75));
  if (distanceToSyzygy <= 0.0625) return 'Spring';
  if (distanceToQuarter <= 0.0625) return 'Neap';
  return 'Intermediate';
}

export class TideDescriptionService {
  private readonly moonPhaseService = new MoonPhaseService();

  calculateTideDescriptions(tideData: Pick<TideData, 'hilo' | 'units'>): TideDescription[] {
    return Object.entries(groupTidesByDay(tideData.hilo))
      .map(([date, tides]) => this.describeDay(date, tides, tideData.units))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  private describeDay(date: string, tides: TidePoint[], units: TideHeightUnit): TideDescription {
    const moonPhase = this.moonPhaseService.getMoonPhase(parseNaiveTimestamp(`${date} 12:00`));
    const heights = tides.map(tide => tide.height);
    const tidalRange = heights.length > 0 ? Math.max(...heights) - Math.min(...heights) : 0;
    const lunarTideTendency = classifyLunarTideTendency(moonPhase.phase);
    const description = `${tidalRange.toFixed(1)} ${units} observed range. ${moonPhase.emoji} ${moonPhase.phaseName} (${moonPhase.illumination}% illuminated); ${lunarTideTendency.toLowerCase()}-tide lunar tendency. Local bathymetry, weather, and station corrections determine actual heights and currents.`;

    return { date, lunarTideTendency, moonPhase, tidalRange, description };
  }
}
