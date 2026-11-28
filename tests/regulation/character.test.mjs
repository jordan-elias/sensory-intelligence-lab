import test from 'node:test'; import assert from 'node:assert/strict';
import { SCALE, VOICE, COLOR, TONIC, voiceAt, melodyEvents, blendColor } from '../../assets/js/regulation/character.js';
import { tonicAt, weightsAt, pulseBeats } from '../../assets/js/regulation/cues.js';
function mk(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const STATES = Object.keys(VOICE);

test('every state has a scale, voice, tone colour and tonic', () => {
  for (const s of STATES) { assert.ok(SCALE[s].length >= 3 && VOICE[s] && COLOR[s] && TONIC[s], s); }
  assert.equal(STATES.length, 9);
});
test('journeys are deterministic for a seed and different across seeds', () => {
  const a = melodyEvents(mk(5), 'anxious', 'calm'), b = melodyEvents(mk(5), 'anxious', 'calm'), c = melodyEvents(mk(6), 'anxious', 'calm');
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
});
test('all events are in time, in range, and audible but quiet', () => {
  for (const [c, t] of [['overwhelmed', 'calm'], ['tired', 'energized'], ['overstim', 'grounded']]) {
    const ev = melodyEvents(mk(3), c, t);
    assert.ok(ev.length > 5);
    for (const e of ev) { assert.ok(e.t >= 4 && e.t < 290, 't'); assert.ok(e.freq > 30 && e.freq < 3200, 'freq'); assert.ok(e.amp > 0 && e.amp < 0.2, 'amp'); assert.ok(Math.abs(e.pan) <= 1, 'pan'); assert.ok(e.att <= e.dur); }
  }
});
test('notes belong to the pitch set in use at that moment, measured from the tonic the drone has at that moment', () => {
  for (const [c, t] of [['anxious', 'calm'], ['tired', 'alert'], ['angry', 'grounded']]) for (const e of melodyEvents(mk(9), c, t)) {
    const ton = tonicAt(c, t, e.t / 300), w = weightsAt(c, t, e.t / 300), semi = Math.round(12 * Math.log2(e.freq / ton)), pcs = ((semi % 12) + 12) % 12;
    assert.ok(w[pcs] > 0.02, `${c}->${t} at ${e.t.toFixed(0)}s pc ${pcs}`);
  }
});
test('the journey moves from the current state to the target, and the first and last stretches stay in their own scale', () => {
  const ev = melodyEvents(mk(11), 'overwhelmed', 'calm'), early = ev.filter(e => e.t < 60), late = ev.filter(e => e.t > 240);
  const share = (list, st) => list.filter(e => e.from === st).length / list.length;
  assert.ok(share(early, 'overwhelmed') > 0.5 && share(late, 'calm') > 0.7);
  for (const e of early) assert.ok(SCALE.overwhelmed.map(x => x % 12).includes(((Math.round(12 * Math.log2(e.freq / tonicAt('overwhelmed', 'calm', e.t / 300))) % 12) + 12) % 12));
});
test('the notes are loose around the pulse, not quantised to it', () => {
  const beats = pulseBeats(mk(2), 'anxious', 'anxious', 300, { start: 4, end: 10 }), ev = melodyEvents(mk(2), 'anxious', 'anxious');
  const off = ev.map(e => { const b = beats[e.beat]; return (e.t - b) / (60 / 104); });
  assert.ok(new Set(off.map(x => x.toFixed(4))).size > off.length * 0.6, 'varied offsets');
  assert.ok(off.some(x => x < -0.05) && off.some(x => x > 0.05), 'early and late');
});
test('states are clearly different: busy states play many short notes, quiet ones few long notes', () => {
  const stat = s => { const ev = melodyEvents(mk(2), s, s); return { n: ev.length, len: ev.reduce((a, e) => a + e.dur, 0) / ev.length }; };
  const busy = stat('energized'), still = stat('grounded'), calm = stat('calm'), over = stat('overstim');
  assert.ok(busy.n > 8 * still.n && over.n > 8 * calm.n);
  assert.ok(still.len > 5 * busy.len && calm.len > 5 * over.len);
});
test('registers differ: grounded sits lower than overstimulated', () => {
  const mean = s => { const ev = melodyEvents(mk(4), s, s); return ev.reduce((a, e) => a + Math.log2(e.freq), 0) / ev.length; };
  assert.ok(mean('overstim') > mean('grounded') + 1.5);
});
test('tone colour and echo glide between the two ends', () => {
  const mid = blendColor('overwhelmed', 'calm', 0.5);
  assert.ok(mid[3] < COLOR.overwhelmed[3] && mid[3] > COLOR.calm[3]);
  assert.ok(voiceAt('anxious', 'calm', 0).echo < voiceAt('anxious', 'calm', 0.5).echo && voiceAt('anxious', 'calm', 0.5).echo < voiceAt('anxious', 'calm', 1).echo);
});
test('wording of the module claims nothing about the body', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../assets/js/regulation/character.js', import.meta.url), 'utf8');
  assert.ok(!/nervous system|vagal|cortisol|heart rate/i.test(src.replace(/Nothing here claims an effect on the body/, '')));
});
