import test from 'node:test';
import assert from 'node:assert/strict';
import { euclid, swingOffset, audible } from '../../assets/js/seq/groove.js';
const show = a => a.map(x => (x ? 'x' : '.')).join('');
test('Euclidean rhythms match the well-known patterns', () => {
  assert.equal(show(euclid(3, 8)), 'x..x..x.'); const rot = (a, b) => a.length === b.length && (a + a).includes(b); assert.ok(rot(show(euclid(5, 8)), 'x.xx.xx.'), 'a rotation of the 5-in-8 pattern'); assert.ok(rot(show(euclid(7, 16)), 'x..x.x.x..x.x.x.')); assert.equal(show(euclid(4, 16)), 'x...x...x...x...');
  assert.equal(show(euclid(2, 5)), 'x..x.'); assert.equal(show(euclid(7, 16)).split('x').length - 1, 7);
});
test('the number of hits is exact, and the extremes behave', () => {
  for (let p = 0; p <= 16; p++) assert.equal(euclid(p, 16).filter(Boolean).length, p);
  assert.equal(show(euclid(0, 8)), '........'); assert.equal(show(euclid(8, 8)), 'xxxxxxxx'); assert.equal(euclid(99, 8).filter(Boolean).length, 8);
});
test('rotation moves the pattern to the right and wraps', () => {
  assert.equal(show(euclid(3, 8, 1)), '.x..x..x'); assert.equal(show(euclid(4, 16, 2)), '..x...x...x...x.'); assert.equal(show(euclid(3, 8, 8)), show(euclid(3, 8, 0))); assert.equal(show(euclid(3, 8, -1)), '..x..x.x');
});
test('swing delays only the off-beat sixteenths, in proportion', () => {
  assert.equal(swingOffset(0, 1, 0.125), 0); assert.equal(swingOffset(2, 1, 0.125), 0); assert.equal(swingOffset(1, 0, 0.125), 0);
  assert.ok(Math.abs(swingOffset(1, 1, 0.125) - 0.0625) < 1e-9); assert.ok(Math.abs(swingOffset(3, 0.5, 0.125) - 0.03125) < 1e-9); assert.equal(swingOffset(1, 9, 0.125), swingOffset(1, 1, 0.125));
});
test('mute and solo: solo wins, otherwise muted tracks are silent', () => {
  const none = [false, false, false];
  assert.equal(audible(0, none, none), true); assert.equal(audible(1, [false, true, false], none), false);
  assert.equal(audible(0, none, [false, true, false]), false); assert.equal(audible(1, [false, true, false], [false, true, false]), true);
  assert.equal(audible(2, none, [true, true, false]), false);
});
