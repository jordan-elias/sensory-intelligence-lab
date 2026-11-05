/**
 * /assets/js/checkins/insights.js
 * Pure functions: how surroundings relate to mood, and which saved place suits a goal.
 * Runs in the browser on decrypted data. Nothing leaves the device.
 *
 * "Mood" here means valence (1 low .. 10 high), "energy" is arousal, "sensory" is sensory load
 * (1 calm .. 10 overwhelming). A relationship needs enough check-ins before it is shown:
 * with fewer than MIN_N the result is marked `enough: false` so pages say "not enough yet".
 */
import { sunPosition, sunLabel } from './sun.js';

export const MIN_N = 3;
export const LIGHT_LEVELS = ['direct', 'bright', 'dim', 'dark'];
export const BUCKETS = ['morning', 'afternoon', 'evening', 'night'];

export function bucketOf(date) {
  const h = new Date(date).getHours();
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
}

const mean = xs => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const round1 = v => (v == null ? null : Math.round(v * 10) / 10);

function summarise(list) {
  return {
    n: list.length, enough: list.length >= MIN_N,
    mood: round1(mean(list.map(c => c.valence))), energy: round1(mean(list.map(c => c.arousal))),
    sensory: round1(mean(list.map(c => c.sensory_load))),
  };
}

/**
 * Average mood, energy and sensory load for each level of one environmental factor.
 * @param {'noise'|'crowd'|'light'} factor
 * @returns {{level:number|string, n, enough, mood, energy, sensory}[]} in level order; empty levels omitted
 */
export function byFactor(checkins, factor) {
  const levels = factor === 'light' ? LIGHT_LEVELS : [1, 2, 3, 4, 5];
  return levels
    .map(level => ({ level, ...summarise(checkins.filter(c => c.env?.[factor] === level)) }))
    .filter(r => r.n > 0);
}

/** Same, by time-of-day bucket. */
export function byTimeOfDay(checkins) {
  return BUCKETS.map(level => ({ level, ...summarise(checkins.filter(c => bucketOf(c.created_at) === level)) })).filter(r => r.n > 0);
}

/** Mood by how high the sun was (only check-ins where a place with coordinates was chosen). */
export function bySun(checkins) {
  const label = c => sunLabel(c.env?.sun_elevation);
  const order = ['dark', 'twilight', 'low sun', 'mid-height sun', 'high sun'];
  return order.map(level => ({ level, ...summarise(checkins.filter(c => label(c) === level)) })).filter(r => r.n > 0);
}

/**
 * The strongest simple relationships, as plain sentences for the insights page.
 * Only reports a difference of at least 1 point between the best and worst level, each with enough check-ins.
 */
export function highlights(checkins) {
  const out = [];
  const add = (factor, rows, name, word) => {
    const ok = rows.filter(r => r.enough && r.mood != null);
    if (ok.length < 2) return;
    const best = ok.reduce((a, b) => (b.mood > a.mood ? b : a)), worst = ok.reduce((a, b) => (b.mood < a.mood ? b : a));
    if (best.mood - worst.mood < 1) return;
    out.push({ factor, best, worst, text: `Your mood averages ${best.mood} with ${name} ${word(best.level)} and ${worst.mood} with ${name} ${word(worst.level)}.` });
  };
  add('noise', byFactor(checkins, 'noise'), 'noise', l => `at ${l} of 5`);
  add('crowd', byFactor(checkins, 'crowd'), 'crowds', l => `at ${l} of 5`);
  add('light', byFactor(checkins, 'light'), 'light', l => `"${l}"`);
  add('time', byTimeOfDay(checkins), 'check-ins in the', l => l);
  add('sun', bySun(checkins), 'sun', l => `at "${l}"`);
  return out;
}

/** What each saved place has been like, overall and by time of day. */
export function placeProfiles(checkins, places) {
  return places.map(place => {
    const here = checkins.filter(c => c.place_id === place.id);
    const prof = bucket => {
      const list = bucket ? here.filter(c => bucketOf(c.created_at) === bucket) : here;
      const s = summarise(list);
      return { ...s, noise: round1(mean(list.map(c => c.env?.noise))), crowd: round1(mean(list.map(c => c.env?.crowd))),
        directSun: list.length ? Math.round(100 * list.filter(c => c.env?.light === 'direct').length / list.length) : null };
    };
    return { place, all: prof(null), byBucket: Object.fromEntries(BUCKETS.map(b => [b, prof(b)])) };
  });
}

/**
 * Which saved places fit what you want, at a given time.
 * @param {object} want  { noise: 'quiet'|'lively'|null, crowd: 'empty'|'busy'|null, sun: 'sunny'|'shade'|null }
 * @param {Date}   when
 * @returns sorted best-first: { place, matches, misses, sun:{elevation,label}|null, mood, n, notes[] }
 */
export function recommend(checkins, places, want = {}, when = new Date()) {
  const bucket = bucketOf(when);
  return placeProfiles(checkins, places).map(({ place, all, byBucket }) => {
    const basis = byBucket[bucket].n >= MIN_N ? byBucket[bucket] : all;       // prefer the same time of day
    const sun = Number.isFinite(place.lat) && Number.isFinite(place.lng)
      ? (() => { const e = sunPosition(when, place.lat, place.lng).elevation; return { elevation: Math.round(e * 10) / 10, label: sunLabel(e) }; })() : null;
    let matches = 0, misses = 0; const notes = [];
    const test = (wanted, value, ok, text) => {
      if (!wanted) return;
      if (value == null) { notes.push(`no ${text} logged yet`); return; }
      ok(value) ? matches++ : misses++;
    };
    test(want.noise, basis.noise, v => (want.noise === 'quiet' ? v <= 2.5 : v >= 3.5), 'noise');
    test(want.crowd, basis.crowd, v => (want.crowd === 'empty' ? v <= 2.5 : v >= 3.5), 'crowd');
    if (want.sun) {
      if (!sun) notes.push('add coordinates to see the sun');
      else (want.sun === 'sunny' ? sun.elevation >= 10 : sun.elevation < 10) ? matches++ : misses++;
    }
    return { place, matches, misses, sun, mood: basis.mood, n: basis.n, basis: basis === all ? 'all day' : bucket, notes };
  }).sort((a, b) => (b.matches - b.misses) - (a.matches - a.misses) || (b.mood ?? -1) - (a.mood ?? -1));
}
