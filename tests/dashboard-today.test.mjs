import test from 'node:test'; import assert from 'node:assert/strict';
import { todayPath, recordRecent, readAnswers, startOfDay, TOOLS, BY_INTENT, INTENTS, MINUTES } from '../assets/js/dashboard/today.js';
const NOW = new Date('2026-11-16T10:00:00').getTime(), H = 3600000, D = 24 * H;

test('every tool in every intent exists, and every intent has a label', () => { for (const [k, list] of Object.entries(BY_INTENT)) { assert.ok(INTENTS.some(i => i.id === k)); for (const id of list) assert.ok(TOOLS[id], id); } });
test('a short path is a check-in and one short tool; the first step is the check-in', () => {
  const p = todayPath({ answers: { intent: 'calm', minutes: 5 }, now: NOW }); assert.equal(p.steps[0].id, 'checkin'); assert.equal(p.steps.length, 2); assert.ok(p.steps[1].min <= 5); assert.ok(p.minutesTotal <= 6);
});
test('a longer path adds a second tool, never a repeat, and stays within the time', () => {
  for (const intent of Object.keys(BY_INTENT)) for (const minutes of MINUTES) {
    const p = todayPath({ answers: { intent, minutes }, now: NOW }); const ids = p.steps.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length); assert.ok(p.steps.length >= 2 && p.steps.length <= 3, `${intent}/${minutes}: ${ids}`);
    if (minutes >= 15) assert.ok(p.minutesTotal <= minutes + 5, `${intent}/${minutes}: ${p.minutesTotal}`);
  }
});
test('the app already shows the check-in, so the path can leave it out', () => { const p = todayPath({ answers: { intent: 'calm', minutes: 15 }, includeCheckin: false, now: NOW }); assert.ok(!p.steps.some(s => s.id === 'checkin')); assert.ok(p.steps.length >= 1); });
test('what you used longest ago comes first, so the path changes from day to day', () => {
  const a = todayPath({ answers: { intent: 'calm', minutes: 15 }, recent: [{ href: '/breathing/', at: NOW - D }], now: NOW }).steps[1].id;
  const b = todayPath({ answers: { intent: 'calm', minutes: 15 }, recent: [{ href: '/soundscape-machine/', at: NOW - D }, { href: '/regulation/', at: NOW - 2 * D }, { href: '/breathing/', at: NOW - 3 * D }], now: NOW }).steps[1].id;
  assert.equal(a, 'regulation'); assert.equal(b, 'breathing');
});
test('steps opened today are ticked, and a finished day is reported', () => {
  const first = todayPath({ answers: { intent: 'calm', minutes: 5 }, now: NOW }), tool = first.steps[1];
  const p = todayPath({ answers: { intent: 'calm', minutes: 5 }, checkedIn: true, recent: [{ href: tool.href, at: NOW - H }], now: NOW });
  assert.ok(p.steps.every(s => s.done) && p.allDone);
  const yesterday = todayPath({ answers: { intent: 'calm', minutes: 5 }, checkedIn: true, recent: [{ href: tool.href, at: startOfDay(NOW) - H }], now: NOW }); assert.ok(!yesterday.allDone);
});
test('the course step points at the next experiment', () => { const p = todayPath({ answers: { intent: 'create', minutes: 15 }, experiment: { title: 'Continue: Subtract', href: '/experiments/#/subtract', label: '15 min · nothing but you' }, recent: [], now: NOW }); const s = p.steps.find(x => x.id === 'experiments'); assert.ok(s); assert.equal(s.href, '/experiments/#/subtract'); });
test('bad answers fall back to the default, never to an error', () => { const p = todayPath({ answers: { intent: 'x', minutes: 7 }, now: NOW }); assert.equal(p.intent, 'calm'); assert.equal(p.minutes, 5); assert.deepEqual(todayPath({ answers: null, now: NOW }).steps.length >= 1, true); });
test('recent keeps one entry per link, newest first, at most 12', () => {
  let r = []; for (let i = 0; i < 20; i++) r = recordRecent(r, '/t' + i + '/', i); assert.equal(r.length, 12); assert.equal(r[0].href, '/t19/');
  r = recordRecent(r, '/t10/', 99); assert.equal(r[0].href, '/t10/'); assert.equal(r.filter(x => x.href === '/t10/').length, 1); assert.deepEqual(recordRecent('junk', '/a/', 1), [{ href: '/a/', at: 1 }]);
});
test('saved answers are read safely', () => { assert.equal(readAnswers('{bad'), null); assert.equal(readAnswers(null), null); assert.deepEqual(readAnswers('{"skipped":true}'), { skipped: true }); assert.deepEqual(readAnswers('{"intent":"focus","minutes":15}'), { intent: 'focus', minutes: 15 }); assert.equal(readAnswers('{"intent":"zzz","minutes":15}'), null); });
test('no description claims an effect on the body or mind', () => { for (const t of Object.values(TOOLS)) assert.ok(!/nervous|anxiety|stress|heal|cure|treat|therap|relax|reduce|improve/i.test(t.why), t.why); });
