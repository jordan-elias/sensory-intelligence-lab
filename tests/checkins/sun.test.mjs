import test from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition, daylightHours, sunLabel, elevationGrid, roundCoords } from '../../assets/js/checkins/sun.js';

const BERLIN = { lat: 52.52, lng: 13.405 };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} ± ${tol}`);

test('Berlin solar noon height at the solstices and equinox', () => {
  // solar noon in Berlin is about 11:08 UTC in June, 11:07 in December
  near(sunPosition(new Date('2026-06-21T11:08:00Z'), BERLIN.lat, BERLIN.lng).elevation, 60.9, 0.6, 'June');
  near(sunPosition(new Date('2026-12-21T11:07:00Z'), BERLIN.lat, BERLIN.lng).elevation, 14.0, 0.6, 'December');
  near(sunPosition(new Date('2026-03-20T11:05:00Z'), BERLIN.lat, BERLIN.lng).elevation, 37.5, 0.8, 'equinox');
});
test('the sun is due south at solar noon and below the horizon at midnight', () => {
  near(sunPosition(new Date('2026-06-21T11:08:00Z'), BERLIN.lat, BERLIN.lng).azimuth, 180, 3, 'azimuth');
  assert.ok(sunPosition(new Date('2026-06-21T23:00:00Z'), BERLIN.lat, BERLIN.lng).elevation < 0);
});
test('east in the morning, west in the evening', () => {
  const am = sunPosition(new Date('2026-09-23T05:00:00Z'), BERLIN.lat, BERLIN.lng).azimuth;
  const pm = sunPosition(new Date('2026-09-23T16:00:00Z'), BERLIN.lat, BERLIN.lng).azimuth;
  assert.ok(am > 60 && am < 130, 'morning ' + am);
  assert.ok(pm > 230 && pm < 300, 'evening ' + pm);
});
test('southern hemisphere: Sydney is summery in December', () => {
  const e = sunPosition(new Date('2026-12-21T02:00:00Z'), -33.87, 151.21).elevation;
  assert.ok(e > 70, 'Sydney noon December ' + e);
});
test('day length', () => {
  near(daylightHours(new Date('2026-06-21T12:00:00Z'), 52.52), 16.8, 0.3, 'Berlin June');
  near(daylightHours(new Date('2026-12-21T12:00:00Z'), 52.52), 7.8, 0.3, 'Berlin December');
  assert.equal(daylightHours(new Date('2026-12-21T12:00:00Z'), 80), 0);     // polar night
  assert.equal(daylightHours(new Date('2026-06-21T12:00:00Z'), 80), 24);    // midnight sun
  near(daylightHours(new Date('2026-03-20T12:00:00Z'), 0), 12, 0.2, 'equator');
});
test('labels', () => {
  assert.equal(sunLabel(-10), 'dark'); assert.equal(sunLabel(-2), 'twilight');
  assert.equal(sunLabel(5), 'low sun'); assert.equal(sunLabel(20), 'mid-height sun'); assert.equal(sunLabel(45), 'high sun');
  assert.equal(sunLabel(null), null);
});
test('grid shape and seasons', () => {
  const g = elevationGrid(BERLIN.lat, BERLIN.lng, 2026);
  assert.equal(g.length, 12); assert.equal(g[0].length, 24);
  assert.ok(Math.max(...g[5]) > Math.max(...g[11]) + 30, 'June sun is much higher than December');
});
test('coordinates are rounded for storage', () => {
  assert.deepEqual(roundCoords(52.520008, 13.404954), { lat: 52.52, lng: 13.4 });
  assert.deepEqual(roundCoords(52.520008, 13.404954, true), { lat: 52.52001, lng: 13.40495 });
});
