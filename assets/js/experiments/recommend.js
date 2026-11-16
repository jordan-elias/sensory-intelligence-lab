/**
 * /assets/js/experiments/recommend.js
 * "Which one for me?": from what the person has and the time they have, suggest one experiment and two others.
 * Not-yet-done experiments come first, in the course's own order. Pure; the person's answers are not stored or sent.
 */
export const TIMES = [['Up to 15 minutes', 15], ['Up to 25 minutes', 25], ['Any length', 999]];

export function recommend(path, { needs = 'all', minutes = 999, done = new Set() } = {}) {
  const fits = e => (needs === 'all' || e.needs === needs) && e.minutes <= minutes;
  const pool = path.filter(fits);
  const fresh = pool.filter(e => !done.has(e.id)), seen = pool.filter(e => done.has(e.id));
  const order = [...fresh, ...seen];
  return { pick: order[0] || null, others: order.slice(1, 3), allDone: pool.length > 0 && fresh.length === 0 };
}

/** The line shown on the "continue" button. */
export const continueLabel = (e, step, total, started = false) => `${step || started ? 'Continue' : 'Begin'}: ${e.title} · ${e.minutes} min${step ? ` · step ${step} of ${total}` : ''}`;
