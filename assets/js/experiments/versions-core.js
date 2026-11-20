/**
 * /assets/js/experiments/versions-core.js
 * Pure rules for "versions": a few takes on the same idea that you listen to, name, and then put in order, twice
 * (once straight away, once after living with one of them), so you can see whether your taste moved.
 */
import { NOTE_NAMES } from './rng.js';

export const MAX_VERSIONS = 5;
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]);
export const pitchText = pcs => pcs.map(p => NOTE_NAMES[((p % 12) + 12) % 12]).join(' ');

/** The order is a list of version indexes, best first. Move one place up (-1) or down (+1). */
export function moveItem(order, i, dir) {
  const j = i + dir; if (j < 0 || j >= order.length) return order.slice();
  const o = order.slice(); [o[i], o[j]] = [o[j], o[i]]; return o;
}
/** Keeps an order in step with the number of versions (new versions go to the end, missing ones drop out). */
export function syncOrder(order, count) {
  const keep = order.filter(i => i < count); for (let i = 0; i < count; i++) if (!keep.includes(i)) keep.push(i); return keep;
}
/** Sentences about what changed between two orders. Empty when nothing moved. */
export function compareOrders(before, after) {
  const out = [];
  after.forEach((v, newPos) => { const oldPos = before.indexOf(v); if (oldPos >= 0 && oldPos !== newPos) out.push(`Version ${v + 1} moved from ${ord(oldPos + 1)} to ${ord(newPos + 1)}.`); });
  return out;
}
/** Plain text for the Keep shelf. */
export function versionsText(versions, before, after) {
  if (!versions.length) return '';
  const lines = versions.map((v, i) => `Version ${i + 1}: ${pitchText(v.pcs)}${v.word ? ` (${v.word})` : ''}`);
  const name = o => o.map(i => `V${i + 1}`).join(' > ');
  if (before && before.length) lines.push('', `Order at first: ${name(before)}`);
  if (after && after.length) { lines.push(`Order after living with one: ${name(after)}`); const c = before ? compareOrders(before, after) : []; lines.push(c.length ? c.join(' ') : 'My order did not change.'); }
  return lines.join('\n');
}
