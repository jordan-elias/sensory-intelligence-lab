import test from 'node:test'; import assert from 'node:assert/strict';
import { LEVELS, nextLevel, velocityVol, plays, clampLen, trackStep } from '../../assets/js/seq/groove.js';
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const P = await import('../../assets/js/seq/patterns.js');
const empty = (fill) => Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => Array(16).fill(fill)));
const state = () => ({ bpm: 100, swing: 0.3, root: 'D', scale: 'minor', loops: empty(null), vel: empty(1), prob: empty(1), len: Array.from({ length: 4 }, () => Array(8).fill(16)), chain: [{ loopIdx: 1, reps: 2 }] });

test('velocity cycles through four levels and returns to full', () => {
  assert.deepEqual([1, 0.75, 0.5, 0.25].map(nextLevel), [0.75, 0.5, 0.25, 1]);
  assert.equal(nextLevel(0.6), 0.25); assert.equal(nextLevel(NaN), 0.75);
});
test('velocity changes loudness, never silences', () => {
  assert.equal(velocityVol(0.8, 1), 0.8); assert.ok(velocityVol(0.8, 0.25) > 0.8 * 0.3 && velocityVol(0.8, 0.25) < 0.8 * 0.5);
  assert.ok(velocityVol(0.8, 0.5) > velocityVol(0.8, 0.25));
});
test('chance: 100% always, 0% never, otherwise by the random number', () => {
  assert.equal(plays(1, 0.999), true); assert.equal(plays(0, 0), false); assert.equal(plays(0.5, 0.49), true); assert.equal(plays(0.5, 0.5), false);
  let n = 0; for (let i = 0; i < 1000; i++) if (plays(0.25, i / 1000)) n++; assert.equal(n, 250);
});
test('track length keeps its own cycle against the sixteen', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(t => trackStep(t, 3)), [0, 1, 2, 0, 1, 2, 0]);
  assert.equal(trackStep(16, 16), 0); assert.equal(trackStep(17, 12), 5); assert.equal(trackStep(35, 12), 11);
  const seen = new Set(); for (let t = 0; t < 16 * 3; t++) seen.add(trackStep(t, 12) + ':' + (t % 16)); assert.equal(seen.size, 48 === 48 ? 48 : 0);
});
test('lengths are whole numbers from 1 to 16', () => { assert.equal(clampLen(0), 1); assert.equal(clampLen(99), 16); assert.equal(clampLen('7.4'), 7); assert.equal(clampLen('x'), 16); });
test('a pattern saves and loads exactly, with all the new step data', () => {
  const s = state(); s.loops[1][2][4] = true; s.loops[2][5][3] = 6; s.vel[1][2][4] = 0.5; s.prob[2][5][3] = 0.25; s.len[1][2] = 12;
  assert.deepEqual(P.save('Groove A', s), { ok: true });
  const back = P.load('Groove A', {}); assert.deepEqual(back, { ...s, bpm: 100 });
});
test('same name replaces, list is newest first, delete works', () => {
  P.save('B', state(), new Date('2026-01-01')); P.save('C', state(), new Date('2026-02-01')); P.save('B', state(), new Date('2026-03-01'));
  assert.deepEqual(P.list().filter(p => ['B', 'C'].includes(p.name)).map(p => p.name), ['B', 'C']);
  P.remove('B'); assert.equal(P.list().some(p => p.name === 'B'), false);
});
test('damaged or hand-edited entries cannot break the sequencer', () => {
  const bad = { bpm: 9999, swing: 'x', root: 'Q', scale: 'nope', loops: [[[true, 99, 'x', -1, 3.5]]], vel: 'bad', prob: [[[7]]], len: [[0, 50]], chain: [{ loopIdx: 9, reps: 2 }, { loopIdx: 1, reps: 3 }, null] };
  const u = P.unpack(bad); assert.equal(u.bpm, 200); assert.equal(u.swing, 0); assert.equal(u.root, 'C'); assert.equal(u.scale, 'major');
  assert.equal(u.loops.length, 4); assert.equal(u.loops[0].length, 8); assert.equal(u.loops[0][0].length, 16);
  assert.deepEqual(u.loops[0][0].slice(0, 5), [true, null, null, null, null]);
  assert.ok(u.vel.flat(2).every(v => LEVELS.includes(v)) && u.prob.flat(2).every(v => LEVELS.includes(v)));
  assert.deepEqual(u.len[0].slice(0, 2), [1, 16]); assert.deepEqual(u.chain, [{ loopIdx: 1, reps: 3 }]);
  assert.equal(P.unpack(null), null); assert.equal(P.unpack({ loops: 'x' }), null);
});
test('names are cleaned, limits are kept, and nothing needs a network', async () => {
  assert.deepEqual(P.save('   ', state()), { ok: false, error: 'Give the pattern a name.' });
  assert.equal(P.cleanName('<b>Hi</b>\n'), 'bHi/b');
  for (let i = 0; i < 40; i++) P.save('p' + i, state());
  assert.ok(P.list().length <= 30); assert.equal(P.save('overflow', state()).ok, false);
  const src = (await import('node:fs')).readFileSync(new URL('../../assets/js/seq/patterns.js', import.meta.url), 'utf8'); assert.ok(!/fetch\(|XMLHttp|sendBeacon/.test(src));
});
