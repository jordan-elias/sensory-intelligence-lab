/**
 * /assets/js/ambience/engine.js
 * The sound of Ambience. One shared clock drives the generated music (so every row stays in time and in key, and changes land
 * on the bar); nature, noise and spoken word run free underneath and fade in and out. Each sound has its own strip:
 * volume, pan (or an alternating left-right sweep), and a send to a shared reverb.
 *
 * `createEngine({ ctx })` takes any AudioContext, so a test can drive it with an OfflineAudioContext through `begin` and
 * `scheduleUntil` instead of the real-time timer.
 */
import { makeVoices } from '../seq/voices.js';
import { swingOffset } from '../seq/groove.js';
import { events, STEPS, PHRASE, feelOf, midiHz, swingOf } from './music.js';
import { NATURE, SPOKEN, DEFAULT_FEEL } from './catalog.js';
import { loopable, makeNoise, extendTexture } from './loop.js';
import * as drift from './drift.js';
import { cleanSettings, DEFAULT_SETTINGS } from './store.js';
import { toggle as toggleSel } from './selection.js';

const LOOKAHEAD = 0.2, HIDDEN_LOOKAHEAD = 2.5, TICK_MS = 25, FADE = 3, XFADE = 5, SHORT = 20, KEEP = 3;   // recordings shorter than SHORT seconds are stretched; at most KEEP decoded recordings stay in memory
const ROW_VOL = { drums: 0.55, bass: 0.6, chords: 0.45, melody: 0.35, pad: 0.4 };
const family = id => id.split(':')[0];
const isMusic = id => id.startsWith('music:');
const isBed = id => !isMusic(id);

export function createEngine({ ctx, loadRecorded, rand = Math.random, doc = globalThis.document, timers = true } = {}) {
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const reverb = ctx.createConvolver(), reverbOut = ctx.createGain(); reverbOut.gain.value = 0.9; reverb.connect(reverbOut); reverbOut.connect(master);
  { // a soft room: noise that dies away over a few seconds, different in each ear
    const n = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.4; }
    reverb.buffer = ir;
  }

  let selected = [], pinned = [], mode = 'steady', density = drift.DEFAULT_DENSITY, pace = drift.DEFAULT_PACE;
  let feelId = DEFAULT_FEEL, feel = feelOf(feelId), masterLevel = 0.8, settings = {};
  let ds = drift.emptyState(), lastMusicSel = [], lastBedSel = [], musicPending = new Set();
  let running = false, timer = null, tick = 0, nextTime = 0, seed = 1 + Math.floor(rand() * 1e9), stopTimer = null;
  const strips = new Map(), beds = new Map(), cache = new Map(), loading = new Set(), missing = new Set();
  const api = { onchange: null, onbar: null, onmissing: null };
  const notify = (t = 0) => { const f = () => api.onchange && api.onchange(); const ms = (t - ctx.currentTime) * 1000; if (timers && ms > 30) setTimeout(f, ms); else f(); };

  /* ── strips ── */
  const setting = key => settings[key] || (settings[key] = { ...DEFAULT_SETTINGS, ...(ROW_VOL[key.split(':')[1]] && key.startsWith('music:') ? { vol: ROW_VOL[key.split(':')[1]] } : { vol: key.startsWith('noise:') ? 0.3 : key.startsWith('spoken:') ? 0.55 : 0.6 }) });
  function applyStrip(s, set) {
    const now = ctx.currentTime;
    s.vol.gain.setTargetAtTime(set.vol, now, 0.04); s.send.gain.setTargetAtTime(set.reverb * 0.9, now, 0.05);
    if (set.alt) {
      s.panner.pan.setTargetAtTime(0, now, 0.05);
      if (!s.lfo) { s.lfo = ctx.createOscillator(); s.lfo.type = 'sine'; s.lfo.connect(s.panner.pan); s.lfo.start(); }
      s.lfo.frequency.setTargetAtTime(set.rate, now, 0.05);
    } else {
      if (s.lfo) { try { s.lfo.stop(); } catch { /* already stopped */ } s.lfo.disconnect(); s.lfo = null; }
      s.panner.pan.setTargetAtTime(set.pan, now, 0.05);
    }
  }
  function getStrip(key) {
    let s = strips.get(key); if (s) return s;
    s = { input: ctx.createGain(), vol: ctx.createGain(), panner: ctx.createStereoPanner(), send: ctx.createGain(), lfo: null, bus: null, voices: null };
    s.input.connect(s.vol); s.vol.connect(s.panner); s.panner.connect(master); s.panner.connect(s.send); s.send.connect(reverb);
    s.bus = s.input;
    if (key === 'music:drums') { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.connect(s.input); s.bus = lp; s.voices = makeVoices(ctx, lp); }   // softened, the lofi way
    strips.set(key, s); applyStrip(s, setting(key)); return s;
  }

  /* ── generated instruments (small, soft, and all built from oscillators) ── */
  const gainEnv = (g, t, attack, peak, end) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, end); };
  const osc = (type, hz, t, stop, dest, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = det; o.connect(dest); o.start(t); o.stop(stop); return o; };
  const synth = {
    rhodes(out, t, hz, dur, vel) { const g = ctx.createGain(), end = t + Math.min(dur, 5) + 0.1; g.connect(out); gainEnv(g, t, 0.012, vel * 0.45, end); osc('sine', hz, t, end + 0.05, g); const h = ctx.createGain(); h.gain.value = 0.28; h.connect(g); osc('sine', hz * 2, t, end + 0.05, h, 4); },
    pad(out, t, hz, dur, vel) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.4; lp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 0.3, t + Math.min(1.2, dur * 0.4)); g.gain.setValueAtTime(vel * 0.3, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
      osc('sawtooth', hz, t, t + dur + 1.3, lp, -7); osc('sawtooth', hz, t, t + dur + 1.3, lp, 7);
    },
    bass(out, t, hz, dur, vel) { const lp = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + dur; lp.type = 'lowpass'; lp.frequency.value = 280; lp.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 0.26, t + 0.025); g.gain.setValueAtTime(vel * 0.26, t + Math.max(0.03, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.15); osc('sine', hz, t, end + 0.2, lp); osc('triangle', hz, t, end + 0.2, lp); },
    pluck(out, t, hz, dur, vel) { const lp = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + 0.9; lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, end); lp.connect(g); g.connect(out); gainEnv(g, t, 0.006, vel * 1.1, end); osc('triangle', hz, t, end + 0.05, lp); },
    bell(out, t, hz, dur, vel) { const g = ctx.createGain(), end = t + 3; g.connect(out); gainEnv(g, t, 0.004, vel * 0.7, end); [[1, 1], [2.76, 0.4], [5.4, 0.2]].forEach(([r, a]) => { const h = ctx.createGain(); h.gain.value = a; h.connect(g); osc('sine', hz * r, t, end + 0.05, h); }); },
  };

  function playEvent(row, e, t, stepSec) {
    const s = getStrip('music:' + row), vol = e.vel, dur = (e.dur || 1) * stepSec;
    if (s.voices && (e.kind === 'kick' || e.kind === 'snare' || e.kind === 'hat' || e.kind === 'ohat')) {
      if (e.kind === 'kick') s.voices.kick(t, vol * 0.9); else if (e.kind === 'snare') s.voices.snare(t, vol * 0.8); else s.voices.hihat(t, vol * 0.7, e.kind === 'ohat');
      return;
    }
    const notes = [].concat(e.midi ?? []);
    notes.forEach((m, i) => { const f = synth[e.kind]; if (f) f(s.input, t + (e.kind === 'rhodes' ? i * 0.012 : 0), midiHz(m), dur, vol); });
  }

  /* ── beds: recorded loops, generated noise ── */
  const noiseBuffer = kind => {
    const key = 'noise:' + kind; if (cache.has(key)) return cache.get(key);
    const n = Math.floor(ctx.sampleRate * 10), [ch] = loopable([makeNoise(kind === 'wind' ? 'pink' : kind, n, 11)], ctx.sampleRate), b = ctx.createBuffer(1, ch.length, ctx.sampleRate); b.getChannelData(0).set(ch); cache.set(key, b); return b;
  };
  async function recorded(id) {
    if (cache.has(id)) { const b = cache.get(id); cache.delete(id); cache.set(id, b); return b; }   // most recently used goes last
    const buf = loadRecorded ? await loadRecorded(id) : await defaultLoad(id); if (!buf) return null;
    let chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)); const sr = buf.sampleRate;
    if (buf.duration < SHORT) chans = extendTexture(chans, sr * 60, Math.floor(buf.length * 0.5), Math.floor(buf.length * 0.15), rand);   // a few seconds of crackle becomes a minute
    const out = loopable(chans, Math.min(XFADE * sr, Math.floor(chans[0].length * 0.1))), b = ctx.createBuffer(out.length, out[0].length, sr); out.forEach((a, c) => b.getChannelData(c).set(a));
    cache.set(id, b);
    for (const k of [...cache.keys()]) { if (cache.size <= KEEP + noiseKeys()) break; if (!k.startsWith('noise:')) cache.delete(k); }
    return b;
  }
  const noiseKeys = () => [...cache.keys()].filter(k => k.startsWith('noise:')).length;
  async function defaultLoad(id) {
    const def = [...NATURE, ...SPOKEN].find(x => id === `nature:${x.id}` || id === `spoken:${x.id}`); if (!def) return null;
    for (const src of def.src) { try { const r = await fetch(src); if (!r.ok) continue; return await ctx.decodeAudioData(await r.arrayBuffer()); } catch { /* try the next file */ } }
    return null;
  }
  function bedSource(id, t) {
    const strip = getStrip(id), g = ctx.createGain(); g.gain.value = 0; g.connect(strip.input);
    const kind = family(id), name = id.split(':')[1], nodes = [];
    if (kind === 'noise') {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(name); src.loop = true; nodes.push(src);
      if (name === 'wind') { // pink noise, shaped and slowly moved
        const bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain(), amp = ctx.createOscillator(), ag = ctx.createGain(), swell = ctx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7; lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(bp.frequency);
        swell.gain.value = 2.2; amp.frequency.value = 0.045; ag.gain.value = 0.7; amp.connect(ag); ag.connect(swell.gain); src.connect(bp); bp.connect(swell); swell.connect(g); lfo.start(t); amp.start(t); nodes.push(lfo, amp);
      } else src.connect(g);
      src.start(t, rand() * 5);
      return { g, nodes };
    }
    return null;
  }
  function startBed(id, t) {
    if (beds.has(id) && !beds.get(id).stopping) return;
    if (family(id) === 'noise') {
      const inst = bedSource(id, t); inst.g.gain.setTargetAtTime(1, t, FADE / 3); beds.set(id, inst); return;
    }
    if (family(id) === 'spoken') { startSpoken(id, t); return; }
    if (loading.has(id)) return; loading.add(id); notify();
    recorded(id).then(buf => {
      loading.delete(id);
      if (!buf) { missing.add(id); api.onmissing && api.onmissing(id); notify(); return; }
      if (!running || !ds.beds.includes(id) || (beds.has(id) && !beds.get(id).stopping)) { notify(); return; }
      const g = ctx.createGain(); g.gain.value = 0; g.connect(getStrip(id).input);
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); const when = ctx.currentTime + 0.05; src.start(when, rand() * buf.duration * 0.9);
      g.gain.setTargetAtTime(1, when, FADE / 3); beds.set(id, { g, nodes: [src] }); notify();
    });
  }
  /* Spoken word is long, so it streams through an audio element instead of being decoded whole. It pauses (not restarts) when it leaves, so it carries on where it stopped. */
  const spokenEls = new Map();
  function startSpoken(id, t) {
    const def = SPOKEN.find(x => id === `spoken:${x.id}`); if (!def || typeof Audio === 'undefined') return;
    let rec = spokenEls.get(id);
    if (!rec) { const el = new Audio(); el.preload = 'auto'; el.loop = true; el.src = def.src[0]; let node = null; try { node = ctx.createMediaElementSource(el); } catch { /* no streaming here */ } rec = { el, node }; spokenEls.set(id, rec); }
    if (!rec.node) return;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(getStrip(id).input); try { rec.node.disconnect(); } catch { /* not connected yet */ } rec.node.connect(g);
    rec.el.play().catch(() => { missing.add(id); api.onmissing && api.onmissing(id); });
    g.gain.setTargetAtTime(1, ctx.currentTime, FADE / 3);
    const inst = { g, nodes: [], after: () => { if (!beds.has(id) || beds.get(id) === inst) rec.el.pause(); } }; beds.set(id, inst);
  }
  function stopBed(id, t) {
    const inst = beds.get(id); if (!inst || inst.stopping) return;
    inst.stopping = true; inst.g.gain.setTargetAtTime(0, t, FADE / 3);
    const end = t + FADE * 1.7; inst.nodes.forEach(n => { try { n.stop(end); } catch { /* already stopped */ } });
    setTimeout(() => { if (inst.after) inst.after(); if (beds.get(id) === inst) beds.delete(id); try { inst.g.disconnect(); } catch { /* gone */ } }, Math.max(0, (end - ctx.currentTime) * 1000) + 200);
  }
  function applyBeds(t) {
    const want = new Set(ds.beds);
    for (const id of want) startBed(id, t);
    for (const id of [...beds.keys()]) if (!want.has(id)) stopBed(id, t);
  }

  /* ── what sounds: the selection (steady) or the drift state ── */
  const musicOf = sel => sel.filter(isMusic).map(id => { const [, row, option] = id.split(':'); return { row, option, id }; });
  const rowVar = row => setting('music:' + row).variation;
  function syncBeds(t) {
    const sel = selected.filter(isBed);
    if (mode === 'steady') ds.beds = sel.slice();
    else { ds.beds = ds.beds.filter(id => sel.includes(id)); for (const id of sel) if (!lastBedSel.includes(id) && !ds.beds.includes(id)) ds.beds.push(id); for (const id of pinned) if (sel.includes(id) && !ds.beds.includes(id)) ds.beds.push(id); }
    lastBedSel = sel; applyBeds(t);
  }
  function syncMusic() {
    const m = musicOf(selected);
    if (mode === 'steady') { ds.music = {}; for (const x of m) ds.music[x.row] = { option: x.option, variation: rowVar(x.row) }; }
    else {
      for (const row of Object.keys(ds.music)) if (!m.some(x => x.row === row && x.option === ds.music[row].option)) delete ds.music[row];
      for (const x of m) if (!lastMusicSel.includes(x.id) || (pinned.includes(x.id) && !ds.music[x.row])) ds.music[x.row] = { option: x.option, variation: rowVar(x.row) };
    }
    lastMusicSel = m.map(x => x.id); musicPending.clear();
  }

  function barStart(bar, t) {
    if (bar % PHRASE === 0) feel = feelOf(feelId);
    syncMusic();
    if (mode === 'drift' && bar > 0 && bar % drift.PACE[pace] === 0) ds = drift.step(ds, selected, { pinned, density }, rand);
    api.onbar && api.onbar(bar, t);
  }

  function scheduleStep(t) {
    const step = tick % STEPS, bar = Math.floor(tick / STEPS), stepSec = 60 / feel.bpm / 4;
    if (step === 0) { barStart(bar, t); syncBeds(t); notify(t); }
    for (const [row, m] of Object.entries(ds.music)) {
      const tt = t + swingOffset(step, swingOf(row, m.option), stepSec), v = mode === 'steady' ? rowVar(row) : m.variation;
      for (const e of events(row, m.option, v, { step, bar, feel, seed })) playEvent(row, e, tt, stepSec);
    }
    tick++; return stepSec;
  }

  const lookahead = () => (doc && doc.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  function pump() {
    if (nextTime < ctx.currentTime - 0.5) { nextTime = ctx.currentTime + 0.05; tick = Math.ceil(tick / STEPS) * STEPS; }   // after a long freeze, rejoin on a bar
    while (nextTime < ctx.currentTime + lookahead()) nextTime += scheduleStep(nextTime);
  }

  /* ── public ── */
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({
    /** Starts the music clock at time `t` (default: now). Tests call this and then `scheduleUntil`. */
    begin(t = ctx.currentTime + 0.1) {
      running = true; tick = 0; nextTime = t; seed = 1 + Math.floor(rand() * 1e9); feel = feelOf(feelId);
      ds = mode === 'drift' ? drift.startState(selected, { pinned, density }, rand) : drift.emptyState();
      lastMusicSel = []; lastBedSel = [];
      if (mode === 'drift') { lastMusicSel = musicOf(selected).map(x => x.id); lastBedSel = selected.filter(isBed); }
      master.gain.cancelScheduledValues(0); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(masterLevel, t + 0.5);
    },
    scheduleUntil(until) { while (nextTime < until) nextTime += scheduleStep(nextTime); },
    start() {
      if (running) return; clearTimeout(stopTimer);
      try { ctx.resume().catch(() => {}); } catch { /* the page will resume on the next tap */ }   // not awaited: a slow audio device must not hold the buttons up
      api.begin(ctx.currentTime + 0.1);
      if (timers) timer = setInterval(pump, TICK_MS); pump(); notify();
    },
    stop(fade = 0.6) {
      if (!running) return; running = false; clearInterval(timer); timer = null;
      const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + fade);
      for (const id of [...beds.keys()]) stopBed(id, now); ds = drift.emptyState(); lastMusicSel = []; lastBedSel = []; musicPending.clear();
      stopTimer = setTimeout(() => { if (!running) ctx.suspend && ctx.suspend().catch(() => {}); }, fade * 1000 + 6000);
      notify();
    },
    /** Taps a tile. Beds react straight away; music waits for the next bar. */
    toggle(id) {
      const was = selected.includes(id); selected = toggleSel(selected, id);
      if (isMusic(id)) musicPending.add(id);
      if (running && isBed(id)) syncBeds(ctx.currentTime + 0.05);
      notify(); return selected.includes(id);
    },
    setSelected(sel) {
      const prev = selected; selected = sel.slice();
      for (const id of new Set([...prev, ...selected])) if (isMusic(id) && prev.includes(id) !== selected.includes(id)) musicPending.add(id);
      if (running) syncBeds(ctx.currentTime + 0.05); notify();
    },
    setMode(m) { mode = m === 'drift' ? 'drift' : 'steady'; if (running) { ds.since = {}; syncBeds(ctx.currentTime + 0.05); } notify(); },
    setFeel(id) { feelId = feelOf(id).id; notify(); },
    setDensity(d) { if (Object.hasOwn(drift.DENSITY, d)) density = d; }, setPace(p) { if (Object.hasOwn(drift.PACE, p)) pace = p; },
    setPinned(id, on) { pinned = pinned.filter(x => x !== id); if (on) pinned.push(id); if (running && mode === 'drift') { syncBeds(ctx.currentTime + 0.05); } notify(); },
    setMaster(v) { masterLevel = Math.max(0, Math.min(1, Number(v) || 0)); if (running) master.gain.setTargetAtTime(masterLevel, ctx.currentTime, 0.05); },
    setSetting(key, patch) { const s = cleanSettings({ ...setting(key), ...patch }); settings[key] = s; if (strips.has(key)) applyStrip(strips.get(key), s); notify(); return s; },
    getSettings: key => ({ ...setting(key) }),
    loadSettings(all) { settings = {}; for (const [k, v] of Object.entries(all || {})) settings[k] = cleanSettings(v); for (const [k, s] of strips) applyStrip(s, setting(k)); },
    /** 'off', 'idle' (switched on but stopped), 'pending' (waiting for the bar), 'loading', 'on', or 'rest' (switched on, resting in Drift). */
    status(id) {
      if (!selected.includes(id)) return 'off'; if (!running) return 'idle';
      if (isMusic(id)) { const [, row, option] = id.split(':'); if (ds.music[row]?.option === option) return 'on'; return musicPending.has(id) ? 'pending' : 'rest'; }
      if (loading.has(id)) return 'loading'; if (ds.beds.includes(id)) return 'on'; return 'rest';
    },
    isPinned: id => pinned.includes(id), isMissing: id => missing.has(id), spokenElement: id => spokenEls.get(id)?.el || null,
    get selected() { return selected.slice(); }, get running() { return running; }, get mode() { return mode; }, get feel() { return feelId; }, get bpm() { return feel.bpm; },
    get density() { return density; }, get pace() { return pace; }, get master() { return masterLevel; }, get pinnedIds() { return pinned.slice(); }, get node() { return master; },
    get sounding() { return drift.soundingIds(ds); },
  }));
  return api;
}
