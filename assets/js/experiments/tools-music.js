/**
 * /assets/js/experiments/tools-music.js
 * Interactive tools for the melody-over-chords, one-sample-beat and treatment experiments.
 * Audio you load stays in this page. Nothing is uploaded.
 */
import { el, audioCtx } from './tools.js';
import { mulberry32, newSeed, generate, euclid, NOTE_NAMES, int } from './rng.js';
import { encodeWav } from './audio-ops.js';
import { scaleNotes, setStep, encodeMidi, makeLanes, LANE_ROLES, treatments } from './music-ops.js';

const midiFreq = n => 440 * Math.pow(2, (n - 69) / 12);
const noteName = n => NOTE_NAMES[((n % 12) + 12) % 12];
function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function tone(ctx, dest, freq, t, dur, { type = 'triangle', gain = 0.25 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}

// ── a melody over a rolled chord progression, scale-locked, one note per step ──
export function rollTool(cfg) {
  const STEPS = 16, PER = 4;
  const st = { root: 0, mode: 'major', chords: null, chordNames: [], melody: Array(STEPS).fill(null), bpm: 90, playing: false };
  const rootSel = el('select', { 'aria-label': 'Key' }, NOTE_NAMES.map((n, i) => el('option', { value: i }, n)));
  const modeSel = el('select', { 'aria-label': 'Mode' }, el('option', { value: 'major' }, 'Major'), el('option', { value: 'natural minor' }, 'Minor'));
  const chordOut = el('p', { class: 'xp-chords', id: 'xpChords', 'aria-live': 'polite' }, 'Roll the chords first.');
  const grid = el('div', { class: 'xp-roll', id: 'xpRoll', role: 'group', 'aria-label': 'Melody: one note per step' });
  const rollBtn = el('button', { type: 'button', class: 'xp-btn', id: 'xpRollChords' }, 'Roll 4 chords');
  const play = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpRollPlay' }, 'Play');
  const save = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpRollMidi' }, 'Download MIDI');
  const tempo = el('input', { type: 'range', min: 60, max: 140, value: st.bpm, 'aria-label': 'Tempo', oninput: e => { st.bpm = +e.target.value; } });
  const msg = el('p', { class: 'xp-hint', role: 'status' });
  let timer = null, cells = [];

  const rows = () => scaleNotes(st.root, st.mode, 2).slice().reverse();         // highest first
  const draw = (on = -1) => {
    const R = rows(); cells = [];
    grid.style.gridTemplateColumns = `3rem repeat(${STEPS}, minmax(1.5rem, 1fr))`;
    grid.replaceChildren();
    R.forEach(n => {
      grid.append(el('span', { class: 'xp-roll-k' }, noteName(n)));
      for (let s = 0; s < STEPS; s++) {
        const b = el('button', { type: 'button', class: 'xp-rc' + (st.melody[s] === n ? ' on' : '') + (s === on ? ' now' : '') + (s % PER === 0 ? ' bar' : ''),
          'aria-pressed': String(st.melody[s] === n), 'aria-label': `Step ${s + 1}, ${noteName(n)}`,
          onclick: () => { st.melody = setStep(st.melody, s, n); if (!st.playing) preview(n); draw(); } });
        grid.append(b);
      }
    });
  };
  const preview = n => { const ctx = audioCtx(); tone(ctx, ctx.destination, midiFreq(n), ctx.currentTime + 0.01, 0.35); };
  const chordMidi = () => st.chords.map(pcs => pcs.map(pc => 48 + ((pc - st.root + 120) % 12) + st.root));
  const stop = () => { clearTimeout(timer); st.playing = false; play.textContent = 'Play'; draw(); };
  const loop = () => {
    const ctx = audioCtx(), t0 = ctx.currentTime + 0.08, sd = 60 / st.bpm / 4, cm = st.chords ? chordMidi() : [];
    cm.forEach((c, k) => c.forEach(n => tone(ctx, ctx.destination, midiFreq(n), t0 + k * PER * sd, PER * sd * 0.98, { gain: 0.1 })));
    st.melody.forEach((n, i) => { if (n != null) tone(ctx, ctx.destination, midiFreq(n), t0 + i * sd, sd * 0.95, { gain: 0.22 }); });
    for (let i = 0; i < STEPS; i++) setTimeout(() => { if (st.playing) draw(i); }, (t0 - ctx.currentTime + i * sd) * 1000);
    timer = setTimeout(() => { if (st.playing) loop(); }, (t0 - ctx.currentTime + STEPS * sd) * 1000);
  };
  play.onclick = () => { if (st.playing) { stop(); return; } st.playing = true; play.textContent = 'Stop'; loop(); };
  rollBtn.onclick = () => {
    const r = generate({ kind: 'chords', count: 4, root: st.root, scale: st.mode }, mulberry32(newSeed()));
    st.chords = r.chords; chordOut.textContent = r.items.map(i => i.text).join('   →   ');
    msg.textContent = 'Write a melody over these. Only notes of the key are offered. You may not re-roll once you have started.';
  };
  rootSel.onchange = () => { st.root = +rootSel.value; st.melody = Array(STEPS).fill(null); draw(); };
  modeSel.onchange = () => { st.mode = modeSel.value; st.melody = Array(STEPS).fill(null); draw(); };
  save.onclick = () => {
    if (!st.chords) { msg.textContent = 'Roll the chords first.'; return; }
    download('melody-over-chords.mid', encodeMidi({ melody: st.melody, chords: chordMidi(), stepsPerChord: PER, bpm: st.bpm }), 'audio/midi');
    msg.textContent = 'Saved as a MIDI file. Open it in any DAW or notation program.';
  };
  draw();
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'Chords and melody'), el('div', { class: 'xp-row' }, el('label', {}, 'Key ', rootSel), modeSel, rollBtn), chordOut,
    el('div', { class: 'xp-roll-wrap' }, grid), el('div', { class: 'xp-row' }, play, save, el('label', {}, 'Tempo ', tempo)), msg,
    el('p', { class: 'xp-hint' }, 'Each column is a sixteenth note and holds one note. Tap a note to place it; tap it again to take it away. Four steps per chord.'));
}

// ── a beat built from one sample ──
function scheduleBeat(ctx, dest, buffer, lanes, pat, bpm, t0, bars) {
  const sd = 60 / bpm / 4;
  for (let b = 0; b < bars; b++) for (let s = 0; s < 16; s++) lanes.forEach((ln, li) => {
    if (!pat[li][s]) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(), t = t0 + (b * 16 + s) * sd;
    src.buffer = buffer; src.playbackRate.value = ln.rate;
    g.gain.setValueAtTime(0.9, t); g.gain.setTargetAtTime(0, t + ln.length / ln.rate * 0.7, 0.02);
    src.connect(g).connect(dest); src.start(t, ln.start, ln.length); src.stop(t + ln.length / ln.rate + 0.1);
  });
}

export function samplerTool() {
  const st = { buffer: null, lanes: [], pat: LANE_ROLES.map(() => Array(16).fill(0)), bpm: 96, playing: false };
  const status = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' }, 'Load one sound: a recording, a snap, a word, a chord. This is the only sound you may use.');
  const file = el('input', { type: 'file', accept: 'audio/*', class: 'xp-file', 'aria-label': 'Load your one sample' });
  const lanesBox = el('div', { class: 'xp-lanes2', id: 'xpLanes', hidden: true });
  const play = el('button', { type: 'button', class: 'xp-btn', id: 'xpBeatPlay' }, 'Play');
  const reslice = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpReslice' }, 'Re-cut the slices');
  const roll = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpRollBeat' }, 'Roll a pattern');
  const save = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpBeatSave' }, 'Download 4 bars (WAV)');
  const tempo = el('input', { type: 'range', min: 60, max: 160, value: st.bpm, 'aria-label': 'Tempo', oninput: e => { st.bpm = +e.target.value; } });
  const controls = el('div', { class: 'xp-row', hidden: true }, play, reslice, roll, save, el('label', {}, 'Tempo ', tempo));
  let timer = null, on = -1;

  const draw = () => {
    lanesBox.replaceChildren(...st.lanes.map((ln, li) => el('div', { class: 'xp-lane2' },
      el('span', { class: 'xp-lane-k' }, `${ln.role} · ×${ln.rate}`),
      el('div', { class: 'xp-lane-steps' }, st.pat[li].map((v, s) => el('button', { type: 'button', class: 'xp-ls' + (v ? ' on' : '') + (s === on ? ' now' : '') + (s % 4 === 0 ? ' bar' : ''),
        'aria-pressed': String(!!v), 'aria-label': `${ln.role}, step ${s + 1}`, onclick: () => { st.pat[li][s] = v ? 0 : 1; draw(); } }))))));
  };
  const cut = () => { st.lanes = makeLanes(mulberry32(newSeed()), st.buffer.duration); draw(); };
  const stop = () => { clearTimeout(timer); st.playing = false; play.textContent = 'Play'; on = -1; draw(); };
  const loop = () => {
    const ctx = audioCtx(), t0 = ctx.currentTime + 0.08, sd = 60 / st.bpm / 4;
    scheduleBeat(ctx, ctx.destination, st.buffer, st.lanes, st.pat, st.bpm, t0, 1);
    for (let i = 0; i < 16; i++) setTimeout(() => { if (st.playing) { on = i; draw(); } }, (t0 - ctx.currentTime + i * sd) * 1000);
    timer = setTimeout(() => { if (st.playing) loop(); }, (t0 - ctx.currentTime + 16 * sd) * 1000);
  };
  file.onchange = async () => {
    const f = file.files && file.files[0]; if (!f) return;
    try {
      st.buffer = await audioCtx().decodeAudioData(await f.arrayBuffer());
      status.textContent = `${f.name}: ${st.buffer.duration.toFixed(1)} seconds. Four lanes cut slices from it, at four speeds. Nothing else may be added.`;
      lanesBox.hidden = false; controls.hidden = false; cut();
    } catch { status.textContent = 'That file could not be read as audio.'; }
  };
  play.onclick = () => { if (!st.buffer) return; if (st.playing) { stop(); return; } st.playing = true; play.textContent = 'Stop'; loop(); };
  reslice.onclick = () => { if (st.buffer) cut(); };
  roll.onclick = () => { st.pat = st.lanes.map(() => euclid(int(mulberry32(newSeed()), 2, 7), 16, int(mulberry32(newSeed()), 0, 15))); draw(); };
  save.onclick = async () => {
    if (!st.buffer) return; save.disabled = true;
    try {
      const sr = 44100, bars = 4, len = Math.ceil((60 / st.bpm / 4) * 16 * bars * sr) + sr, oc = new OfflineAudioContext(1, len, sr);
      scheduleBeat(oc, oc.destination, st.buffer, st.lanes, st.pat, st.bpm, 0, bars);
      const out = (await oc.startRendering()).getChannelData(0);
      download('one-sample-beat.wav', encodeWav(out, sr), 'audio/wav');
    } catch { status.textContent = 'The beat could not be rendered here.'; } finally { save.disabled = false; }
  };
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'One sample'), el('div', { class: 'xp-row' }, file), status, lanesBox, controls,
    el('p', { class: 'xp-hint' }, 'Tap steps to place hits. "Re-cut the slices" is allowed once. The sample stays in this page.'));
}

// ── a different treatment for each track after the swap ──
export function treatTool() {
  const area = el('textarea', { rows: 4, id: 'xpTracks', 'aria-label': 'Your tracks, one per line', placeholder: 'One track per line, after the instruments are swapped:\nPiano (now on the bass line)\nVoice (now on the drums)' });
  const out = el('div', { class: 'xp-out', 'aria-live': 'polite' });
  const btn = el('button', { type: 'button', class: 'xp-btn', id: 'xpTreat' }, 'Deal the treatments');
  btn.onclick = () => {
    const names = area.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { out.replaceChildren(el('p', { class: 'xp-hint' }, 'Enter at least two tracks.')); return; }
    out.replaceChildren(el('ul', { class: 'xp-treat' }, treatments(mulberry32(newSeed()), names).map(t => el('li', {}, el('strong', {}, t.track), ': ', t.effect, ', ', t.setting))));
  };
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'Treatments'), area, el('div', { class: 'xp-row' }, btn), out,
    el('p', { class: 'xp-hint' }, 'Each track is given one effect and an exact setting. Use them as written.'));
}
