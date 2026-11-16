import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, generate, shuffle, sample, rotateAssign, degreeNotes, NOTE_NAMES, euclid, chordTable } from '../../assets/js/experiments/rng.js';
import { resample, reverse, chopShuffle, stutter, pitchedGrains, contrastLayer, normalise, encodeWav, mixToMono } from '../../assets/js/experiments/audio-ops.js';
import { EXPERIMENTS, CATEGORIES, NEEDS, UNITS, PATH, COURSE } from '../../assets/js/experiments/catalog.js';

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

test('euclid spreads hits evenly and rotates', () => {
  assert.deepEqual(euclid(3, 8), [1, 0, 0, 1, 0, 0, 1, 0]);
  for (let k = 1; k <= 16; k++) assert.equal(euclid(k, 16, 5).reduce((a, b) => a + b, 0), k);
  assert.deepEqual(euclid(3, 8, 3), [1, 0, 0, 1, 0, 1, 0, 0]);
});
test('chords: triads in the key, no immediate repeats', () => {
  const t = chordTable(0, 'major'); assert.deepEqual(t.map(c => c.name), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°']); assert.deepEqual(t[0].pcs, [0, 4, 7]);
  for (let s = 0; s < 100; s++) { const r = generate({ kind: 'chords', count: 4, root: 7, scale: 'natural minor' }, mulberry32(s)); assert.equal(r.chords.length, 4); for (let i = 1; i < 4; i++) assert.notEqual(r.items[i].text, r.items[i - 1].text); }
});
test('euclid generator gives a pattern of the requested length', () => {
  const r = generate({ kind: 'euclid', steps: 16, minHits: 3, maxHits: 7 }, mulberry32(4)); assert.equal(r.pattern.length, 16);
  const hits = r.pattern.reduce((a, b) => a + b, 0); assert.ok(hits >= 3 && hits <= 7);
});

test('every experiment is a complete protocol with real parameters, tools and generators', () => {
  const ids = new Set(), kinds = ['degrees', 'notes', 'tuning', 'range', 'choice', 'shuffle', 'pattern', 'chords', 'euclid'], tools = ['gen', 'timer', 'clip', 'loops', 'groove', 'assign', 'wordpoem', 'burn', 'cards', 'blackout', 'roll', 'sampler', 'treat'], ops = ['slow', 'fast', 'contrast', 'reverse', 'chop', 'stutter', 'grain'];
  for (const e of EXPERIMENTS) {
    assert.ok(!ids.has(e.id), 'duplicate id ' + e.id); ids.add(e.id);
    assert.ok(CATEGORIES[e.category], e.id); assert.ok(NEEDS[e.needs], e.id);
    for (const f of ['title', 'summary', 'question', 'stop', 'reflect', 'solo']) assert.ok(e[f] && e[f].length > (f === 'title' ? 3 : 10), `${e.id}.${f}`);
    assert.ok(!('hypothesis' in e) && !('variables' in e) && !('trials' in e), e.id + ': no hypothesis, variables or trials');
    assert.ok(!/hypothes|predict|score|1 to 5|surprise score/i.test([e.reflect, ...e.procedure].join(' ')), e.id + ': no leftover science-fair wording');
    assert.ok(e.parameters.length >= 3 && e.parameters.every(p => p.length === 2 && p[0] && p[1]), e.id + ' parameters');
    assert.ok(e.parameters.some(p => /\d/.test(p[1])), e.id + ': at least one exact number');
    assert.ok(e.procedure.length >= 4 && e.minutes > 0, e.id);
    assert.ok(e.procedure.every(x => x.length > 12), e.id + ': every step is a real instruction');
    for (const t of e.tools) {
      assert.ok(tools.includes(t.type), e.id);
      if (t.type === 'gen') { assert.ok(kinds.includes(t.kind), e.id); generate({ ...t, root: 0, scale: 'major' }, mulberry32(1)); }
      if (t.type === 'clip') for (const o of t.ops) assert.ok(ops.includes(o), e.id + ' ' + o);
    }
  }
  assert.ok(EXPERIMENTS.length >= 20);
  for (const c of Object.keys(CATEGORIES)) assert.ok(EXPERIMENTS.some(e => e.category === c), 'empty category ' + c);
  assert.ok(EXPERIMENTS.some(e => e.id === 'fixed-groove-chords') && EXPERIMENTS.some(e => e.id === 'fixed-notes-rhythm'), 'the fixed-rhythm and fixed-notes experiments exist');
});

import { wordsOf, syllables, findHaiku, burnPlan, burnedAfter, endWordFrame, pageWords, blackoutPoem } from '../../assets/js/experiments/text-ops.js';
import { DECK, draw } from '../../assets/js/experiments/cards.js';
import { scaleNotes, setStep, encodeMidi, makeLanes, treatments, EFFECTS } from '../../assets/js/experiments/music-ops.js';

const PAGE = 'The morning light came slowly over the quiet river and the old bridge held the water still while a small bird sang about nothing at all and everything else besides';
test('wordsOf strips edge punctuation and keeps inner apostrophes', () => assert.deepEqual(wordsOf('"Don\'t stop," she said.'), ["Don't", 'stop', 'she', 'said']));
test('syllables is a sensible guide', () => { for (const [w, n] of [['the', 1], ['water', 2], ['quiet', 2], ['came', 1], ['everything', 4]]) assert.equal(syllables(w), n, w); });
test('findHaiku returns words in order that count 5-7-5', () => {
  for (let s = 0; s < 30; s++) {
    const words = wordsOf(PAGE), h = findHaiku(words, mulberry32(s)); assert.ok(h);
    assert.deepEqual(h.map(l => l.reduce((a, i) => a + syllables(words[i]), 0)), [5, 7, 5]);
    const flat = h.flat(); assert.deepEqual(flat, [...flat].sort((a, b) => a - b));
  }
  assert.equal(findHaiku(wordsOf('too short'), mulberry32(1)), null);
});
test('burnPlan burns everything except the haiku, and the haiku survives', () => {
  const p = burnPlan(PAGE, mulberry32(4)); assert.ok(p.haiku);
  assert.equal(p.order.length + p.keep.size, p.words.length);
  assert.ok(p.order.every(i => !p.keep.has(i)));
  assert.equal(burnedAfter(p, p.order.length).size, p.order.length); assert.equal(burnedAfter(p, 0).size, 0);
  assert.equal(burnPlan('only a few words here', mulberry32(1)).haiku, null);
});
test('endWordFrame keeps order unless shuffled, and always keeps every word', () => {
  assert.deepEqual(endWordFrame('a b c d', mulberry32(1)).map(f => f.word), ['a', 'b', 'c', 'd']);
  assert.deepEqual(endWordFrame('a b c d', mulberry32(1), { shuffled: true }).map(f => f.word).sort(), ['a', 'b', 'c', 'd']);
});
test('blackout keeps the chosen words in page order', () => { const w = pageWords('one two three four five'); assert.equal(blackoutPoem(w, new Set([3, 1])), 'two four'); assert.equal(pageWords('a '.repeat(1000)).length, 360); });
test('the deck is complete and a draw never repeats until it is used up', () => {
  assert.ok(DECK.length >= 36); assert.ok(DECK.every(c => c.text.length > 15 && /\d/.test(c.limit + c.text)));
  const seen = new Set(), got = []; for (let i = 0; i < DECK.length / 3 - 1; i++) got.push(...draw(mulberry32(i), 3, seen).map(c => c.id));
  assert.equal(new Set(got).size, got.length);
});
test('scaleNotes stays in the scale; setStep toggles', () => {
  assert.deepEqual(scaleNotes(0, 'major', 1), [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(setStep([null, null], 1, 62), [null, 62]); assert.deepEqual(setStep([null, 62], 1, 62), [null, null]);
});
test('encodeMidi writes a valid file with matching note on and off events', () => {
  const m = encodeMidi({ melody: [60, null, 62], chords: [[48, 52, 55]], stepsPerChord: 4, bpm: 120 }), dv = new DataView(m.buffer);
  assert.equal(String.fromCharCode(...m.slice(0, 4)), 'MThd'); assert.equal(dv.getUint16(12, true) >= 0, true); assert.equal(String.fromCharCode(...m.slice(14, 18)), 'MTrk');
  assert.equal(dv.getUint32(18), m.length - 22); assert.deepEqual([...m.slice(-3)], [0xff, 0x2f, 0]);
  const on = [...m].filter((b, i) => (b === 0x90 || b === 0x91) && m[i + 2] > 0).length, off = [...m].filter(b => b === 0x80 || b === 0x81).length; assert.ok(on >= 5 && off >= 5);
});
test('makeLanes gives four lanes whose slices fit inside the sample', () => {
  for (let s = 0; s < 50; s++) { const l = makeLanes(mulberry32(s), 1.5); assert.equal(l.length, 4); for (const x of l) assert.ok(x.start >= 0 && x.start + x.length <= 1.5 + 1e-9 && x.rate > 0); }
});
test('treatments gives every track an effect, all different while there are enough', () => {
  for (let s = 0; s < 30; s++) { const t = treatments(mulberry32(s), ['a', 'b', 'c', 'd']); assert.equal(new Set(t.map(x => x.effect)).size, 4); assert.ok(t.every(x => /\d/.test(x.setting))); }
  assert.ok(EFFECTS.length >= 8);
});
test('the course has a name, seven units, and every experiment is in the path once', () => {
  assert.equal(COURSE.name, 'Experiments in Creativity'); assert.equal(UNITS.length, 7);
  assert.equal(PATH.length, EXPERIMENTS.length); assert.equal(new Set(PATH.map(e => e.id)).size, EXPERIMENTS.length);
  assert.ok(EXPERIMENTS.length >= 36);
});

import { buildNotebook } from '../../assets/js/experiments/notebook.js';
test('the notebook lists only what was written, in course order', () => {
  const first = UNITS[0].experiments[0], second = UNITS[1].experiments[0];
  const saved = id => (id === second.id ? 'It kept pulling me back to the rhythm.' : '');
  const t = buildNotebook({ course: 'Experiments in Creativity', units: UNITS, done: new Set([first.id]), saved });
  assert.match(t, /^# Experiments in Creativity: my notebook/); assert.ok(t.indexOf(first.title) < t.indexOf(second.title));
  assert.match(t, /It kept pulling me back to the rhythm\./); assert.match(t, /\(no note\)/);
  assert.ok(!t.includes(UNITS[2].experiments[0].title));
});
test('an empty notebook says so', () => assert.match(buildNotebook({ course: 'X', units: UNITS, done: new Set(), saved: () => '' }), /Nothing here yet/));
