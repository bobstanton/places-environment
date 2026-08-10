import { TideCodeBlockSettings, TideData, TideStation, tideUnitToUnitsSystem } from '../types';
import { km, formatKmInSystem, getElevationUnit, UnitsSystem } from "places-shared/units";
import { DateParser } from "places-shared/settings";
import { parseNaiveTimestamp } from './TideTime';
import { markdownTable } from 'markdown-table';

// Rows cover high/low tides plus optional hourly and solar points.
export interface TideEventRow {
  datetime: Date;
  time: string;
  type: string;
  height: string;
  datum: string;
}

function unitsLabel(tideData: TideData): string {
  const elevationUnit = getElevationUnit(tideUnitToUnitsSystem(tideData.units));
  return elevationUnit.name.charAt(0).toUpperCase() + elevationUnit.name.slice(1);
}

function formatTime(timestamp: string): string {
  return parseNaiveTimestamp(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Shared by the card and table views.
export function buildTideEvents(
  tideData: TideData,
  settings: TideCodeBlockSettings,
  interpolateHeight: (date: Date) => number | null
): TideEventRow[] {
  const unitsText = unitsLabel(tideData);
  const events: TideEventRow[] = [];

  for (const tide of tideData.hilo) {
    events.push({
      datetime: parseNaiveTimestamp(tide.timestamp_local),
      time: formatTime(tide.timestamp_local),
      type: tide.type === 'H' ? 'High Tide' : 'Low Tide',
      height: `${tide.height.toFixed(2)} ${unitsText}`,
      datum: tideData.datum,
    });
  }

  if (settings.exportHourlyEstimates) {
    for (const hourlyPoint of tideData.hourly) {
      events.push({
        datetime: parseNaiveTimestamp(hourlyPoint.timestamp_local),
        time: formatTime(hourlyPoint.timestamp_local),
        type: 'Hourly',
        height: `${hourlyPoint.height.toFixed(2)} ${unitsText}`,
        datum: tideData.datum,
      });
    }
  }

  if (settings.showSolar) {
    const addSolar = (iso: string | undefined, label: string): void => {
      if (!iso) return;
      const date = parseNaiveTimestamp(iso);
      const height = interpolateHeight(date);
      const hasHeight = height !== null && height !== undefined;
      events.push({
        datetime: date,
        time: DateParser.formatTime12Hour(parseNaiveTimestamp(iso)),
        type: label,
        height: hasHeight ? `${height.toFixed(2)} ${unitsText}` : '-',
        datum: hasHeight ? tideData.datum : '-',
      });
    };
    for (const solar of tideData.solar ?? []) {
      addSolar(solar.sunrise, 'Sunrise');
      addSolar(solar.sunset, 'Sunset');
      addSolar(solar.civil_twilight_begin, 'Dawn');
      addSolar(solar.civil_twilight_end, 'Dusk');
    }
  }

  events.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  return events;
}

// Consumed by both markdown and HTML rendering.
export function tideEventsToRows(events: TideEventRow[]): string[][] {
  return [
    ['Date', 'Time', 'Type', 'Height', 'Datum'],
    ...events.map(event => [
      event.datetime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      event.time,
      event.type,
      event.height || '-',
      event.datum || '-',
    ]),
  ];
}

export function buildTideMoonPhaseRows(tideData: TideData): string[][] {
  const unitsText = unitsLabel(tideData);
  const descriptions = Array.from(tideData.descriptionByDate?.entries() ?? []);
  return [
    ['Date', 'Range', 'Moon Phase', 'Illumination', 'Lunar Tide Tendency', 'Context'],
    ...descriptions.map(([dateStr, desc]) => {
      const date = parseNaiveTimestamp(dateStr + ' 12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayTides = tideData.hilo.filter(tide => tide.timestamp_local.startsWith(dateStr));
      const highTides = dayTides.filter(t => t.type === 'H');
      const lowTides = dayTides.filter(t => t.type === 'L');
      const tidalRange = (highTides.length > 0 && lowTides.length > 0)
        ? Math.max(...highTides.map(h => h.height)) - Math.min(...lowTides.map(l => l.height))
        : 0;
      return [
        date,
        `${tidalRange.toFixed(1)} ${unitsText}`,
        `${desc.moonPhase.emoji} ${desc.moonPhase.phaseName}`,
        `${desc.moonPhase.illumination}%`,
        desc.lunarTideTendency,
        desc.description,
      ];
    }),
  ];
}

// The distance appears when the station stands in for a requested location.
export function tideStationTitle(station: TideStation, unitsSystem?: UnitsSystem): string {
  const base = `${station.name} (${station.id})`;
  if (unitsSystem && station.distance_km !== undefined) {
    return `${base} · ${formatKmInSystem(km(station.distance_km), unitsSystem, 1)}`;
  }
  return base;
}

// Reference stations carry NOAA harmonic predictions; subordinate stations derive
// theirs from a reference station via offsets.
export function tideStationTypeLabel(type: TideStation['type']): string | undefined {
  if (type === 'R') return 'Reference station';
  if (type === 'S') return 'Subordinate station (derived predictions)';
  return undefined;
}

// For the clipboard; shared by the card and table views.
export function buildTideMarkdown(
  tideData: TideData,
  settings: TideCodeBlockSettings,
  interpolateHeight: (date: Date) => number | null
): string {
  const unitsSystem = tideUnitToUnitsSystem(tideData.units);
  const unitsText = unitsLabel(tideData);

  let markdown = `# Tide Table - ${tideData.station.name}\n`;
  markdown += `**Station:** ${tideStationTitle(tideData.station, unitsSystem)}  \n`;
  const typeLabel = tideStationTypeLabel(tideData.station.type);
  if (typeLabel) {
    markdown += `**Type:** ${typeLabel}  \n`;
  }
  markdown += `**Datum:** ${tideData.datum}  \n`;
  markdown += `**Units:** ${unitsText}  \n`;
  markdown += `**Generated:** ${new Date().toLocaleString()}  \n\n`;

  const events = buildTideEvents(tideData, settings, interpolateHeight);
  if (events.length > 0) {
    const hasSolar = !!settings.showSolar && tideData.solar && tideData.solar.length > 0;
    markdown += `## ${hasSolar ? 'Tide and Solar Events' : 'Tide Events'}\n\n`;
    const interpolationNote = hasSolar ? ' and interpolated for solar events' : '';
    markdown += `*All times are station local time (LST/LDT). Heights calculated from NOAA predictions${interpolationNote}.*\n\n`;
    markdown += markdownTable(tideEventsToRows(events)) + '\n';
  } else {
    markdown += '*No tide or solar data available.*\n';
  }
  markdown += '\n';

  if (settings.showMoonPhases) {
    markdown += '## Tidal Coefficients & Moon Phases\n\n';
    markdown += markdownTable(buildTideMoonPhaseRows(tideData)) + '\n\n';
  }

  markdown += "\n---\n\n";
  markdown += "*Tide data provided by NOAA's Center for Operational Oceanographic Products and Services (CO-OPS).*  \n";
  if (settings.showSolar) {
    markdown += "*Solar data provided by [sunrise-sunset.org](https://sunrise-sunset.org).*  \n";
  }
  return markdown;
}

export function renderTideStationInfo(container: HTMLElement, tideData: TideData): void {
  const stationInfoDiv = container.createDiv('tide-station-info');
  const unitsSystem = tideUnitToUnitsSystem(tideData.units);
  stationInfoDiv.createEl('h4').setText(tideStationTitle(tideData.station, unitsSystem));

  const detailsDiv = stationInfoDiv.createDiv('tide-station-details');

  const typeLabel = tideStationTypeLabel(tideData.station.type);
  if (typeLabel) {
    detailsDiv.createSpan('tide-station-type').setText(typeLabel);
  }

  detailsDiv.createSpan('tide-station-datum').setText(tideData.datum);

  const elevationUnit = getElevationUnit(unitsSystem);
  detailsDiv.createSpan('tide-station-units').setText(elevationUnit.name.charAt(0).toUpperCase() + elevationUnit.name.slice(1));

  if (tideData.solar && tideData.solar.length > 0) {
    const attribution = stationInfoDiv.createDiv('tide-attribution');
    attribution.setText('Solar data: ');
    const link = attribution.createEl('a');
    link.href = 'https://sunrise-sunset.org';
    link.target = '_blank';
    link.rel = 'noopener';
    link.setText('sunrise-sunset.org');
  }
}
