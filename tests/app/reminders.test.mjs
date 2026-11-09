import test from 'node:test';
import assert from 'node:assert/strict';
import { planTimes, dayKey, getReminder, enableReminder, disableReminder, refreshReminder, remindersAvailable } from '../../assets/js/app/reminders.js';

const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
function fakeNative({ perm = 'granted' } = {}) {
  const calls = { scheduled: [], cancelled: [] }; let pending = [];
  const ln = {
    checkPermissions: async () => ({ display: perm }), requestPermissions: async () => ({ display: perm }),
    getPending: async () => ({ notifications: pending }), createChannel: async () => {},
    cancel: async ({ notifications }) => { calls.cancelled.push(...notifications.map(n => n.id)); pending = pending.filter(p => !notifications.some(n => n.id === p.id)); },
    schedule: async ({ notifications }) => { calls.scheduled.push(...notifications); pending.push(...notifications.map(n => ({ id: n.id }))); },
    addListener: () => {},
  };
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: ln } } };
  return calls;
}
const reset = () => { for (const k of Object.keys(mem)) delete mem[k]; delete globalThis.window; };

test('plans one reminder per day at the chosen time, skipping a past time today and a day already done', () => {
  const now = new Date(2026, 10, 9, 21, 0);
  const t = planTimes({ hour: 20, minute: 30, doneDay: null }, now, 3);
  assert.deepEqual(t.map(d => `${dayKey(d)} ${d.getHours()}:${d.getMinutes()}`), ['2026-11-10 20:30', '2026-11-11 20:30']);
  const early = new Date(2026, 10, 9, 8, 0);
  assert.equal(planTimes({ hour: 20, minute: 30, doneDay: '2026-11-09' }, early, 3).length, 2, 'today is skipped when done');
  assert.equal(planTimes({ hour: 20, minute: 30, doneDay: null }, early, 3).length, 3);
});
test('not available on the website', () => { reset(); assert.equal(remindersAvailable(), false); });
test('turning on asks permission, schedules 14 generic notifications, and stores the time on the device', async () => {
  reset(); const calls = fakeNative();
  assert.deepEqual(await enableReminder(7, 15), { ok: true });
  assert.ok(calls.scheduled.length >= 13 && calls.scheduled.length <= 14);
  for (const n of calls.scheduled) { assert.equal(n.title, 'A moment to check in'); assert.doesNotMatch(JSON.stringify(n), /mood|score|journal/i); assert.equal(n.extra.path, '/check-in/index.html'); }
  assert.deepEqual([getReminder().enabled, getReminder().hour, getReminder().minute], [true, 7, 15]);
});
test('denied permission leaves the reminder off', async () => {
  reset(); const calls = fakeNative({ perm: 'denied' });
  assert.deepEqual(await enableReminder(20, 0), { ok: false, reason: 'denied' });
  assert.equal(calls.scheduled.length, 0); assert.equal(getReminder().enabled, false);
});
test('a check-in today drops today\'s reminder and re-arms the rest without duplicates', async () => {
  reset(); const calls = fakeNative(); await enableReminder(23, 59);
  const before = calls.scheduled.length;
  await refreshReminder({ checkedInToday: true });
  assert.equal(calls.cancelled.length, before, 'the old set is cleared first');
  const after = calls.scheduled.slice(before);
  assert.equal(after.length, before - 1);
  assert.ok(!after.some(n => dayKey(new Date(n.schedule.at)) === dayKey()));
});
test('turning off cancels everything', async () => {
  reset(); const calls = fakeNative(); await enableReminder(23, 59);
  await disableReminder();
  assert.equal(getReminder().enabled, false); assert.ok(calls.cancelled.length > 0);
});
