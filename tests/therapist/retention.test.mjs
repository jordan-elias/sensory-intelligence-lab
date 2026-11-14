import test from 'node:test'; import assert from 'node:assert/strict';
import { addYears, lastActivity, retentionStatus, sentence, settings, setYears, snoozeFor, SOON_DAYS } from '../../assets/js/therapist/retention.js';
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const iso = d => d.toISOString().slice(0, 10);

test('addYears keeps the calendar day and handles 29 February', () => {
  assert.equal(iso(addYears(new Date('2016-03-05T00:00:00Z'), 10)), '2026-03-05');
  assert.equal(iso(addYears(new Date('2016-02-29T00:00:00Z'), 10)), '2026-02-28');
  assert.equal(iso(addYears(new Date('2016-02-29T00:00:00Z'), 8)), '2024-02-29');
});
test('lastActivity takes the latest dated thing and ignores junk', () => {
  assert.equal(iso(lastActivity({ endedAt: '2019-05-01T10:00:00Z', sessionDates: ['2019-04-20', null, 'nonsense'], noteDates: ['2019-06-02'] })), '2019-06-02');
  assert.equal(lastActivity({}), null);
});
test('states: ok, soon, due, unknown, off', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  assert.equal(retentionStatus('2020-01-01', 10, now).state, 'ok');
  assert.equal(retentionStatus('2016-12-20', 10, now).state, 'soon');
  assert.equal(retentionStatus('2016-11-14', 10, now).state, 'due');
  assert.equal(retentionStatus('2010-01-01', 10, now).state, 'due');
  assert.equal(retentionStatus(null, 10, now).state, 'unknown');
  assert.equal(retentionStatus('2010-01-01', 0, now).state, 'off');
  assert.equal(retentionStatus('2016-12-20', 10, now).daysLeft <= SOON_DAYS, true);
});
test('a reminder never comes early: the later date wins', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const early = retentionStatus(lastActivity({ endedAt: '2016-01-01' }), 10, now).state;
  const later = retentionStatus(lastActivity({ endedAt: '2016-01-01', noteDates: ['2020-01-01'] }), 10, now).state;
  assert.equal(early, 'due'); assert.equal(later, 'ok');
});
test('snooze only hides a reminder that is soon or due, and only until its date', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  assert.equal(retentionStatus('2010-01-01', 10, now, '2027-01-01').state, 'snoozed');
  assert.equal(retentionStatus('2010-01-01', 10, now, '2026-01-01').state, 'due');
  assert.equal(retentionStatus('2020-01-01', 10, now, '2027-01-01').state, 'ok');
});
test('sentences say that nothing is deleted for the therapist', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  assert.match(sentence(retentionStatus('2010-01-01', 10, now)), /Nothing is deleted for you/);
  assert.equal(sentence({ state: 'off' }), '');
});
test('settings default to ten years, are kept per therapist, and survive bad storage', () => {
  assert.equal(settings('a').years, 10);
  setYears('a', 12); assert.equal(settings('a').years, 12); assert.equal(settings('b').years, 10);
  setYears('a', 0); assert.equal(settings('a').years, 0);
  snoozeFor('a', 'p1', 365, new Date('2026-11-14T00:00:00Z')); assert.equal(settings('a').snooze.p1, '2027-11-14');
  store['sil.th.retention.c'] = '{bad'; assert.equal(settings('c').years, 10);
});
