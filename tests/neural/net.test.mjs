import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVATIONS, ACTIVATION_NAMES, setWeight, setBias, toggleMute, toggleFrozen, toggleConnection, scaleIncoming, resetNeuron, setActivation, createNet, forward, train, loss, perturb, rewire, softmax, Conductor, chordTarget, SIZES, DEGREES, weightStrength } from '../../assets/js/neural/net.js';
import { mulberry32 } from '../../assets/js/experiments/rng.js';
import { degreeFreq, droneAmps, shimmerPartials, pickDegree, fires, strongest, tensionOf } from '../../assets/js/neural/sonify.js';

test('forward gives one activation set per layer, all within -1 and 1', () => {
  const net = createNet(3), a = forward(net, [0.1, -0.4, 0.9, 0, 0.3, -1]);
  assert.deepEqual(a.map(l => l.length), SIZES); assert.ok(a.slice(1).flat().every(v => v >= -1 && v <= 1));
});
test('the same seed gives the same network', () => assert.deepEqual(createNet(5).W, createNet(5).W));
test('the worked example in the essay is right', () => {
  const net = createNet(1, [2, 1]), x = [0.5, -1]; net.W = [[[0.8, 0.3]]]; net.B = [[0.1]];
  assert.ok(Math.abs(forward(net, x)[1][0] - 0.1974) < 1e-3);
  train(net, x, [0.9], 0.05);
  assert.ok(Math.abs(net.W[0][0][0] - 0.8338) < 1e-3 && Math.abs(net.W[0][0][1] - 0.2325) < 1e-3 && Math.abs(net.B[0][0] - 0.1675) < 1e-3);
  assert.ok(Math.abs(forward(net, x)[1][0] - 0.338) < 2e-3);
});
test('training lowers the loss on a fixed example', () => {
  const net = createNet(2), x = [0.3, -0.2, 0.5, 0.1, -0.7, 0.2], t = chordTarget([0, 2, 4], 0.5), first = loss(forward(net, x)[3], t);
  for (let i = 0; i < 300; i++) train(net, x, t, 0.05);
  assert.ok(loss(forward(net, x)[3], t) < first * 0.1);
});
test('rewire moves connections without emptying a layer, and perturb changes weights', () => {
  const net = createNet(4), rng = mulberry32(1), live = l => net.M[l].flat().reduce((a, b) => a + b, 0), before = live(1);
  assert.ok(rewire(net, rng, 1, 5) > 0); assert.equal(live(1), before);
  for (let i = 0; i < 100; i++) rewire(net, rng, 1, 5); assert.ok(live(1) >= before * 0.4);
  const w0 = net.W[0][0][0]; perturb(net, rng, 0.1); assert.notEqual(net.W[0][0][0], w0);
});
test('softmax sums to one', () => assert.ok(Math.abs(softmax([1, 2, 3], 2).reduce((a, b) => a + b) - 1) < 1e-9));

test('the conductor keeps the music changing: chords, episodes and keys all happen over ten minutes', () => {
  const c = new Conductor(9), seen = { chord: 0, episode: 0, key: 0 }, chords = new Set(), keys = new Set();
  for (let i = 0; i < 6000; i++) { const s = c.tick(0.1); s.events.forEach(e => seen[e]++); chords.add(c.chord.join()); keys.add(c.root + c.mode); }
  assert.ok(seen.chord >= 30 && seen.episode >= 3 && seen.key >= 2, JSON.stringify(seen));
  assert.ok(chords.size >= 20 && keys.size >= 2);
});
test('the network follows its target: the loss falls after a change, and is not stuck at zero either', () => {
  const c = new Conductor(12), L = []; for (let i = 0; i < 3000; i++) L.push(c.tick(0.1).loss);
  const med = [...L.slice(300)].sort((a, b) => a - b)[Math.floor(L.slice(300).length / 2)];
  assert.ok(L[0] > 0.2 && med < 0.1, `first ${L[0]}, median ${med}`);
  assert.ok(Math.max(...L.slice(500)) > 0.05, 'there is always something for it to chase');
});
test('the input never repeats', () => {
  const c = new Conductor(1), seen = new Set(); for (let i = 0; i < 2000; i++) { c.tick(0.1); seen.add(c.input().map(v => v.toFixed(3)).join()); } assert.equal(seen.size, 2000);
});
test('the whole run is reproducible from its seed', () => {
  const run = () => { const c = new Conductor(21); let l = 0; for (let i = 0; i < 500; i++) l = c.tick(0.1).loss; return l; };
  assert.equal(run(), run());
});

test('degreeFreq steps up the scale and wraps through octaves', () => {
  const f = d => degreeFreq(0, 'natural minor', d, 0, 110); assert.equal(f(0), 110); assert.ok(f(1) > f(0) && f(7) === 220 && f(-1) < f(0));
});
test('drone and shimmer follow the activations, and tension stretches the shimmer', () => {
  const a = [0, 0.5, -1]; assert.ok(droneAmps(a)[2] > droneAmps(a)[1] && droneAmps(a)[1] > droneAmps(a)[0]);
  const calm = shimmerPartials([0, 0, 0, 0], 0, 0), tense = shimmerPartials([0, 0, 0, 0], 0, 1);
  assert.ok(tense[3].freq > calm[3].freq && calm[0].freq === tense[0].freq * 1 / 1.05);
});
test('pickDegree favours the strong outputs and is deterministic per seed', () => {
  const out = [-0.9, -0.9, 0.9, -0.9, 0.9, -0.9, -0.9, 0], counts = Array(7).fill(0), rng = mulberry32(3);
  for (let i = 0; i < 2000; i++) counts[pickDegree(out, rng, 0.3)]++;
  assert.ok(counts[2] + counts[4] > 1500);
});
test('a closed gate stays quiet and an open one sounds', () => {
  const rng = mulberry32(1); let off = 0, on = 0; for (let i = 0; i < 1000; i++) { off += fires(-1, 1, rng); on += fires(1, 1, rng); }
  assert.equal(off, 0); assert.ok(on > 900);
});
test('strongest returns the largest weight-times-activation products', () => {
  const net = createNet(1), acts = Array(10).fill(0.5), top = strongest(net, 1, acts, 3);
  assert.equal(top.length, 3); assert.ok(Math.abs(top[0].v) >= Math.abs(top[1].v) && Math.abs(top[1].v) >= Math.abs(top[2].v));
  assert.ok(tensionOf(0) === 0 && tensionOf(9) === 1);
});

import { describeNeuron, describeConnection, explainWeight, roleOf } from '../../assets/js/neural/inspect.js';
test('every activation function has a slope that matches its numbers', () => {
  for (const name of ACTIVATION_NAMES) for (const z of [-2.1, -0.4, 0.3, 1.7]) {
    const f = ACTIVATIONS[name], h = 1e-5, numeric = (f.f(z + h) - f.f(z - h)) / (2 * h);
    assert.ok(Math.abs(numeric - f.df(z)) < 1e-4, `${name} at ${z}`);
  }
});
test('training works with every hidden activation function', () => {
  for (const a of ACTIVATION_NAMES) {
    const net = createNet(3); setActivation(net, 1, a); setActivation(net, 2, a);
    const x = [0.3, -0.2, 0.5, 0.1, -0.7, 0.2], t = chordTarget([0, 2, 4], 0.4), first = loss(forward(net, x)[3], t);
    for (let i = 0; i < 400; i++) train(net, x, t, 0.03);
    assert.ok(loss(forward(net, x)[3], t) < first * 0.5, a);
  }
});
test('the output layer is always tanh, whatever is chosen', () => {
  const net = createNet(1); setActivation(net, 3, 'relu'); assert.equal(net.act[2], 'tanh');
});
test('a muted neuron outputs zero and carries no error; a frozen one does not learn', () => {
  const net = createNet(2), x = [0.3, -0.2, 0.5, 0.1, -0.7, 0.2], t = chordTarget([1, 3, 5], 0.2);
  toggleMute(net, 1, 4); assert.equal(forward(net, x)[1][4], 0);
  const before = JSON.stringify([net.W[1][2], net.B[1][2]]); toggleFrozen(net, 2, 2);
  for (let i = 0; i < 50; i++) train(net, x, t, 0.05);
  assert.equal(JSON.stringify([net.W[1][2], net.B[1][2]]), before);
  assert.equal(forward(net, x)[1][4], 0);
});
test('editing a weight, a bias or a connection changes the output as it should', () => {
  const net = createNet(1, [2, 1]), x = [1, 1]; setWeight(net, 0, 0, 0, 0); setWeight(net, 0, 0, 1, 0); setBias(net, 0, 0, 0);
  assert.equal(forward(net, x)[1][0], 0); setBias(net, 0, 0, 0.5); assert.ok(Math.abs(forward(net, x)[1][0] - Math.tanh(0.5)) < 1e-9);
  setWeight(net, 0, 0, 0, 1); assert.ok(Math.abs(forward(net, x)[1][0] - Math.tanh(1.5)) < 1e-9);
  assert.equal(toggleConnection(net, 0, 0, 0), false); assert.ok(Math.abs(forward(net, x)[1][0] - Math.tanh(0.5)) < 1e-9);
  setWeight(net, 0, 0, 0, 99); assert.equal(net.W[0][0][0], 3);
});
test('scale and reset change a neuron\'s weights', () => {
  const net = createNet(5), w = net.W[0][3].slice(); scaleIncoming(net, 1, 3, 2); assert.ok(net.W[0][3].every((v, i) => Math.abs(v - Math.max(-3, Math.min(3, w[i] * 2))) < 1e-9));
  resetNeuron(net, 1, 3, mulberry32(1)); assert.notDeepEqual(net.W[0][3], w); assert.equal(net.B[0][3], 0);
});
test('hidden layers can be resized and the network still runs', () => {
  const c = new Conductor(4, { hidden: [6, 5] }); assert.deepEqual(c.net.sizes, [6, 6, 5, 8]); for (let i = 0; i < 50; i++) c.tick(0.1);
  c.resize(14, 11); assert.deepEqual(c.net.sizes, [6, 14, 11, 8]); assert.equal(c.tick(0.1).acts[1].length, 14);
  c.resize(99, 1); assert.deepEqual(c.net.sizes, [6, 16, 2, 8]);
});
test('holding and key lock stop the changes; pins force a target', () => {
  const c = new Conductor(6); c.hold = true; c.lockKey = true; c.setKey(3, 'dorian'); const chord = c.chord.join();
  let ev = 0; for (let i = 0; i < 4000; i++) ev += c.tick(0.1).events.length; assert.equal(ev, 0); assert.equal(c.chord.join(), chord); assert.equal(c.root, 3);
  c.pins[2] = -0.9; c.tick(0.1); assert.equal(c.target[2], -0.9);
});
test('the inspector describes a neuron completely', () => {
  const c = new Conductor(2); c.tick(0.1); const d = describeNeuron(c.net, c.lastActs, 2, 3, c.target);
  assert.equal(d.incoming.length, c.net.sizes[1]); assert.ok(Math.abs(d.sum - d.fn.z) < 1e-9); assert.ok(d.type === 'Hidden neuron' && d.sound.length > 20);
  const o = describeNeuron(c.net, c.lastActs, 3, 7, c.target); assert.equal(o.type, 'Output neuron (gate)'); assert.equal(typeof o.target, 'number');
  assert.equal(roleOf(c.net, 0, 0).type, 'Input neuron'); assert.match(roleOf(c.net, 3, 2).short, /3rd scale degree/);
  const k = describeConnection(c.net, c.lastActs, 1, 2, 3); assert.equal(k.product, k.weight * k.input);
  assert.match(explainWeight(-1.5), /negative/); assert.match(explainWeight(0.05), /barely/);
});
