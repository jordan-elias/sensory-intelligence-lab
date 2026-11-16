/**
 * /assets/js/seq/patterns.js
 * Saving and loading whole sequencer patterns on this device only (localStorage). Nothing is sent anywhere.
 * `pack` takes the sequencer's state, `unpack` checks anything read back so a damaged or hand-edited entry can never
 * put the sequencer into a broken state.
 */
import { LEVELS, clampLen } from './groove.js';

const KEY = 'sil.seq.patterns', MAX_PATTERNS = 30, MAX_NAME = 40;
const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['major', 'minor_pentatonic', 'major_pentatonic', 'minor', 'harmonic_minor'];
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const level = v => { v = Number(v); return Number.isFinite(v) ? LEVELS.reduce((b, l) => Math.abs(l - v) < Math.abs(b - v) ? l : b, 1) : 1; };

/** A plain, serialisable copy of the state. */
export function pack(s) { return JSON.parse(JSON.stringify({ v: 1, bpm: s.bpm, swing: s.swing, root: s.root, scale: s.scale, loops: s.loops, vel: s.vel, prob: s.prob, len: s.len, chain: s.chain })); }

/** Checks and repairs a packed pattern. Returns null when it cannot be used at all. */
export function unpack(o, { tracks = 8, loops = 4, steps = 16, maxNote = 7 } = {}) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.loops)) return null;
  const grid = (src, fill, fix) => Array.from({ length: loops }, (_, l) => Array.from({ length: tracks }, (_, t) => Array.from({ length: steps }, (_, i) => { const row = src && src[l] && src[l][t]; return fix(row ? row[i] : undefined, fill); })));
  const cell = v => (v === true ? true : Number.isInteger(v) && v >= 0 && v <= maxNote ? v : null);
  const out = {
    bpm: Math.round(num(o.bpm, 60, 200, 120)), swing: num(o.swing, 0, 1, 0), root: ROOTS.includes(o.root) ? o.root : 'C', scale: SCALES.includes(o.scale) ? o.scale : 'major',
    loops: grid(o.loops, null, cell), vel: grid(o.vel, 1, v => level(v)), prob: grid(o.prob, 1, v => level(v)),
    len: Array.from({ length: loops }, (_, l) => Array.from({ length: tracks }, (_, t) => clampLen(o.len && o.len[l] ? o.len[l][t] : steps, steps))),
    chain: (Array.isArray(o.chain) ? o.chain : []).filter(c => c && Number.isInteger(c.loopIdx) && c.loopIdx >= 0 && c.loopIdx < loops && Number.isInteger(c.reps) && c.reps >= 1 && c.reps <= 16).slice(0, 32).map(c => ({ loopIdx: c.loopIdx, reps: c.reps })),
  };
  return out;
}

const read = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(o) ? o.filter(p => p && typeof p.name === 'string' && p.data) : []; } catch { return []; } };
const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };
export const cleanName = n => String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME);

/** Saved patterns, newest first: [{ name, saved, data }]. */
export const list = () => read().sort((a, b) => String(b.saved).localeCompare(String(a.saved)));
/** Saves under a name (replacing one with the same name). Returns { ok, error }. */
export function save(name, state, now = new Date()) {
  name = cleanName(name); if (!name) return { ok: false, error: 'Give the pattern a name.' };
  const all = read().filter(p => p.name !== name);
  if (all.length >= MAX_PATTERNS) return { ok: false, error: `You can keep up to ${MAX_PATTERNS} patterns. Delete one first.` };
  all.push({ name, saved: now.toISOString(), data: pack(state) });
  return write(all) ? { ok: true } : { ok: false, error: 'Could not save on this device.' };
}
export function load(name, dims) { const p = read().find(x => x.name === name); return p ? unpack(p.data, dims) : null; }
export function remove(name) { return write(read().filter(p => p.name !== name)); }
