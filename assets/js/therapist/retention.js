/**
 * /assets/js/therapist/retention.js
 * A reminder, never an action. In Germany treatment records are generally kept for ten years after treatment ends
 * (§ 630f BGB); other rules can apply, so the length is the therapist's own setting (0 turns the reminder off).
 * The date it counts from is the latest of: the end of the connection, the last session, the last note or saved copy.
 * Taking the latest means a reminder never comes early. Everything is worked out on the therapist's device from dates
 * they can already see; nothing is decrypted, sent anywhere, or deleted.
 */
export const DEFAULT_YEARS = 10;
export const SOON_DAYS = 90;
const DAY = 86400000;
const toDate = v => { if (!v) return null; const d = v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? v + 'T00:00:00Z' : v); return isNaN(d) ? null : d; };

/** The same calendar day `years` later (29 February becomes 28 February in a non-leap year). */
export function addYears(date, years) {
  const d = new Date(date.getTime()), m = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  if (d.getUTCMonth() !== m) d.setUTCDate(0);
  return d;
}

/** The latest date among everything dated that concerns one person; null when there is none. */
export function lastActivity({ endedAt = null, sessionDates = [], noteDates = [] } = {}) {
  const all = [endedAt, ...sessionDates, ...noteDates].map(toDate).filter(Boolean);
  return all.length ? new Date(Math.max(...all.map(d => d.getTime()))) : null;
}

/**
 * state: 'off' (reminder turned off), 'unknown' (nothing dated), 'snoozed', 'ok', 'soon' (within SOON_DAYS), 'due' (the period has passed).
 * `snoozedUntil` is a date the therapist chose to be reminded again.
 */
export function retentionStatus(last, years = DEFAULT_YEARS, now = new Date(), snoozedUntil = null) {
  years = Number(years);
  if (!(years > 0)) return { state: 'off', due: null, daysLeft: null };
  const l = toDate(last); if (!l) return { state: 'unknown', due: null, daysLeft: null };
  const due = addYears(l, Math.round(years)), daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY);
  const sn = toDate(snoozedUntil);
  if (sn && sn.getTime() > now.getTime() && daysLeft <= SOON_DAYS) return { state: 'snoozed', due, daysLeft, until: sn };
  return { state: daysLeft <= 0 ? 'due' : daysLeft <= SOON_DAYS ? 'soon' : 'ok', due, daysLeft };
}

const fmt = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** One plain sentence for a status, or '' when there is nothing to say. */
export function sentence(s, years = DEFAULT_YEARS) {
  if (s.state === 'due') return `The ${years}-year period ended on ${fmt(s.due)}. You may now delete these records if you no longer need them. Nothing is deleted for you.`;
  if (s.state === 'soon') return `The ${years}-year period ends on ${fmt(s.due)} (in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}).`;
  if (s.state === 'ok') return `Kept until ${fmt(s.due)} if you follow a ${years}-year period.`;
  if (s.state === 'snoozed') return `The period ended or ends on ${fmt(s.due)}. You asked to be reminded again on ${fmt(s.until)}.`;
  return '';
}

export const NOTE = 'In Germany treatment records are generally kept for ten years after treatment ends (§ 630f BGB). Other rules can apply to you, so check with your professional body if you are unsure. This is a reminder only: nothing is ever deleted automatically.';

const KEY = id => 'sil.th.retention.' + id;
const read = (id) => { try { return JSON.parse(localStorage.getItem(KEY(id)) || '{}') || {}; } catch { return {}; } };
const write = (id, o) => { try { localStorage.setItem(KEY(id), JSON.stringify(o)); return true; } catch { return false; } };

/** Stored on this device only, per therapist account: { years, snooze: { [personId]: 'YYYY-MM-DD' } }. */
export function settings(userId) {
  const o = read(userId), y = Number(o.years);
  return { years: Number.isFinite(y) && y >= 0 && y <= 99 ? y : DEFAULT_YEARS, snooze: o.snooze && typeof o.snooze === 'object' ? o.snooze : {} };
}
export function setYears(userId, years) { const o = read(userId); o.years = Math.max(0, Math.min(99, Math.round(Number(years) || 0))); return write(userId, o); }
export function snoozeFor(userId, personId, days = 365, now = new Date()) {
  const o = read(userId); o.snooze = o.snooze || {};
  o.snooze[personId] = new Date(now.getTime() + days * DAY).toISOString().slice(0, 10); return write(userId, o);
}
