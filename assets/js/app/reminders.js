/**
 * /assets/js/app/reminders.js
 * A daily check-in reminder the person sets for a time they choose. Works in the installed Android app only,
 * as notifications created on the phone itself: the time never leaves the device and nothing is sent to a server.
 * The text is generic and never mentions what the person has written.
 *
 * The next 14 days are scheduled and topped up each time the app opens or a check-in is saved, so a day that
 * already has a check-in is skipped, and the reminders fade out on their own if the app is not used for two weeks.
 */
const KEY = 'sil-checkin-reminder';
const DAYS = 14;
const BASE_ID = 4100;
const CHANNEL = 'checkin-reminder';
export const CHECKIN_PATH = '/check-in/index.html';

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);
const plugin = () => cap()?.Plugins?.LocalNotifications;
export const remindersAvailable = () => !!(cap()?.isNativePlatform?.() && plugin());
const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function getReminder() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && Number.isInteger(r.hour) && Number.isInteger(r.minute)) return { enabled: !!r.enabled, hour: r.hour, minute: r.minute, doneDay: r.doneDay || null }; } catch (_) {}
  return { enabled: false, hour: 20, minute: 0, doneDay: null };
}
const store = r => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (_) {} };

/** The reminder times to schedule: today's time if still ahead and not done, then one per following day. */
export function planTimes({ hour, minute, doneDay }, now = new Date(), days = DAYS) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (d <= now) continue;
    if (dayKey(d) === doneDay) continue;
    out.push(d);
  }
  return out;
}

async function arm(r) {
  const ln = plugin();
  const pending = await ln.getPending().catch(() => ({ notifications: [] }));
  const ours = (pending.notifications || []).filter(n => n.id >= BASE_ID && n.id < BASE_ID + DAYS + 2);
  if (ours.length) await ln.cancel({ notifications: ours.map(n => ({ id: n.id })) });
  if (!r.enabled) return;
  await ln.createChannel?.({ id: CHANNEL, name: 'Daily check-in reminder', description: 'The reminder you set for a daily check-in', importance: 3 }).catch(() => {});
  const times = planTimes(r);
  if (!times.length) return;
  await ln.schedule({ notifications: times.map((at, i) => ({
    id: BASE_ID + i, title: 'A moment to check in', body: 'A check-in takes about a minute.',
    schedule: { at, allowWhileIdle: true }, channelId: CHANNEL, extra: { path: CHECKIN_PATH },
  })) });
}

/** Turns the reminder on at a time (asks for permission first). Returns { ok, reason }. */
export async function enableReminder(hour, minute) {
  if (!remindersAvailable()) return { ok: false, reason: 'unavailable' };
  const ln = plugin();
  let perm = await ln.checkPermissions();
  if (perm.display !== 'granted') perm = await ln.requestPermissions();
  if (perm.display !== 'granted') return { ok: false, reason: 'denied' };
  const r = { ...getReminder(), enabled: true, hour, minute };
  store(r); await arm(r);
  return { ok: true };
}

export async function disableReminder() {
  const r = { ...getReminder(), enabled: false };
  store(r);
  if (remindersAvailable()) await arm(r);
}

/** Call after a check-in is saved (skips today's reminder) and when the app opens (tops up the days). */
export async function refreshReminder({ checkedInToday = false } = {}) {
  const r = getReminder();
  if (checkedInToday) { r.doneDay = dayKey(); store(r); }
  if (remindersAvailable() && r.enabled) await arm(r).catch(e => console.warn('[reminder]', e.message));
}

/** Opens the check-in when the notification is tapped. */
export function listenForTaps() {
  const ln = plugin();
  ln?.addListener?.('localNotificationActionPerformed', ev => {
    const path = ev?.notification?.extra?.path;
    if (path === CHECKIN_PATH) location.href = CHECKIN_PATH;
  });
}
