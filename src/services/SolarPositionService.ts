const RAD = Math.PI / 180;
const DAY_MS = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397; // Earth's axial tilt
const PERIHELION = RAD * 102.9372;

function toDays(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
}

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(meanAnomaly: number): number {
  // Equation of the center
  const center = RAD * (1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly));
  return meanAnomaly + center + PERIHELION + Math.PI;
}

function siderealTime(d: number, longitudeWest: number): number {
  return RAD * (280.16 + 360.9856235 * d) - longitudeWest;
}

export interface SunPosition {
  altitudeDeg: number;
  azimuthDeg: number;
}

export function getSunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const lw = RAD * -longitude;
  const phi = RAD * latitude;
  const d = toDays(date);

  const meanAnomaly = solarMeanAnomaly(d);
  const eclipticLng = eclipticLongitude(meanAnomaly);
  const declination = Math.asin(Math.sin(OBLIQUITY) * Math.sin(eclipticLng));
  const rightAscension = Math.atan2(Math.sin(eclipticLng) * Math.cos(OBLIQUITY), Math.cos(eclipticLng));
  const hourAngle = siderealTime(d, lw) - rightAscension;

  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)
  );
  const azimuthFromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi)
  );

  return {
    altitudeDeg: altitude / RAD,
    azimuthDeg: ((azimuthFromSouth / RAD + 180) % 360 + 360) % 360,
  };
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function azimuthToCompass(azimuthDeg: number): string {
  return COMPASS_POINTS[Math.round(azimuthDeg / 22.5) % 16];
}
