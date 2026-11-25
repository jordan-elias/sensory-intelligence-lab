/**
 * /assets/js/oramics/scan.js
 * Reading the picture. A layer is scanned column by column into "runs": the bands of paint in that column. Everything the music needs
 * (a melody note, a chord, a drum hit, a band of noise) is worked out from those runs, as pure functions, so the live player, the WAV
 * export and the tests all hear the same thing.
 */
import { hzAt, snapHz } from './music.js';
import { INKS } from './inks.js';

export const ALPHA_MIN = 40;   // fainter than this counts as empty (soft brush edges)
const clamp01 = v => Math.max(0, Math.min(1, v));

/** An empty scan for a layer of this size: runs[x] is null (nothing) or an Int16Array [top, bottom, top, bottom, …] (rows, inclusive). */
export const emptyScan = (w, h) => ({ w, h, runs: new Array(w).fill(null) });

/** Scans columns x0..x1 of an ImageData-like { width, height, data } into scan.runs. */
export function scanLayer(img, scan, x0 = 0, x1 = img.width - 1) {
  const { width: w, height: h, data } = img, a = Math.max(0, Math.floor(x0)), b = Math.min(w - 1, Math.ceil(x1));
  for (let x = a; x <= b; x++) {
    let out = null, start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && data[(y * w + x) * 4 + 3] >= ALPHA_MIN;
      if (on && start < 0) start = y;
      else if (!on && start >= 0) { (out ||= []).push(start, y - 1); start = -1; }
    }
    scan.runs[x] = out ? Int16Array.from(out) : null;
  }
  return scan;
}

/** The runs in a column as { top, bot, c, size } (all 0..1 down the picture; size is the thickness). */
export function runsAt(scan, x) {
  const r = scan.runs[Math.max(0, Math.min(scan.w - 1, Math.round(x)))]; if (!r) return [];
  const out = [];
  for (let i = 0; i < r.length; i += 2) { const top = r[i] / scan.h, bot = (r[i + 1] + 1) / scan.h; out.push({ top, bot, c: (top + bot) / 2, size: bot - top }); }
  return out;
}

/** Thickness (share of the picture's height) → loudness 0.25 … 1. A thin line is quiet but audible; a broad stroke is full. */
export const loudness = size => 0.25 + 0.75 * clamp01(size / 0.05);

/** One singing line: the thickest band in the column, or null. opts.snap = { on, root, scale }. */
export function melodyAt(runs, ink = 'melody', opts = {}) {
  if (!runs.length) return null;
  const r = runs.reduce((a, b) => (b.size > a.size ? b : a));
  let hz = hzAt(r.c, INKS[ink].range); if (opts.snap && opts.snap.on) hz = snapHz(hz, opts.snap.root, opts.snap.scale);
  return { hz, amp: loudness(r.size), c: r.c };
}

/** Chord notes, highest first: every band is a note on the key, at most maxVoices (the thickest win). */
export function harmonyAt(runs, { root = 0, scale = 'major pentatonic', maxVoices = 4 } = {}) {
  const picked = [...runs].sort((a, b) => b.size - a.size).slice(0, maxVoices).sort((a, b) => a.c - b.c);
  const seen = new Set(), out = [];
  for (const r of picked) { const hz = snapHz(hzAt(r.c, INKS.harmony.range), root, scale), k = Math.round(hz * 100); if (seen.has(k)) continue; seen.add(k); out.push({ hz, amp: loudness(r.size), c: r.c }); }
  return out;
}

/** A band of noise: where its middle sits sets the brightness, all the paint together sets the level. */
export function textureAt(runs) {
  if (!runs.length) return null;
  const total = runs.reduce((s, r) => s + r.size, 0), c = runs.reduce((s, r) => s + r.c * r.size, 0) / total;
  return { hz: hzAt(c, INKS.texture.range), amp: loudness(total), c };
}

/** The drums, from top to bottom of the picture. A mark covers one or more of them. */
export const ZONES = [
  { id: 'open', to: 0.18 }, { id: 'hat', to: 0.38 }, { id: 'snare', to: 0.58 }, { id: 'tom', to: 0.78 }, { id: 'kick', to: 1.01 },
];
export const zoneOf = n => ZONES.find(z => n < z.to) || ZONES[ZONES.length - 1];

/** New marks in this column compared with the last one are hits. Returns [{ zone, c, vel }] (a tall mark hits every zone it covers). */
export function onsetsAt(prev, runs, tol = 2 / 800) {
  const hits = [];
  for (const r of runs) {
    if (prev.some(p => r.top <= p.bot + tol && r.bot >= p.top - tol)) continue;
    const vel = loudness(Math.min(r.size, 0.05) * 1.4), first = zoneOf(r.top), last = zoneOf(Math.max(r.top, r.bot - 1e-6));
    let on = false;
    for (const z of ZONES) {
      if (z === first) on = true;
      if (on) hits.push({ zone: z.id, c: Math.max(r.top, Math.min(r.bot, z === first ? (r.top + Math.min(r.bot, z.to)) / 2 : (z.to - 0.1))), vel });
      if (z === last) break;
    }
  }
  return hits;
}
