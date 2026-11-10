/**
 * /assets/js/experiments/tools.js
 * The interactive parts of the experiments. Everything runs in the browser.
 * Audio you load or record here is held in memory only: it is not uploaded, and it is gone
 * when you leave the page unless you download it yourself.
 */
import { mulberry32, newSeed, generate, SCALES, NOTE_NAMES, rotateAssign } from './rng.js';
import { mixToMono, resample, reverse, chopShuffle, stutter, pitchedGrains, contrastLayer, normalise, encodeWav } from './audio-ops.js';

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

let _ctx;
export function audioCtx() {
  if (!_ctx || _ctx.state === 'closed') _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}
const freqOf = pc => 261.63 * Math.pow(2, pc / 12);

/** Plays pitch classes one after another as soft tones. Returns a stop function. */
export function playTones(pcs, { step = 0.5, octave = 0 } = {}) {
  const ctx = audioCtx(), t0 = ctx.currentTime + 0.05, nodes = [];
  pcs.forEach((pc, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * step;
    o.type = 'triangle'; o.frequency.value = freqOf(pc) * Math.pow(2, octave);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.95);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + step); nodes.push(o);
  });
  return () => nodes.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
}

// ── tool: number / note generator ───────────────────────────────────
function genTool(cfg) {
  const root = el('div', { class: 'xp-tool' });
  const state = { root: 0, scale: 'major', n: 0 };
  const out = el('div', { class: 'xp-out', 'aria-live': 'polite' }, el('p', { class: 'xp-hint' }, 'Nothing rolled yet.'));
  const hist = el('ol', { class: 'xp-hist', 'aria-label': 'Earlier rolls' });
  const seedEl = el('span', { class: 'xp-seed' });
  let stop = () => {};
  const rollBtn = el('button', { type: 'button', class: 'xp-btn' }, cfg.label || 'Roll');
  const hear = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true }, 'Hear the notes');
  const bar = el('div', { class: 'xp-row' });

  if (cfg.keyPicker) {
    const key = el('select', { 'aria-label': 'Key', onchange: e => { state.root = +e.target.value; } }, NOTE_NAMES.map((n, i) => el('option', { value: i }, n)));
    const sc = el('select', { 'aria-label': 'Scale', onchange: e => { state.scale = e.target.value; } }, Object.keys(SCALES).map(s => el('option', { value: s }, s)));
    bar.append(el('label', {}, 'Key ', key), el('label', {}, 'Scale ', sc));
  }
  let last = null;
  rollBtn.onclick = () => {
    const seed = newSeed();
    last = generate({ ...cfg, root: state.root, scale: state.scale }, mulberry32(seed));
    out.replaceChildren(el('ul', { class: 'xp-chips' }, last.items.map(i => el('li', {}, i.label ? el('span', { class: 'xp-chip-k' }, i.label) : null, ' ', i.text))));
    seedEl.textContent = `Seed ${seed}`;
    hist.prepend(el('li', {}, last.summary)); while (hist.children.length > 5) hist.lastChild.remove();
    hear.hidden = !last.pitchClasses;
  };
  hear.onclick = () => { stop(); if (last?.pitchClasses) stop = playTones(last.pitchClasses, { step: cfg.kind === 'notes' ? 0.6 : 0.4 }); };
  root.append(el('div', { class: 'xp-row' }, rollBtn, hear), bar, out, el('div', { class: 'xp-meta' }, seedEl, el('p', { class: 'xp-hint' }, 'The seed makes a roll repeatable.')),
    cfg.noHistory ? null : el('details', { class: 'xp-details' }, el('summary', {}, 'Earlier rolls'), hist));
  return root;
}

// ── tool: timer ─────────────────────────────────────────────────────
function timerTool(cfg) {
  const total = (cfg.minutes || 10) * 60; let left = total, id = null;
  const show = el('div', { class: 'xp-time', role: 'timer' });
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const draw = () => { show.textContent = fmt(left); };
  const btn = el('button', { type: 'button', class: 'xp-btn' }, 'Start');
  const reset = el('button', { type: 'button', class: 'xp-btn xp-btn--alt' }, 'Reset');
  const chime = () => { try { playTones([9], { step: 1.2, octave: 1 }); } catch { /* sound is a nicety */ } };
  btn.onclick = () => {
    if (id) { clearInterval(id); id = null; btn.textContent = 'Resume'; return; }
    btn.textContent = 'Pause';
    id = setInterval(() => { left--; draw(); if (left <= 0) { clearInterval(id); id = null; btn.textContent = 'Start'; left = total; chime(); show.textContent = 'Time. Stop where you are.'; } }, 1000);
  };
  reset.onclick = () => { clearInterval(id); id = null; left = total; btn.textContent = 'Start'; draw(); };
  draw();
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, `Timer · ${cfg.minutes} minutes`), show, el('div', { class: 'xp-row' }, btn, reset));
}

// ── tool: audio clip ────────────────────────────────────────────────
function clipTool(cfg) {
  const root = el('div', { class: 'xp-tool' });
  const st = { data: null, sr: 44100, result: null, source: null, ctx: null };
  const status = el('p', { class: 'xp-hint', role: 'status' }, 'No clip yet.');
  const file = el('input', { type: 'file', accept: 'audio/*', 'aria-label': 'Load an audio file', class: 'xp-file' });
  const rec = el('button', { type: 'button', class: 'xp-btn' }, 'Record 10 seconds');
  const ops = el('div', { class: 'xp-row', hidden: true });
  const play = el('button', { type: 'button', class: 'xp-btn', hidden: true }, 'Play result');
  const save = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true }, 'Download WAV');
  const info = el('p', { class: 'xp-hint', 'aria-live': 'polite' });
  const orig = el('button', { type: 'button', class: 'xp-btn xp-btn--alt' }, 'Play original');
  const grainPos = el('input', { type: 'range', min: 0, max: 100, value: 20, 'aria-label': 'Where in the clip' });
  const grainLen = el('input', { type: 'range', min: 40, max: 400, value: 120, 'aria-label': 'Length in milliseconds' });
  const grainBox = el('div', { class: 'xp-grain', hidden: true }, el('label', {}, 'Where ', grainPos), el('label', {}, 'Length ', grainLen));
  let stopNow = () => {};

  const playData = (d) => {
    stopNow(); const ctx = audioCtx(), b = ctx.createBuffer(1, d.length, st.sr); b.copyToChannel(d, 0);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(); stopNow = () => { try { s.stop(); } catch { /* ended */ } };
  };
  const setResult = (d, text) => { st.result = normalise(d); info.textContent = text; play.hidden = false; save.hidden = false; playData(st.result); };
  const load = (data, sr, label) => { st.data = data; st.sr = sr; ops.hidden = false; grainBox.hidden = !cfg.ops.some(o => o === 'grain' || o === 'stutter'); status.textContent = `${label}: ${(data.length / sr).toFixed(1)} seconds. Held in this page only.`; st.result = null; play.hidden = save.hidden = true; info.textContent = ''; };
  const decode = async (arrayBuf, label) => {
    try { const ctx = audioCtx(), buf = await ctx.decodeAudioData(arrayBuf); load(mixToMono([...Array(buf.numberOfChannels).keys()].map(i => buf.getChannelData(i))), buf.sampleRate, label); }
    catch { status.textContent = 'That file could not be read as audio.'; }
  };
  file.onchange = async () => { const f = file.files?.[0]; if (f) await decode(await f.arrayBuffer(), f.name); };
  rec.onclick = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { status.textContent = 'Recording is not available here. Load a file instead.'; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(stream), chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => { stream.getTracks().forEach(t => t.stop()); rec.disabled = false; rec.textContent = 'Record 10 seconds'; await decode(await new Blob(chunks).arrayBuffer(), 'Recording'); };
      rec.disabled = true; let s = 10; rec.textContent = `Recording… ${s}`; mr.start();
      const iv = setInterval(() => { s--; rec.textContent = `Recording… ${s}`; if (s <= 0) { clearInterval(iv); mr.stop(); } }, 1000);
    } catch { status.textContent = 'The microphone was not available. You can load a file instead.'; }
  };
  orig.onclick = () => st.data && playData(st.data);
  play.onclick = () => st.result && playData(st.result);
  save.onclick = () => {
    if (!st.result) return; const url = URL.createObjectURL(new Blob([encodeWav(st.result, st.sr)], { type: 'audio/wav' }));
    el('a', { href: url, download: 'experiment.wav' }).click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const grainWin = () => { const dur = st.data.length / st.sr, len = grainLen.value / 1000; return { start: Math.min(dur - len, (grainPos.value / 100) * dur), len }; };
  const OPS = {
    slow: ['Slow (¼ speed)', () => setResult(resample(st.data, 0.25), 'A quarter of the speed, two octaves lower.')],
    fast: ['Fast (4× speed)', () => setResult(resample(st.data, 4), 'Four times the speed, two octaves higher.')],
    contrast: ['Slow and fast together', () => setResult(contrastLayer(st.data), 'Quarter speed with four-times speed repeating beneath it.')],
    reverse: ['Reverse', () => setResult(reverse(st.data), 'Backwards.')],
    chop: ['Chop and shuffle', () => {
      const n = Math.max(2, parseInt(document.querySelector('.xp-out .xp-chips li')?.textContent, 10) || 8); const seed = newSeed();
      const r = chopShuffle(st.data, st.sr, n, mulberry32(seed)); setResult(r.out, `${n} slices, order ${r.order.join(' ')} (seed ${seed}).`);
    }],
    stutter: ['Stutter a moment', () => { const w = grainWin(); setResult(stutter(st.data, st.sr, w.start, Math.min(w.len, 0.25), Math.round(8 / Math.max(w.len, 0.04))), `Repeating ${Math.round(Math.min(w.len, 0.25) * 1000)} ms from ${w.start.toFixed(2)} s.`); }],
    grain: ['Melody from one grain', () => {
      const w = grainWin(), seed = newSeed(), rng = mulberry32(seed), set = [0, 2, 3, 5, 7, 8, 10].filter(() => rng() < 0.7).concat(0);
      const semis = Array.from({ length: 8 }, () => set[Math.floor(rng() * set.length)] + (rng() < 0.3 ? 12 : 0) - 12);
      setResult(pitchedGrains(st.data, st.sr, w.start, w.len, semis), `Steps from the original pitch: ${semis.join(' ')} (seed ${seed}).`);
    }],
  };
  for (const o of cfg.ops) ops.append(el('button', { type: 'button', class: 'xp-btn', onclick: () => st.data && OPS[o][1]() }, OPS[o][0]));
  ops.append(orig);
  root.append(el('p', { class: 'xp-k' }, 'Your clip'), el('div', { class: 'xp-row' }, rec, el('label', { class: 'xp-filelabel' }, 'or load a file ', file)),
    el('p', { class: 'xp-hint' }, 'Audio stays in your browser. It is not uploaded or saved.'), status, grainBox, ops, el('div', { class: 'xp-row' }, play, save), info);
  return root;
}

// ── tool: loops of different lengths ────────────────────────────────
function loopsTool(cfg) {
  const lens = (cfg.lengths || [3, 4, 5]).slice(); let bpm = 90, timer = null, step = 0, next = 0;
  const lights = el('div', { class: 'xp-lanes' });
  const lenInputs = lens.map((l, i) => el('input', { type: 'number', min: 2, max: 16, value: l, 'aria-label': `Loop ${i + 1} length in beats`, onchange: e => { lens[i] = Math.max(2, Math.min(16, +e.target.value || 2)); } }));
  const pitches = [196, 261.63, 329.63, 392];
  const btn = el('button', { type: 'button', class: 'xp-btn' }, 'Start');
  const tempo = el('input', { type: 'range', min: 50, max: 160, value: bpm, 'aria-label': 'Tempo', oninput: e => { bpm = +e.target.value; } });
  const drawLanes = s => { lights.replaceChildren(...lens.map((l, i) => el('div', { class: 'xp-lane' }, el('span', {}, `Loop ${i + 1}: `), ...Array.from({ length: l }, (_, b) => el('i', { class: (s % l) === b ? 'on' : '' }))))); };
  const click = (t, f, loud) => { const c = audioCtx(), o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(loud ? 0.4 : 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + (loud ? 0.35 : 0.08)); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.4); };
  const tick = () => { const c = audioCtx(); while (next < c.currentTime + 0.15) { const s = step; lens.forEach((l, i) => click(next, pitches[i % 4], s % l === 0)); const when = next; setTimeout(() => drawLanes(s), Math.max(0, (when - c.currentTime) * 1000)); step++; next += 60 / bpm; } };
  btn.onclick = () => {
    if (timer) { clearInterval(timer); timer = null; btn.textContent = 'Start'; return; }
    step = 0; next = audioCtx().currentTime + 0.1; timer = setInterval(tick, 50); btn.textContent = 'Stop';
  };
  drawLanes(-1);
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'Loops'), el('div', { class: 'xp-row' }, ...lens.map((_, i) => el('label', {}, `Loop ${i + 1} `, lenInputs[i])), el('label', {}, 'Tempo ', tempo)),
    el('p', { class: 'xp-hint' }, 'The loud click is beat 1 of each loop. Change a length, then stop and start again.'), btn, lights);
}

// ── tool: reassign ──────────────────────────────────────────────────
function assignTool() {
  const area = el('textarea', { rows: 4, 'aria-label': 'Your tracks, one per line', placeholder: 'One track or instrument per line, for example:\nBass\nPiano\nVoice\nDrums' });
  const out = el('div', { class: 'xp-out', 'aria-live': 'polite' });
  const btn = el('button', { type: 'button', class: 'xp-btn' }, 'Swap them');
  btn.onclick = () => {
    const names = area.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { out.replaceChildren(el('p', { class: 'xp-hint' }, 'Enter at least two.')); return; }
    out.replaceChildren(el('ul', { class: 'xp-chips' }, rotateAssign(mulberry32(newSeed()), names).map(a => el('li', {}, `${a.from} → ${a.to}`))));
  };
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'Swap'), area, el('div', { class: 'xp-row' }, btn), out);
}

export function buildTool(cfg) {
  switch (cfg.type) {
    case 'gen': return genTool(cfg);
    case 'timer': return timerTool(cfg);
    case 'clip': return clipTool(cfg);
    case 'loops': return loopsTool(cfg);
    case 'assign': return assignTool(cfg);
    default: return el('p', {}, '');
  }
}
export const TOOL_TYPES = ['gen', 'timer', 'clip', 'loops', 'assign'];
