import test from 'node:test';
import assert from 'node:assert/strict';
import { moveItem, syncOrder, compareOrders, versionsText, pitchText } from '../../assets/js/experiments/versions-core.js';

test('moving an item swaps neighbours and stops at the ends', () => {
  assert.deepEqual(moveItem([0, 1, 2], 2, -1), [0, 2, 1]); assert.deepEqual(moveItem([0, 1, 2], 0, -1), [0, 1, 2]); assert.deepEqual(moveItem([0, 1, 2], 2, 1), [0, 1, 2]);
});
test('the order follows the number of versions', () => {
  assert.deepEqual(syncOrder([], 3), [0, 1, 2]); assert.deepEqual(syncOrder([1, 0], 3), [1, 0, 2]); assert.deepEqual(syncOrder([2, 1, 0], 2), [1, 0]);
});
test('comparing orders says who moved, in plain words', () => {
  assert.deepEqual(compareOrders([0, 1, 2], [0, 1, 2]), []);
  assert.deepEqual(compareOrders([0, 1, 2], [2, 0, 1]), ['Version 3 moved from 3rd to 1st.', 'Version 1 moved from 1st to 2nd.', 'Version 2 moved from 2nd to 3rd.']);
  assert.match(compareOrders([0, 1, 2, 3], [3, 1, 2, 0])[0], /4th to 1st/);
});
test('saved text lists versions, words and both orders', () => {
  const v = [{ pcs: [0, 4, 7], word: 'bright' }, { pcs: [2, 2, 9], word: '' }];
  assert.equal(pitchText([0, 3, 6]), 'C E♭ F♯');
  const t = versionsText(v, [0, 1], [1, 0]);
  assert.match(t, /Version 1: C E G \(bright\)/); assert.match(t, /Order at first: V1 > V2/); assert.match(t, /Version 2 moved from 2nd to 1st/);
  assert.match(versionsText(v, [0, 1], [0, 1]), /did not change/); assert.equal(versionsText([], [], null), '');
});
