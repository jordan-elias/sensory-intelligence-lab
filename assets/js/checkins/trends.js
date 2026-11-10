/**
 * /assets/js/checkins/trends.js
 * Pure functions: how mood and energy move over days, weeks and across a single day.
 * Runs in the browser on decrypted check-ins. Nothing leaves the device.
 *
 * Several check-ins a day are expected. They are kept separate for within-day change and
 * time-of-day patterns, and averaged per day for trends and streaks.
 *
 * Wording rule: patterns are described as "tends to", never as a cause, and never as a
 * diagnosis. Every result carries `enough`; below the thresholds nothing is reported.
 */
import { bucketOf, BUCKETS } from './insights.js';

export const MIN_DAYS_PER_WINDOW = 3;     // check-in days needed in each half of a trend
export const MIN_PER_GROUP = 3;           // check-ins needed in a time-of-day / weekday group
export const TREND_STEP = 0.7;            // mean change (1–10 scale) that counts as a real move
export const GROUP_STEP = 1.0;            // difference between groups that counts as a pattern

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const mean = xs => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const pad = n => String(n).padStart(2, '0');
export const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const usable = (list, field) => list.filter(c => Number.isFinite(c[field]) && !Number.isNaN(new Date(c.created_at).getTime()));

/** One point per day with check-ins: { day, n, value } (value = mean of that day), oldest first. */
export function dailySeries(checkins, field = 'valence') {
  const days = new Map();
  for (const c of usable(checkins, field)) {
    const k = dayKey(c.created_at);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(c[field]);
  }
  return [...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, v]) => ({ day, n: v.length, value: r1(mean(v)) }));
}

/** Recent `days` against the `days` before them. */
export function trend(checkins, { field = 'valence', days = 7, now = new Date() } = {}) {
  const series = dailySeries(checkins, field);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const cut = k => { const d = new Date(end); d.setDate(d.getDate() - days * k); return dayKey(d); };
  const recentFrom = cut(1), priorFrom = cut(2);
  const recent = series.filter(p => p.day > recentFrom), prior = series.filter(p => p.day > priorFrom && p.day <= recentFrom);
  const enough = recent.length >= MIN_DAYS_PER_WINDOW && prior.length >= MIN_DAYS_PER_WINDOW;
  if (!enough) return { enough: false, recentDays: recent.length, priorDays: prior.length };
  const a = mean(recent.map(p => p.value)), b = mean(prior.map(p => p.value)), delta = a - b;
  return { enough: true, recent: r1(a), prior: r1(b), delta: r1(delta),
    direction: Math.abs(delta) < TREND_STEP ? 'steady' : delta > 0 ? 'up' : 'down', recentDays: recent.length, priorDays: prior.length };
}

/** Days in a row with at least one check-in, ending today (or yesterday, so a streak is not lost until the day is over). */
export function streak(checkins, now = new Date()) {
  const have = new Set(checkins.map(c => dayKey(c.created_at)));
  const d = new Date(now);
  if (!have.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (have.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return { days: n, checkedInToday: have.has(dayKey(now)) };
}

/** Change from the first to the last check-in on days that have two or more. */
export function withinDay(checkins, field = 'valence') {
  const days = new Map();
  for (const c of usable(checkins, field).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    const k = dayKey(c.created_at); if (!days.has(k)) days.set(k, []); days.get(k).push(c);
  }
  const multi = [...days.values()].filter(l => l.length >= 2);
  const changes = multi.map(l => l[l.length - 1][field] - l[0][field]);
  const perDay = days.size ? usable(checkins, field).length / days.size : 0;
  const enough = multi.length >= MIN_DAYS_PER_WINDOW;
  const avg = enough ? mean(changes) : null;
  return { enough, days: multi.length, perDay: r1(perDay), change: r1(avg),
    direction: !enough ? null : Math.abs(avg) < TREND_STEP ? 'steady' : avg > 0 ? 'up' : 'down' };
}

function groupPattern(checkins, keyOf, order, field) {
  const groups = new Map();
  for (const c of usable(checkins, field)) { const k = keyOf(new Date(c.created_at)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c[field]); }
  const rows = order.filter(k => groups.has(k)).map(k => ({ key: k, n: groups.get(k).length, value: r1(mean(groups.get(k))) }));
  const ok = rows.filter(r => r.n >= MIN_PER_GROUP);
  if (ok.length < 2) return { enough: false, rows };
  const hi = ok.reduce((a, b) => (b.value > a.value ? b : a)), lo = ok.reduce((a, b) => (b.value < a.value ? b : a));
  return { enough: true, rows, high: hi, low: lo, gap: r1(hi.value - lo.value), real: hi.value - lo.value >= GROUP_STEP };
}
export const timeOfDayPattern = (checkins, field = 'valence') => groupPattern(checkins, d => bucketOf(d), BUCKETS, field);
export const weekdayPattern = (checkins, field = 'valence') => groupPattern(checkins, d => WEEKDAYS[d.getDay()], WEEKDAYS, field);

const labelOf = { valence: 'mood', arousal: 'energy', sensory_load: 'sensory load' };

/**
 * Candidate insights, strongest first. Each: { id, kind, title, text, strength }.
 * `id` changes when the finding changes (e.g. a new streak length), so a repeat is a new thing to say.
 */
export function insights(checkins, { now = new Date() } = {}) {
  const out = [];
  const t = trend(checkins, { now });
  if (t.enough && t.direction !== 'steady') {
    const up = t.direction === 'up';
    out.push({ id: `trend:${t.direction}:w${Math.floor(now.getTime() / 6048e5)}`, kind: 'trend', strength: Math.abs(t.delta) + 1,
      title: up ? 'Your mood has been lifting' : 'A lower stretch lately',
      text: up ? `Over the last week your check-ins average ${t.recent}, up from ${t.prior} the week before.`
        : `Over the last week your check-ins average ${t.recent}, down from ${t.prior} the week before. It can help to notice what has changed, and to bring it to someone you trust.` });
  }
  const s = streak(checkins, now);
  if ([3, 7, 14, 30, 60, 100].includes(s.days)) {
    out.push({ id: `streak:${s.days}`, kind: 'streak', strength: 1.5, title: `${s.days} days in a row`, text: `You have checked in ${s.days} days running. Regular check-ins make the patterns here more reliable.` });
  }
  const tod = timeOfDayPattern(checkins);
  if (tod.enough && tod.real) {
    out.push({ id: `tod:${tod.high.key}:${tod.low.key}`, kind: 'time-of-day', strength: tod.gap,
      title: 'Your day has a shape', text: `Your mood tends to be higher in the ${tod.high.key} (${tod.high.value}) than in the ${tod.low.key} (${tod.low.value}). This is a pattern in your own check-ins, not a cause.` });
  }
  const wd = weekdayPattern(checkins);
  if (wd.enough && wd.real) {
    out.push({ id: `wd:${wd.high.key}:${wd.low.key}`, kind: 'weekday', strength: wd.gap * 0.9,
      title: 'Some days feel different', text: `${wd.high.key}s tend to be your better days (${wd.high.value}), and ${wd.low.key}s your harder ones (${wd.low.value}).` });
  }
  const w = withinDay(checkins);
  if (w.enough && w.direction !== 'steady') {
    out.push({ id: `within:${w.direction}`, kind: 'within-day', strength: Math.abs(w.change),
      title: 'How your days move', text: w.direction === 'up' ? `On days you check in more than once, your mood tends to end higher than it began (by ${Math.abs(w.change)} on average).`
        : `On days you check in more than once, your mood tends to end lower than it began (by ${Math.abs(w.change)} on average). Late-day dips are worth noticing.` });
  }
  return out.sort((a, b) => b.strength - a.strength);
}

/**
 * Picks at most one insight to show, and only occasionally.
 * `shown` is { [id]: ISO date last shown }; `lastAt` is the ISO time anything was last shown.
 * Returns the insight or null. The caller records it.
 */
export function pickInsight(checkins, { now = new Date(), shown = {}, lastAt = null, minGapHours = 36 } = {}) {
  if (lastAt && now - new Date(lastAt) < minGapHours * 36e5) return null;
  return insights(checkins, { now }).find(i => !shown[i.id]) || null;
}

export { labelOf };
