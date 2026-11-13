/**
 * /assets/js/neural/inspect.js
 * What the inspector shows about one neuron or one connection. Pure: it reads the network and returns plain data.
 */
import { ACTIVATIONS, DEGREES } from './net.js';

export const LAYER_NAMES = ['Input', 'Hidden 1', 'Hidden 2', 'Output'];
const DEG = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** Which kind of neuron this is, and what its number does in the sound. */
export function roleOf(net, layer, i) {
  const last = net.sizes.length - 1;
  if (layer === 0) return { type: 'Input neuron', short: `input ${i + 1}`, sound: 'An input does not make sound itself. It is one coordinate of a point that wanders slowly through space and never repeats. Every other neuron is ultimately listening to these six numbers.' };
  if (layer === 1) return { type: 'Hidden neuron', short: `hidden 1, neuron ${i + 1}`, sound: `Its activation sets the loudness of harmonic number ${[1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 27][i]} of the drone. Louder means the network is more strongly responding to its inputs in this way.` };
  if (layer === 2) return { type: 'Hidden neuron', short: `hidden 2, neuron ${i + 1}`, sound: `Its activation sets one of the shimmering upper partials (number ${i + 1} of ${net.sizes[2]}), both its loudness and its place in the stereo field. The partials are stretched out of tune when the network is far from its target.` };
  if (i < DEGREES) return { type: 'Output neuron (note)', short: `output ${i + 1}: the ${DEG[i]} scale degree`, sound: `Its activation says how strongly the network wants the ${DEG[i]} note of the scale. The seven note outputs are turned into probabilities, and one is drawn each time a note sounds. The goal pushes it toward +0.9 when that note is in the target chord and -0.9 when it is not.` };
  return { type: 'Output neuron (gate)', short: 'output 8: the gate', sound: 'The gate says how willing the network is to play a note at all. Near -1 the music goes quiet; near +1 it plays often. It follows a target that drifts slowly, together with the slow density cycle.' };
}

/** Everything about one neuron: where it sits, what it listens to, how it weighs it, and what it says. */
export function describeNeuron(net, acts, layer, i, target = null) {
  const role = roleOf(net, layer, i), info = { layer, index: i, layerName: LAYER_NAMES[layer], ...role, muted: !!net.mute[layer][i], frozen: !!net.frozen[layer][i], activation: acts[layer][i] };
  if (layer === 0) return { ...info, incoming: [], sum: null, bias: null, fn: null };
  const l = layer - 1, fnName = layer === net.sizes.length - 1 ? 'tanh' : net.act[l], fn = ACTIVATIONS[fnName];
  const incoming = net.W[l][i].map((w, k) => ({ from: k, weight: w, alive: !!net.M[l][i][k], input: acts[l][k], product: net.M[l][i][k] ? w * acts[l][k] : 0 }));
  const sum = incoming.reduce((s, r) => s + r.product, 0) + net.B[l][i];
  return { ...info, incoming, bias: net.B[l][i], sum, fn: { name: fnName, label: fn.label, range: fn.range, about: fn.about, z: net.z && net.z[layer] ? net.z[layer][i] : sum },
    target: layer === net.sizes.length - 1 && target ? target[i] : null,
    outgoing: layer < net.sizes.length - 1 ? net.W[layer].map((row, j) => ({ to: j, weight: row[i], alive: !!net.M[layer][j][i] })) : [] };
}

/** One connection: from neuron i in `layer` to neuron j in the next. */
export function describeConnection(net, acts, layer, j, i) {
  const w = net.W[layer][j][i], x = acts[layer][i];
  return { layer, from: i, to: j, fromLayer: LAYER_NAMES[layer], toLayer: LAYER_NAMES[layer + 1], weight: w, alive: !!net.M[layer][j][i], input: x, product: net.M[layer][j][i] ? w * x : 0 };
}

/** The sentence that says what a weight does. */
export function explainWeight(w) {
  const a = Math.abs(w);
  const size = a < 0.15 ? 'barely listens to' : a < 0.6 ? 'listens a little to' : a < 1.2 ? 'listens closely to' : 'is dominated by';
  return w >= 0 ? `A positive weight: this neuron ${size} that one, and rises when it rises.` : `A negative weight: this neuron ${size} that one, but does the opposite: it falls when that one rises.`;
}
