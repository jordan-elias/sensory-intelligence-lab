import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBench, track, toggle, setNote, fillEuclid, setRhythm, fillNotes, eventsAt, cycleVel, cycleProb, setLen, hits, pitchChoices, encodeBenchMidi, exportLength, benchText } from '../../assets/js/experiments/bench-core.js';

test('a new bench has the chosen tracks, all empty', () => {
  const b = makeBench(['kick', 'lead', 'nope']);
  assert.deepEqual(b.tracks.map(t => t.id), ['kick', 'lead']);
  assert.ok(b.tracks.every(t => hits(t) === 0 && t.len === 16));
});
test('toggling a melodic step gives it a note from the key; toggling again clears it', () => {
  const b = makeBench(['lead']); toggle(b, 'lead', 3);
  assert.equal(track(b, 'lead').on[3], true); assert.equal(track(b, 'lead').note[3], pitchChoices(b, 'lead')[0]);
  toggle(b, 'lead', 3); assert.equal(track(b, 'lead').on[3], false);
});
test('pitch choices stay in the key and span two octaves', () => {
  const b = makeBench(['bass'], { root: 7, scale: 'natural minor' }); const p = pitchChoices(b, 'bass');
  assert.equal(p.length, 15); assert.equal(p[0], 36 + 7); assert.equal(p[14], 36 + 7 + 24);
  assert.ok(p.slice(0, 7).every(n => [0, 2, 3, 5, 7, 8, 10].includes((n - 43) % 12)));
});
test('Euclidean fill spreads hits and respects the track length', () => {
  const b = makeBench(['kick']); fillEuclid(b, 'kick', 4); assert.deepEqual(track(b, 'kick').on.flatMap((v, i) => v ? [i] : []), [0, 4, 8, 12]);
  setLen(b, 'kick', 12); fillEuclid(b, 'kick', 3); assert.equal(hits(track(b, 'kick')), 3); assert.ok(track(b, 'kick').on.slice(12).every(v => !v));
});
test('a rolled rhythm repeats to fill the bench', () => {
  const b = makeBench(['hihat']); setRhythm(b, 'hihat', [true, false, false, true]);
  assert.deepEqual(track(b, 'hihat').on.flatMap((v, i) => v ? [i] : []), [0, 3, 4, 7, 8, 11, 12, 15]);
});
test('drawn notes go onto the hits by the rule, keeping their names', () => {
  const b = makeBench(['lead']); setRhythm(b, 'lead', [true, false, false, false]);   // hits at 0, 4, 8, 12
  assert.equal(fillNotes(b, 'lead', [4, 0, 7], 'order'), 4);
  assert.deepEqual([0, 4, 8, 12].map(i => track(b, 'lead').note[i] % 12), [4, 0, 7, 4]);
  fillNotes(b, 'lead', [4, 0, 7], 'reverse'); assert.deepEqual([0, 4, 8, 12].map(i => track(b, 'lead').note[i] % 12), [7, 0, 4, 7]);
  fillNotes(b, 'lead', [4, 0, 7], 'first'); assert.ok([0, 4, 8, 12].every(i => track(b, 'lead').note[i] % 12 === 4));
  const seq = [0, 0.99, 0.5, 0.2]; let k = 0; fillNotes(b, 'lead', [4, 0, 7], 'random', () => seq[k++]);
  assert.deepEqual([0, 4, 8, 12].map(i => track(b, 'lead').note[i] % 12), [4, 7, 0, 4]);
  assert.equal(fillNotes(b, 'lead', [], 'order'), 0);
});
test('events: mute, solo, length cycles, chance and swing follow the sequencer rules', () => {
  const b = makeBench(['kick', 'snare']); toggle(b, 'kick', 0); toggle(b, 'snare', 1);
  assert.deepEqual(eventsAt(b, 0, 0.1).map(e => e.id), ['kick']); assert.deepEqual(eventsAt(b, 1, 0.1).map(e => e.id), ['snare']);
  track(b, 'kick').mute = true; assert.deepEqual(eventsAt(b, 0, 0.1), []);
  track(b, 'kick').mute = false; track(b, 'snare').solo = true; assert.deepEqual(eventsAt(b, 0, 0.1), []);
  track(b, 'snare').solo = false; setLen(b, 'kick', 3);                       // kick restarts every 3 steps
  assert.deepEqual([0, 3, 6, 9].map(t => eventsAt(b, t, 0.1).some(e => e.id === 'kick')), [true, true, true, true]);
  cycleProb(b, 'kick', 0); cycleProb(b, 'kick', 0); cycleProb(b, 'kick', 0); assert.equal(track(b, 'kick').prob[0], 0.25);
  assert.equal(eventsAt(b, 0, 0.1, () => 0.1).length, 1); assert.equal(eventsAt(b, 0, 0.1, () => 0.9).length, 0);
  b.swing = 1; assert.equal(eventsAt(b, 1, 0.2, () => 0)[0].delay, 0.1); assert.equal(eventsAt(b, 0, 0.2, () => 0)[0].delay, 0);
  cycleVel(b, 'snare', 1); assert.equal(track(b, 'snare').vel[1], 0.75);
});
test('set note puts a note on and keeps it', () => {
  const b = makeBench(['bass']); setNote(b, 'bass', 5, 43); assert.equal(track(b, 'bass').on[5], true); assert.equal(track(b, 'bass').note[5], 43);
});
test('export length cycles tracks of different length against each other', () => {
  const b = makeBench(['kick', 'snare']); setLen(b, 'kick', 12); assert.equal(exportLength(b), 48);
  setLen(b, 'kick', 15); setLen(b, 'snare', 14); assert.equal(exportLength(b), 15 * 14 > 64 ? 15 : 210);
});
test('MIDI export is a valid type 1 file with a track per bench track, drums on channel 10', () => {
  const b = makeBench(['kick', 'lead']); fillEuclid(b, 'kick', 4); toggle(b, 'lead', 0, 64);
  const m = encodeBenchMidi(b), dv = new DataView(m.buffer);
  assert.equal(String.fromCharCode(...m.slice(0, 4)), 'MThd'); assert.equal(dv.getUint16(8), 1); assert.equal(dv.getUint16(10), 3);   // tempo track + 2
  const s = [...m].join(','); assert.ok(s.includes('153,36'), 'kick on channel 10 (0x99, note 36)'); assert.ok(m.includes(0x90) || m.includes(0x91));
  assert.ok(encodeBenchMidi(makeBench(['kick'])).length > 30, 'an empty bench still writes a valid file');
});
test('text picture lists only tracks with hits', () => {
  const b = makeBench(['kick', 'snare']); assert.equal(benchText(b), ''); fillEuclid(b, 'kick', 4);
  const t = benchText(b); assert.match(t, /Kick\s+x/); assert.ok(!/Snare/.test(t)); assert.match(t, /100 BPM/);
});
