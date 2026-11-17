/**
 * /assets/js/experiments/tools-phrase.js
 * "Play it": put notes onto a rhythm and hear them. The notes can be the ones just drawn, ones the person sets by hand, or both;
 * the rhythm can be the rolled one, or tapped in here. The person decides which note lands on which hit, or lets a rule fill them in
 * and then changes any of them. All in the browser, nothing is saved unless the person ticks it at the end.
 */
import { NOTE_NAMES } from './rng.js';

const MODES = [
  ['order', 'In order, over and over'],
  ['reverse', 'Backwards, over and over'],
  ['random', 'A random one on each hit'],
  ['same', 'The first note on every hit'],
];
const freq = (pc, oct) => 261.63 * Math.pow(2, (pc % 12) / 12) * Math.pow(2, oct);

export function phraseTool(cfg, { el, audioCtx }) {
  const n = cfg.steps || 16;
  let bpm = cfg.bpm || 90, oct = 0, mode = 'order', pool = [], pat = Array(n).fill(0), assign = Array(n).fill(-1), timer = null, step = 0, next = 0;
  let sources = { notes: () => null, pattern: () => null };

  const poolEl = el('ul', { class: 'xp-pool', 'aria-label': 'Your notes' });
  const grid = el('div', { class: 'xp-phrase-grid', style: `grid-template-columns:repeat(${Math.min(n, 16)},1fr)` });
  const info = el('p', { class: 'xp-hint', 'aria-live': 'polite' });
  const playBtn = el('button', { type: 'button', class: 'xp-btn', id: 'xpPhrasePlay' }, 'Play');
  const hits = () => pat.map((v, i) => (v ? i : -1)).filter(i => i >= 0);

  function fill() {                         // apply the rule to every hit, then the person can change any one
    const h = hits(), k = pool.length;
    h.forEach((slot, j) => {
      assign[slot] = !k ? -1 : mode === 'order' ? j % k : mode === 'reverse' ? (k - 1 - (j % k)) : mode === 'random' ? Math.floor(Math.random() * k) : 0;
    });
    draw();
  }
  function draw() {
    poolEl.replaceChildren(...pool.map((pc, i) => el('li', {}, el('button', { type: 'button', class: 'xp-chip-btn', 'aria-label': `Remove ${NOTE_NAMES[pc % 12]}`, onclick: () => { pool.splice(i, 1); assign = assign.map(a => (a === i ? -1 : a > i ? a - 1 : a)); fill(); } }, NOTE_NAMES[pc % 12] + ' ×'))));
    if (!pool.length) poolEl.replaceChildren(el('li', { class: 'xp-hint' }, 'No notes yet. Use the notes you drew, or tap notes below.'));
    grid.replaceChildren(...pat.map((v, i) => {
      const cell = el('div', { class: 'xp-phrase-cell' });
      cell.append(el('button', { type: 'button', class: 'xp-step', 'aria-pressed': String(!!v), 'aria-label': `Beat ${i + 1}`, onclick: () => { pat[i] = pat[i] ? 0 : 1; fill(); } }));
      if (v) {
        const sel = el('select', { 'aria-label': `Note for beat ${i + 1}`, onchange: e => { assign[i] = +e.target.value; } },
          el('option', { value: -1 }, '–'), ...pool.map((pc, k) => el('option', { value: k }, NOTE_NAMES[pc % 12] + (pool.indexOf(pc) !== k ? ` (${k + 1})` : ''))));
        sel.value = String(assign[i]);
        cell.append(sel);
      }
      return cell;
    }));
    info.textContent = `${pool.length} notes · ${hits().length} hits · ${bpm} BPM`;
  }
  const stepDur = () => (60 / bpm) * (4 / n);
  const note = (t, pc, dur) => {
    const c = audioCtx(), o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = freq(pc, oct);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.12, dur * 0.9));
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  const cells = () => [...grid.querySelectorAll('.xp-step')];
  function stop() { if (timer) { clearInterval(timer); timer = null; } playBtn.textContent = 'Play'; cells().forEach(c => c.classList.remove('on')); }
  function tick() {
    if (!root.isConnected) { stop(); return; }
    const c = audioCtx();
    while (next < c.currentTime + 0.15) {
      const i = step % n, when = next;
      if (pat[i] && pool[assign[i]] != null) note(when, pool[assign[i]], stepDur());
      setTimeout(() => { cells().forEach((x, k) => x.classList.toggle('on', k === i)); }, Math.max(0, (when - c.currentTime) * 1000));
      step++; next += stepDur();
    }
  }
  playBtn.onclick = () => {
    if (timer) { stop(); return; }
    if (!pool.length || !hits().length) { info.textContent = 'Add at least one note and switch on at least one beat first.'; return; }
    step = 0; next = audioCtx().currentTime + 0.1; timer = setInterval(tick, 40); playBtn.textContent = 'Stop';
  };

  const useNotes = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpPhraseNotes' }, 'Use the notes I drew');
  useNotes.onclick = () => { const p = sources.notes(); if (!p?.length) { info.textContent = 'Draw your notes first (the tool above), then press this.'; return; } pool = [...p]; fill(); };
  const useRhythm = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpPhraseRhythm' }, 'Use the rhythm I rolled');
  useRhythm.onclick = () => { const r = sources.pattern(); if (!r) { info.textContent = 'Roll your rhythm first (the tool above), then press this.'; return; } pat = Array.from({ length: n }, (_, i) => (r.pat[i % r.pat.length] ? 1 : 0)); if (r.bpm) bpm = r.bpm; tempo.value = bpm; fill(); };
  const keys = el('div', { class: 'xp-row xp-keys', role: 'group', 'aria-label': 'Add a note' }, NOTE_NAMES.map((nm, pc) => el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-key', onclick: () => { pool.push(pc); fill(); } }, nm)));
  const modeSel = el('select', { 'aria-label': 'How notes go onto the hits', onchange: e => { mode = e.target.value; fill(); } }, MODES.map(([v, l]) => el('option', { value: v }, l)));
  const octSel = el('select', { 'aria-label': 'Octave', onchange: e => { oct = +e.target.value; } }, [[-1, 'Octave lower'], [0, 'Middle octave'], [1, 'Octave higher']].map(([v, l]) => el('option', { value: v, selected: v === 0 }, l)));
  const tempo = el('input', { type: 'range', min: 40, max: 180, value: bpm, 'aria-label': 'Tempo', oninput: e => { bpm = +e.target.value; info.textContent = `${pool.length} notes · ${hits().length} hits · ${bpm} BPM`; } });
  const clear = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: () => { stop(); pool = []; pat = Array(n).fill(0); assign = Array(n).fill(-1); draw(); } }, 'Clear');

  const root = el('div', { class: 'xp-tool xp-phrase' },
    el('p', { class: 'xp-k' }, 'Play it: your notes on your rhythm'),
    el('div', { class: 'xp-row' }, useNotes, useRhythm), poolEl, keys,
    el('p', { class: 'xp-hint' }, 'Tap beats to switch them on or off. Under each switched-on beat, choose which note it plays, or pick a rule and change any you like.'),
    grid,
    el('div', { class: 'xp-row' }, el('label', {}, 'Rule ', modeSel), el('label', {}, 'Pitch ', octSel), el('label', {}, 'Tempo ', tempo)),
    el('div', { class: 'xp-row' }, playBtn, clear), info);
  root.link = list => {                      // read the drawn notes and rolled rhythm from the other tools on this experiment
    sources = {
      notes: () => { for (const t of list) { const p = t.pitches?.(); if (p) return p; } return null; },
      pattern: () => { for (const t of list) { const r = t.pattern?.(); if (r) return r; } return null; },
    };
  };
  root.keepable = () => {
    const h = hits(); if (!pool.length || !h.length) return null;
    const seq = pat.map((v, i) => (v ? (pool[assign[i]] != null ? NOTE_NAMES[pool[assign[i]] % 12] : '?') : '.')).join(' ');
    return { label: 'My phrase', kind: 'text', text: `${seq}\n${bpm} BPM, ${n} steps. Notes: ${pool.map(p => NOTE_NAMES[p % 12]).join(' ')}` };
  };
  draw();
  return root;
}
