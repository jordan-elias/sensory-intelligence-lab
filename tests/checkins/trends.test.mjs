import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeries, trend, streak, withinDay, timeOfDayPattern, weekdayPattern, insights, pickInsight } from '../../assets/js/checkins/trends.js';

const NOW = new Date(2026, 5, 15, 20, 0);            // Mon 15 Jun 2026, local
const at = (daysAgo, h, v, extra = {}) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return { created_at: d.toISOString(), valence: v, arousal: 5, sensory_load: 5, ...extra }; };

test('several check-ins on one day average into one point', () => {
  const s = dailySeries([at(0, 8, 4), at(0, 20, 8), at(1, 9, 5)]);
  assert.deepEqual(s.map(p => [p.n, p.value]), [[1, 5], [2, 6]]);
});
test('trend compares the last 7 days with the 7 before, and needs enough days', () => {
  const up = [0, 1, 2, 3].map(d => at(d, 9, 8)).concat([8, 9, 10, 11].map(d => at(d, 9, 4)));
  const t = trend(up, { now: NOW }); assert.equal(t.enough, true); assert.equal(t.direction, 'up'); assert.equal(t.delta, 4);
  assert.equal(trend([at(0, 9, 8), at(8, 9, 4)], { now: NOW }).enough, false);
  const flat = [0, 1, 2].map(d => at(d, 9, 6)).concat([8, 9, 10].map(d => at(d, 9, 6.3)));
  assert.equal(trend(flat, { now: NOW }).direction, 'steady');
});
test('streak counts consecutive days and survives until today is over', () => {
  assert.equal(streak([at(0, 9, 5), at(1, 9, 5), at(2, 9, 5), at(4, 9, 5)], NOW).days, 3);
  const s = streak([at(1, 9, 5), at(2, 9, 5)], NOW); assert.equal(s.days, 2); assert.equal(s.checkedInToday, false);
  assert.equal(streak([at(3, 9, 5)], NOW).days, 0);
});
test('within-day change uses first to last on days with 2+ check-ins', () => {
  const d = [1, 2, 3].flatMap(k => [at(k, 8, 4), at(k, 21, 7)]);
  const w = withinDay(d); assert.equal(w.enough, true); assert.equal(w.direction, 'up'); assert.equal(w.change, 3); assert.equal(w.perDay, 2);
  assert.equal(withinDay([at(1, 8, 4), at(1, 21, 7)]).enough, false);
});
test('time-of-day pattern needs enough in each group and a real gap', () => {
  const d = [1, 2, 3].map(k => at(k, 9, 8)).concat([1, 2, 3].map(k => at(k, 22, 4)));
  const p = timeOfDayPattern(d); assert.equal(p.enough, true); assert.equal(p.high.key, 'morning'); assert.equal(p.low.key, 'night'); assert.equal(p.real, true);
  assert.equal(timeOfDayPattern([at(1, 9, 8), at(1, 22, 4)]).enough, false);
});
test('weekday pattern names the better and harder days', () => {
  const d = [0, 7, 14].map(k => at(k, 9, 3)).concat([1, 8, 15].map(k => at(k, 9, 8)));   // Mondays low, Sundays high
  const p = weekdayPattern(d); assert.equal(p.high.key, 'Sunday'); assert.equal(p.low.key, 'Monday');
});
test('insights are strongest first, never causal, and empty with little data', () => {
  assert.deepEqual(insights([at(0, 9, 5)], { now: NOW }), []);
  const d = [0, 1, 2, 3].map(k => at(k, 9, 8)).concat([8, 9, 10, 11].map(k => at(k, 9, 4)));
  const list = insights(d, { now: NOW });
  assert.ok(list.length >= 1 && list[0].kind === 'trend');
  for (const i of list) assert.ok(!/because|causes|diagnos/i.test(i.text), i.text);
});
test('pickInsight shows one thing occasionally and does not repeat', () => {
  const d = [0, 1, 2, 3].map(k => at(k, 9, 8)).concat([8, 9, 10, 11].map(k => at(k, 9, 4)));
  const first = pickInsight(d, { now: NOW }); assert.ok(first);
  assert.equal(pickInsight(d, { now: NOW, lastAt: new Date(NOW - 2 * 36e5).toISOString() }), null);
  assert.equal(pickInsight(d, { now: NOW, shown: { [first.id]: 1 } })?.id === first.id, false);
});
