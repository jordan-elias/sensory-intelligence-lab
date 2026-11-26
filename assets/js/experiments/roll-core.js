/**
 * /assets/js/experiments/roll-core.js
 * The model behind the note editor (a small piano roll): notes with a start step, a length and a pitch, on up to four tracks.
 * Pitches are locked to a scale so nothing can sound "wrong". Pure functions: no page, no audio, no network.
 */
import { SCALES, NOTE_NAMES, shuffle, int } from './rng.js';

export const VOICES = { soft: 'Soft', pluck: 'Pluck', bass: 'Bass', bell: 'Bell' };
export const MAX_TRACKS = 4;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** The pitches you can place, lowest to highest: the scale across `octaves` octaves, plus the top root. */
export function rowsOf(root = 0, scale = 'major', octaves = 2, base = 60) {
  const degrees = SCALES[scale] || SCALES.major, out = [];
  for (let o = 0; o < octaves; o++) for (const d of degrees) out.push(base + root + d + 12 * o);
  out.push(base + root + 12 * octaves);
  return out;
}
export const nameOf = midi => NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
export const hzOf = midi => 440 * Math.pow(2, (midi - 69) / 12);

export function makeRoll({ steps = 16, bpm = 100, root = 0, scale = 'major', octaves = 2, voices = ['soft'] } = {}) {
  return { steps: [8, 16, 32].includes(steps) ? steps : 16, bpm: clamp(Math.round(bpm), 40, 220), root, scale, octaves,
    tracks: voices.slice(0, MAX_TRACKS).map((v, i) => ({ name: `Track ${i + 1}`, voice: VOICES[v] ? v : 'soft', notes: [], mute: false })) };
}
export const rows = r => rowsOf(r.root, r.scale, r.octaves);
export const stepSeconds = r => 60 / r.bpm / 4;

export function noteAt(r, ti, step, pitch) { return r.tracks[ti].notes.find(n => n.step <= step && step < n.step + n.len && n.pitch === pitch) || null; }

/** Taps a cell: an existing note there is removed; otherwise a note of `len` steps is placed (and cut short if it would run off the end). */
export function toggleNote(r, ti, step, pitch, len = 1) {
  const t = r.tracks[ti]; if (!t || step < 0 || step >= r.steps) return false;
  const snapped = rows(r).reduce((best, p) => (Math.abs(p - pitch) < Math.abs(best - pitch) ? p : best), rows(r)[0]);
  const hit = noteAt(r, ti, step, snapped);
  if (hit) { t.notes.splice(t.notes.indexOf(hit), 1); return false; }
  t.notes = t.notes.filter(n => !(n.step === step && n.pitch === snapped));
  t.notes.push({ step, len: clamp(len, 1, r.steps - step), pitch: snapped });
  t.notes.sort((a, b) => a.step - b.step || a.pitch - b.pitch);
  return true;
}
export const clearTrack = (r, ti) => { r.tracks[ti].notes = []; };

/** Same rhythm, the same pitches in a new order. */
export function shufflePitches(r, ti, rng) {
  const t = r.tracks[ti], p = shuffle(rng, t.notes.map(n => n.pitch)); t.notes.forEach((n, i) => { n.pitch = p[i]; }); return t.notes.length;
}
/** Same rhythm, new pitches drawn at random from the scale. */
export function newPitches(r, ti, rng) {
  const t = r.tracks[ti], R = rows(r); t.notes.forEach(n => { n.pitch = R[int(rng, 0, R.length - 1)]; }); return t.notes.length;
}
/** Moves every note up or down by whole scale steps, stopping at the edge. */
export function shiftRows(r, ti, delta) {
  const R = rows(r), t = r.tracks[ti]; const idx = t.notes.map(n => R.indexOf(n.pitch) + delta);
  if (idx.some(i => i < 0 || i >= R.length)) return false;
  t.notes.forEach((n, i) => { n.pitch = R[idx[i]]; }); return true;
}
/** Plays the notes backwards in time. */
export function reverse(r, ti) { const t = r.tracks[ti]; t.notes = t.notes.map(n => ({ ...n, step: r.steps - n.step - n.len })).sort((a, b) => a.step - b.step || a.pitch - b.pitch); }
/** Doubles the length of the roll and repeats what is there in the second half (up to 32 steps). */
export function double(r) {
  if (r.steps >= 32) return false;
  const n = r.steps; for (const t of r.tracks) t.notes = t.notes.concat(t.notes.map(x => ({ ...x, step: x.step + n })));
  r.steps = n * 2; return true;
}
/** Which steps have a note starting, as x and dots: the rhythm without the pitches. */
export const rhythmText = (r, ti) => { const t = r.tracks[ti], s = Array(r.steps).fill('.'); t.notes.forEach(n => { s[n.step] = 'x'; }); return s.join(''); };

/** What is sounding: [{ track, time (seconds), dur, pitch, voice }] for one pass through the roll. */
export function events(r) {
  const s = stepSeconds(r), out = [];
  r.tracks.forEach((t, ti) => { if (!t.mute) for (const n of t.notes) out.push({ track: ti, time: n.step * s, dur: n.len * s, pitch: n.pitch, voice: t.voice }); });
  return out.sort((a, b) => a.time - b.time || a.pitch - b.pitch);
}
export const lengthSeconds = r => r.steps * stepSeconds(r);
export const count = r => r.tracks.reduce((a, t) => a + t.notes.length, 0);

export function rollText(r) {
  const lines = [`${r.bpm} bpm, ${NOTE_NAMES[r.root]} ${r.scale}, ${r.steps} steps`];
  r.tracks.forEach(t => { if (t.notes.length) lines.push(`${t.name} (${VOICES[t.voice]}): ` + t.notes.map(n => `${n.step + 1}${n.len > 1 ? '+' + n.len : ''}:${nameOf(n.pitch)}`).join(' ')); });
  return count(r) ? lines.join('\n') : '';
}

/* ── MIDI file (format 1: a tempo track and one track per voice) ── */
const vlq = n => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], u16 = n => [(n >> 8) & 255, n & 255];
export function encodeRollMidi(r) {
  const PPQ = 480, step = PPQ / 4, chunk = body => [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
  const mpqn = Math.round(60e6 / r.bpm);
  const tempo = chunk([0, 0xff, 0x51, 3, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255, 0, 0xff, 0x2f, 0]);
  const tracks = r.tracks.map((t, i) => {
    const ev = []; for (const n of t.notes) { ev.push([n.step * step, 1, [0x90 | i, n.pitch, 96]]); ev.push([(n.step + n.len) * step - 6, 0, [0x80 | i, n.pitch, 0]]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const body = []; const name = [...`${t.name}`].map(c => c.charCodeAt(0) & 127); body.push(0, 0xff, 0x03, name.length, ...name);
    let last = 0; for (const [tick, , bytes] of ev) { body.push(...vlq(tick - last), ...bytes); last = tick; }
    body.push(...vlq(Math.max(0, r.steps * step - last)), 0xff, 0x2f, 0); return chunk(body);
  });
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(1 + tracks.length), ...u16(PPQ), ...tempo, ...tracks.flat()]);
}
