import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC, NATURE, NOISE, allTiles, strip } from '../../assets/js/ambience/catalog.js';
import { toggle, clean, ofFamily } from '../../assets/js/ambience/selection.js';
import { events, ROWS, STEPS, VARIATIONS, feelOf, chordMidi, degreeMidi, rng } from '../../assets/js/ambience/music.js';
import { startState, step, reconcile, soundingIds, DENSITY } from '../../assets/js/ambience/drift.js';
import { loopable, makeNoise } from '../../assets/js/ambience/loop.js';
import { cleanPrefs, DEFAULT_SETTINGS } from '../../assets/js/ambience/store.js';

const known = allTiles().map(t => t.id);

test('selection: one per music row, two nature, one noise, one spoken', () => {
  let s = [];
  s = toggle(s, 'music:drums:lofi'); s = toggle(s, 'music:drums:soft');
  assert.deepEqual(s, ['music:drums:soft']);
  s = toggle(s, 'music:bass:sub'); assert.equal(ofFamily(s, 'music').length, 2);
  s = toggle(s, 'nature:ocean'); s = toggle(s, 'nature:rain'); s = toggle(s, 'nature:birds');
  assert.deepEqual(ofFamily(s, 'nature'), ['nature:rain', 'nature:birds']);   // the oldest steps aside
  s = toggle(s, 'noise:pink'); s = toggle(s, 'noise:wind'); assert.deepEqual(ofFamily(s, 'noise'), ['noise:wind']);
  s = toggle(s, 'noise:wind'); assert.deepEqual(ofFamily(s, 'noise'), []);
});
test('selection: clean drops unknown, duplicate and over-limit entries', () => {
  const c = clean(['nope', 'music:drums:lofi', 'music:drums:lofi', 'music:drums:soft', 5, 'nature:ocean', 'nature:rain', 'nature:fire'], known);
  assert.deepEqual(c, ['music:drums:soft', 'nature:rain', 'nature:fire']);
  assert.deepEqual(clean('x', known), []);
});
test('strip: music tiles share their row', () => { assert.equal(strip('music:drums:lofi'), 'music:drums'); assert.equal(strip('nature:ocean'), 'nature:ocean'); });

test('music: every row, option, variation, bar and step gives finite events', () => {
  for (const feelId of ['calm', 'warm', 'dreamy']) {
    const feel = feelOf(feelId);
    for (const [row, opts] of Object.entries(ROWS)) for (const o of opts) for (let v = 0; v < VARIATIONS; v++) {
      let count = 0;
      for (let bar = 0; bar < 4; bar++) for (let step = 0; step < STEPS; step++) for (const e of events(row, o, v, { step, bar, feel, seed: 7 })) {
        count++; assert.ok(e.vel > 0 && e.vel <= 1, `${row}/${o}`);
        for (const m of [].concat(e.midi ?? [])) assert.ok(Number.isFinite(m) && m >= 12 && m <= 110, `${row}/${o} midi ${m}`);
        if ('dur' in e) assert.ok(e.dur >= 1 && e.dur <= 16);
      }
      if (!(row === 'melody' && o === 'bells')) assert.ok(count > 0, `${row}/${o}/${v} plays something`);
    }
  }
});
test('music: kinds match their row', () => {
  const kinds = { drums: ['kick', 'snare', 'hat', 'ohat'], bass: ['bass'], chords: ['rhodes'], pad: ['pad'], melody: ['pluck', 'bell'] };
  const feel = feelOf('calm');
  for (const [row, opts] of Object.entries(ROWS)) for (const o of opts) for (let bar = 0; bar < 4; bar++) for (let step = 0; step < 16; step++) for (const e of events(row, o, 1, { step, bar, feel })) assert.ok(kinds[row].includes(e.kind));
});
test('music: the same seed gives the same melody, another seed another', () => {
  const run = seed => { const o = []; for (let bar = 0; bar < 4; bar++) for (let step = 0; step < 16; step++) o.push(events('melody', 'pluck', 0, { step, bar, feel: feelOf('calm'), seed })); return JSON.stringify(o); };
  assert.equal(run(5), run(5)); assert.notEqual(run(5), run(6));
});
test('music: chords follow the key', () => {
  const calm = feelOf('calm');
  assert.deepEqual(chordMidi(calm, 0).map(m => m % 12), [9, 0, 4, 7]);          // A C E G (Am7)
  assert.equal(degreeMidi(calm, 7), degreeMidi(calm, 0) + 12);
  assert.equal(degreeMidi(calm, -7), degreeMidi(calm, 0) - 12);
});
test('music: only drums are rhythm, only one bar of pad per phrase bar', () => {
  const pads = []; for (let bar = 0; bar < 4; bar++) for (let step = 0; step < 16; step++) pads.push(...events('pad', 'air', 0, { step, bar, feel: feelOf('calm') }));
  assert.equal(pads.length, 4);
});

const sel = ['music:drums:lofi', 'music:bass:sub', 'music:chords:warm', 'music:melody:pluck', 'music:pad:air', 'nature:ocean', 'nature:rain', 'noise:pink'];
function run(selection, { pinned = [], density = 'medium', phrases = 300, seed = 1 } = {}) {
  const r = rng(seed); let st = startState(selection, { pinned, density }, r); const log = [st];
  for (let i = 0; i < phrases; i++) { st = step(st, selection, { pinned, density }, r); log.push(st); }
  return log;
}
test('drift: starts gently, with the beds and one music row', () => {
  const st = startState(sel, {}, rng(3));
  assert.equal(Object.keys(st.music).length, 1); assert.deepEqual(st.beds.sort(), ['nature:ocean', 'nature:rain', 'noise:pink']);
});
test('drift: the cap, the selection and the silence rule hold over many phrases', () => {
  for (const density of Object.keys(DENSITY)) for (let seed = 1; seed <= 20; seed++) for (const st of run(sel, { density, seed })) {
    assert.ok(Object.keys(st.music).length <= DENSITY[density].maxMusic, 'cap');
    for (const id of soundingIds(st)) assert.ok(sel.includes(id), 'only what is switched on');
    assert.ok(soundingIds(st).length >= 1, 'never silent');
  }
});
test('drift: it really does change, and by one music row at a time', () => {
  const log = run(sel, { seed: 4 }); let changes = 0;
  for (let i = 1; i < log.length; i++) {
    const a = Object.keys(log[i - 1].music), b = Object.keys(log[i].music), delta = a.filter(x => !b.includes(x)).length + b.filter(x => !a.includes(x)).length;
    assert.ok(delta <= 1, 'at most one row comes or goes'); if (JSON.stringify(log[i].music) !== JSON.stringify(log[i - 1].music)) changes++;
  }
  assert.ok(changes > 40, `changes ${changes}`);
});
test('drift: nothing flips straight back (cooldown)', () => {
  const log = run(sel, { seed: 9, phrases: 400 });
  const onsets = {};
  for (let i = 1; i < log.length; i++) for (const row of new Set([...Object.keys(log[i].music), ...Object.keys(log[i - 1].music)])) {
    const was = !!log[i - 1].music[row], is = !!log[i].music[row];
    if (was !== is) { if (onsets[row] != null) assert.ok(i - onsets[row] >= 2, `${row} changed after ${i - onsets[row]}`); onsets[row] = i; }
  }
});
test('drift: pinned tiles always sound', () => {
  const pinned = ['music:drums:lofi', 'nature:ocean'];
  for (const st of run(sel, { pinned, seed: 11 })) { assert.ok(st.music.drums, 'pinned drums'); assert.ok(st.beds.includes('nature:ocean'), 'pinned ocean'); }
});
test('drift: with only beds it keeps one sounding; with only music it keeps one sounding', () => {
  for (const st of run(['nature:ocean', 'noise:pink'], { seed: 2 })) assert.ok(st.beds.length >= 1);
  for (const st of run(['music:drums:lofi', 'music:bass:sub'], { seed: 2 })) assert.ok(Object.keys(st.music).length >= 1);
});
test('drift: deterministic for a seed; empty selection stays empty', () => {
  assert.equal(JSON.stringify(run(sel, { seed: 5 })), JSON.stringify(run(sel, { seed: 5 })));
  const e = run([], { phrases: 20 }); for (const st of e) assert.equal(soundingIds(st).length, 0);
});
test('drift: spoken word is rare, short and always leaves', () => {
  const s2 = [...sel, 'spoken:talk']; const log = run(s2, { seed: 8, phrases: 600 });
  const on = log.filter(st => st.beds.includes('spoken:talk')).length, entries = log.filter((st, i) => i && st.beds.includes('spoken:talk') && !log[i - 1].beds.includes('spoken:talk')).length;
  assert.ok(entries >= 2, `entries ${entries}`); assert.ok(on / log.length < 0.5, 'rare'); assert.ok(on / entries <= 6, 'short');
});
test('drift: reconcile drops what was switched off and keeps pinned', () => {
  const st = startState(sel, {}, rng(1)); const next = reconcile(st, ['nature:ocean'], []);
  assert.deepEqual(next.beds, ['nature:ocean']); assert.deepEqual(next.music, {});
});

test('loopable: the end runs into the start without a jump', () => {
  const n = 44100 * 4, a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.sin(i * 0.05) * 0.5;
  const [o] = loopable([a], 22050); assert.equal(o.length, n - 22050);
  let maxStep = 0; for (let i = 1; i < o.length; i++) maxStep = Math.max(maxStep, Math.abs(o[i] - o[i - 1]));
  assert.ok(Math.abs(o[0] - o[o.length - 1]) <= maxStep * 2 + 1e-6, 'seam');
  for (const v of o) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1);
});
test('loopable: crossfade is capped, and zero leaves the sound alone', () => {
  assert.equal(loopable([new Float32Array(300)], 10000)[0].length, 200);
  assert.equal(loopable([new Float32Array(300)], 0)[0].length, 300);
});
test('noise: finite, peak 0.5, repeatable', () => {
  for (const k of ['white', 'pink', 'brown']) { const a = makeNoise(k, 20000, 3), b = makeNoise(k, 20000, 3); let m = 0; for (let i = 0; i < a.length; i++) { assert.ok(Number.isFinite(a[i])); m = Math.max(m, Math.abs(a[i])); assert.equal(a[i], b[i]); } assert.ok(Math.abs(m - 0.5) < 1e-6); }
});
test('noise: brown has more low-frequency energy than white', () => {
  const diffE = a => { let e = 0; for (let i = 1; i < a.length; i++) e += (a[i] - a[i - 1]) ** 2; return e / a.length; };
  assert.ok(diffE(makeNoise('brown', 20000)) < diffE(makeNoise('pink', 20000)) && diffE(makeNoise('pink', 20000)) < diffE(makeNoise('white', 20000)));
});

test('store: repairs bad input', () => {
  const p = cleanPrefs({ selected: ['music:drums:lofi', 'x'], settings: { 'music:drums': { vol: 9, pan: -3, alt: 'yes', rate: 'a' }, evil: { vol: 1 } }, mode: 'journey', feel: 'zzz', master: 'a', pinned: ['nope', 'nature:rain'] }, known);
  assert.deepEqual(p.selected, ['music:drums:lofi']); assert.equal(p.settings['music:drums'].vol, 1); assert.equal(p.settings['music:drums'].pan, -1);
  assert.equal(p.settings['music:drums'].alt, false); assert.equal(p.settings['music:drums'].rate, DEFAULT_SETTINGS.rate); assert.equal(p.settings.evil, undefined);
  assert.equal(p.mode, 'steady'); assert.equal(p.feel, 'calm'); assert.equal(p.master, 0.8); assert.deepEqual(p.pinned, ['nature:rain']);
  assert.equal(cleanPrefs(null, known).selected.length, 0);
});
test('catalog: tile ids are unique and every nature sound has a file to try', () => {
  assert.equal(new Set(known).size, known.length);
  for (const n of NATURE) assert.ok(n.src.length >= 1); assert.equal(NOISE.length, 4); assert.equal(MUSIC.length, 5);
});
