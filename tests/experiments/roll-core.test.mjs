import test from 'node:test'; import assert from 'node:assert/strict';
import * as R from '../../assets/js/experiments/roll-core.js';
import { mulberry32 } from '../../assets/js/experiments/rng.js';

const roll = () => R.makeRoll({ steps: 16, bpm: 120, root: 0, scale: 'major', octaves: 2, voices: ['soft', 'bass'] });

test('rows are the scale across the octaves, plus the top root', () => {
  const r = R.rowsOf(0, 'major', 2, 60);
  assert.equal(r.length, 15); assert.equal(r[0], 60); assert.equal(r.at(-1), 84); assert.ok(r.includes(67));
  assert.equal(R.rowsOf(2, 'major pentatonic', 1, 60).join(), '62,64,66,69,71,74');
});
test('placing, snapping to the scale, and tapping again removes', () => {
  const r = roll();
  assert.equal(R.toggleNote(r, 0, 3, 61, 2), true);                         // 61 is not in C major: it snaps
  assert.ok(R.rows(r).includes(r.tracks[0].notes[0].pitch));
  const p = r.tracks[0].notes[0].pitch;
  assert.equal(R.noteAt(r, 0, 4, p).step, 3);                               // the second step of a two-step note
  assert.equal(R.toggleNote(r, 0, 4, p, 1), false); assert.equal(r.tracks[0].notes.length, 0);
});
test('a long note is cut at the end of the roll', () => {
  const r = roll(); R.toggleNote(r, 0, 14, 60, 8); assert.equal(r.tracks[0].notes[0].len, 2);
});
test('shuffling and re-picking pitches keeps the rhythm exactly', () => {
  const r = roll(); [0, 3, 4, 8, 11].forEach((s, i) => R.toggleNote(r, 0, s, R.rows(r)[i * 2], 1));
  const before = R.rhythmText(r, 0), pitches = r.tracks[0].notes.map(n => n.pitch).sort().join();
  R.shufflePitches(r, 0, mulberry32(5)); assert.equal(R.rhythmText(r, 0), before); assert.equal(r.tracks[0].notes.map(n => n.pitch).sort().join(), pitches);
  R.newPitches(r, 0, mulberry32(9)); assert.equal(R.rhythmText(r, 0), before); assert.ok(r.tracks[0].notes.every(n => R.rows(r).includes(n.pitch)));
});
test('shift moves by scale steps and refuses to leave the grid', () => {
  const r = roll(); R.toggleNote(r, 0, 0, 60); assert.equal(R.shiftRows(r, 0, 2), true); assert.equal(r.tracks[0].notes[0].pitch, 64);
  assert.equal(R.shiftRows(r, 0, -9), false); assert.equal(r.tracks[0].notes[0].pitch, 64);
});
test('reverse and double', () => {
  const r = roll(); R.toggleNote(r, 0, 0, 60, 2); R.toggleNote(r, 0, 5, 62, 1);
  R.reverse(r, 0); assert.deepEqual(r.tracks[0].notes.map(n => [n.step, n.len]), [[10, 1], [14, 2]]);
  assert.equal(R.double(r), true); assert.equal(r.steps, 32); assert.equal(r.tracks[0].notes.length, 4); assert.equal(R.double(r), false);
});
test('events carry seconds from the tempo, and mute silences a track', () => {
  const r = roll(); R.toggleNote(r, 0, 4, 60, 2); R.toggleNote(r, 1, 0, 48 + 12);
  const e = R.events(r); assert.equal(e.length, 2); assert.ok(Math.abs(e.find(x => x.track === 0).time - 4 * 60 / 120 / 4) < 1e-9);
  r.tracks[1].mute = true; assert.equal(R.events(r).length, 1);
});
test('text and MIDI', () => {
  const r = roll(); assert.equal(R.rollText(r), ''); R.toggleNote(r, 0, 0, 60, 2);
  assert.match(R.rollText(r), /120 bpm, C major, 16 steps\nTrack 1 \(Soft\): 1\+2:C4/);
  const m = R.encodeRollMidi(r); assert.equal(String.fromCharCode(...m.slice(0, 4)), 'MThd'); assert.equal(m[10] << 8 | m[11], 3);   // two tracks plus tempo
  assert.ok(m.length > 60);
});
