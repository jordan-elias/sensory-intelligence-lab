import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD, noteName, soundingNote, shapeNotes, clampDetune, pluck, stringsText, emptyShape, midiHz } from '../../assets/js/experiments/strings-core.js';

test('names and frequencies', () => {
  assert.equal(noteName(40), 'E2'); assert.equal(noteName(64), 'E4'); assert.equal(noteName(61), 'C♯4');
  assert.ok(Math.abs(midiHz(69) - 440) < 1e-9);
});
test('a retuned string shifts every fret on it', () => {
  assert.equal(soundingNote(40, 0, 0), 40); assert.equal(soundingNote(40, 0, 3), 43);
  assert.equal(soundingNote(40, -2, 0), 38); assert.equal(soundingNote(40, 3, 2), 45);
  assert.equal(soundingNote(40, 0, null), null); assert.equal(soundingNote(40, 0, 'x'), null);
  assert.equal(soundingNote(40, 99, 0), 52, 'retuning is limited to an octave');
  assert.equal(clampDetune('abc'), 0);
});
test('a shape lists its notes, lowest string first, skipping muted strings', () => {
  const s = emptyShape(); s[0] = 0; s[1] = 2; s[2] = 2;
  assert.deepEqual(shapeNotes(s, [0, 0, 0, 0, 0, 0]), [40, 47, 52, null, null, null]);
  assert.deepEqual(shapeNotes(s, [-2, 0, 0, 0, 0, 0]), [38, 47, 52, null, null, null]);
});
test('the plucked sound is the right length, loud at first, then dies away, and repeats with the same noise', () => {
  let a = 1; const rand = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const d = pluck(8000, 200, 1, rand), peak = (x, y) => Math.max(...d.slice(x, y).map(Math.abs));
  assert.equal(d.length, 8000); assert.ok(peak(0, 400) > 0.5); assert.ok(peak(7000, 8000) < peak(0, 400) / 2);
  a = 1; assert.deepEqual(Array.from(pluck(8000, 200, 1, rand).slice(0, 10)), Array.from(d.slice(0, 10)));
});
test('the saved text names the tuning and each filled shape, and is empty with no shapes', () => {
  const s = emptyShape(); s[1] = 0; s[2] = 2;
  const t = stringsText([-2, 0, 0, 0, 0, 0], [s, emptyShape(), emptyShape()]);
  assert.match(t, /Tuning \(string 6 to 1\): D2 \(-2\), A2 \(standard\)/); assert.match(t, /Shape 1: frets x 0 2 x x x sounds A2 E3/);
  assert.equal(stringsText([0, 0, 0, 0, 0, 0], [emptyShape(), emptyShape(), emptyShape()]), '');
});
