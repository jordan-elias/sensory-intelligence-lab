/**
 * /assets/js/semantic/export.js
 * Saving a Composed piece: a Standard MIDI File (the notes, tempo and the slowing at the end) and a stereo 16-bit WAV. Plain functions with no browser in them.
 */
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], u16 = n => [(n >> 8) & 255, n & 255];
const vlq = n => { const o = [n & 127]; while ((n >>= 7)) o.unshift((n & 127) | 128); return o; };
const PROGRAM = { 1: 11, 2: 4, 3: 89, 4: 32 };   // vibraphone, electric piano, warm pad, acoustic bass
const PPQ = 480;

/** A type 1 MIDI file: a tempo track and one track for each of voices 1 to 4 (the drone is not written). */
export function encodePlanMidi(plan) {
  const track = body => [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body], text = (type, s) => { const b = [...new TextEncoder().encode(s)]; return [0xff, type, ...vlq(b.length), ...b]; };
  const mpqn = bpm => Math.round(60e6 / bpm);
  const tempo = bpm => [0xff, 0x51, 3, (mpqn(bpm) >> 16) & 255, (mpqn(bpm) >> 8) & 255, mpqn(bpm) & 255];
  const meta = [0, ...text(0x03, 'Semantic Synth: ' + (plan.key ? plan.key.name : '')), 0, ...tempo(plan.bpm), 0, 0xff, 0x58, 4, 4, 2, 24, 8];
  const span = Math.max(1, plan.endBeat - plan.ritStart); let last = 0;
  if (plan.endBeat > plan.ritStart) for (let b = Math.ceil(plan.ritStart); b <= plan.endBeat; b++) { const tick = Math.round(b * PPQ); meta.push(...vlq(tick - last), ...tempo(plan.bpm / (1 + 0.3 * (b - plan.ritStart) / span))); last = tick; }
  meta.push(0, 0xff, 0x2f, 0);
  const chunks = [track(meta)];
  for (let v = 1; v <= 4; v++) {
    const ev = [];
    for (const e of plan.events) if (e.voice === v) for (const m of e.midi) { const on = Math.round(e.beat * PPQ), off = Math.max(on + 10, Math.round((e.beat + e.dur) * PPQ) - 5), vel = Math.max(1, Math.min(127, Math.round(e.vel * 127))); ev.push([on, 1, [0x90 | (v - 1), m, vel]], [off, 0, [0x80 | (v - 1), m, 0]]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const body = [0, ...text(0x03, ['', 'melody', 'predictions', 'pad', 'bass and colour'][v]), 0, 0xc0 | (v - 1), PROGRAM[v]]; let t = 0;
    for (const [tick, , bytes] of ev) { body.push(...vlq(tick - t), ...bytes); t = tick; }
    body.push(0, 0xff, 0x2f, 0); chunks.push(track(body));
  }
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(PPQ), ...chunks.flat()]);
}

/** A stereo 16-bit WAV from two channels of samples. */
export function encodeWavStereo(left, right, sr) {
  const n = left.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  const q = x => { const s = Math.max(-1, Math.min(1, x || 0)); return s < 0 ? s * 0x8000 : s * 0x7fff; };
  for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, q(left[i]), true); v.setInt16(46 + i * 4, q(right[i]), true); }
  return buf;
}
