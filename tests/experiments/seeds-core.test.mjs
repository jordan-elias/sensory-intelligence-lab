import test from 'node:test'; import assert from 'node:assert/strict';
import { dailySeed, localDate, parseRoll, combineRolls } from '../../assets/js/experiments/seeds-core.js';
test('the daily seed is steady for a day and differs between days and tools', () => {
  assert.equal(dailySeed('2026-11-20', 'a'), dailySeed('2026-11-20', 'a'));
  assert.notEqual(dailySeed('2026-11-20', 'a'), dailySeed('2026-11-21', 'a'));
  assert.notEqual(dailySeed('2026-11-20', 'a'), dailySeed('2026-11-20', 'b'));
  assert.ok(Number.isInteger(dailySeed('2026-11-20')) && dailySeed('2026-11-20') >= 0);
});
test('localDate is YYYY-MM-DD', () => assert.equal(localDate(new Date(2026, 0, 5)), '2026-01-05'));
test('parseRoll reads items and seed', () => assert.deepEqual(parseRoll('C · E · G\nSeed 42'), { items: ['C', 'E', 'G'], seed: '42' }));
test('combineRolls takes turns and the longer one carries on', () => {
  assert.equal(combineRolls('a · b · c\nSeed 1', 'x · y\nSeed 2'), 'a · x · b · y · c\nCombined from seeds 1 and 2');
  assert.equal(combineRolls('a', 'b'), 'a · b\nCombined from two rolls');
});
