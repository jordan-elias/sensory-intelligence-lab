/**
 * /assets/js/neural/engine.js
 * Plays the network. Every sound here is driven by a number the network computed:
 *   drone     the ten units of hidden layer 1 set the loudness of ten harmonics of the key's root
 *   shimmer   the eight units of hidden layer 2 set eight inharmonic upper partials, stretched when the network is far from its target
 *   melody    the output layer's probabilities choose each note; the gate unit decides whether a note sounds at all
 *   weighing  the strongest weight-times-activation products between the hidden layers sound as soft blips
 *   texture   noise whose brightness follows the loss: the harder the network is working, the more there is
 * Everything is routed to the speakers only, so the shared safe-output stage applies.
 */
import { Conductor, MAX_HIDDEN } from './net.js';
import { degreeFreq, droneAmps, shimmerPartials, pickDegree, fires, strongest, tensionOf } from './sonify.js';

export const HARM = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 27];
export const VOICES = ['drone', 'shimmer', 'melody', 'weighing', 'texture'];

export class NeuralEngine {
  constructor({ seed = 1, learn = 0.05, wild = 0.5, volume = 0.7, hidden, onFrame = () => {} } = {}) {
    this.conductor = new Conductor(seed, { learn, wild, hidden }); this.volume = volume; this.onFrame = onFrame;
    this.adventure = 0.5; this.noteRate = 1; this.levels = { drone: 1, shimmer: 1, melody: 1, weighing: 1, texture: 1 }; this.buses = {};
    this.ctx = null; this.timer = null; this.running = false; this.noteClock = 0; this.frames = 0;
  }
  get state() { return this.conductor; }
  set({ learn, wild, heat, pace, adventure, noteRate, volume }) {
    if (learn != null) this.conductor.learn = learn;
    if (wild != null) this.conductor.heat = wild;
    if (heat != null) this.conductor.heat = heat;
    if (pace != null) this.conductor.pace = pace;
    if (adventure != null) this.adventure = adventure;
    if (noteRate != null) this.noteRate = noteRate;
    if (volume != null) { this.volume = volume; if (this.master) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1); }
  }
  /** Sets the level of one voice (0 to 1.5). 0 silences it. */
  setLevel(voice, v) { this.levels[voice] = v; const b = this.buses[voice]; if (b) b.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  _build() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)(), c = this.conductor;
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    for (const v of VOICES) { const b = ctx.createGain(); b.gain.value = this.levels[v]; b.connect(this.master); this.buses[v] = b; }
    // a feedback delay and a dark pad of echoes for the melody
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.43; const fb = ctx.createGain(); fb.gain.value = 0.42; const wet = ctx.createGain(); wet.gain.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.delay.connect(lp).connect(fb).connect(this.delay); lp.connect(wet).connect(this.buses.melody);
    this.send = ctx.createGain(); this.send.gain.value = 0.6; this.send.connect(this.delay); this.send.connect(this.buses.melody);
    const mk = (type, freq, pan = 0, bus = this.master) => { const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; o.type = type; o.frequency.value = freq; g.gain.value = 0; p ? (p.pan.value = pan, o.connect(g).connect(p).connect(bus)) : o.connect(g).connect(bus); o.start(); return { o, g, p }; };
    const rootHz = 55 * Math.pow(2, c.root / 12);
    this.drone = HARM.slice(0, MAX_HIDDEN[0]).map((h, i) => mk('sine', rootHz * h, (i % 2 ? 1 : -1) * 0.25, this.buses.drone));
    this.shim = Array.from({ length: MAX_HIDDEN[1] }, (_, i) => mk('sine', 440 + i * 100, 0, this.buses.shimmer));
    // texture noise
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
    this.nf = ctx.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.Q.value = 1.2; this.nf.frequency.value = 800; this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf).connect(this.ng).connect(this.buses.texture); this.noise.start();
    this.rootHz = rootHz;
  }
  _pluck(freq, vel, pan, tension) {
    const ctx = this.ctx, t = ctx.currentTime + 0.02, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2.003;
    f.type = 'lowpass'; f.frequency.setValueAtTime(700 + 3500 * (0.3 + 0.7 * tension), t); f.frequency.exponentialRampToValueAtTime(350, t + 1.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8 + 1.5 * (1 - tension));
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = pan;
    o.connect(f); o2.connect(f); f.connect(g); p ? g.connect(p).connect(this.send) : g.connect(this.send);
    o.start(t); o2.start(t); o.stop(t + 3.5); o2.stop(t + 3.5);
  }
  _blip(freq, vel, pan) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) p.pan.value = pan;
    o.connect(g); p ? g.connect(p).connect(this.buses.weighing) : g.connect(this.buses.weighing); o.start(t); o.stop(t + 0.2);
  }
  _step(dt) {
    const c = this.conductor, s = c.tick(dt), ctx = this.ctx, now = ctx.currentTime, a1 = s.acts[1], a2 = s.acts[2], out = s.acts[3];
    const tension = tensionOf(s.loss), rootHz = 55 * Math.pow(2, s.root / 12);
    this.drone.forEach((d, i) => { if (i >= a1.length) d.g.gain.setTargetAtTime(0, now, 0.3); });
    this.shim.forEach((v, i) => { if (i >= a2.length) v.g.gain.setTargetAtTime(0, now, 0.3); });
    droneAmps(a1).forEach((amp, i) => { const d = this.drone[i]; d.g.gain.setTargetAtTime(amp, now, 0.5); d.o.frequency.setTargetAtTime(rootHz * HARM[i] * (1 + 0.0015 * a1[i]), now, s.events.includes('key') ? 3 : 0.4); });
    shimmerPartials(a2, s.root, tension).forEach((p, i) => { const v = this.shim[i]; v.g.gain.setTargetAtTime(p.amp, now, 0.4); v.o.frequency.setTargetAtTime(p.freq, now, 0.6); if (v.p) v.p.pan.setTargetAtTime(p.pan, now, 0.5); });
    this.nf.frequency.setTargetAtTime(300 + 2500 * tension, now, 0.3); this.ng.gain.setTargetAtTime(0.004 + 0.03 * tension, now, 0.4);
    this.noteClock -= dt;
    if (this.noteClock <= 0) {
      this.noteClock = (0.22 + c.rng() * 0.2 + (1 - s.density) * 0.35) / this.noteRate;
      if (fires(out[7], s.density, c.rng)) {
        const deg = pickDegree(out, c.rng, this.adventure), oct = ((a2[0] || 0) > 0.2 ? 1 : 0) + ((a2[3] || 0) < -0.3 ? 1 : 0);
        this._pluck(degreeFreq(s.root, s.mode, deg, oct, 110), 0.5 + 0.5 * Math.min(1, Math.abs(out[deg])), (a1[1] || 0) * 0.6, tension);
      }
      for (const w of strongest(c.net, 1, a1, 2)) if (c.rng() < 0.5) this._blip(degreeFreq(s.root, s.mode, w.i + w.j, 2 + (w.v > 0 ? 0 : -1), 110), Math.min(1, Math.abs(w.v) * 2), (w.j / Math.max(1, a2.length)) * 2 - 1);
    }
    this.frames++; this.onFrame(s);
  }
  async start() {
    if (this.running) return; if (!this.ctx) this._build();
    await this.ctx.resume(); this.running = true; let last = performance.now();
    this.timer = setInterval(() => { const n = performance.now(), dt = Math.min(0.25, (n - last) / 1000); last = n; this._step(dt); }, 100);
  }
  pause() { this.running = false; clearInterval(this.timer); if (this.ctx) { const ctx = this.ctx; window.silAudio?.fadeOut ? window.silAudio.fadeOut(ctx, 0.4) : this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => ctx.suspend().catch(() => {}), 600); } }
  async resume() { if (!this.ctx) return this.start(); await this.ctx.resume(); window.silAudio?.fadeIn?.(this.ctx, 0.4); this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.2); this.running = true; let last = performance.now(); this.timer = setInterval(() => { const n = performance.now(), dt = Math.min(0.25, (n - last) / 1000); last = n; this._step(dt); }, 100); }
  reseed(seed) { const wasRunning = this.running; this.pause(); const { learn, heat, pace, sizes } = this.conductor; this.conductor = new Conductor(seed, { learn, heat, pace, hidden: [sizes[1], sizes[2]] }); if (this.ctx) { try { this.ctx.close(); } catch {} this.ctx = null; } if (wasRunning) setTimeout(() => this.start(), 700); }
}
