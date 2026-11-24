/**
 * /assets/js/oramics/store.js
 * Saving drawings. Everything stays on this device (localStorage, or a file the person downloads); nothing is sent anywhere.
 * A project is { v, name, w, h, layers: { pitch: dataURL, … }, settings }. cleanProject validates anything read back.
 */
export const KEY = 'sil.oramics.v1', MAX_SLOTS = 8, MAX_BYTES = 3_500_000, LAYER_KEYS = ['pitch', 'amp', 'timbre', 'mod'];
import { SCALES } from './curves.js';

const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
const num = (v, lo, hi, d) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d;

export function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {}; const sn = s.snap && typeof s.snap === 'object' ? s.snap : {};
  return {
    wave: WAVES.includes(s.wave) ? s.wave : 'sine', voices: Math.round(num(s.voices, 1, 6, 1)), analog: s.analog === true, speed: num(s.speed, 0.1, 3, 0.8),
    loop: s.loop !== false, snap: { on: sn.on === true, root: Math.round(num(sn.root, 0, 11, 0)), scale: Object.hasOwn(SCALES, sn.scale) ? sn.scale : 'major' },
  };
}
export function cleanProject(p) {
  if (!p || typeof p !== 'object') return null;
  const layers = {}; let any = false;
  for (const k of LAYER_KEYS) { const u = p.layers && p.layers[k]; if (typeof u === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 2_000_000) { layers[k] = u; any = true; } }
  if (!any) return null;
  return { v: 1, name: String(p.name || 'Untitled').replace(/[<>]/g, '').slice(0, 40) || 'Untitled', w: Math.round(num(p.w, 100, 6000, 0)), h: Math.round(num(p.h, 100, 3000, 0)), layers, settings: cleanSettings(p.settings), saved: num(p.saved, 0, 4e12, 0) };
}
export function loadSlots(storage = globalThis.localStorage) {
  try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return (Array.isArray(a) ? a : []).map(cleanProject).filter(Boolean).slice(0, MAX_SLOTS); } catch { return []; }
}
/** Saves a project in a slot (replacing one with the same name). Returns { ok, error }. */
export function saveSlot(project, storage = globalThis.localStorage) {
  const p = cleanProject(project); if (!p) return { ok: false, error: 'There is nothing drawn to save.' };
  const slots = loadSlots(storage).filter(s => s.name !== p.name); slots.unshift({ ...p, saved: Date.now() });
  const kept = slots.slice(0, MAX_SLOTS); let json = JSON.stringify(kept);
  while (json.length > MAX_BYTES && kept.length > 1) { kept.pop(); json = JSON.stringify(kept); }
  if (json.length > MAX_BYTES) return { ok: false, error: 'This drawing is too big to keep on this device. Save it as a file instead.' };
  try { storage.setItem(KEY, json); return { ok: true }; } catch { return { ok: false, error: 'This browser would not let the drawing be kept. Save it as a file instead.' }; }
}
export function deleteSlot(name, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(loadSlots(storage).filter(s => s.name !== name))); } catch { /* nothing to do */ } }
