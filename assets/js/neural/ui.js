/**
 * /assets/js/neural/ui.js
 * The interactive parts of the network page: choosing a neuron or a connection, seeing exactly how it computes,
 * changing it, and adjusting the network. Everything it shows is read from the live network.
 */
import { ACTIVATIONS, ACTIVATION_NAMES, MAX_HIDDEN, MODES, setWeight, setBias, toggleConnection, toggleMute, toggleFrozen, scaleIncoming, resetNeuron, setActivation } from './net.js';
import { describeNeuron, describeConnection, explainWeight, LAYER_NAMES } from './inspect.js';
import { hitTest } from './draw.js';
import { neuronCycle } from './synth.js';
import { mulberry32 } from '../experiments/rng.js';
import { NODE_TYPES, ACTIVATION_INFO, LARGER_UNITS } from './node-types.js';

const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k.startsWith('on')) e[k] = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const fill = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));
const f2 = v => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));
const colour = v => { const a = Math.min(1, Math.abs(v) / 1.5); return v >= 0 ? `rgba(42,92,69,${0.08 + 0.7 * a})` : `rgba(190,90,40,${0.08 + 0.7 * a})`; };

/** One cycle of a wave as a line, with the current phase marked and an optional target wave dashed behind it. */
export function plotCycle(canvas, wave, phase = null, target = null) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 300, hgt = canvas.clientHeight || 110;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  let hi = 1.05; for (const v of wave) hi = Math.max(hi, Math.abs(v) * 1.05);
  const Y = v => hgt / 2 - (v / hi) * (hgt / 2 - 4), X = k => (k / (wave.length - 1)) * w;
  g.strokeStyle = '#d5d5cf'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
  if (target) { g.strokeStyle = '#b4532a'; g.setLineDash([4, 3]); g.beginPath(); for (let k = 0; k < target.length; k++) { const x = (k / (target.length - 1)) * w; k ? g.lineTo(x, Y(target[k])) : g.moveTo(x, Y(target[k])); } g.stroke(); g.setLineDash([]); }
  g.strokeStyle = '#2a5c45'; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < wave.length; k++) k ? g.lineTo(X(k), Y(wave[k])) : g.moveTo(X(k), Y(wave[k])); g.stroke();
  if (phase != null) { const k = phase * (wave.length - 1); g.strokeStyle = '#111'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(k), 0); g.lineTo(X(k), hgt); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(X(k), Y(wave[Math.round(k)]), 3.5, 0, 6.283); g.fill(); }
}

/** A small plot of an activation function with the neuron's current input and output marked. */
export function plotFunction(canvas, name, z = null) {
  const f = ACTIVATIONS[name].f, dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 220, hgt = canvas.clientHeight || 110;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  const X = v => ((v + 4) / 8) * w, ys = [-4, 4].map(f), lo = Math.min(-1.2, ...ys, -1), hi = Math.max(1.2, ...ys, 1), Y = v => hgt - ((v - lo) / (hi - lo)) * hgt;
  g.strokeStyle = '#d5d5cf'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.moveTo(X(0), 0); g.lineTo(X(0), hgt); g.stroke();
  g.strokeStyle = '#2a5c45'; g.lineWidth = 2; g.beginPath(); for (let px = 0; px <= w; px += 2) { const zz = (px / w) * 8 - 4; px ? g.lineTo(px, Y(f(zz))) : g.moveTo(px, Y(f(zz))); } g.stroke();
  if (z != null && Number.isFinite(z)) { const zc = Math.max(-4, Math.min(4, z)); g.strokeStyle = '#b4532a'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(zc), hgt); g.lineTo(X(zc), Y(f(zc))); g.lineTo(0, Y(f(zc))); g.stroke(); g.setLineDash([]); g.fillStyle = '#b4532a'; g.beginPath(); g.arc(X(zc), Y(f(zc)), 4, 0, 6.283); g.fill(); }
  g.fillStyle = '#6b6b6b'; g.font = '10px sans-serif'; g.fillText('input sum (z) →', w - 78, Y(0) - 4); g.fillText('output', 4, 11);
}

export function mountUI({ engine, canvas, state, onSelect }) {
  const c = () => engine.conductor, net = () => c().net;
  const sel = state.sel = state.sel || null;
  const pickLayer = document.getElementById('nnPickLayer'), pickNeuron = document.getElementById('nnPickNeuron');
  const panel = document.getElementById('nnInspector'), wTable = document.getElementById('nnWeights'), wLayer = document.getElementById('nnWLayer');
  let live = null;                                       // refreshers for the current selection

  // ── choosing ──
  const fillNeurons = () => { const l = +pickLayer.value; pickNeuron.replaceChildren(...Array.from({ length: net().sizes[l] }, (_, i) => h('option', { value: i }, `${i + 1}`))); };
  const choose = s => { state.sel = s; onSelect && onSelect(s); if (s && s.kind === 'node') { pickLayer.value = s.layer; fillNeurons(); pickNeuron.value = s.i; showNeuron(s.layer, s.i); } else if (s && s.kind === 'edge') { showEdge(s.layer, s.j, s.i); } else { panel.replaceChildren(h('p', { class: 'nn-hint' }, 'Select a neuron on the picture, or use the lists above, to see how it computes and to change it.')); live = null; } };
  pickLayer.onchange = () => { fillNeurons(); choose({ kind: 'node', layer: +pickLayer.value, i: 0 }); };
  pickNeuron.onchange = () => choose({ kind: 'node', layer: +pickLayer.value, i: +pickNeuron.value });
  canvas.addEventListener('click', e => { const r = canvas.getBoundingClientRect(); const hit = hitTest(canvas, net(), e.clientX - r.left, e.clientY - r.top); choose(hit ? { kind: hit.kind, layer: hit.layer, i: hit.i, j: hit.j } : null); document.getElementById('tabNeuron').click(); });

  // ── the neuron inspector ──
  function showNeuron(layer, i) {
    const d = describeNeuron(net(), c().lastActs, layer, i, c().target), isOut = layer === net().sizes.length - 1;
    const act = h('strong', { id: 'nnIAct' }), sum = h('strong', { id: 'nnISum' }), formula = h('p', { class: 'nn-formula', id: 'nnIFormula' });
    const plot = d.fn ? h('canvas', { class: 'nn-plot', id: 'nnIPlot', role: 'img', 'aria-label': `The ${d.fn.label} function with this neuron's current input marked` }) : null;
    const body = d.incoming.length ? h('table', { class: 'nn-tab' }, h('thead', {}, h('tr', {}, ...['From', 'Its output', '× Weight', '= Contribution'].map(t => h('th', { scope: 'col' }, t)))), h('tbody', { id: 'nnIRows' })) : null;
    const bias = d.fn ? h('input', { type: 'range', min: -3, max: 3, step: 0.05, value: d.bias, id: 'nnIBias', 'aria-label': 'Bias', oninput: e => setBias(net(), layer - 1, i, +e.target.value) }) : null;
    const controls = d.fn ? h('div', { class: 'nn-ctl' },
      h('label', {}, 'Bias ', bias), h('div', { class: 'nn-row' },
        h('button', { type: 'button', class: 'nn-btn nn-btn--sm', id: 'nnLouder', onclick: () => scaleIncoming(net(), layer, i, 1.25) }, 'Listen louder ×1.25'),
        h('button', { type: 'button', class: 'nn-btn nn-btn--sm nn-btn--alt', id: 'nnQuieter', onclick: () => scaleIncoming(net(), layer, i, 0.8) }, 'Listen quieter ×0.8'),
        h('button', { type: 'button', class: 'nn-btn nn-btn--sm nn-btn--alt', id: 'nnResetN', onclick: () => resetNeuron(net(), layer, i, mulberry32((Math.random() * 1e9) | 0)) }, 'Reset this neuron'))) : null;
    const flags = h('div', { class: 'nn-row' },
      h('label', {}, h('input', { type: 'checkbox', id: 'nnMute', checked: d.muted, onchange: () => toggleMute(net(), layer, i) }), ' Silence this neuron (output forced to 0)'),
      layer > 0 ? h('label', {}, h('input', { type: 'checkbox', id: 'nnFreeze', checked: d.frozen, onchange: () => toggleFrozen(net(), layer, i) }), ' Freeze learning for this neuron') : null);
    let pin = null;
    if (isOut) { pin = h('label', {}, 'Teach it: ', h('select', { id: 'nnPin', onchange: e => { const v = e.target.value; if (v === 'auto') delete c().pins[i]; else c().pins[i] = +v; } },
      h('option', { value: 'auto' }, 'follow the chord'), h('option', { value: '0.9' }, 'always on (+0.9)'), h('option', { value: '-0.9' }, 'always off (-0.9)'))); pin.querySelector('select').value = c().pins[i] == null ? 'auto' : String(c().pins[i]); }
    const cyc = engine.mode === 'inst' && layer > 0 ? h('canvas', { class: 'nn-plot nn-cycle', id: 'nnICycle', role: 'img', 'aria-label': 'This neuron over one cycle of the wave, with the current position marked' }) : null;
    fill(panel,
      h('h4', { class: 'nn-h4' }, `${LAYER_NAMES[layer]}, neuron ${i + 1}`, h('span', { class: 'nn-badge' }, d.type)),
      h('p', {}, d.sound),
      h('div', { class: 'nn-nums' }, h('div', {}, act, 'Activation'), d.fn ? h('div', {}, sum, 'Weighted sum + bias (z)') : null, d.fn ? h('div', {}, h('strong', {}, d.fn.label), 'Activation function') : null, isOut ? h('div', {}, h('strong', { id: 'nnITarget' }), 'Target') : null),
      d.fn ? formula : null, plot, cyc ? h('p', { class: 'nn-hint' }, 'This neuron over one cycle of the wave (the dot is where the cycle is now). The next layer builds the sound out of shapes like this.') : null, cyc, d.fn ? h('p', { class: 'nn-hint' }, d.fn.about) : null, body, controls, flags, pin,
      d.outgoing && d.outgoing.length ? h('p', { class: 'nn-hint', id: 'nnIOut' }) : null);
    live = () => {
      const dd = describeNeuron(net(), c().lastActs, layer, i, c().target);
      if (cyc) plotCycle(cyc, neuronCycle(net(), layer, i, engine.a || 0, engine.b || 0), engine.phase || 0);
      act.textContent = f2(dd.activation); if (dd.fn) { sum.textContent = f2(dd.fn.z); formula.textContent = `${dd.fn.label}( ${dd.incoming.filter(r => r.alive).map(r => f2(r.product)).join(' + ') || '0'} + bias ${f2(dd.bias)} ) = ${dd.fn.label}( ${f2(dd.fn.z)} ) = ${f2(dd.activation)}`; if (plot) plotFunction(plot, dd.fn.name, dd.fn.z); }
      const rows = document.getElementById('nnIRows');
      if (rows) { const maxP = Math.max(0.05, ...dd.incoming.map(r => Math.abs(r.product)));
        if (rows.children.length !== dd.incoming.length) rows.replaceChildren(...dd.incoming.map((r, k) => h('tr', { class: 'nn-click', tabindex: 0, 'aria-label': `Connection from neuron ${k + 1}. Press to select it.`, onclick: () => choose({ kind: 'edge', layer: layer - 1, j: i, i: k }), onkeydown: e => { if (e.key === 'Enter') choose({ kind: 'edge', layer: layer - 1, j: i, i: k }); } }, h('td', {}), h('td', {}), h('td', {}), h('td', {}))));
        dd.incoming.forEach((r, k) => { const tds = rows.children[k].children; tds[0].textContent = `${LAYER_NAMES[layer - 1]} ${k + 1}`; tds[1].textContent = f2(r.input); tds[2].textContent = r.alive ? `× ${f2(r.weight)}` : 'cut'; tds[2].style.background = r.alive ? colour(r.weight) : 'transparent'; tds[3].textContent = r.alive ? `= ${f2(r.product)}` : '–'; tds[3].style.boxShadow = `inset ${Math.round(60 * Math.abs(r.product) / maxP)}px 0 0 ${r.product >= 0 ? 'rgba(42,92,69,.25)' : 'rgba(190,90,40,.25)'}`; }); }
      if (dd.target != null) document.getElementById('nnITarget').textContent = f2(dd.target);
      const out = document.getElementById('nnIOut'); if (out) { const top = [...dd.outgoing].filter(o => o.alive).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 3); out.textContent = `It feeds ${dd.outgoing.filter(o => o.alive).length} neurons in the next layer; its strongest links go to ${top.map(o => `#${o.to + 1} (${f2(o.weight)})`).join(', ')}.`; }
    };
    live();
  }

  // ── a single connection ──
  function showEdge(layer, j, i) {
    const d = describeConnection(net(), c().lastActs, layer, j, i), num = h('strong', { id: 'nnEW' }), prod = h('strong', { id: 'nnEP' });
    fill(panel,
      h('h4', { class: 'nn-h4' }, `${d.fromLayer} ${i + 1} → ${d.toLayer} ${j + 1}`, h('span', { class: 'nn-badge' }, 'Connection (weight)')),
      h('p', { id: 'nnEExplain' }), h('div', { class: 'nn-nums' }, h('div', {}, num, 'Weight'), h('div', {}, h('strong', { id: 'nnEX' }), 'Sender\'s output'), h('div', {}, prod, 'Contribution (weight × output)')),
      h('label', { class: 'nn-ctl' }, 'Weight ', h('input', { type: 'range', min: -3, max: 3, step: 0.05, id: 'nnEWSlider', value: d.weight, 'aria-label': 'Weight', oninput: e => { if (!net().M[layer][j][i]) toggleConnection(net(), layer, j, i); setWeight(net(), layer, j, i, +e.target.value); } })),
      h('div', { class: 'nn-row' }, h('button', { type: 'button', class: 'nn-btn nn-btn--sm', id: 'nnCut', onclick: () => { toggleConnection(net(), layer, j, i); live(); } }, d.alive ? 'Cut this connection' : 'Restore this connection'),
        h('button', { type: 'button', class: 'nn-btn nn-btn--sm nn-btn--alt', onclick: () => choose({ kind: 'node', layer: layer + 1, i: j }) }, 'Go to the neuron it feeds'),
        h('button', { type: 'button', class: 'nn-btn nn-btn--sm nn-btn--alt', onclick: () => choose({ kind: 'node', layer, i }) }, 'Go to the sender')),
      h('p', { class: 'nn-hint' }, 'Learning keeps adjusting this weight, so a value you set is a nudge, not a lock. Freeze the receiving neuron to hold it.'));
    live = () => { const dd = describeConnection(net(), c().lastActs, layer, j, i); num.textContent = f2(dd.weight); document.getElementById('nnEX').textContent = f2(dd.input); prod.textContent = dd.alive ? f2(dd.product) : 'cut';
      document.getElementById('nnEExplain').textContent = dd.alive ? explainWeight(dd.weight) : 'This connection has been cut, so nothing passes along it.'; document.getElementById('nnCut').textContent = dd.alive ? 'Cut this connection' : 'Restore this connection';
      const s = document.getElementById('nnEWSlider'); if (document.activeElement !== s) s.value = dd.weight; };
    live();
  }

  // ── the weights view ──
  let wBuilt = '';
  function drawWeights() {
    const n = net(), l = +wLayer.value, key = `${l}:${n.sizes.join()}`;
    if (wBuilt !== key) {
      wBuilt = key; const cols = n.sizes[l], rows = n.sizes[l + 1];
      wTable.replaceChildren(h('thead', {}, h('tr', {}, h('th', {}, ''), ...Array.from({ length: cols }, (_, i) => h('th', { scope: 'col' }, `${i + 1}`)))),
        h('tbody', {}, ...Array.from({ length: rows }, (_, j) => h('tr', {}, h('th', { scope: 'row' }, `${j + 1}`), ...Array.from({ length: cols }, (_, i) => h('td', { tabindex: 0, 'data-i': i, 'data-j': j, onclick: () => { choose({ kind: 'edge', layer: l, j, i }); document.getElementById('tabNeuron').click(); }, onkeydown: e => { if (e.key === 'Enter') e.target.click(); } }))))));
    }
    wTable.querySelectorAll('td').forEach(td => { const i = +td.dataset.i, j = +td.dataset.j, w = n.W[l][j][i], alive = n.M[l][j][i]; td.textContent = alive ? f2(w) : '·'; td.style.background = alive ? colour(w) : 'transparent'; td.title = alive ? `From ${LAYER_NAMES[l]} ${i + 1} to ${LAYER_NAMES[l + 1]} ${j + 1}: ${f2(w)}` : 'cut'; });
    document.getElementById('nnWCaption').textContent = `Rows are the ${n.sizes[l + 1]} neurons of ${LAYER_NAMES[l + 1].toLowerCase()} (the receivers); columns are the ${n.sizes[l]} neurons of ${LAYER_NAMES[l].toLowerCase()} (the senders). Green is positive, orange is negative, a dot is a cut connection. Select a cell to inspect and edit it.`;
  }
  wLayer.onchange = () => { wBuilt = ''; drawWeights(); };

  // ── settings ──
  const bind = (id, fn, fmt) => { const el = document.getElementById(id), out = document.getElementById(id + 'V'); const run = () => { const v = +el.value; fn(v); if (out) out.textContent = fmt ? fmt(v) : v; }; el.oninput = run; run(); return el; };
  bind('nnLearn', v => engine.set({ learn: v }), v => v.toFixed(3));
  bind('nnHeat', v => engine.set({ heat: v }), v => v.toFixed(2));
  bind('nnPace', v => engine.set({ pace: v }), v => `${v.toFixed(2)}×`);
  bind('nnAdv', v => engine.set({ adventure: v }), v => v.toFixed(2));
  bind('nnRate', v => engine.set({ noteRate: v }), v => `${v.toFixed(2)}×`);
  bind('nnVol', v => engine.set({ volume: v }), v => v.toFixed(2));
  const sizeChange = () => { c().resize(+document.getElementById('nnH1').value, +document.getElementById('nnH2').value); document.getElementById('nnH1V').textContent = c().sizes[1]; document.getElementById('nnH2V').textContent = c().sizes[2]; wBuilt = ''; pickLayer.value = 0; fillNeurons(); choose(null); drawWeights(); };
  for (const id of ['nnH1', 'nnH2']) { const el = document.getElementById(id); el.max = MAX_HIDDEN[id === 'nnH1' ? 0 : 1]; el.onchange = sizeChange; el.oninput = () => { document.getElementById(id + 'V').textContent = el.value; }; }
  for (const [id, layer] of [['nnAct1', 1], ['nnAct2', 2]]) { const el = document.getElementById(id); el.replaceChildren(...ACTIVATION_NAMES.map(n => h('option', { value: n }, ACTIVATIONS[n].label))); el.value = net().act[layer - 1]; el.onchange = () => { setActivation(net(), layer, el.value); if (state.sel) choose(state.sel); }; }
  document.getElementById('nnHold').onchange = e => { c().hold = e.target.checked; };
  const keyRoot = document.getElementById('nnKeyRoot'), keyMode = document.getElementById('nnKeyMode');
  keyRoot.replaceChildren(...NOTE.map((n, i) => h('option', { value: i }, n))); keyMode.replaceChildren(...MODES.map(m => h('option', { value: m }, m)));
  const applyKey = () => { c().setKey(+keyRoot.value, keyMode.value); };
  keyRoot.onchange = keyMode.onchange = applyKey;
  document.getElementById('nnLockKey').onchange = e => { c().lockKey = e.target.checked; if (e.target.checked) applyKey(); };
  for (const v of ['drone', 'shimmer', 'melody', 'weighing', 'texture']) { const el = document.getElementById('nnMix-' + v); el.oninput = () => { engine.setLevel(v, +el.value); document.getElementById('nnMixV-' + v).textContent = (+el.value).toFixed(2); }; }

  // ── tabs ──
  const tabs = [...document.querySelectorAll('[role=tab]')];
  tabs.forEach(t => { t.onclick = () => { tabs.forEach(o => { const on = o === t; o.setAttribute('aria-selected', String(on)); o.tabIndex = on ? 0 : -1; document.getElementById(o.getAttribute('aria-controls')).hidden = !on; }); if (t.id === 'tabWeights') drawWeights(); }; t.onkeydown = e => { const k = tabs.indexOf(t); if (e.key === 'ArrowRight') { tabs[(k + 1) % tabs.length].focus(); tabs[(k + 1) % tabs.length].click(); } if (e.key === 'ArrowLeft') { tabs[(k + tabs.length - 1) % tabs.length].focus(); tabs[(k + tabs.length - 1) % tabs.length].click(); } }; });

  fillNeurons(); choose(null);
  return { refresh() { live && live(); if (!document.getElementById('paneWeights').hidden) drawWeights(); }, choose, keyRoot, keyMode, syncKey() { if (!document.getElementById('nnLockKey').checked) { keyRoot.value = c().root; keyMode.value = c().mode; } }, redraw() { wBuilt = ''; fillNeurons(); } };
}

/** The reference section: node types, activation functions (with plots), and the units of larger networks. */
export function mountReference(root) {
  root.append(
    h('h3', {}, 'The kinds of unit in this network'),
    ...NODE_TYPES.map(t => h('details', { class: 'nn-ref' }, h('summary', {}, h('strong', {}, t.name), h('span', { class: 'nn-badge' }, t.where)), h('p', {}, t.what), h('p', { class: 'nn-hint' }, 'In the sound: ' + t.sound))),
    h('h3', {}, 'Activation functions'),
    h('p', {}, 'The activation function is what makes a neuron more than a weighted average. Pick a different one for each hidden layer in the Network tab, and listen to what changes.'),
    h('div', { class: 'nn-acts' }, ...ACTIVATION_INFO.map(a => { const cv = h('canvas', { class: 'nn-plot', role: 'img', 'aria-label': `Plot of ${a.name}` }); requestAnimationFrame(() => plotFunction(cv, a.id)); return h('figure', {}, cv, h('figcaption', {}, h('strong', {}, a.name), h('code', {}, a.formula), h('span', {}, a.note))); })),
    h('h3', {}, 'Other kinds of unit, in larger networks'),
    h('p', {}, 'The units on this page are the simplest kind, often called dense or fully connected. Real systems combine them with specialised ones:'),
    ...LARGER_UNITS.map(u => h('details', { class: 'nn-ref' }, h('summary', {}, h('strong', {}, u.name)), h('p', {}, u.what))));
}
