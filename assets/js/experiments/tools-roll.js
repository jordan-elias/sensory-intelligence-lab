/**
 * /assets/js/experiments/tools-roll.js
 * Three tools that let someone actually do a prompt without a DAW: a note editor (a small piano roll), a keyboard that
 * records what you play, and a microphone recorder. Audio stays in the page and is only kept if the person keeps it.
 */
import { el, audioCtx } from './tools.js';
import { NOTE_NAMES, SCALES, mulberry32, newSeed } from './rng.js';
import * as R from './roll-core.js';
import { playNote } from './synth.js';
import { encodeWav, normalise } from './audio-ops.js';

const SR = 44100;
function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Plays the roll once into an offline context and returns mono Float32 data. */
export async function renderRoll(roll, tail = 1.2) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, n = Math.ceil((R.lengthSeconds(roll) + tail) * SR);
  const ctx = new Off(1, n, SR), m = ctx.createGain(); m.gain.value = 0.8; m.connect(ctx.destination);
  for (const e of R.events(roll)) playNote(ctx, m, e.voice, R.hzOf(e.pitch), e.time, e.dur);
  return (await ctx.startRendering()).getChannelData(0);
}
const decodeBlob = async blob => { const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer()); const d = new Float32Array(buf.length); for (let c = 0; c < buf.numberOfChannels; c++) { const x = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] += x[i] / buf.numberOfChannels; } return { data: d, sr: buf.sampleRate }; };

/* ───────────── the note editor ───────────── */
export function editorTool(cfg = {}) {
  const roll = R.makeRoll({ steps: cfg.steps || 16, bpm: cfg.bpm || 100, root: cfg.root || 0, scale: cfg.scale || 'major', octaves: cfg.octaves || 2, voices: cfg.voices || ['soft'] });
  let cur = 0, len = 1, playing = false, timer = 0, raf = 0, startAt = 0, ctx = null, master = null, nextPass = 0, lastClip = null, renderTimer = 0, live = [];
  const root = el('div', { class: 'xp-tool xp-ed' });
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' });
  const say = t => { msg.textContent = t; };

  const play = el('button', { type: 'button', class: 'xp-btn', id: 'xpRollPlay' }, 'Play');
  const bpm = el('input', { type: 'number', min: 40, max: 220, value: roll.bpm, class: 'xp-num', 'aria-label': 'Tempo in beats per minute', onchange: () => { roll.bpm = Math.max(40, Math.min(220, +bpm.value || 100)); bpm.value = roll.bpm; changed(false); } });
  const stepsSel = el('select', { 'aria-label': 'Length in steps', onchange: () => { resize(+stepsSel.value); } }, [8, 16, 32].map(n => el('option', { value: n, selected: n === roll.steps }, `${n} steps`)));
  const keySel = el('select', { 'aria-label': 'Key', onchange: () => { roll.root = +keySel.value; snapAll(); draw(); changed(); } }, NOTE_NAMES.map((n, i) => el('option', { value: i, selected: i === roll.root }, n)));
  const scaleSel = el('select', { 'aria-label': 'Scale', onchange: () => { roll.scale = scaleSel.value; snapAll(); draw(); changed(); } }, Object.keys(SCALES).map(s => el('option', { value: s, selected: s === roll.scale }, s)));
  const lenSel = el('select', { 'aria-label': 'Length of the next note', id: 'xpRollLen', onchange: () => { len = +lenSel.value; } }, [[1, 'Short note'], [2, 'Medium note'], [4, 'Long note']].map(([v, l]) => el('option', { value: v }, l)));
  const tabs = el('div', { class: 'xp-row', role: 'tablist', 'aria-label': 'Tracks' });
  const voiceSel = el('select', { 'aria-label': 'Instrument for this track', id: 'xpRollVoice', onchange: () => { roll.tracks[cur].voice = voiceSel.value; changed(); } }, Object.entries(R.VOICES).map(([k, v]) => el('option', { value: k }, v)));
  const muteBtn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: () => { roll.tracks[cur].mute = !roll.tracks[cur].mute; drawTabs(); changed(); } }, 'Mute');
  const addBtn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: () => { if (roll.tracks.length >= R.MAX_TRACKS) return; roll.tracks.push({ name: `Track ${roll.tracks.length + 1}`, voice: 'bass', notes: [], mute: false }); cur = roll.tracks.length - 1; drawTabs(); draw(); } }, 'Add a track');
  const grid = el('div', { class: 'xp-rgrid', role: 'group', 'aria-label': 'Notes. Left to right is time, up is higher.' });

  const snapAll = () => { const Rw = R.rows(roll); for (const t of roll.tracks) t.notes.forEach(n => { n.pitch = Rw.reduce((b, p) => (Math.abs(p - n.pitch) < Math.abs(b - n.pitch) ? p : b), Rw[0]); }); };
  const resize = n => { for (const t of roll.tracks) t.notes = t.notes.filter(x => x.step < n).map(x => ({ ...x, len: Math.min(x.len, n - x.step) })); roll.steps = n; draw(); changed(); };
  function drawTabs() {
    tabs.replaceChildren(...roll.tracks.map((t, i) => el('button', { type: 'button', role: 'tab', class: 'xp-btn xp-btn--alt xp-tab', 'aria-selected': String(i === cur), onclick: () => { cur = i; drawTabs(); draw(); } }, t.name + (t.mute ? ' (muted)' : ''))), addBtn);
    voiceSel.value = roll.tracks[cur].voice; muteBtn.textContent = roll.tracks[cur].mute ? 'Unmute' : 'Mute'; addBtn.hidden = roll.tracks.length >= R.MAX_TRACKS;
  }
  function draw() {
    const Rw = R.rows(roll).slice().reverse(); grid.style.setProperty('--cols', roll.steps);
    const cells = [];
    for (const p of Rw) {
      cells.push(el('span', { class: 'xp-rlab' + (R.nameOf(p).startsWith(NOTE_NAMES[roll.root]) ? ' root' : '') }, R.nameOf(p)));
      for (let s = 0; s < roll.steps; s++) {
        const own = R.noteAt(roll, cur, s, p), other = !own && roll.tracks.some((t, i) => i !== cur && R.noteAt(roll, i, s, p));
        cells.push(el('button', { type: 'button', class: 'xp-rc' + (own ? ' on' : '') + (own && own.step === s ? ' start' : '') + (other ? ' other' : '') + (s % 4 === 0 ? ' beat' : ''), 'data-step': s, 'data-pitch': p, 'aria-pressed': String(!!own), 'aria-label': `Step ${s + 1}, ${R.nameOf(p)}`,
          onclick: () => { const on = R.toggleNote(roll, cur, s, p, len); if (on) preview(p); draw(); changed(); } }));
      }
    }
    grid.replaceChildren(...cells); status();
  }
  const status = () => { const n = roll.tracks[cur].notes.length; count.textContent = n ? `${n} note${n === 1 ? '' : 's'} on this track.` : 'Tap a square to place a note. Tap it again to take it away.'; };
  const count = el('p', { class: 'xp-hint' });
  const ensure = () => { if (!ctx) { ctx = audioCtx(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination); } return ctx; };
  const preview = p => { ensure(); playNote(ctx, master, roll.tracks[cur].voice, R.hzOf(p), ctx.currentTime + 0.01, 0.35); };

  /* playback: a repeating pass, scheduled a little ahead */
  const schedule = () => {
    const now = ctx.currentTime, span = R.lengthSeconds(roll);
    while (nextPass < now + 0.25) {
      for (const e of R.events(roll)) { const t = nextPass + e.time; if (t >= now - 0.01) live.push(playNote(ctx, master, e.voice, R.hzOf(e.pitch), Math.max(t, now), e.dur)); }
      nextPass += span;
    }
    live = live.slice(-200);
  };
  const frame = () => {
    if (!playing) return; const span = R.lengthSeconds(roll), s = Math.floor((((ctx.currentTime - startAt) % span) / span) * roll.steps);
    grid.querySelectorAll('.now').forEach(c => c.classList.remove('now')); grid.querySelectorAll(`[data-step="${s}"]`).forEach(c => c.classList.add('now')); raf = requestAnimationFrame(frame);
  };
  const stop = () => { playing = false; clearInterval(timer); cancelAnimationFrame(raf); live.forEach(n => n.stop()); live = []; play.textContent = 'Play'; grid.querySelectorAll('.now').forEach(c => c.classList.remove('now')); };
  const start = () => { if (!R.count(roll)) { say('Place a note first.'); return; } ensure(); stop(); playing = true; startAt = nextPass = ctx.currentTime + 0.05; schedule(); timer = setInterval(schedule, 40); play.textContent = 'Stop'; frame(); };
  play.onclick = () => (playing ? stop() : start());
  // an edit while playing is heard from the next note: the pass is rescheduled
  const changed = (redraw = true) => { if (redraw) status(); if (playing) { live.forEach(n => n.stop()); live = []; const now = ctx.currentTime, span = R.lengthSeconds(roll); nextPass = now - ((now - startAt) % span) + (now - startAt >= 0 ? 0 : 0); startAt = nextPass; } lastClip = null; clearTimeout(renderTimer); renderTimer = setTimeout(async () => { try { if (R.count(roll)) lastClip = { data: normalise(await renderRoll(roll)), sr: SR }; } catch { lastClip = null; } }, 500); };

  const mkBtn = (label, fn, id) => el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id, onclick: () => { fn(); draw(); changed(); } }, label);
  const rng = () => mulberry32(newSeed());
  const actions = el('div', { class: 'xp-row' },
    mkBtn('New pitches, same rhythm', () => { if (!R.newPitches(roll, cur, rng())) say('Place some notes first.'); else say('The rhythm is the same. The notes are new.'); }, 'xpRollNew'),
    mkBtn('Shuffle the pitches', () => { if (!R.shufflePitches(roll, cur, rng())) say('Place some notes first.'); else say('The same notes, in a different order.'); }, 'xpRollShuffle'),
    mkBtn('Up a step', () => { if (!R.shiftRows(roll, cur, 1)) say('That is as high as it goes.'); }, 'xpRollUp'),
    mkBtn('Down a step', () => { if (!R.shiftRows(roll, cur, -1)) say('That is as low as it goes.'); }, 'xpRollDown'),
    mkBtn('Backwards', () => R.reverse(roll, cur), 'xpRollRev'),
    mkBtn('Repeat twice as long', () => { if (!R.double(roll)) say('That is the longest it goes.'); else { stepsSel.value = roll.steps; } }, 'xpRollDouble'),
    mkBtn('Clear this track', () => R.clearTrack(roll, cur), 'xpRollClear'));
  const exports = el('div', { class: 'xp-row' },
    el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpRollMidi', onclick: () => { if (!R.count(roll)) { say('Place a note first.'); return; } download('my-notes.mid', R.encodeRollMidi(roll), 'audio/midi'); say('Saved as a MIDI file. Any music program can open it.'); } }, 'Save as MIDI'),
    el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpRollWav', onclick: async () => { if (!R.count(roll)) { say('Place a note first.'); return; } download('my-notes.wav', encodeWav(normalise(await renderRoll(roll)), SR), 'audio/wav'); say('Saved as a sound file.'); } }, 'Save as sound'));

  root.append(el('p', { class: 'xp-k' }, 'Note editor'), el('div', { class: 'xp-row' }, play, el('label', {}, 'Tempo ', bpm), el('label', {}, stepsSel)), el('div', { class: 'xp-row' }, el('label', {}, 'Key ', keySel), el('label', {}, scaleSel), el('label', {}, lenSel)),
    tabs, el('div', { class: 'xp-row' }, el('label', {}, 'Instrument ', voiceSel), muteBtn), grid, count, actions, exports, msg,
    el('p', { class: 'xp-hint' }, 'Every square is in the key you chose, so no note can be wrong. Your notes stay in this page unless you keep them.'));
  drawTabs(); draw();
  root.keepable = () => {
    const text = R.rollText(roll); if (!text) return null;
    const items = [{ label: 'My notes', kind: 'text', text, midi: () => R.encodeRollMidi(roll) }];
    if (lastClip) items.push({ label: 'My notes, as sound', kind: 'audio', clip: lastClip });
    return items;
  };
  root.__roll = roll; root.__stop = stop;
  return root;
}

/* ───────────── the keyboard that records ───────────── */
export function keysTool(cfg = {}) {
  const st = { root: cfg.root || 0, scale: cfg.scale || 'major', voice: cfg.voice || 'soft', rec: null, take: null, down: new Map() };
  const root = el('div', { class: 'xp-tool xp-keys', tabindex: '-1' });
  let ctx = null, master = null, dest = null, mr = null, chunks = [];
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' }, 'Tap the keys, or use the letters on your keyboard.');
  const ensure = () => { if (!ctx) { ctx = audioCtx(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination); } return ctx; };
  const KEYS = 'asdfghjkl;\'zxcvbnm,./'.split('');
  const pitches = () => R.rowsOf(st.root, st.scale, 2).slice(0, 15);
  const bar = el('div', { class: 'xp-kbd', role: 'group', 'aria-label': 'Keyboard in the key you chose' });
  const press = (p, key) => { if (st.down.has(key)) return; ensure(); const n = playNote(ctx, master, st.voice, R.hzOf(p), ctx.currentTime + 0.005, 8, 0.9); st.down.set(key, n); bar.querySelector(`[data-pitch="${p}"]`)?.classList.add('down'); };
  const release = (p, key) => { const n = st.down.get(key); if (!n) return; n.stop(ctx.currentTime + 0.02); st.down.delete(key); bar.querySelector(`[data-pitch="${p}"]`)?.classList.remove('down'); };
  function draw() {
    bar.replaceChildren(...pitches().map((p, i) => { const b = el('button', { type: 'button', class: 'xp-key' + (R.nameOf(p).startsWith(NOTE_NAMES[st.root]) ? ' root' : ''), 'data-pitch': p, 'aria-label': R.nameOf(p) }, el('span', {}, R.nameOf(p)), el('small', {}, KEYS[i] || ''));
      const id = 'p' + p; b.addEventListener('pointerdown', e => { e.preventDefault(); press(p, id); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => release(p, id));
      b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(p, 'k' + p); } }); b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(p, 'k' + p); }); return b; }));
  }
  const typed = e => { if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0 && pitches()[i] != null) { e.preventDefault(); press(pitches()[i], 'L' + i); } };
  const typedUp = e => { const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0 && pitches()[i] != null) release(pitches()[i], 'L' + i); };
  root.addEventListener('focusin', () => { document.addEventListener('keydown', typed); document.addEventListener('keyup', typedUp); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { document.removeEventListener('keydown', typed); document.removeEventListener('keyup', typedUp); } });
  const keySel = el('select', { 'aria-label': 'Key', onchange: () => { st.root = +keySel.value; draw(); } }, NOTE_NAMES.map((n, i) => el('option', { value: i, selected: i === st.root }, n)));
  const scaleSel = el('select', { 'aria-label': 'Scale', onchange: () => { st.scale = scaleSel.value; draw(); } }, Object.keys(SCALES).map(s => el('option', { value: s, selected: s === st.scale }, s)));
  const voiceSel = el('select', { 'aria-label': 'Instrument', onchange: () => { st.voice = voiceSel.value; } }, Object.entries(R.VOICES).map(([k, v]) => el('option', { value: k, selected: k === st.voice }, v)));
  const rec = el('button', { type: 'button', class: 'xp-btn', id: 'xpKeysRec' }, 'Record');
  const playBack = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true, id: 'xpKeysPlay' }, 'Play it back');
  const save = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true }, 'Save as sound');
  let backSrc = null;
  rec.onclick = async () => {
    if (mr && mr.state === 'recording') { mr.stop(); return; }
    if (typeof MediaRecorder === 'undefined') { msg.textContent = 'Recording is not available in this browser. You can still play.'; return; }
    ensure(); dest = ctx.createMediaStreamDestination(); master.connect(dest); chunks = []; mr = new MediaRecorder(dest.stream);
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => { try { master.disconnect(dest); } catch { /* gone */ } rec.textContent = 'Record again'; try { st.take = await decodeBlob(new Blob(chunks)); st.take.data = normalise(st.take.data); playBack.hidden = false; save.hidden = false; msg.textContent = `Recorded ${(st.take.data.length / st.take.sr).toFixed(1)} seconds. Play it back, or record again.`; } catch { msg.textContent = 'That take could not be read.'; } };
    mr.start(); rec.textContent = 'Stop recording'; msg.textContent = 'Recording what you play…';
  };
  playBack.onclick = () => { if (!st.take) return; const c = ensure(), b = c.createBuffer(1, st.take.data.length, st.take.sr); b.copyToChannel(st.take.data, 0); try { backSrc?.stop(); } catch { /* ended */ } backSrc = c.createBufferSource(); backSrc.buffer = b; backSrc.connect(c.destination); backSrc.start(); };
  save.onclick = () => st.take && download('my-take.wav', encodeWav(st.take.data, st.take.sr), 'audio/wav');
  root.append(el('p', { class: 'xp-k' }, 'Keyboard'), el('div', { class: 'xp-row' }, el('label', {}, 'Key ', keySel), el('label', {}, scaleSel), el('label', {}, 'Instrument ', voiceSel)), bar, el('div', { class: 'xp-row' }, rec, playBack, save), msg,
    el('p', { class: 'xp-hint' }, 'Every key is in the key you chose. What you record stays in this page unless you keep it.'));
  draw();
  root.keepable = () => (st.take ? { label: 'My take', kind: 'audio', clip: { data: st.take.data, sr: st.take.sr } } : null);
  return root;
}

/* ───────────── the microphone recorder ───────────── */
export function recorderTool(cfg = {}) {
  const st = { take: null }; let mr = null, chunks = [], stream = null, iv = 0, secs = 0, src = null;
  const root = el('div', { class: 'xp-tool xp-recorder' });
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' }, cfg.hint || 'Press Record, make your sound, press Stop. It stays on this device.');
  const rec = el('button', { type: 'button', class: 'xp-btn', id: 'xpRecStart' }, 'Record');
  const play = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true, id: 'xpRecPlay' }, 'Play it back');
  const save = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true }, 'Save as sound');
  const finish = () => { clearInterval(iv); stream?.getTracks().forEach(t => t.stop()); rec.textContent = st.take ? 'Record again' : 'Record'; };
  rec.onclick = async () => {
    if (mr && mr.state === 'recording') { mr.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { msg.textContent = 'Recording is not available here. Record on your phone and load the file in a step that accepts one.'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); } catch { msg.textContent = 'The microphone was not available. Check that this site may use it.'; return; }
    chunks = []; mr = new MediaRecorder(stream); mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => { try { st.take = await decodeBlob(new Blob(chunks)); st.take.data = normalise(st.take.data); play.hidden = false; save.hidden = false; msg.textContent = `Recorded ${(st.take.data.length / st.take.sr).toFixed(1)} seconds.`; } catch { msg.textContent = 'That recording could not be read.'; } finish(); };
    secs = 0; mr.start(); rec.textContent = 'Stop'; iv = setInterval(() => { secs++; msg.textContent = `Recording… ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; if (secs >= 600) mr.stop(); }, 1000);
  };
  play.onclick = () => { if (!st.take) return; const c = audioCtx(), b = c.createBuffer(1, st.take.data.length, st.take.sr); b.copyToChannel(st.take.data, 0); try { src?.stop(); } catch { /* ended */ } src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(); };
  save.onclick = () => st.take && download('my-recording.wav', encodeWav(st.take.data, st.take.sr), 'audio/wav');
  root.append(el('p', { class: 'xp-k' }, cfg.label || 'Record'), el('div', { class: 'xp-row' }, rec, play, save), msg);
  root.keepable = () => (st.take ? { label: cfg.keepLabel || 'My recording', kind: 'audio', clip: { data: st.take.data, sr: st.take.sr } } : null);
  return root;
}
