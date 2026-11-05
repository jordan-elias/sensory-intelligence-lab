import test from 'node:test';
import assert from 'node:assert/strict';
import { byFactor, byTimeOfDay, bySun, highlights, placeProfiles, recommend, bucketOf, MIN_N } from '../../assets/js/checkins/insights.js';

let id = 0;
const ci = (valence, env = {}, extra = {}) => ({ id: ++id, created_at: '2026-06-10T09:00:00', valence, arousal: 5, sensory_load: 5, env, place_id: null, ...extra });

test('buckets of the day', () => {
  assert.equal(bucketOf('2026-06-10T09:00:00'), 'morning'); assert.equal(bucketOf('2026-06-10T14:00:00'), 'afternoon');
  assert.equal(bucketOf('2026-06-10T19:00:00'), 'evening'); assert.equal(bucketOf('2026-06-10T02:00:00'), 'night');
});
test('mood by noise level, with an "enough data" flag', () => {
  const data = [...[8, 9, 7].map(v => ci(v, { noise: 1 })), ...[3, 4, 2].map(v => ci(v, { noise: 5 })), ci(5, { noise: 3 })];
  const r = byFactor(data, 'noise');
  assert.deepEqual(r.map(x => x.level), [1, 3, 5]);
  assert.equal(r[0].mood, 8); assert.equal(r[2].mood, 3);
  assert.equal(r[0].enough, true); assert.equal(r[1].enough, false);
});
test('light factor uses named levels in order', () => {
  const r = byFactor([ci(7, { light: 'dim' }), ci(9, { light: 'direct' })], 'light');
  assert.deepEqual(r.map(x => x.level), ['direct', 'dim']);
});
test('highlights only report real differences backed by enough check-ins', () => {
  const quiet = [8, 9, 7].map(v => ci(v, { noise: 1 })), loud = [3, 4, 2].map(v => ci(v, { noise: 5 }));
  const h = highlights([...quiet, ...loud]);
  assert.ok(h.some(x => x.factor === 'noise' && /8 .*3/.test(x.text)));
  const flat = highlights([...[6, 6, 6].map(v => ci(v, { noise: 1 })), ...[6, 6, 7].map(v => ci(v, { noise: 5 }))]);
  assert.equal(flat.filter(x => x.factor === 'noise').length, 0);
  assert.equal(highlights([ci(8, { noise: 1 }), ci(2, { noise: 5 })]).length, 0, 'one check-in per level is not enough');
});
test('mood by sun height', () => {
  const rows = bySun([...[8, 8, 9].map(v => ci(v, { sun_elevation: 40 })), ...[4, 4, 5].map(v => ci(v, { sun_elevation: -20 }))]);
  assert.deepEqual(rows.map(r => r.level), ['dark', 'high sun']);
});
test('time of day', () => {
  const rows = byTimeOfDay([ci(8), ci(8), ci(8), ci(2, {}, { created_at: '2026-06-10T21:00:00' })]);
  assert.equal(rows.find(r => r.level === 'morning').mood, 8);
});
const park = { id: 'p1', name: 'Park', lat: 52.52, lng: 13.405 }, cafe = { id: 'p2', name: 'Cafe', lat: null, lng: null };
const history = [
  ...[8, 9, 8].map(v => ci(v, { noise: 1, crowd: 1, light: 'direct' }, { place_id: 'p1' })),
  ...[4, 5, 4].map(v => ci(v, { noise: 4, crowd: 5, light: 'dim' }, { place_id: 'p2' })),
];
test('place profiles', () => {
  const [a, b] = placeProfiles(history, [park, cafe]);
  assert.equal(a.all.mood, 8.3); assert.equal(a.all.noise, 1); assert.equal(a.all.directSun, 100);
  assert.equal(b.all.crowd, 5);
});
test('recommend: quiet and sunny at noon in June picks the park', () => {
  const r = recommend(history, [cafe, park], { noise: 'quiet', crowd: 'empty', sun: 'sunny' }, new Date('2026-06-21T12:00:00'));
  assert.equal(r[0].place.id, 'p1'); assert.equal(r[0].matches, 3); assert.equal(r[0].misses, 0);
  assert.equal(r[1].place.id, 'p2'); assert.ok(r[1].misses >= 2);
  assert.ok(r[1].notes.some(n => /coordinates/.test(n)));
});
test('recommend: a place with no logged noise says so instead of guessing', () => {
  const r = recommend([], [park], { noise: 'quiet' }, new Date('2026-06-21T12:00:00'));
  assert.ok(r[0].notes.some(n => /no noise logged/.test(n))); assert.equal(r[0].matches + r[0].misses, 0);
});
test('recommend: shade wanted at night means no sun', () => {
  const r = recommend(history, [park], { sun: 'shade' }, new Date('2026-12-21T23:00:00'));
  assert.equal(r[0].matches, 1);
});
test('MIN_N is exported', () => assert.equal(MIN_N, 3));
