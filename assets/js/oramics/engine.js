/**
 * /assets/js/oramics/engine.js
 * The sound of the five inks. One engine serves the live player and the WAV export: column() is told what the picture says at one
 * moment and schedules the sound at an exact audio time, so what you hear while it plays is what the file contains.
 * Nothing is recorded or sent anywhere; everything is made with the browser's own audio nodes.
 */
import { INKS, INK_ORDER } from './inks.js';
import { runsAt, melodyAt, harmonyAt, textureAt, onsetsAt, ZONES } from './scan.js';

/* ── the voices, four shades each ── */
export const VOICES = {
  melody: [
    { waves: ['sine', 'sine'], ratios: [1, 2], mix: [0.9, 0.06], detune: [0, 0], cut: 6000, q: 0.5, vib: 0, vibRate: 5 },
    { waves: ['triangle', 'sine'], ratios: [1, 2], mix: [0.8, 0.12], detune: [0, 0], cut: 5000, q: 0.5, vib: 12, vibRate: 5.4 },
    { waves: ['sawtooth', 'sawtooth'], ratios: [1, 1], mix: [0.42, 0.42], detune: [-7, 7], cut: 3200, q: 0.7, vib: 7, vibRate: 5.1 },
    { waves: ['square', 'triangle'], ratios: [1, 1], mix: [0.3, 0.5], detune: [0, 4], cut: 1900, q: 1.2, vib: 6, vibRate: 5.8 },
  ],
  harmony: [
    { waves: ['triangle', 'triangle'], ratios: [1, 1], mix: [0.5, 0.5], detune: [-6, 6], cut: 2400, q: 0.5, vib: 0, vibRate: 0.2 },
    { waves: ['sawtooth', 'sawtooth'], ratios: [1, 1], mix: [0.3, 0.3], detune: [-10, 10], cut: 1100, q: 0.8, vib: 8, vibRate: 4.6 },
    { waves: ['square', 'sine'], ratios: [1, 2], mix: [0.22, 0.5], detune: [0, 0], cut: 1500, q: 0.5, vib: 0, vibRate: 0.2 },
    { waves: ['sine', 'sine'], ratios: [1, 3], mix: [0.6, 0.14], detune: [-4, 4], cut: 7000, q: 0.5, vib: 3, vibRate: 3.5 },
  ],
  bass: [
    { waves: ['sine', 'sine'], ratios: [1, 2], mix: [0.95, 0.08], detune: [0, 0], cut: 900, q: 0.5, vib: 0, vibRate: 5 },
    { waves: ['triangle', 'sine'], ratios: [1, 1], mix: [0.8, 0.3], detune: [0, 0], cut: 1200, q: 0.6, vib: 0, vibRate: 5 },
    { waves: ['sawtooth', 'sawtooth'], ratios: [1, 1], mix: [0.35, 0.35], detune: [-5, 5], cut: 650, q: 4, vib: 0, vibRate: 5 },
    { waves: ['square', 'sine'], ratios: [1, 1], mix: [0.3, 0.6], detune: [0, 0], cut: 520, q: 1, vib: 0, vibRate: 5 },
  ],
  texture: [
    { type: 'bandpass', q: 0.8, mul: 1, trem: 0, tremRate: 0.2 },
    { type: 'bandpass', q: 2.6, mul: 1, trem: 0.35, tremRate: 0.3 },
    { type: 'bandpass', q: 9, mul: 1.6, trem: 0.25, tremRate: 2.2 },
    { type: 'lowpass', q: 0.9, mul: 0.22, trem: 0.2, tremRate: 0.15 },
  ],
};
export const KITS = [
  { kick: [115, 42, 0.42, 'sine'], snareF: 1700, snareTone: 185, snareDec: 0.17, hatF: 7000, hatDec: 0.045, openDec: 0.24, tomWave: 'sine', tomDec: 0.24, tomTop: 430 },
  { kick: [170, 46, 0.3, 'sine'], snareF: 2600, snareTone: 220, snareDec: 0.13, hatF: 9500, hatDec: 0.035, openDec: 0.18, tomWave: 'triangle', tomDec: 0.2, tomTop: 520 },
  { kick: [95, 56, 0.26, 'triangle'], snareF: 1000, snareTone: 260, snareDec: 0.1, hatF: 5200, hatDec: 0.05, openDec: 0.2, tomWave: 'triangle', tomDec: 0.14, tomTop: 760 },
];
const LEVEL = { melody: 0.34, harmony: 0.15, bass: 0.5, texture: 0.55, rhythm: 0.9 };
const SEND = { melody: 0.3, harmony: 0.5, bass: 0.04, texture: 0.55, rhythm: 0.22 };
const PAN = [-0.55, -0.2, 0.2, 0.55];

function noiseBuffer(ctx, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); let s = 22222;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 2147483648) - 1; }   // fixed seed: the same noise every time
  return buf;
}
function impulse(ctx, seconds = 2.4) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate); let s = 9137;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; lp += ((s / 2147483648 - 1) - lp) * 0.45; d[i] = lp * Math.pow(1 - i / n, 3.2); } }
  return buf;
}

export function createEngine(ctx, { destination = ctx.destination } = {}) {
  const master = ctx.createGain(); master.gain.value = 0.85;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 8; lim.attack.value = 0.004; lim.release.value = 0.12;
  master.connect(lim); lim.connect(destination);
  const conv = ctx.createConvolver(); conv.buffer = impulse(ctx); const wet = ctx.createGain(); wet.gain.value = 0.5; conv.connect(wet); wet.connect(master);
  const noise = noiseBuffer(ctx);

  const mix = {}, shade = {}, bus = {}, send = {}, state = {}; let solo = null, space = 0.5;
  for (const id of INK_ORDER) {
    mix[id] = { vol: 0.8, mute: false }; shade[id] = 0; state[id] = { on: false, last: {} };
    bus[id] = ctx.createGain(); bus[id].gain.value = 0.8; bus[id].connect(master);
    send[id] = ctx.createGain(); send[id].gain.value = SEND[id] * space; bus[id].connect(send[id]); send[id].connect(conv);
  }
  const applyMix = (t = ctx.currentTime, instant = false) => {
    for (const id of INK_ORDER) {
      const v = (mix[id].mute || (solo && solo !== id)) ? 0 : mix[id].vol;
      instant ? bus[id].gain.setValueAtTime(v, t) : bus[id].gain.setTargetAtTime(v, t, 0.03);
    }
  };

  /* A pitched voice: two oscillators through a filter. */
  function tonal(id, pan = 0) {
    const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000; f.connect(g);
    let out = g; if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; } out.connect(bus[id]);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = 0; lfo.connect(lg); lfo.start();
    const o = [0, 1].map(() => { const osc = ctx.createOscillator(), og = ctx.createGain(); osc.connect(og); og.connect(f); lg.connect(osc.detune); osc.start(); return { osc, og }; });
    const v = { g, f, lfo, lg, o, ratios: [1, 1], on: false };
    v.set = p => {
      v.ratios = p.ratios; f.frequency.value = p.cut; f.Q.value = p.q; lfo.frequency.value = p.vibRate; lg.gain.value = p.vib;
      o.forEach((x, i) => { x.osc.type = p.waves[i]; x.osc.detune.value = p.detune[i]; x.og.gain.value = p.mix[i]; });
    };
    v.hz = (hz, t, jump, tc) => o.forEach((x, i) => (jump ? x.osc.frequency.setValueAtTime(hz * v.ratios[i], t) : x.osc.frequency.setTargetAtTime(hz * v.ratios[i], t, tc)));
    v.amp = (a, t, tc) => g.gain.setTargetAtTime(a, t, tc);
    v.set(VOICES[id][0] || VOICES.melody[0]); return v;
  }
  const melody = tonal('melody'), bass = tonal('bass'), chord = PAN.map(p => tonal('harmony', p));
  melody.set(VOICES.melody[0]); bass.set(VOICES.bass[0]); chord.forEach(c => c.set(VOICES.harmony[0]));

  /* Texture: looped noise through a filter. */
  const tex = (() => {
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; const f = ctx.createBiquadFilter(), g = ctx.createGain(); g.gain.value = 0;
    const tg = ctx.createGain(); tg.gain.value = 1; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.2; lg.gain.value = 0; lfo.connect(lg); lg.connect(tg.gain); lfo.start();
    src.connect(f); f.connect(g); g.connect(tg); tg.connect(bus.texture); src.start(); const v = { f, g, lfo, lg, p: VOICES.texture[0] };
    v.set = p => { v.p = p; f.type = p.type; f.Q.value = p.q; lg.gain.value = p.trem; lfo.frequency.value = p.tremRate; }; v.set(VOICES.texture[0]); return v;
  })();

  /* Drums: a short burst of nodes per hit. */
  let kit = KITS[0];
  const burst = (t, nodes, life) => { const stop = t + life; for (const n of nodes) if (n.stop) { try { n.stop(stop); } catch { /* already scheduled */ } } };
  const env = (g, t, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); };
  const noiseHit = (t, type, f, q, peak, dec, pan = 0) => {
    const s = ctx.createBufferSource(); s.buffer = noise; const flt = ctx.createBiquadFilter(), g = ctx.createGain(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    s.connect(flt); flt.connect(g); let out = g; if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; } out.connect(bus.rhythm);
    env(g, t, peak, dec); s.start(t, (t * 7.3) % 1.5); burst(t, [s], dec + 0.05);
  };
  const toneHit = (t, wave, f0, f1, drop, peak, dec) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = wave; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + drop);
    o.connect(g); g.connect(bus.rhythm); env(g, t, peak, dec); o.start(t); burst(t, [o], dec + 0.05);
  };
  function hit(zone, c, vel, t) {
    const k = kit;
    if (zone === 'kick') { toneHit(t, k.kick[3], k.kick[0], k.kick[1], 0.11, 0.9 * vel, k.kick[2]); noiseHit(t, 'lowpass', 900, 0.5, 0.12 * vel, 0.02); }
    else if (zone === 'tom') { const f = k.tomTop - Math.max(0, Math.min(1, (c - 0.58) / 0.2)) * k.tomTop * 0.5; toneHit(t, k.tomWave, f * 1.12, f, 0.06, 0.6 * vel, k.tomDec); noiseHit(t, 'bandpass', f * 3, 1, 0.1 * vel, 0.02, -0.25); }
    else if (zone === 'snare') { noiseHit(t, 'bandpass', k.snareF, 0.8, 0.5 * vel, k.snareDec); toneHit(t, 'triangle', k.snareTone * 1.2, k.snareTone, 0.04, 0.3 * vel, 0.09); }
    else if (zone === 'hat') noiseHit(t, 'highpass', k.hatF, 0.7, 0.26 * vel, k.hatDec, 0.35);
    else noiseHit(t, 'highpass', k.hatF * 0.8, 0.7, 0.2 * vel, k.openDec, 0.35);
  }

  const engine = {
    ctx, master, VOICES, get mix() { return mix; }, get shade() { return shade; },
    setShade(id, i) {
      shade[id] = i;
      if (id === 'melody') melody.set(VOICES.melody[i]); else if (id === 'bass') bass.set(VOICES.bass[i]); else if (id === 'harmony') chord.forEach(c => c.set(VOICES.harmony[i]));
      else if (id === 'texture') tex.set(VOICES.texture[i]); else if (id === 'rhythm') kit = KITS[i] || KITS[0];
    },
    setMix(id, m, instant = false) { Object.assign(mix[id], m); applyMix(ctx.currentTime, instant); },
    setSolo(id, instant = false) { solo = id; applyMix(ctx.currentTime, instant); },
    setSpace(v) { space = v; wet.gain.value = 0.2 + 0.8 * v; for (const id of INK_ORDER) send[id].gain.value = SEND[id] * v * 1.6; },
    /** The picture loops: marks in the first column count as new hits again. */
    wrap() { state.rhythm.prev = []; },
    resetMemory() { for (const id of INK_ORDER) state[id] = { on: false, last: {}, prev: [] }; },
    /** Schedules what the picture says at column x, to sound at audio time t. an = { ink: scan }. */
    column(x, t, secPerCol, an, settings = {}) {
      const tc = Math.max(0.015, Math.min(0.06, secPerCol * 0.7)), snap = settings.snap || { on: false };
      // melody and bass: one line each
      for (const [id, v] of [['melody', melody], ['bass', bass]]) {
        const m = an[id] ? melodyAt(runsAt(an[id], x), id, { snap }) : null, s = state[id];
        if (m) { v.hz(m.hz, t, !s.on, tc); v.amp(m.amp * LEVEL[id], t, s.on ? tc : 0.01); s.on = true; } else if (s.on) { v.amp(0, t, 0.03); s.on = false; }
      }
      // harmony: up to four notes, swelling in and fading out slowly
      const notes = an.harmony ? harmonyAt(runsAt(an.harmony, x), { root: settings.root || 0, scale: settings.scale || 'major pentatonic', maxVoices: 4 }) : [];
      const hs = state.harmony; hs.voices ||= [false, false, false, false];
      chord.forEach((v, i) => {
        const n = notes[i];
        if (n) { v.hz(n.hz, t, !hs.voices[i], 0.12); v.amp(n.amp * LEVEL.harmony / Math.sqrt(Math.max(1, notes.length)), t, hs.voices[i] ? 0.1 : 0.07); hs.voices[i] = true; }
        else if (hs.voices[i]) { v.amp(0, t, 0.14); hs.voices[i] = false; }
      });
      // texture
      const tx = an.texture ? textureAt(runsAt(an.texture, x)) : null, ts = state.texture;
      if (tx) { tex.f.frequency.setTargetAtTime(tx.hz * tex.p.mul, t, ts.on ? 0.04 : 0.001); tex.g.gain.setTargetAtTime(tx.amp * LEVEL.texture, t, 0.06); ts.on = true; } else if (ts.on) { tex.g.gain.setTargetAtTime(0, t, 0.1); ts.on = false; }
      // rhythm: new marks are hits
      if (an.rhythm) {
        const runs = runsAt(an.rhythm, x), rs = state.rhythm; rs.prev ||= [];
        let n = 0; for (const h of onsetsAt(rs.prev, runs)) { if (n >= 3 || t - (rs.last[h.zone] ?? -1) < 0.035) continue; hit(h.zone, h.c, h.vel, t); rs.last[h.zone] = t; n++; }
        rs.prev = runs;
      }
    },
    /** Everything to silence at time t (stop, or the end of a one-shot render). */
    silence(t = ctx.currentTime) {
      for (const v of [melody, bass, ...chord]) v.amp(0, t, 0.04); tex.g.gain.setTargetAtTime(0, t, 0.05);
      engine.resetMemory();
    },
    /** A short note on the ink at height c, so painting is heard while the music is stopped. */
    audition(id, c, settings = {}, when = ctx.currentTime) {
      const fake = { w: 1, h: 1000, runs: [Int16Array.from([Math.round(c * 1000) - 8, Math.round(c * 1000) + 8])] };
      if (id === 'rhythm') { const z = ZONES.find(z => c < z.to) || ZONES[4]; hit(z.id, c, 0.8, when); return; }
      const one = { [id]: fake };
      this.column(0, when, 0.02, one, settings);
      this.column(0, when + 0.16, 0.02, { [id]: { w: 1, h: 1000, runs: [null] } }, settings);
    },
    dispose() { try { master.disconnect(); } catch { /* gone */ } for (const v of [melody, bass, ...chord]) for (const x of v.o) { try { x.osc.stop(); } catch { /* stopped */ } } try { tex.f.disconnect(); } catch { /* gone */ } },
  };
  engine.resetMemory(); engine.setSpace(0.5);
  return engine;
}

/** Plays the whole picture once into an offline context and returns the rendered AudioBuffer (for the WAV file). */
export async function renderPiece({ Offline, sampleRate = 44100, an, w, seconds, settings, mix, shade, space, tail = 2.5 }) {
  const ctx = new Offline(2, Math.ceil((seconds + tail) * sampleRate), sampleRate), e = createEngine(ctx);
  for (const id of INK_ORDER) { e.setShade(id, shade?.[id] || 0); e.setMix(id, mix?.[id] || {}, true); }
  e.setSpace(space ?? 0.5); const per = seconds / w;
  for (let x = 0; x < w; x++) e.column(x, x * per, per, an, settings);
  e.silence(seconds);
  return ctx.startRendering();
}

/** 16-bit stereo WAV from an AudioBuffer-like { sampleRate, numberOfChannels, length, getChannelData }. */
export function encodeWav(buf) {
  const ch = Math.min(2, buf.numberOfChannels), n = buf.length, sr = buf.sampleRate, bytes = n * ch * 2, v = new DataView(new ArrayBuffer(44 + bytes));
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, bytes, true);
  const d = []; for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, d[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return v.buffer;
}
