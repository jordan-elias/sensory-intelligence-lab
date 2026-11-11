/**
 * /assets/js/experiments/audio-ops.js
 * Pure functions on mono sample arrays (Float32Array). Used by the field-recording experiments.
 * The audio never leaves the browser; nothing here saves or sends it.
 */
import { shuffle } from './rng.js';

export function mixToMono(channels) {
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const n = channels[0].length, out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** rate > 1 is faster and higher, rate < 1 slower and lower. Linear interpolation. */
export function resample(data, rate) {
  const n = Math.max(1, Math.floor(data.length / rate)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate, k = Math.floor(p), f = p - k;
    out[i] = (data[k] ?? 0) * (1 - f) + (data[k + 1] ?? data[k] ?? 0) * f;
  }
  return out;
}
export const reverse = data => Float32Array.from(data).reverse();

function fadeEdges(buf, fade) {
  const f = Math.min(fade, Math.floor(buf.length / 2));
  for (let i = 0; i < f; i++) { const g = i / f; buf[i] *= g; buf[buf.length - 1 - i] *= g; }
  return buf;
}
const concat = parts => { const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

/** Cuts into equal slices and plays them in a random order. Returns { out, order } (order is 1-based). */
export function chopShuffle(data, sr, slices, rng, fadeMs = 5) {
  const n = Math.max(2, slices | 0), size = Math.floor(data.length / n), fade = Math.floor(sr * fadeMs / 1000);
  const parts = Array.from({ length: n }, (_, i) => fadeEdges(data.slice(i * size, (i + 1) * size), fade));
  let idx = shuffle(rng, [...Array(n).keys()]);
  if (n > 1 && idx.every((v, i) => v === i)) idx = idx.slice(1).concat(idx[0]);   // never hand back the original order
  return { out: concat(idx.map(i => parts[i])), order: idx.map(i => i + 1) };
}

/** Repeats one short piece. start/len in seconds. */
export function stutter(data, sr, start, len, repeats, fadeMs = 3) {
  const s = Math.max(0, Math.floor(start * sr)), l = Math.max(1, Math.floor(len * sr));
  const grain = fadeEdges(data.slice(s, s + l), Math.floor(sr * fadeMs / 1000));
  return concat(Array.from({ length: Math.max(1, repeats | 0) }, () => grain));
}

/** One short piece played at several pitches (semitones from the original), one after another. */
export function pitchedGrains(data, sr, start, len, semis, fadeMs = 4) {
  const s = Math.max(0, Math.floor(start * sr)), l = Math.max(1, Math.floor(len * sr)), grain = data.slice(s, s + l);
  return concat(semis.map(st => fadeEdges(resample(grain, Math.pow(2, st / 12)), Math.floor(sr * fadeMs / 1000))));
}

/** The same sound at once very slow and very fast: contrast of scale. The fast copy repeats to fill the slow one. */
export function contrastLayer(data, slow = 0.25, fast = 4) {
  const a = resample(data, slow), b = resample(data, fast), out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * 0.6 + b[i % b.length] * 0.4;
  return out;
}

export function normalise(data, peak = 0.89) {
  let m = 0; for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
  if (m === 0) return data;
  const g = peak / m, out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] * g;
  return out;
}

/** 16-bit mono WAV file bytes. */
export function encodeWav(data, sr) {
  const n = data.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return new Uint8Array(buf);
}
