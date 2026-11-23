/**
 * /assets/js/ambience/selection.js
 * What is switched on, and the rules for switching: one option per music row, up to two nature sounds (the oldest steps
 * aside for a third), one noise, one spoken voice. A selection is an array of tile ids in the order they were switched on.
 */
import { MAX_NATURE } from './catalog.js';

const family = id => id.split(':')[0];
const rowOf = id => id.split(':').slice(0, 2).join(':');

/** The selection after tapping `id`: switched off if it was on, otherwise switched on, making room if its family is full. */
export function toggle(sel, id) {
  if (sel.includes(id)) return sel.filter(x => x !== id);
  const f = family(id);
  let next = sel.slice();
  if (f === 'music') next = next.filter(x => rowOf(x) !== rowOf(id));
  else if (f === 'nature') { const nat = next.filter(x => family(x) === 'nature'); if (nat.length >= MAX_NATURE) { const drop = new Set(nat.slice(0, nat.length - MAX_NATURE + 1)); next = next.filter(x => !drop.has(x)); } }
  else next = next.filter(x => family(x) !== f);   // noise and spoken: one at a time
  next.push(id);
  return next;
}

/** Repairs a selection read from storage: only known tiles, no duplicates, limits applied. */
export function clean(sel, known) {
  const ok = new Set(known); let out = [];
  for (const id of Array.isArray(sel) ? sel : []) if (typeof id === 'string' && ok.has(id) && !out.includes(id)) out = toggle(out, id);
  return out;
}

export const ofFamily = (sel, f) => sel.filter(x => family(x) === f);
export const musicRows = sel => ofFamily(sel, 'music').map(id => ({ row: id.split(':')[1], option: id.split(':')[2] }));
