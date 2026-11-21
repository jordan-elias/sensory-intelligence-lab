/**
 * /assets/js/therapist/month.js
 * A month of a therapist's booked sessions, for their own invoicing. Pure: it takes the session rows and client names the therapist
 * can already see and returns a list, totals and a CSV. The prices are on Cal.com, so none are shown here.
 */
import { KIND_LABEL } from './sessions.js';

export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return monthOf(d); };
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * @param sessions rows with link_id, scheduled_at, completed_at, event_type, status
 * @param names    Map or object: link_id -> client name
 */
export function monthList(sessions, names, ym, { cancelled = false } = {}) {
  const get = id => (names instanceof Map ? names.get(id) : names?.[id]) || 'Client';
  const rows = (sessions || []).filter(r => r.scheduled_at && !Number.isNaN(Date.parse(r.scheduled_at)))
    .map(r => ({ d: new Date(r.scheduled_at), r }))
    .filter(({ d }) => monthOf(d) === ym)
    .filter(({ r }) => cancelled || r.status !== 'cancelled')
    .sort((a, b) => a.d - b.d)
    .map(({ d, r }) => {
      const end = r.completed_at ? new Date(r.completed_at) : null;
      return { date: localDate(d), time: d.toTimeString().slice(0, 5), client: get(r.link_id), link: r.link_id, kind: KIND_LABEL[r.event_type] || 'Session', minutes: end && end > d ? Math.round((end - d) / 60000) : null, status: r.status === 'cancelled' ? 'Cancelled' : (d.getTime() > Date.now() ? 'Booked' : 'Held') };
    });
  const per = new Map();
  for (const x of rows) { if (x.status === 'Cancelled') continue; const p = per.get(x.link) || { client: x.client, sessions: 0, minutes: 0 }; p.sessions++; p.minutes += x.minutes || 0; per.set(x.link, p); }
  const totals = [...per.values()].sort((a, b) => a.client.localeCompare(b.client));
  return { rows, totals, count: rows.filter(x => x.status !== 'Cancelled').length };
}

const cell = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
/** A CSV that opens in Excel and Numbers (with a byte-order mark). Names that start like a formula are prefixed so they stay text. */
export function toCsv(list) {
  const head = ['Date', 'Time', 'Client', 'Kind', 'Minutes', 'Status'];
  return '﻿' + [head, ...list.rows.map(r => [r.date, r.time, r.client, r.kind, r.minutes ?? '', r.status])].map(l => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
