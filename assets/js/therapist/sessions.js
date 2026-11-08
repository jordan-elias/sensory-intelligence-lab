/**
 * /assets/js/therapist/sessions.js
 * Upcoming and past sessions for one client, from the session times the therapist may see.
 */
export const KIND_LABEL = { session: 'Session', 'subscriber-session': 'Monthly session' };

/** Splits into upcoming (soonest first) and past (latest first). Cancelled sessions are not upcoming. */
export function splitSessions(rows, now = new Date()) {
  const t = now.getTime();
  const live = (rows || []).filter(r => r.scheduled_at);
  const upcoming = live.filter(r => r.status !== 'cancelled' && new Date(r.scheduled_at).getTime() >= t)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = live.filter(r => !upcoming.includes(r)).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return { upcoming, past };
}

export const nextSession = rows => splitSessions(rows).upcoming[0] || null;

export function describe(r) {
  const d = new Date(r.scheduled_at);
  const end = r.completed_at ? new Date(r.completed_at) : null;
  const when = d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const mins = end && end > d ? Math.round((end - d) / 60000) : null;
  return { when, minutes: mins, kind: KIND_LABEL[r.event_type] || 'Session', cancelled: r.status === 'cancelled' };
}
