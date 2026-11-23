/**
 * /assets/js/ambience/store.js
 * What Ambience remembers on this device (localStorage only; nothing is sent anywhere): what is switched on, each sound's settings,
 * the mode and feel. Anything read back is checked, so a damaged or hand-edited entry can never break the page.
 */
import { clean } from './selection.js';
import { FEELS, DEFAULT_FEEL } from './catalog.js';
import { DENSITY, PACE, DEFAULT_DENSITY, DEFAULT_PACE } from './drift.js';

const KEY = 'sil.ambience.v1';
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

export const DEFAULT_SETTINGS = { vol: 0.6, pan: 0, alt: false, rate: 0.4, reverb: 0.2, variation: 0 };
export const cleanSettings = o => ({
  vol: num(o?.vol, 0, 1, DEFAULT_SETTINGS.vol), pan: num(o?.pan, -1, 1, 0), alt: o?.alt === true, rate: num(o?.rate, 0.1, 1.5, DEFAULT_SETTINGS.rate),
  reverb: num(o?.reverb, 0, 1, DEFAULT_SETTINGS.reverb), variation: Math.round(num(o?.variation, 0, 2, 0)),
});

/** Checks everything read back. `known` is the list of tile ids that exist. */
export function cleanPrefs(o, known) {
  const settings = {};
  if (o && typeof o.settings === 'object' && o.settings) for (const k of Object.keys(o.settings).slice(0, 60)) if (known.some(id => id === k || id.startsWith(k + ':'))) settings[k] = cleanSettings(o.settings[k]);
  return {
    selected: clean(o?.selected, known), settings, pinned: (Array.isArray(o?.pinned) ? o.pinned : []).filter(id => known.includes(id)),
    mode: o?.mode === 'drift' ? 'drift' : 'steady', feel: FEELS.some(f => f.id === o?.feel) ? o.feel : DEFAULT_FEEL,
    density: Object.hasOwn(DENSITY, o?.density) ? o.density : DEFAULT_DENSITY, pace: Object.hasOwn(PACE, o?.pace) ? o.pace : DEFAULT_PACE,
    master: num(o?.master, 0, 1, 0.8), hintSeen: o?.hintSeen === true,
  };
}
export function load(known, storage = globalThis.localStorage) { try { return cleanPrefs(JSON.parse(storage.getItem(KEY) || 'null'), known); } catch { return cleanPrefs(null, known); } }
export function save(prefs, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(prefs)); return true; } catch { return false; } }
