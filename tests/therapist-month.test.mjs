import test from 'node:test'; import assert from 'node:assert/strict';
import { monthList, toCsv, shiftMonth, monthOf } from '../assets/js/therapist/month.js';
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0).toISOString();
const S = [
  { link_id: 'a', scheduled_at: at(2026, 10, 30), completed_at: at(2026, 10, 30, 11), event_type: 'session', status: 'scheduled' },
  { link_id: 'a', scheduled_at: at(2026, 11, 3), completed_at: new Date(new Date(2026, 10, 3, 10).getTime() + 50 * 60000).toISOString(), event_type: 'subscriber-session', status: 'scheduled' },
  { link_id: 'b', scheduled_at: at(2026, 11, 10), event_type: 'session', status: 'scheduled' },
  { link_id: 'b', scheduled_at: at(2026, 11, 12), event_type: 'session', status: 'cancelled' },
  { link_id: 'a', scheduled_at: '', event_type: 'session' },
];
const names = new Map([['a', 'Ana'], ['b', '=cmd|x']]);
test('a month holds only its own sessions, cancelled ones only when asked, with totals per client', () => {
  const l = monthList(S, names, '2026-11'); assert.equal(l.count, 2); assert.equal(l.rows.length, 2);
  assert.deepEqual(l.rows.map(r => [r.date, r.client, r.kind, r.minutes]), [['2026-11-03', 'Ana', 'Monthly session', 50], ['2026-11-10', '=cmd|x', 'Session', null]]);
  assert.deepEqual(l.totals.map(t => [t.client, t.sessions, t.minutes]), [['=cmd|x', 1, 0], ['Ana', 1, 50]]);
  const c = monthList(S, names, '2026-11', { cancelled: true }); assert.equal(c.rows.length, 3); assert.equal(c.count, 2); assert.equal(c.rows[2].status, 'Cancelled');
  assert.equal(monthList(S, names, '2026-10').count, 1); assert.equal(monthList([], names, '2026-11').count, 0);
});
test('months step across the year', () => { assert.equal(shiftMonth('2026-12', 1), '2027-01'); assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.match(monthOf(new Date(2026, 4, 9)), /^2026-05$/); });
test('the CSV has a header, quotes what needs it and keeps formula-like names as text', () => {
  const csv = toCsv(monthList(S, new Map([['a', 'Ana, B'], ['b', '=cmd|x']]), '2026-11'));
  assert.ok(csv.startsWith('﻿Date,Time,Client,Kind,Minutes,Status\r\n')); assert.match(csv, /"Ana, B"/); assert.match(csv, /'=cmd\|x/); assert.ok(!/,=cmd/.test(csv));
});
