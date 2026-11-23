import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePlanMidi, encodeWavStereo } from '../../assets/js/semantic/export.js';
import { composePlan, liveNote, liveMark } from '../../assets/js/semantic/compose.js';

const TEXT = 'The river moves slowly through the quiet valley, and I remember the light. Why does it never stop?';
const toks = text => (text.match(/\b\w+\b/g) || []).map((w, i) => ({ word: w, lower: w.toLowerCase(), freqScore: ((i * 37) % 100) / 100, cluster: i % 20, pos: ['noun', 'verb', 'adjective', 'other'][i % 4], len: w.length }));
const plan = composePlan(TEXT, toks(TEXT));

test('MIDI: a valid type 1 file with a tempo track and four voice tracks, every note on matched by an off', () => {
  const b = encodePlanMidi(plan), dv = new DataView(b.buffer);
  assert.equal(String.fromCharCode(...b.slice(0, 4)), 'MThd'); assert.equal(dv.getUint16(8), 1); assert.equal(dv.getUint16(10), 5); assert.equal(dv.getUint16(12), 480);
  let pos = 14, tracks = 0, ons = 0, offs = 0, tempos = 0;
  while (pos < b.length) {
    assert.equal(String.fromCharCode(...b.slice(pos, pos + 4)), 'MTrk'); const len = dv.getUint32(pos + 4), end = pos + 8 + len; let p = pos + 8, run = 0; tracks++;
    while (p < end) {
      while (b[p] & 128) p++; p++;                      // delta time
      const st = b[p]; if (st === 0xff) { const type = b[p + 1]; let q = p + 2, l = 0; do { l = (l << 7) | (b[q] & 127); } while (b[q++] & 128); if (type === 0x51) tempos++; p = q + l; if (type === 0x2f) break; }
      else { run = st; if ((st & 0xf0) === 0x90 && b[p + 2] > 0) ons++; else if ((st & 0xf0) === 0x80) offs++; p += (st & 0xf0) === 0xc0 ? 2 : 3; }
    }
    assert.equal(p, end, 'track ends where its length says'); pos = end;
  }
  assert.equal(tracks, 5); assert.equal(ons, offs); assert.ok(ons > 20); assert.ok(tempos > 1, 'the slowing at the end is written as tempo changes');
  const notes = plan.events.filter(e => e.voice <= 4).reduce((n, e) => n + e.midi.length, 0); assert.equal(ons, notes);
});
test('MIDI: velocities and notes are in range', () => {
  const b = encodePlanMidi(plan); for (let i = 14; i < b.length - 2; i++) if (b[i] === 0x90 || b[i] === 0x91) assert.ok(b[i + 1] < 128 && b[i + 2] < 128);
  assert.deepEqual([...encodePlanMidi({ ...plan, events: [] }).slice(0, 4)], [0x4d, 0x54, 0x68, 0x64]);
});
test('WAV: stereo 16-bit with the right header and clipped samples', () => {
  const l = new Float32Array([0, 0.5, -1, 2]), r = new Float32Array([0, -0.5, 1, -2]), w = encodeWavStereo(l, r, 44100), dv = new DataView(w);
  assert.equal(w.byteLength, 44 + 16); assert.equal(dv.getUint16(22, true), 2); assert.equal(dv.getUint32(24, true), 44100); assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getInt16(44 + 4 * 1, true), Math.round(0.5 * 0x7fff - 0.5) || dv.getInt16(48, true)); assert.equal(dv.getInt16(44 + 12, true), 32767); assert.equal(dv.getInt16(44 + 14, true), -32768);
});
test('typing: a finished word plays a note in the key the text so far suggests; punctuation plays a chord', () => {
  const text = 'The river moves slowly', t = toks(text), n = liveNote(text, t);
  assert.ok(n && n.key.pcs.includes(n.midi % 12) && n.vel > 0 && ['pluck', 'bell'].includes(n.kind)); assert.equal(liveNote('', []), null);
  const dot = liveMark('.', n.key), q = liveMark('?', n.key), dots = liveMark('…', n.key);
  for (const c of [dot, q, dots]) assert.ok(c.midi.length === 3 && c.midi.every(m => n.key.pcs.includes(m % 12)));
  assert.equal(liveMark(',', n.key), null);
  assert.notDeepEqual(dot.midi, q.midi);
});
