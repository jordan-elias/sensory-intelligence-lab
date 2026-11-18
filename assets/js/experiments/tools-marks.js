/**
 * /assets/js/experiments/tools-marks.js
 * Two tools for experiments that happen mostly in your own music software or on your instrument:
 *  - marks: a stopwatch with a Mark button. In "sections" mode the marks become a timeline you can play through with a chime at
 *    each boundary (borrowed form); in "spots" mode they are a list of moments (one knob).
 *  - subtract: take a piece apart in rounds, removing half of what is left each time, with a clarity rating per round.
 * Everything stays in the page. Nothing is saved or sent unless it is ticked at the end.
 */
import { el, audioCtx } from './tools.js';
import { fmtClock, sectionsFrom, textFromSections, halfOf } from './marks-core.js';

function chime(freq = 660) {
  const c = audioCtx(), t = c.currentTime + 0.01, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1);
}

export function marksTool(cfg = {}) {
  const sections = cfg.mode !== 'spots', noun = sections ? 'section' : (cfg.noun || 'moment');
  let t0 = 0, acc = 0, running = false, raf = 0, marks = [], ended = null, playT = 0, playRaf = 0;
  const clock = el('div', { class: 'xp-clock', id: 'xpMarksClock', role: 'timer', 'aria-label': 'Stopwatch' }, '0:00');
  const startBtn = el('button', { type: 'button', class: 'xp-btn', id: 'xpMarksStart' }, 'Start');
  const markBtn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-markbig', id: 'xpMarksMark', disabled: true }, sections ? 'New section starts now' : 'Mark this moment');
  const endBtn = sections ? el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpMarksEnd', disabled: true }, 'The piece ends now') : null;
  const resetBtn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt' }, 'Start again');
  const list = el('ol', { class: 'xp-marks', id: 'xpMarksList' }), line = el('div', { class: 'xp-timeline', id: 'xpTimeline' });
  const playBtn = sections ? el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpMarksPlay', hidden: true }, 'Play the timeline through') : null;
  const now = () => acc + (running ? (performance.now() - t0) / 1000 : 0);
  const tickClock = () => { clock.textContent = fmtClock(now()); raf = requestAnimationFrame(tickClock); };
  const secs = () => sectionsFrom(marks, ended);

  function draw() {
    list.replaceChildren(...marks.map((m, i) => el('li', {},
      el('input', { type: 'number', min: 0, step: 1, value: Math.round(m.t), 'aria-label': `${noun} ${i + 1} start, in seconds`, class: 'xp-num', onchange: e => { m.t = Math.max(0, +e.target.value || 0); marks.sort((a, b) => a.t - b.t); draw(); } }), ' s ',
      el('input', { type: 'text', value: m.label, 'aria-label': `Name of ${noun} ${i + 1}`, placeholder: sections ? `Section ${i + 1}` : 'what you heard', class: 'xp-markname', oninput: e => { m.label = e.target.value; } }),
      el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-ms', 'aria-label': `Remove ${noun} ${i + 1}`, onclick: () => { marks.splice(i, 1); draw(); } }, '×'))));
    if (sections) {
      const S = secs(), total = S.length ? S[S.length - 1].end : 0;
      line.replaceChildren(...S.map((s, i) => el('div', { class: 'xp-tl', style: `flex:${Math.max(0.5, s.end - s.start)}`, 'data-i': i, title: `${s.label || 'Section ' + (i + 1)}: ${Math.round(s.end - s.start)} s` }, el('span', {}, s.label || `Section ${i + 1}`), el('em', {}, `${Math.round(s.end - s.start)} s`))));
      playBtn.hidden = !S.length || ended == null;
      line.hidden = !S.length;
    }
  }
  startBtn.onclick = () => {
    if (running) { acc = now(); running = false; startBtn.textContent = 'Carry on'; cancelAnimationFrame(raf); clock.textContent = fmtClock(acc); markBtn.disabled = true; if (endBtn) endBtn.disabled = true; return; }
    running = true; t0 = performance.now(); startBtn.textContent = 'Pause'; markBtn.disabled = false; if (endBtn) endBtn.disabled = false; cancelAnimationFrame(raf); tickClock();
    if (sections && !marks.length) { marks.push({ t: 0, label: '' }); draw(); }      // the first section starts when you do
  };
  markBtn.onclick = () => { marks.push({ t: Math.round(now()), label: '' }); marks.sort((a, b) => a.t - b.t); draw(); };
  if (endBtn) endBtn.onclick = () => { ended = Math.round(now()); running = false; acc = ended; cancelAnimationFrame(raf); clock.textContent = fmtClock(ended); startBtn.textContent = 'Start'; markBtn.disabled = true; endBtn.disabled = true; draw(); };
  resetBtn.onclick = () => { running = false; acc = 0; ended = null; marks = []; cancelAnimationFrame(raf); clock.textContent = '0:00'; startBtn.textContent = 'Start'; markBtn.disabled = true; if (endBtn) endBtn.disabled = true; stopPlay(); draw(); };
  function stopPlay() { cancelAnimationFrame(playRaf); if (playBtn) playBtn.textContent = 'Play the timeline through'; line.querySelectorAll('.xp-tl').forEach(x => x.classList.remove('now')); playT = 0; }
  if (playBtn) playBtn.onclick = () => {
    if (playT) { stopPlay(); return; }
    const S = secs(); if (!S.length) return; const total = S[S.length - 1].end, begin = performance.now(); let last = -1; playT = begin; playBtn.textContent = 'Stop'; chime(523);
    const loop = () => {
      const t = (performance.now() - begin) / 1000, i = S.findIndex(s => t >= s.start && t < s.end);
      if (t >= total) { chime(784); stopPlay(); return; }
      if (i !== last && i >= 0) { if (last >= 0) chime(659); last = i; line.querySelectorAll('.xp-tl').forEach((x, k) => x.classList.toggle('now', k === i)); }
      playRaf = requestAnimationFrame(loop);
    }; loop();
  };
  const root = el('div', { class: 'xp-tool xp-marks-tool' }, el('p', { class: 'xp-k' }, sections ? 'Time the sections' : (cfg.label || 'Mark moments')), clock,
    el('div', { class: 'xp-row' }, startBtn, markBtn, endBtn, resetBtn),
    el('p', { class: 'xp-hint' }, sections ? 'Start this when your piece starts. Press the section button each time a new part begins, then the end button. Change any time or name afterwards.' : 'Start this when you start listening. Press Mark at each moment you want to remember. You can name it afterwards.'),
    list, sections ? line : null, playBtn);
  root.keepable = () => {
    if (!marks.length) return null;
    return { label: sections ? 'My timeline' : (cfg.label || 'My moments'), kind: 'text', text: sections ? textFromSections(secs()) : marks.map(m => `${fmtClock(m.t)} ${m.label || ''}`.trim()).join('\n') };
  };
  draw();
  return root;
}

export function subtractTool() {
  const rounds = [];                    // [{ parts: [names], gone: Set, clarity }]
  const input = el('input', { type: 'text', id: 'xpSubParts', placeholder: 'drums, bass, chords, melody, vocal, texture', 'aria-label': 'The parts of your piece, separated by commas', class: 'xp-wide' });
  const begin = el('button', { type: 'button', class: 'xp-btn', id: 'xpSubBegin' }, 'These are the parts');
  const out = el('div', { id: 'xpSubRounds' }), msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' });
  const parts = () => input.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean).filter((s, i, a) => a.indexOf(s) === i);
  function draw() {
    out.replaceChildren(...rounds.map((r, ri) => {
      const last = ri === rounds.length - 1, need = halfOf(r.parts.length), n = r.gone.size;
      return el('div', { class: 'xp-sround', 'data-round': ri },
        el('h4', { class: 'xp-h' }, ri === 0 ? 'Round 1: the whole piece' : `Round ${ri + 1}: what was left`),
        el('div', { class: 'xp-row' }, r.parts.map(p => el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-part', 'aria-pressed': String(r.gone.has(p)), disabled: !last, onclick: () => { r.gone.has(p) ? r.gone.delete(p) : r.gone.add(p); draw(); } }, (r.gone.has(p) ? '✕ ' : '') + p))),
        last ? el('p', { class: 'xp-hint' }, r.parts.length < 2 ? 'Only one part is left.' : `Tap the parts to remove. Half of ${r.parts.length} is ${need}: ${n} chosen.`) : el('p', { class: 'xp-hint' }, `Removed: ${[...r.gone].join(', ') || 'nothing'}`),
        el('label', {}, 'How clear does it feel? ', el('input', { type: 'range', min: 1, max: 5, value: r.clarity, 'aria-label': `Clarity of round ${ri + 1}`, oninput: e => { r.clarity = +e.target.value; e.target.nextSibling.textContent = ' ' + r.clarity + ' of 5'; } }), el('span', {}, ' ' + r.clarity + ' of 5')),
        last && r.parts.length > 1 ? el('div', { class: 'xp-row' }, el('button', { type: 'button', class: 'xp-btn', id: 'xpSubNext', disabled: n < 1, onclick: () => { rounds.push({ parts: r.parts.filter(p => !r.gone.has(p)), gone: new Set(), clarity: 3 }); draw(); } }, 'Remove these and go on')) : null);
    }));
  }
  begin.onclick = () => { const p = parts(); if (p.length < 2) { msg.textContent = 'Give at least two parts, for example: drums, bass, chords, melody.'; return; } msg.textContent = ''; rounds.length = 0; rounds.push({ parts: p, gone: new Set(), clarity: 3 }); draw(); };
  const root = el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'Take it apart'),
    el('p', { class: 'xp-hint' }, 'List the parts of your piece (instruments, layers, sections). Then remove half, listen, and rate how clear it feels. You decide what goes.'),
    el('div', { class: 'xp-row' }, input, begin), msg, out);
  root.keepable = () => (rounds.length ? { label: 'What I took away', kind: 'text', text: rounds.map((r, i) => `Round ${i + 1} (clarity ${r.clarity} of 5): ${r.parts.filter(p => !r.gone.has(p)).join(', ') || '(nothing)'}${r.gone.size ? `  | removed: ${[...r.gone].join(', ')}` : ''}`).join('\n') } : null);
  return root;
}
