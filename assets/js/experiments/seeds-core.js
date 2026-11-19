/**
 * /assets/js/experiments/seeds-core.js
 * Pure helpers for seeds. A "seed" is something you rolled and kept: a short list of items plus the number that made it.
 * Nothing here touches the network or the page.
 */

/** A number from a date and a name, so "today's roll" is the same all day on every device. Date is local, YYYY-MM-DD. */
export function dailySeed(dateStr, salt = '') {
  let h = 2166136261;
  for (const ch of `${dateStr}|${salt}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Splits a kept roll ("a · b · c\nSeed 123") into its items and the seed line. */
export function parseRoll(text) {
  const [first = '', ...rest] = String(text || '').split('\n');
  const seed = (rest.join(' ').match(/Seed\s+(\d+)/i) || [])[1] || null;
  return { items: first.split(' · ').map(s => s.trim()).filter(Boolean), seed };
}

/** Takes turns between two rolls: a1 · b1 · a2 · b2 … The longer one carries on at the end. */
export function combineRolls(a, b) {
  const A = parseRoll(a), B = parseRoll(b), out = [];
  for (let i = 0; i < Math.max(A.items.length, B.items.length); i++) {
    if (A.items[i] != null) out.push(A.items[i]);
    if (B.items[i] != null) out.push(B.items[i]);
  }
  const from = [A.seed, B.seed].filter(Boolean);
  return out.join(' · ') + (from.length ? `\nCombined from seeds ${from.join(' and ')}` : '\nCombined from two rolls');
}
