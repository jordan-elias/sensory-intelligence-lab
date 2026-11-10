import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, generate, shuffle, sample, rotateAssign, degreeNotes, NOTE_NAMES } from '../../assets/js/experiments/rng.js';
import { resample, reverse, chopShuffle, stutter, pitchedGrains, contrastLayer, normalise, encodeWav, mixToMono } from '../../assets/js/experiments/audio-ops.js';
import { EXPERIMENTS, CATEGORIES, NEEDS } from '../../assets/js/experiments/catalog.js';

test('the same seed gives the same roll; different seeds differ', () => {
  const spec = { kind: 'degrees', count: 7, root: 0, scale: 'major' };
  assert.deepEqual(generate(spec, mulberry32(5)), generate(spec, mulberry32(5)));
  assert.notDeepEqual(generate(spec, mulberry32(5)).summary, generate(spec, mulberry32(6)).summary);
});
test('degrees: right count, inside the scale, and named in the key', () => {
  const r = generate({ kind: 'degrees', count: 7, root: 2, scale: 'major pentatonic' }, mulberry32(1));
  assert.equal(r.items.length, 7);
  for (const pc of r.pitchClasses) assert.ok([2, 4, 6, 9, 11].includes(pc), String(pc));
  assert.deepEqual(degreeNotes(0, 'major', [1, 3, 5]), ['C', 'E', 'G']);
});
test('notes: unique pitch classes', () => {
  const r = generate({ kind: 'notes', count: 5 }, mulberry32(9));
  assert.equal(new Set(r.pitchClasses).size, 5); assert.ok(r.pitchClasses.every(p => p >= 0 && p < 12));
});
test('tuning never rolls a zero shift', () => {
  for (let s = 0; s < 200; s++) { const r = generate({ kind: 'tuning' }, mulberry32(s)); assert.ok(!/ 0 /.test(r.items[1].text) && !/^0/.test(r.items[1].text)); assert.ok(/semitone/.test(r.items[1].text)); }
});
test('range stays inside its bounds', () => {
  for (let s = 0; s < 200; s++) { const [v] = generate({ kind: 'range', min: 5, max: 13 }, mulberry32(s)).values; assert.ok(v >= 5 && v <= 13); }
});
test('shuffle keeps every option once; pattern uses only its note set', () => {
  const opts = ['a', 'b', 'c', 'd']; assert.deepEqual(shuffle(mulberry32(2), opts).sort(), opts);
  const p = generate({ kind: 'pattern', steps: 8, setSize: 5 }, mulberry32(3));
  assert.equal(p.items.length, 8); assert.ok(new Set(p.pitchClasses).size <= 5);
});
test('rotateAssign moves every item to a different place', () => {
  for (let s = 0; s < 50; s++) { const r = rotateAssign(mulberry32(s), ['Bass', 'Keys', 'Voice', 'Drums']); assert.ok(r.every(a => a.from !== a.to)); assert.equal(new Set(r.map(a => a.to)).size, 4); }
});

const ramp = n => Float32Array.from({ length: n }, (_, i) => (i / n) * 0.8 + 0.01);
test('resample changes length by the rate', () => {
  assert.equal(resample(ramp(1000), 0.25).length, 4000); assert.equal(resample(ramp(1000), 4).length, 250);
});
test('reverse flips the samples', () => { assert.deepEqual([...reverse(Float32Array.of(1, 2, 3))], [3, 2, 1]); });
test('chopShuffle keeps the total length (within a slice) and never returns the original order', () => {
  for (let s = 0; s < 40; s++) { const { out, order } = chopShuffle(ramp(4800), 4800, 8, mulberry32(s)); assert.equal(out.length, 4800); assert.notDeepEqual(order, [1, 2, 3, 4, 5, 6, 7, 8]); assert.equal(new Set(order).size, 8); }
});
test('stutter repeats one piece; pitchedGrains makes one piece per step', () => {
  assert.equal(stutter(ramp(8000), 8000, 0.1, 0.1, 5).length, 4000);
  assert.ok(pitchedGrains(ramp(8000), 8000, 0, 0.1, [0, 12, -12]).length > 800 * 1.5);
});
test('contrastLayer is as long as the slow copy and normalise peaks below full scale', () => {
  const c = contrastLayer(ramp(1000)); assert.equal(c.length, 4000);
  const n = normalise(Float32Array.of(0.1, -0.5)); assert.ok(Math.abs(Math.max(...n.map(Math.abs)) - 0.89) < 1e-6);
});
test('encodeWav writes a valid 16-bit mono header', () => {
  const w = encodeWav(Float32Array.of(0, 1, -1), 22050), dv = new DataView(w.buffer);
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF'); assert.equal(String.fromCharCode(...w.slice(8, 12)), 'WAVE');
  assert.equal(dv.getUint32(24, true), 22050); assert.equal(dv.getUint32(40, true), 6); assert.equal(w.length, 50);
});
test('mixToMono averages channels', () => { assert.deepEqual([...mixToMono([Float32Array.of(1, 0), Float32Array.of(0, 1)])], [0.5, 0.5]); });

test('every experiment is complete, and uses real categories, needs and generator kinds', () => {
  const ids = new Set(), kinds = ['degrees', 'notes', 'tuning', 'range', 'choice', 'shuffle', 'pattern'], tools = ['gen', 'timer', 'clip', 'loops', 'assign'], ops = ['slow', 'fast', 'contrast', 'reverse', 'chop', 'stutter', 'grain'];
  for (const e of EXPERIMENTS) {
    assert.ok(!ids.has(e.id), 'duplicate id ' + e.id); ids.add(e.id);
    assert.ok(CATEGORIES[e.category], e.id); assert.ok(NEEDS[e.needs], e.id);
    for (const f of ['title', 'summary', 'limit', 'surprise', 'reflect', 'solo']) assert.ok(e[f] && e[f].length > (f === 'title' ? 3 : 10), `${e.id}.${f}`);
    assert.ok(e.steps.length >= 3 && e.minutes > 0, e.id);
    for (const t of e.tools) {
      assert.ok(tools.includes(t.type), e.id);
      if (t.type === 'gen') { assert.ok(kinds.includes(t.kind), e.id); generate({ ...t, root: 0, scale: 'major' }, mulberry32(1)); }
      if (t.type === 'clip') for (const o of t.ops) assert.ok(ops.includes(o), e.id + ' ' + o);
    }
  }
  assert.ok(EXPERIMENTS.length >= 18);
  for (const c of Object.keys(CATEGORIES)) assert.ok(EXPERIMENTS.some(e => e.category === c), 'empty category ' + c);
});
