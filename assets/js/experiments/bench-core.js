/**
 * /assets/js/experiments/bench-core.js
 * The model behind the Experiments workbench: a small step sequencer with drum and melodic tracks, per-step loudness and
 * chance, per-track length (polymeter), swing, mute and solo. Pure functions: no page, no audio, no network.
 * The rules for swing, chance, length and audibility are the Sequencer's own (`/assets/js/seq/groove.js`).
 */
import { euclid, swingOffset, audible, plays, trackStep, clampLen, nextLevel, velocityVol } from '../seq/groove.js';
import { SCALES } from './rng.js';

export const STEPS = 16;
export const TRACK_DEFS = {
  kick:   { name: 'Kick',   kind: 'drum',   gm: 36 },
  snare:  { name: 'Snare',  kind: 'drum',   gm: 38 },
  hihat:  { name: 'Hi-hat', kind: 'drum',   gm: 42 },
  cymbal: { name: 'Cymbal', kind: 'drum',   gm: 49 },
  bass:   { name: 'Bass',   kind: 'melodic', base: 36 },
  lead:   { name: 'Lead',   kind: 'melodic', base: 60 },
};
export const DEFAULT_TRACKS = ['kick', 'snare', 'hihat', 'bass', 'lead'];

/** A new bench. `ids` picks the tracks. */
export function makeBench(ids = DEFAULT_TRACKS, { steps = STEPS, bpm = 100, root = 0, scale = 'major' } = {}) {
  return {
    steps, bpm, swing: 0, root, scale,
    tracks: ids.filter(id => TRACK_DEFS[id]).map(id => ({
      id, on: Array(steps).fill(false), note: Array(steps).fill(0), vel: Array(steps).fill(1), prob: Array(steps).fill(1),
      len: steps, mute: false, solo: false,
    })),
  };
}
export const track = (b, id) => b.tracks.find(t => t.id === id);
export const hits = t => t.on.reduce((n, v) => n + (v ? 1 : 0), 0);

/** The notes a melodic track can use: scale degrees over two octaves, as MIDI numbers, lowest first. */
export function pitchChoices(b, id) {
  const deg = SCALES[b.scale] || SCALES.major, base = TRACK_DEFS[id].base + b.root, out = [];
  for (let o = 0; o < 2; o++) for (const d of deg) out.push(base + d + 12 * o);
  out.push(base + 24); return out;
}
export const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);

/* ── editing: every function returns nothing and changes the bench it is given ── */
export function toggle(b, id, step, note) {
  const t = track(b, id); t.on[step] = !t.on[step];
  if (t.on[step]) { if (note != null) t.note[step] = note; else if (TRACK_DEFS[id].kind === 'melodic' && !t.note[step]) t.note[step] = pitchChoices(b, id)[0]; t.vel[step] = 1; t.prob[step] = 1; }
}
export function setNote(b, id, step, note) { const t = track(b, id); t.on[step] = true; t.note[step] = note; }
export const cycleVel = (b, id, step) => { const t = track(b, id); t.vel[step] = nextLevel(t.vel[step]); };
export const cycleProb = (b, id, step) => { const t = track(b, id); t.prob[step] = nextLevel(t.prob[step]); };
export const setLen = (b, id, n) => { track(b, id).len = clampLen(n, b.steps); };
export function clear(b, id) { const t = track(b, id); t.on.fill(false); t.vel.fill(1); t.prob.fill(1); }
export function fillEuclid(b, id, pulses, rotate = 0) {
  const t = track(b, id), pat = euclid(pulses, t.len, rotate);
  for (let i = 0; i < b.steps; i++) { t.on[i] = i < t.len ? pat[i] : false; if (t.on[i] && TRACK_DEFS[id].kind === 'melodic' && !t.note[i]) t.note[i] = pitchChoices(b, id)[0]; }
}
/** Put a rhythm (booleans) on a track, repeating it to fill the bench. */
export function setRhythm(b, id, pattern) {
  const t = track(b, id); for (let i = 0; i < b.steps; i++) t.on[i] = !!pattern[i % pattern.length];
  if (TRACK_DEFS[id].kind === 'melodic') for (let i = 0; i < b.steps; i++) if (t.on[i] && !t.note[i]) t.note[i] = pitchChoices(b, id)[0];
}

export const FILL_RULES = [['order', 'In order, over and over'], ['reverse', 'Backwards, over and over'], ['random', 'Any of them, at random'], ['first', 'The first note every time']];
/**
 * Put drawn pitch classes (0 to 11) onto the hits of a melodic track, by a rule. The notes keep their own names: each pitch class
 * lands in the track's octave, so a drawn E is an E whatever the key. Returns the number of hits that were filled.
 */
export function fillNotes(b, id, pitchClasses, rule = 'order', rand = Math.random) {
  const t = track(b, id), base = TRACK_DEFS[id].base, k = pitchClasses.length; if (!k) return 0;
  const midi = pc => base + ((pc - base) % 12 + 12) % 12 + (id === 'lead' ? 0 : 12);
  let j = 0;
  for (let i = 0; i < b.steps; i++) if (t.on[i]) {
    const idx = rule === 'order' ? j % k : rule === 'reverse' ? k - 1 - (j % k) : rule === 'random' ? Math.floor(rand() * k) : 0;
    t.note[i] = midi(pitchClasses[idx]); j++;
  }
  return j;
}

/**
 * What sounds at a running step count `tick`: [{ id, kind, note, vol, delay }], delay in seconds from the step's start (swing).
 * `rand` supplies the chance rolls so the result can be tested.
 */
export function eventsAt(b, tick, stepSeconds, rand = Math.random) {
  const muted = b.tracks.map(t => t.mute), soloed = b.tracks.map(t => t.solo), out = [];
  b.tracks.forEach((t, i) => {
    if (!audible(i, muted, soloed)) return;
    const s = trackStep(tick, t.len, b.steps);
    if (!t.on[s] || !plays(t.prob[s], rand())) return;
    out.push({ id: t.id, kind: TRACK_DEFS[t.id].kind, note: t.note[s], vol: velocityVol(1, t.vel[s]), delay: swingOffset(s, b.swing, stepSeconds), step: s });
  });
  return out;
}

/* ── export ── */
const vlq = n => { const o = [n & 0x7f]; while ((n >>= 7) > 0) o.unshift((n & 0x7f) | 0x80); return o; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], u16 = n => [(n >> 8) & 255, n & 255];
const gcd = (a, c) => (c ? gcd(c, a % c) : a), lcm = (a, c) => (a / gcd(a, c)) * c;
/** How many steps one pass of the whole bench lasts: the tracks' lengths cycle against each other (up to 64 steps). */
export function exportLength(b) { let n = 1; for (const t of b.tracks) n = lcm(n, t.len); return n <= 64 ? n : Math.max(...b.tracks.map(t => t.len)); }
/** A Standard MIDI File (type 1): one track per bench track, drums on channel 10. Chance is not applied: every step that is on is written. */
export function encodeBenchMidi(b) {
  const PPQ = 480, step = PPQ / 4, total = exportLength(b), mpqn = Math.round(60e6 / b.bpm), chunks = [];
  const meta = [0, 0xff, 0x51, 3, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255, 0, 0xff, 0x2f, 0];
  chunks.push([0x4d, 0x54, 0x72, 0x6b, ...u32(meta.length), ...meta]);
  b.tracks.forEach((t, ti) => {
    const drum = TRACK_DEFS[t.id].kind === 'drum', ch = drum ? 9 : Math.min(ti, 8), ev = [];
    for (let k = 0; k < total; k++) {
      const s = k % t.len; if (!t.on[s]) continue;
      const n = drum ? TRACK_DEFS[t.id].gm : t.note[s], v = Math.max(20, Math.round(127 * (0.2 + 0.8 * t.vel[s])));
      const sw = k % 2 === 1 ? Math.round(b.swing * step * 0.5) : 0;
      ev.push([k * step + sw, 1, [0x90 | ch, n, v]], [(k + 1) * step - 10 + sw, 0, [0x80 | ch, n, 0]]);
    }
    ev.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
    const name = [...t.id].map(c => c.charCodeAt(0)), body = [0, 0xff, 0x03, name.length, ...name]; let last = 0;
    for (const [tick, , bytes] of ev) { body.push(...vlq(tick - last), ...bytes); last = tick; }
    body.push(0, 0xff, 0x2f, 0); chunks.push([0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]);
  });
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(PPQ), ...chunks.flat()]);
}
/** A plain-text picture of the bench, for the Keep shelf and the notebook. */
export function benchText(b) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const lines = b.tracks.filter(t => hits(t)).map(t => `${TRACK_DEFS[t.id].name.padEnd(7)} ${t.on.slice(0, t.len).map((v, i) => (v ? (TRACK_DEFS[t.id].kind === 'melodic' ? names[t.note[i] % 12] : 'x') : '.').padEnd(2)).join('')}`);
  return lines.length ? `${lines.join('\n')}\n${b.bpm} BPM, swing ${Math.round(b.swing * 100)}%, ${names[b.root]} ${b.scale}` : '';
}

/* ── patterns saved in the Sequencer ── */
const SEQ_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SEQ_SCALES = { major: 'major', minor: 'natural minor', minor_pentatonic: 'minor pentatonic', major_pentatonic: 'major pentatonic', harmonic_minor: 'natural minor' };
/** The Sequencer track that feeds each workbench track (it has three leads; the workbench has one). */
const SEQ_TRACK = { kick: 0, snare: 1, hihat: 2, cymbal: 3, bass: 4, lead: 5 };
/**
 * Puts one loop of a saved Sequencer pattern (as patterns.js unpacks it) onto the bench. Changes `b` and returns how many tracks got notes.
 * Only the first `b.steps` (up to 16) steps come across. Tracks the bench does not have are skipped.
 */
export function applyPattern(b, p, loopIdx = 0) {
  if (!p || !Array.isArray(p.loops) || !p.loops[loopIdx]) return 0;
  b.bpm = Math.max(50, Math.min(180, Math.round(p.bpm) || b.bpm)); b.swing = Math.max(0, Math.min(1, +p.swing || 0));
  b.root = Math.max(0, SEQ_ROOTS.indexOf(p.root)); b.scale = SEQ_SCALES[p.scale] || 'major';
  let n = 0;
  for (const t of b.tracks) {
    const si = SEQ_TRACK[t.id]; if (si == null) continue;
    const cells = p.loops[loopIdx][si] || [], vel = p.vel?.[loopIdx]?.[si] || [], prob = p.prob?.[loopIdx]?.[si] || [], ch = TRACK_DEFS[t.id].kind === 'melodic' ? pitchChoices(b, t.id) : null;
    t.on.fill(false); t.note.fill(0); t.vel.fill(1); t.prob.fill(1); t.len = clampLen(Math.min(p.len?.[loopIdx]?.[si] || 16, b.steps), b.steps);
    for (let i = 0; i < Math.min(16, b.steps); i++) {
      const c = cells[i]; if (c == null) continue;
      t.on[i] = true; t.vel[i] = vel[i] ?? 1; t.prob[i] = prob[i] ?? 1;
      if (ch) t.note[i] = ch[Math.min(Number.isInteger(c) ? c : 0, ch.length - 1)];
    }
    if (hits(t)) n++;
  }
  return n;
}
