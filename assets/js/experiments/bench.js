/**
 * /assets/js/experiments/bench.js
 * The workbench: a small step sequencer in the style of the lab's Sequencer, for the Experiments in Creativity.
 * Drum and melodic tracks, scale-locked notes, loudness and chance per step, swing, per-track length, mute and solo,
 * Euclidean fill, and MIDI export. It can take in the notes just drawn and the rhythm just rolled. Everything runs in the
 * page; nothing is saved or sent unless the person ticks it at the end.
 */
import { el, audioCtx } from './tools.js';
import { NOTE_NAMES, SCALES } from './rng.js';
import { makeVoices } from '../seq/voices.js';
import * as B from './bench-core.js';

const noteName = n => NOTE_NAMES[((n % 12) + 12) % 12];
const MODES = [['notes', 'Notes'], ['vel', 'Loudness'], ['prob', 'Chance']];
const LEVEL_WORD = { 1: 'full', 0.75: '¾', 0.5: '½', 0.25: '¼' };

function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function benchTool(cfg = {}) {
  const b = B.makeBench(cfg.tracks || B.DEFAULT_TRACKS, { bpm: cfg.bpm || 100 });
  if (cfg.lengths) for (const [id, n] of Object.entries(cfg.lengths)) if (B.track(b, id)) B.setLen(b, id, n);
  let mode = 'notes', sel = null, timer = null, raf = 0, tick = 0, nextTime = 0, queue = [], voices = null, ctx = null, master = null;
  let sources = { notes: () => null, pattern: () => null, number: () => null };
  const ui = {};                                                    // per-track elements: { cells, picker, len }
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' });
  const say = t => { msg.textContent = t; };
  const melodic = () => b.tracks.filter(t => B.TRACK_DEFS[t.id].kind === 'melodic').map(t => t.id);

  /* ── sound ── */
  const ensure = () => { if (!ctx) { ctx = audioCtx(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination); voices = makeVoices(ctx, master); } return ctx; };
  const sound = (e, t) => {
    const v = voices, at = t + e.delay, vol = 0.5 * e.vol;
    if (e.id === 'kick') v.kick(at, vol); else if (e.id === 'snare') v.snare(at, vol); else if (e.id === 'hihat') v.hihat(at, vol, false); else if (e.id === 'cymbal') v.cymbal(at, vol);
    else if (e.id === 'bass') v.bass(at, B.midiHz(e.note), vol); else v.lead(at, B.midiHz(e.note) / 2, vol, 0);
  };
  const preview = (id, note) => { ensure(); if (ctx.state === 'suspended') ctx.resume(); sound({ id, note, vol: 1, delay: 0 }, ctx.currentTime + 0.01); };

  /* ── drawing ── */
  function drawTrack(t) {
    const u = ui[t.id], melodicT = B.TRACK_DEFS[t.id].kind === 'melodic';
    u.cells.forEach((c, i) => {
      const inLen = i < t.len, on = t.on[i];
      c.className = 'xp-bs' + (on ? ' on' : '') + (!inLen ? ' off' : '') + (i % 4 === 0 ? ' bar' : '') + (sel && sel.id === t.id && sel.step === i ? ' sel' : '');
      c.setAttribute('aria-pressed', String(!!on)); c.disabled = !inLen;
      const level = mode === 'prob' ? t.prob[i] : t.vel[i];
      c.style.setProperty('--lv', on ? (mode === 'notes' ? 1 : level) : 0);
      c.textContent = on ? (mode === 'notes' ? (melodicT ? noteName(t.note[i]) : '') : (LEVEL_WORD[level] || '')) : '';
      c.setAttribute('aria-label', `${B.TRACK_DEFS[t.id].name}, step ${i + 1}${on ? (melodicT ? ', ' + noteName(t.note[i]) : ', on') : ', off'}`);
    });
    u.mute.setAttribute('aria-pressed', String(t.mute)); u.solo.setAttribute('aria-pressed', String(t.solo));
    u.count.textContent = `${B.hits(t)} hits`;
    if (u.picker) {
      const open = sel && sel.id === t.id && t.on[sel.step];
      u.picker.hidden = !open;
      if (open) u.picker.querySelectorAll('button').forEach(p => p.setAttribute('aria-pressed', String(+p.dataset.n === t.note[sel.step])));
    }
  }
  const together = el('p', { class: 'xp-hint', id: 'xpBenchTogether' });
  const drawAll = () => { b.tracks.forEach(drawTrack); const L = b.tracks.map(t => t.len); together.textContent = new Set(L).size > 1 ? `The tracks are ${L.join(', ')} steps long. They line up again every ${B.exportLength(b)} steps (${Math.round(B.exportLength(b) * 60 / b.bpm / 4)} seconds).` : ''; };
  function buildPicker(t) {
    const p = el('div', { class: 'xp-picker', role: 'group', 'aria-label': `Pick a note for ${B.TRACK_DEFS[t.id].name}`, hidden: true });
    B.pitchChoices(b, t.id).forEach((n, k) => p.append(el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-pk', 'data-n': n, onclick: () => { if (sel) { B.setNote(b, t.id, sel.step, n); preview(t.id, n); drawAll(); } } }, noteName(n) + (k % 7 === 0 && k > 0 ? '↑' : ''))));
    return p;
  }
  function rebuildPickers() { b.tracks.forEach(t => { const u = ui[t.id]; if (!u.picker) return; const np = buildPicker(t); u.picker.replaceWith(np); u.picker = np; }); drawAll(); }

  function onStep(t, i) {
    const melodicT = B.TRACK_DEFS[t.id].kind === 'melodic';
    if (mode === 'vel' || mode === 'prob') { if (!t.on[i]) return; (mode === 'vel' ? B.cycleVel : B.cycleProb)(b, t.id, i); }
    else if (!t.on[i]) { B.toggle(b, t.id, i); sel = melodicT ? { id: t.id, step: i } : null; preview(t.id, t.note[i]); }
    else if (melodicT && !(sel && sel.id === t.id && sel.step === i)) { sel = { id: t.id, step: i }; preview(t.id, t.note[i]); }
    else { B.toggle(b, t.id, i); sel = null; }
    drawAll();
  }

  /* ── playback ── */
  const stepSec = () => 60 / b.bpm / 4;
  function schedule() {
    if (!root.isConnected) { stop(); return; }
    while (nextTime < ctx.currentTime + 0.15) {
      B.eventsAt(b, tick, stepSec()).forEach(e => sound(e, nextTime));
      queue.push({ time: nextTime, tick }); tick++; nextTime += stepSec();
    }
  }
  function animate() {
    while (queue.length && queue[0].time <= ctx.currentTime) { const q = queue.shift(); b.tracks.forEach(t => ui[t.id].cells.forEach((c, i) => c.classList.toggle('now', i === ((q.tick % t.len) + t.len) % t.len && i < t.len))); }
    raf = requestAnimationFrame(animate);
  }
  function play() {
    ensure(); if (ctx.state === 'suspended') ctx.resume();
    if (!b.tracks.some(t => B.hits(t))) { say('Switch some steps on first, or use the buttons under “Bring in” to start from what you drew or rolled.'); return; }
    tick = 0; queue = []; nextTime = ctx.currentTime + 0.08; timer = setInterval(schedule, 25); raf = requestAnimationFrame(animate); ui.play.textContent = 'Stop'; say('');
  }
  function stop() { clearInterval(timer); timer = null; cancelAnimationFrame(raf); ui.play.textContent = 'Play'; b.tracks.forEach(t => ui[t.id].cells.forEach(c => c.classList.remove('now'))); }
  const toggleTransport = () => (timer ? stop() : play());

  /* ── controls ── */
  ui.play = el('button', { type: 'button', class: 'xp-btn', id: 'xpBenchPlay', onclick: toggleTransport }, 'Play');
  const tempo = el('input', { type: 'range', min: 50, max: 180, value: b.bpm, 'aria-label': 'Tempo', id: 'xpBenchTempo' });
  const tempoOut = el('span', { class: 'xp-hint' }, `${b.bpm} BPM`);
  tempo.oninput = () => { b.bpm = +tempo.value; tempoOut.textContent = `${b.bpm} BPM`; };
  const swing = el('input', { type: 'range', min: 0, max: 100, value: 0, 'aria-label': 'Swing', id: 'xpBenchSwing' });
  const swingOut = el('span', { class: 'xp-hint' }, 'swing 0%');
  swing.oninput = () => { b.swing = +swing.value / 100; swingOut.textContent = `swing ${swing.value}%`; };
  const rootSel = el('select', { 'aria-label': 'Key', id: 'xpBenchKey' }, NOTE_NAMES.map((n, i) => el('option', { value: i }, n)));
  const scaleSel = el('select', { 'aria-label': 'Scale', id: 'xpBenchScale' }, Object.keys(SCALES).map(s => el('option', { value: s }, s)));
  rootSel.onchange = () => { const d = +rootSel.value - b.root; b.root = +rootSel.value; b.tracks.forEach(t => { if (B.TRACK_DEFS[t.id].kind === 'melodic') t.note = t.note.map(n => (n ? n + d : n)); }); rebuildPickers(); };
  scaleSel.onchange = () => {
    b.scale = scaleSel.value;
    b.tracks.forEach(t => { if (B.TRACK_DEFS[t.id].kind !== 'melodic') return; const ch = B.pitchChoices(b, t.id); t.note = t.note.map(n => (n ? ch.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), ch[0]) : n)); });
    rebuildPickers();
  };
  const modeRow = el('div', { class: 'xp-row', role: 'group', 'aria-label': 'What a tap on a step changes' },
    MODES.map(([v, l]) => el('button', { type: 'button', class: 'xp-btn xp-btn--alt', 'data-mode': v, 'aria-pressed': String(v === mode), onclick: e => { mode = v; modeRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === v))); drawAll(); } }, l)));

  /* ── bring in what was drawn and rolled ── */
  const noteTrack = el('select', { 'aria-label': 'Put the drawn notes on', id: 'xpBenchNoteTrack' }, melodic().map(id => el('option', { value: id }, B.TRACK_DEFS[id].name)));
  if (melodic().includes('lead')) noteTrack.value = 'lead';
  const rule = el('select', { 'aria-label': 'How the notes go onto the hits', id: 'xpBenchRule' }, B.FILL_RULES.map(([v, l]) => el('option', { value: v }, l)));
  const rhyTrack = el('select', { 'aria-label': 'Put the rolled rhythm on', id: 'xpBenchRhyTrack' }, b.tracks.map(t => el('option', { value: t.id }, B.TRACK_DEFS[t.id].name)));
  rhyTrack.value = (b.tracks.find(t => t.id === 'hihat') || b.tracks[0]).id;
  const useNotes = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpBenchNotes', onclick: () => {
    const p = sources.notes(); if (!p?.length) { say('Draw your notes first (the tool above), then press this.'); return; }
    const id = noteTrack.value; if (!id) { say('This workbench has no melodic track.'); return; }
    if (!B.hits(B.track(b, id))) B.setRhythm(b, id, [true, false, false, false]);       // notes need hits to land on: start with four
    const n = B.fillNotes(b, id, p, rule.value); sel = null; drawAll(); say(`${p.length} notes put on ${n} hits of the ${B.TRACK_DEFS[id].name.toLowerCase()}. Change any step you like.`);
  } }, 'Put the notes I drew on the hits');
  const useRhythm = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpBenchRhythm', onclick: () => {
    const r = sources.pattern(); if (!r) { say('Roll your rhythm first (the tool above), then press this.'); return; }
    const id = rhyTrack.value; B.setRhythm(b, id, r.pat); if (r.bpm) { b.bpm = r.bpm; tempo.value = r.bpm; tempoOut.textContent = `${r.bpm} BPM`; } sel = null; drawAll(); say(`The rolled rhythm is on the ${B.TRACK_DEFS[id].name.toLowerCase()}.`);
  } }, 'Use the rhythm I rolled');
  const useNumber = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpBenchNumber', onclick: () => {
    const n = sources.number(); if (!n) { say('Roll the number first (the tool above), then press this.'); return; }
    b.tracks.forEach(t => B.setLen(b, t.id, n)); b.tracks.forEach(t => { const sl = ui[t.id].lenSel; if (sl) sl.value = String(Math.min(16, Math.max(2, n))); }); sel = null; drawAll(); say(`Every track now cycles every ${n} steps.`);
  } }, 'Use the number I rolled');
  const bring = cfg.bring === false && !cfg.number ? null : el('details', { class: 'xp-solo', id: 'xpBenchBring', open: true }, el('summary', {}, cfg.number ? 'Bring in the number you rolled' : 'Bring in what you drew and rolled'),
    ...(cfg.number ? [el('div', { class: 'xp-row' }, useNumber)] : []),
    ...(cfg.number ? [] : [el('div', { class: 'xp-row' }, useRhythm, el('label', {}, 'on ', rhyTrack)),
    el('div', { class: 'xp-row' }, useNotes, el('label', {}, 'on ', noteTrack), el('label', {}, rule))]));

  /* ── track blocks ── */
  const blocks = b.tracks.map(t => {
    const def = B.TRACK_DEFS[t.id], u = ui[t.id] = { cells: [] };
    u.mute = el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-ms', 'aria-label': `Mute ${def.name}`, onclick: () => { t.mute = !t.mute; drawTrack(t); } }, 'M');
    u.solo = el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-ms', 'aria-label': `Solo ${def.name}`, onclick: () => { t.solo = !t.solo; b.tracks.forEach(drawTrack); } }, 'S');
    u.count = el('span', { class: 'xp-hint' });
    const lenSel = u.lenSel = el('select', { 'aria-label': `${def.name} length in steps`, onchange: () => { B.setLen(b, t.id, +lenSel.value); drawTrack(t); } }, Array.from({ length: 15 }, (_, k) => k + 2).map(n => el('option', { value: n, selected: n === t.len }, n + ' steps')));
    const pulses = el('input', { type: 'number', min: 0, max: 16, value: 4, 'aria-label': `${def.name} hits to spread`, class: 'xp-num' });
    const fill = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: () => { B.fillEuclid(b, t.id, +pulses.value || 0, 0); sel = null; drawAll(); } }, 'Spread');
    const clear = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: () => { B.clear(b, t.id); sel = null; drawAll(); } }, 'Clear');
    const grid = el('div', { class: 'xp-bgrid', role: 'group', 'aria-label': `${def.name}: ${b.steps} steps` });
    for (let i = 0; i < b.steps; i++) { const c = el('button', { type: 'button', class: 'xp-bs', onclick: () => onStep(t, i) }); u.cells.push(c); grid.append(c); }
    if (def.kind === 'melodic') u.picker = buildPicker(t);
    return el('div', { class: 'xp-btrack', 'data-track': t.id },
      el('div', { class: 'xp-bhead' }, el('strong', {}, def.name), u.count, el('span', { class: 'xp-grow' }), u.mute, u.solo),
      grid, u.picker || null,
      el('details', { class: 'xp-bmore' }, el('summary', {}, cfg.lockLength ? 'Spread' : 'Spread, length'), el('div', { class: 'xp-row' }, el('label', {}, 'Spread ', pulses, ' hits'), fill, clear), cfg.lockLength ? null : el('label', {}, 'Cycle ', lenSel)));
  });

  const save = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpBenchMidi', onclick: () => {
    if (!b.tracks.some(t => B.hits(t))) { say('Nothing to save yet.'); return; }
    download('my-loop.mid', B.encodeBenchMidi(b), 'audio/midi'); say('Saved as a MIDI file: open it in any DAW. Chance is not applied, and tracks of different lengths are written out in full.');
  } }, 'Download MIDI');

  const root = el('div', { class: 'xp-tool xp-bench', id: 'xpBench' },
    el('p', { class: 'xp-k' }, 'Workbench: build it, hear it'),
    bring,
    together,
    el('div', { class: 'xp-row' }, ui.play, el('label', {}, 'Tempo ', tempo), tempoOut),
    el('div', { class: 'xp-row' }, el('label', {}, 'Key ', rootSel), el('label', {}, scaleSel), el('label', {}, 'Swing ', swing), swingOut),
    el('div', { class: 'xp-row' }, el('span', { class: 'xp-hint' }, 'A tap on a step changes:'), modeRow),
    ...blocks,
    el('div', { class: 'xp-row' }, save), msg,
    el('p', { class: 'xp-hint' }, 'Tap a step to switch it on. On a melodic track, tap it again to choose its note (only notes of the key), and once more to switch it off. Loudness and Chance cycle full, ¾, ½, ¼.'));
  root.link = list => {
    sources = {
      notes: () => { for (const t of list) { const p = t.pitches?.(); if (p) return p; } return null; },
      pattern: () => { for (const t of list) { const r = t.pattern?.(); if (r) return r; } return null; },
      number: () => { for (const t of list) { const r = t.number?.(); if (r) return r; } return null; },
    };
  };
  root.keepable = () => { const text = B.benchText(b); return text ? { label: 'My loop', kind: 'text', text } : null; };
  root.__bench = b;
  drawAll();
  return root;
}
