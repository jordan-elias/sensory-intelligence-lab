import test from 'node:test';
import assert from 'node:assert/strict';
import { inputsAt, renderCycle, harmonics, dcOf, WAVES, WAVE_NAMES, teachWave, makeInstrument, scaleAll, pack, packedForward, TAU } from '../../assets/js/neural/synth.js';
import { forward, ACTIVATIONS, setActivation, toggleMute, toggleConnection } from '../../assets/js/neural/net.js';
import { mulberry32 } from '../../assets/js/experiments/rng.js';

const ACT = Object.fromEntries(Object.entries(ACTIVATIONS).map(([k, v]) => [k, v.f]));
test('the inputs are a sine and cosine pair, their doubles, and the two knobs', () => {
  const x = inputsAt(0.25, 0.3, -0.5); assert.equal(x.length, 6); assert.ok(Math.abs(x[0] - 1) < 1e-9 && Math.abs(x[1]) < 1e-9); assert.deepEqual(x.slice(4), [0.3, -0.5]);
});
test('a cycle has the requested length, every sample in range, and repeats seamlessly at the join', () => {
  const net = makeInstrument(3), c = renderCycle(net, 0.2, -0.1, 128);
  assert.equal(c.length, 128); assert.ok([...c].every(v => v >= -1 && v <= 1));
  const wrap = Math.abs(forward(net, inputsAt(1, 0.2, -0.1))[3][0] - c[0]); assert.ok(wrap < 1e-5, 'phase 1 must equal phase 0');
});
test('harmonics of a pure sine and a square wave are what they should be', () => {
  const n = 512, sine = Float32Array.from({ length: n }, (_, k) => Math.sin(TAU * k / n)), sq = Float32Array.from({ length: n }, (_, k) => (k < n / 2 ? 1 : -1));
  const hs = harmonics(sine, 8); assert.ok(Math.abs(hs[0] - 1) < 1e-6 && hs.slice(1).every(v => v < 1e-6));
  const hq = harmonics(sq, 8); assert.ok(hq[0] > 1.2 && hq[1] < 1e-6 && Math.abs(hq[2] / hq[0] - 1 / 3) < 0.01 && hq[3] < 1e-6);
  assert.ok(Math.abs(dcOf(Float32Array.from([1, 1, 1, 1])) - 1) < 1e-9);
});
test('an odd function of a symmetric wave makes only odd harmonics; a bias brings the even ones', () => {
  const n = 512, drive = x => Math.tanh(3 * x), sine = Float32Array.from({ length: n }, (_, k) => Math.sin(TAU * k / n));
  const odd = harmonics(sine.map(drive), 8); assert.ok(odd[1] < 1e-6 && odd[3] < 1e-6 && odd[2] > 0.01);
  const even = harmonics(sine.map(v => drive(v + 0.4)), 8); assert.ok(even[1] > 0.01);
});
test('every target wave stays in range and repeats', () => { for (const n of WAVE_NAMES) { for (const p of [0, 0.13, 0.5, 0.77, 0.999]) assert.ok(Math.abs(WAVES[n](p)) <= 1.0001, n); assert.ok(Math.abs(WAVES[n](0) - WAVES[n](1)) < 1e-6 || n === 'saw' || n === 'square' || n === 'pulse', n); } });
test('teaching a wave lowers the error, and the network then produces something close to it', () => {
  for (const wave of ['sine', 'triangle', 'square']) {
    const net = makeInstrument(5), rng = mulberry32(2); let first = null, last = 0;
    for (let i = 0; i < 400; i++) { last = teachWave(net, wave, 0, 0, 0.05, 40, rng); if (first == null) first = last; }
    assert.ok(last < first * 0.5, `${wave}: ${first} -> ${last}`);
  }
});
test('the activation function changes the sound: the harmonic content differs', () => {
  const a = makeInstrument(8), b = makeInstrument(8); setActivation(b, 1, 'sine'); setActivation(b, 2, 'sine');
  const ha = harmonics(renderCycle(a, 0, 0, 256), 12), hb = harmonics(renderCycle(b, 0, 0, 256), 12);
  assert.ok(ha.some((v, i) => Math.abs(v - hb[i]) > 0.02));
});
test('scaling the weights up adds harmonics', () => {
  const a = makeInstrument(4, undefined, 0.6), b = makeInstrument(4, undefined, 0.6); scaleAll(b, 3);
  const energy = h => h.slice(2).reduce((s, v) => s + v * v, 0), ha = harmonics(renderCycle(a, 0, 0, 256), 16), hb = harmonics(renderCycle(b, 0, 0, 256), 16);
  assert.ok(energy(hb) > energy(ha));
});
test('the packed one-sample pass the worklet uses matches the real network, including muted neurons and cut connections', () => {
  const net = makeInstrument(9); setActivation(net, 1, 'relu'); setActivation(net, 2, 'softsign'); toggleMute(net, 2, 3); toggleConnection(net, 1, 2, 4);
  const p = pack(net); for (const ph of [0, 0.2, 0.61, 0.93]) { const x = inputsAt(ph, 0.3, -0.4), want = forward(net, x)[3], got = packedForward(p, x, ACT); assert.ok(want.every((v, i) => Math.abs(v - got[i]) < 1e-5), `phase ${ph}`); }
});
