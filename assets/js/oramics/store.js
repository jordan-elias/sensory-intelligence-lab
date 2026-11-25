/**
 * /assets/js/oramics/store.js
 * Keeping pictures. Everything stays on this device (localStorage, or a file the person downloads); nothing is sent anywhere.
 * A project is { v: 2, name, w, h, layers: { ink: PNG data URL }, settings }. cleanProject validates anything read back,
 * including a file someone opens, so a damaged or hand-edited file can never break the page.
 */
import { INK_ORDER, shadeCount } from './inks.js';
import { SCALES } from './music.js';

export const KEY = 'sil.oramics.v2', DRAFT = 'sil.oramics.draft.v2', MAX_SLOTS = 8, MAX_BYTES = 3_500_000;
const num = (v, lo, hi, d) => Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, +v)) : d;

export function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {}; const sn = s.snap && typeof s.snap === 'object' ? s.snap : {}, shade = {}, mix = {};
  for (const id of INK_ORDER) {
    shade[id] = Math.round(num(s.shade && s.shade[id], 0, shadeCount(id) - 1, 0));
    const m = s.mix && s.mix[id] || {}; mix[id] = { vol: num(m.vol, 0, 1, 0.8), mute: m.mute === true };
  }
  return {
    seconds: num(s.seconds, 4, 90, 24), root: Math.round(num(s.root, 0, 11, 0)), scale: Object.hasOwn(SCALES, s.scale) ? s.scale : 'major pentatonic',
    snap: { on: sn.on === true }, space: num(s.space, 0, 1, 0.5), loop: s.loop !== false, paper: s.paper === 'light' ? 'light' : 'dark', shade, mix,
  };
}
export function cleanProject(p) {
  if (!p || typeof p !== 'object') return null;
  const layers = {}; let any = false;
  for (const k of INK_ORDER) { const u = p.layers && p.layers[k]; if (typeof u === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 2_000_000) { layers[k] = u; any = true; } }
  if (!any) return null;
  return { v: 2, name: String(p.name || 'Untitled').replace(/[<>]/g, '').slice(0, 40) || 'Untitled', w: Math.round(num(p.w, 200, 4000, 1280)), h: Math.round(num(p.h, 200, 3000, 800)), layers, settings: cleanSettings(p.settings), saved: num(p.saved, 0, 4e12, 0) };
}
export function loadSlots(storage = globalThis.localStorage) {
  try { const a = JSON.parse(storage.getItem(KEY) || '[]'); return (Array.isArray(a) ? a : []).map(cleanProject).filter(Boolean).slice(0, MAX_SLOTS); } catch { return []; }
}
/** Saves a project in a slot (replacing one with the same name). Returns { ok, error }. */
export function saveSlot(project, storage = globalThis.localStorage) {
  const p = cleanProject(project); if (!p) return { ok: false, error: 'There is nothing painted to save yet.' };
  const slots = loadSlots(storage).filter(s => s.name !== p.name); slots.unshift({ ...p, saved: Date.now() });
  const kept = slots.slice(0, MAX_SLOTS); let json = JSON.stringify(kept);
  while (json.length > MAX_BYTES && kept.length > 1) { kept.pop(); json = JSON.stringify(kept); }
  if (json.length > MAX_BYTES) return { ok: false, error: 'This picture is too big to keep on this device. Save it as a file instead.' };
  try { storage.setItem(KEY, json); return { ok: true }; } catch { return { ok: false, error: 'This browser would not let the picture be kept. Save it as a file instead.' }; }
}
export function deleteSlot(name, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(loadSlots(storage).filter(s => s.name !== name))); } catch { /* nothing to do */ } }
/** The work in progress, kept so a closed tab does not lose it. Same shape as a project. */
export function saveDraft(project, storage = globalThis.localStorage) { try { const p = cleanProject(project); if (!p) { storage.removeItem(DRAFT); return true; } const j = JSON.stringify(p); if (j.length > MAX_BYTES) return false; storage.setItem(DRAFT, j); return true; } catch { return false; } }
export function loadDraft(storage = globalThis.localStorage) { try { return cleanProject(JSON.parse(storage.getItem(DRAFT) || 'null')); } catch { return null; } }
export function clearDraft(storage = globalThis.localStorage) { try { storage.removeItem(DRAFT); } catch { /* nothing to do */ } }
