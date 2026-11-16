import { MoonPhase } from '../types';
import { Moon, Hemisphere } from 'lunarphase-js';
import { DateParser } from "places-shared/settings";

export class MoonPhaseService {
  getMoonPhase(date: Date): MoonPhase {
    const phaseName = Moon.lunarPhase(date);
    const emoji = Moon.lunarPhaseEmoji(date, { hemisphere: Hemisphere.NORTHERN });
    const phasePercent = Moon.lunarAgePercent(date);
    const phase = phasePercent / 100;
    const illumination = this.calculateIllumination(phase);
    const dateStr = DateParser.formatDateISO(date);
    
    return {
      phase,
      phaseName,
      emoji,
      illumination,
      date: dateStr
    };
  }
  
  calculateMoonPhases(startDate: Date, endDate: Date): MoonPhase[] {
    const moonPhases: MoonPhase[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const moonPhase = this.getMoonPhase(currentDate);

      moonPhases.push(moonPhase);

      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return moonPhases;
  }

  private calculateIllumination(phase: number): number {
    if (phase <= 0.5) {
      return Math.round((1 - Math.cos(phase * 2 * Math.PI)) * 50);
    } else {
      return Math.round((1 + Math.cos((phase - 0.5) * 2 * Math.PI)) * 50);
    }
  }
}