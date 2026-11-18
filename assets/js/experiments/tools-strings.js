/**
 * /assets/js/experiments/tools-strings.js
 * A six-string plucked instrument for retuning experiments: change what a string is tuned to, set up to three chord shapes by fret,
 * hear them strummed, and compare the same shape in standard and in your retuned tuning. It makes the sound itself, so it works
 * for people without a guitar. Nothing is saved or sent unless it is ticked at the end.
 */
import { el, audioCtx } from './tools.js';
import * as S from './strings-core.js';

const STRING_LABEL = ['6 (lowest)', '5', '4', '3', '2', '1 (highest)'];

export function stringsTool(cfg = {}) {
  const bpm = cfg.bpm || 70, detunes = Array(6).fill(0), shapes = [S.emptyShape(), S.emptyShape(), S.emptyShape()];
  let cur = 0, timer = 0;
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' }), say = t => { msg.textContent = t; };
  const cache = new Map();
  const voice = (m, when, vol = 0.35) => {
    const c = audioCtx(); let buf = cache.get(m);
    if (!buf) { const d = S.pluck(c.sampleRate, S.midiHz(m)); buf = c.createBuffer(1, d.length, c.sampleRate); buf.copyToChannel(d, 0); cache.set(m, buf); }
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; g.gain.value = vol; src.connect(g).connect(c.destination); src.start(when);
  };
  const strum = (notes, at = audioCtx().currentTime + 0.02, gap = 0.045) => { let k = 0; notes.forEach(m => { if (m !== null) voice(m, at + (k++) * gap); }); return k; };
  const notesNow = (d = detunes, shape = shapes[cur]) => S.shapeNotes(shape, d);

  const rows = STRING_LABEL.map((lab, i) => {
    const tune = el('select', { 'aria-label': `String ${lab} tuning change in semitones`, class: 'xp-str-tune', 'data-i': i, onchange: () => { detunes[i] = S.clampDetune(tune.value); cache.clear(); draw(); } },
      Array.from({ length: 25 }, (_, k) => k - 12).map(d => el('option', { value: d, selected: d === 0 }, d === 0 ? 'standard' : (d > 0 ? '+' : '') + d)));
    const fret = el('select', { 'aria-label': `String ${lab} fret in this shape`, class: 'xp-str-fret', 'data-i': i, onchange: () => { shapes[cur][i] = fret.value === 'x' ? null : +fret.value; draw(); } },
      el('option', { value: 'x' }, 'muted'), Array.from({ length: 13 }, (_, k) => el('option', { value: k }, k === 0 ? 'open' : 'fret ' + k)));
    const name = el('span', { class: 'xp-str-note', 'aria-live': 'off' });
    const hear = el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-str-pluck', 'aria-label': `Hear string ${lab} on its own`, onclick: () => { const m = S.soundingNote(S.STANDARD[i], detunes[i], shapes[cur][i] ?? 0); voice(m, audioCtx().currentTime + 0.02); } }, 'Hear');
    return { tune, fret, name, row: el('div', { class: 'xp-str-row', 'data-string': i }, el('strong', { class: 'xp-str-lab' }, 'String ' + lab), el('label', {}, 'Tuned ', tune), el('label', {}, 'Play ', fret), name, hear) };
  });
  const tabs = [0, 1, 2].map(k => el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-str-tab', 'data-shape': k, onclick: () => { cur = k; draw(); } }, 'Shape ' + (k + 1)));

  function draw() {
    tabs.forEach((t, k) => { t.setAttribute('aria-pressed', String(k === cur)); t.classList.toggle('on', k === cur); });
    const notes = notesNow();
    rows.forEach((r, i) => { r.tune.value = String(detunes[i]); r.fret.value = shapes[cur][i] === null ? 'x' : String(shapes[cur][i]); r.name.textContent = notes[i] === null ? '–' : S.noteName(notes[i]); });
  }

  const strumBtn = el('button', { type: 'button', class: 'xp-btn', id: 'xpStrStrum', onclick: () => { if (!strum(notesNow())) say('Choose a fret for at least one string first.'); else say(''); } }, 'Strum this shape');
  const compare = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpStrCompare', onclick: () => {
    if (!notesNow().some(x => x !== null)) { say('Choose a fret for at least one string first.'); return; }
    const t = audioCtx().currentTime + 0.02; strum(notesNow(Array(6).fill(0)), t); strum(notesNow(), t + 1.8);
    say('First in standard tuning, then in your retuning.');
  } }, 'Standard, then retuned');
  const progBtn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpStrProg', onclick: () => {
    if (timer) { clearTimeout(timer); timer = 0; progBtn.textContent = 'Play shapes 1, 2, 3'; return; }
    const set = shapes.map(s => notesNow(detunes, s)).filter(n => n.some(x => x !== null));
    if (!set.length) { say('Set up at least one shape first.'); return; }
    const beat = 60 / bpm; let k = 0; progBtn.textContent = 'Stop';
    const next = () => { if (k >= set.length * 4) { progBtn.textContent = 'Play shapes 1, 2, 3'; timer = 0; return; } strum(set[k % set.length]); k++; timer = setTimeout(next, beat * 4 * 1000); };
    next();
    say(`Each shape rings for 4 beats at ${bpm} BPM, four times through.`);
  } }, 'Play shapes 1, 2, 3');
  const reset = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpStrReset', onclick: () => { detunes.fill(0); cache.clear(); draw(); say('Back to standard tuning.'); } }, 'Standard tuning');

  const root = el('div', { class: 'xp-tool xp-strings', id: 'xpStrings' },
    el('p', { class: 'xp-k' }, 'Strings: retune and strum'),
    el('div', { class: 'xp-row' }, ...tabs),
    ...rows.map(r => r.row),
    el('div', { class: 'xp-row' }, strumBtn, compare, progBtn, reset), msg,
    el('p', { class: 'xp-hint' }, 'Set the retuning you rolled on the string it names. Then dial in a shape you know by heart, the way you would finger it normally. The note names show what it turns into.'));
  root.keepable = () => { const text = S.stringsText(detunes, shapes); return text ? { label: 'My retuned shapes', kind: 'text', text } : null; };
  root.__strings = { detunes, shapes };
  draw();
  return root;
}
