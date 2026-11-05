/**
 * /assets/js/checkins/sun.js
 * Where the sun is, computed on the device from a date and a latitude/longitude.
 * Nothing is sent anywhere. Accurate to about a degree, which is plenty for
 * "is it sunny here at 4pm in December?".
 *
 * Standard low-precision solar position formulas (Meeus, Astronomical Algorithms).
 */
const RAD = Math.PI / 180;
const DAY_MS = 864e5;
const OBLIQUITY = RAD * 23.4397;

const toDays = date => date.valueOf() / DAY_MS - 0.5 + 2440588 - 2451545;   // days since J2000

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);                                           // mean anomaly
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;                                            // ecliptic longitude
  return {
    dec: Math.asin(Math.sin(OBLIQUITY) * Math.sin(L)),
    ra: Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L)),
  };
}

/**
 * @returns {{elevation:number, azimuth:number}} degrees above the horizon (negative = night),
 *          and compass bearing 0 = north, 90 = east, 180 = south.
 */
export function sunPosition(date, lat, lng) {
  const d = toDays(date);
  const { dec, ra } = sunCoords(d);
  const phi = RAD * lat;
  const H = RAD * (280.16 + 360.9856235 * d) - RAD * -lng - ra;                          // hour angle
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const fromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { elevation: elevation / RAD, azimuth: ((fromSouth / RAD + 180) % 360 + 360) % 360 };
}

/** Hours between sunrise and sunset on the day of `date` (0 in polar night, 24 in midnight sun). */
export function daylightHours(date, lat) {
  const { dec } = sunCoords(toDays(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12))));
  const phi = RAD * lat;
  const c = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (c >= 1) return 0;
  if (c <= -1) return 24;
  return (2 * Math.acos(c) / RAD) / 15;
}

/** Plain-language label for how much sun there is at a given elevation. */
export function sunLabel(elevation) {
  if (elevation == null) return null;
  if (elevation <= -6) return 'dark';
  if (elevation <= 0) return 'twilight';
  if (elevation < 10) return 'low sun';
  if (elevation < 30) return 'mid-height sun';
  return 'high sun';
}

/**
 * Sun height for every month and hour of the day, for the "sun through the year" chart.
 * Uses the device's own time zone, so it matches the clock on the wall for places in it.
 * @returns {number[][]} rows = months 0..11 (15th of the month), columns = hours 0..23
 */
export function elevationGrid(lat, lng, year = new Date().getFullYear()) {
  return Array.from({ length: 12 }, (_, m) =>
    Array.from({ length: 24 }, (_, h) => Math.round(sunPosition(new Date(year, m, 15, h, 30), lat, lng).elevation * 10) / 10));
}

/** Rounds coordinates for storage: about 1 km by default, about 1 m when the person asks for exact. */
export function roundCoords(lat, lng, exact = false) {
  const p = exact ? 5 : 2;
  const r = v => Math.round(v * 10 ** p) / 10 ** p;
  return { lat: r(lat), lng: r(lng) };
}
