import test from 'node:test'; import assert from 'node:assert/strict';
import { CUES, STATES, SCALE, TONIC, WINDOWS, windows, cuesAt, tonicAt, weightsAt, pulseBeats, pulseHits, beatHz } from '../../assets/js/regulation/cues.js';
function mk(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test('nine states, angry in place of unfocused, each with every cue', () => {
  assert.equal(STATES.length, 9); assert.ok(STATES.includes('angry') && !STATES.includes('unfocused'));
  for (const s of STATES) { assert.ok(SCALE[s] && TONIC[s]); for (const k of ['bpm', 'jit', 'sync', 'rest', 'rough', 'trem', 'drive', 'pulse']) assert.ok(Number.isFinite(CUES[s][k]), s + k); }
});
test('the states differ the way the research table says', () => {
  assert.ok(CUES.calm.bpm < CUES.anxious.bpm && CUES.anxious.bpm < CUES.angry.bpm);
  assert.ok(CUES.calm.rough < 0.2 && CUES.angry.rough > 0.8);
  assert.ok(CUES.anxious.trem > CUES.calm.trem && CUES.angry.drive > CUES.calm.drive);
  assert.ok(CUES.anxious.rest > CUES.angry.rest, 'anxious stops and starts, angry drives');
});
test('nothing moves before the first window opens, and everything has arrived by the end', () => {
  const a = cuesAt('angry', 'calm', 0), b = cuesAt('angry', 'calm', 0.03), z = cuesAt('angry', 'calm', 1);
  assert.equal(a.bpm, CUES.angry.bpm); assert.ok(Math.abs(b.bpm - a.bpm) < 1);
  assert.ok(Math.abs(z.bpm - CUES.calm.bpm) < 1e-9 && Math.abs(z.rough - CUES.calm.rough) < 1e-9);
});
test('cues move one group at a time: the tempo is well on its way before the pitch set starts to change', () => {
  const w = windows(0.45); assert.ok(w.tempo > 0.6 && w.harm === 0);
  assert.ok(WINDOWS.harm[0] > WINDOWS.tempo[0] && WINDOWS.harm[1] > WINDOWS.tex[1]);
});
test('tempo, roughness and the tonic change smoothly, without jumps', () => {
  let prev = cuesAt('angry', 'calm', 0), prevT = tonicAt('angry', 'calm', 0);
  for (let i = 1; i <= 300; i++) { const c = cuesAt('angry', 'calm', i / 300), t = tonicAt('angry', 'calm', i / 300); assert.ok(Math.abs(c.bpm - prev.bpm) < 2.5, 'bpm'); assert.ok(Math.abs(c.rough - prev.rough) < 0.03, 'rough'); assert.ok(Math.abs(t - prevT) < 0.8, 'tonic'); prev = c; prevT = t; }
});
test('the pitch set passes through shared notes: the tonic and anything both states have never drop out', () => {
  for (const [a, b] of [['angry', 'calm'], ['anxious', 'grounded'], ['overwhelmed', 'alert']]) {
    const shared = [...Array(12).keys()].filter(i => SCALE[a].map(x => x % 12).includes(i) && SCALE[b].map(x => x % 12).includes(i));
    for (let p = 0; p <= 1; p += 0.05) { const w = weightsAt(a, b, p); for (const i of shared) assert.ok(w[i] > 0.9, `${a}->${b} ${i} @${p}`); }
  }
});
test('the pulse follows the tempo glide, drifts a little and is never a clock', () => {
  const b = pulseBeats(mk(4), 'angry', 'calm'), iv = b.slice(1).map((t, i) => t - b[i]);
  assert.ok(iv[0] < 0.55 && iv[iv.length - 1] > 1.0, 'slows down');
  const early = iv.slice(0, 20); assert.ok(new Set(early.map(x => x.toFixed(3))).size > 15, 'not identical intervals');
  assert.deepEqual(pulseBeats(mk(4), 'angry', 'calm'), b, 'seeded');
});
test('pulse hits: one per beat, syncopated ticks only where the state is syncopated', () => {
  const beats = pulseBeats(mk(1), 'angry', 'angry'), hits = pulseHits(mk(1), 'angry', 'angry', 300, beats);
  assert.equal(hits.filter(h => h.kind === 'thump').length, beats.length);
  const calm = pulseHits(mk(1), 'grounded', 'grounded', 300, pulseBeats(mk(1), 'grounded', 'grounded'));
  assert.ok(hits.filter(h => h.kind === 'tick').length / beats.length > 0.3 && calm.filter(h => h.kind === 'tick').length / calm.length < 0.1);
});
test('roughness runs from a slow shimmer to a buzz', () => { assert.ok(beatHz(0) < 0.2 && beatHz(1) > 20 && beatHz(0.5) > beatHz(0.2)); });
test('wording claims nothing about the body', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../assets/js/regulation/cues.js', import.meta.url), 'utf8');
  assert.ok(!/nervous system|vagal|cortisol|heart rate/i.test(src.replace(/Nothing here claims an effect on the body/, '')));
});
