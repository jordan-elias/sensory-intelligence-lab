/**
 * /assets/js/spatial/voices.js
 * The three sound sources of the shell game. Each one is a continuous, broadband voice, because the ear places a sound by the cues
 * in its high frequencies (the small level and colour differences between the ears) far better than by a low hum. So every voice carries
 * energy up to about 6 kHz and never goes fully silent, so it can be followed while it moves.
 *   bowed string (the target): quarter-note accents · soft pad: half notes · woodblock: dotted quarters (a syncopated tick)
 * Beats are scheduled on the audio clock, a little ahead of time, so they never drift.
 */
export const BPM = 100, BEAT_SEC = 60 / BPM, HALF_SEC = BEAT_SEC * 2, DOT_Q_SEC = BEAT_SEC * 1.5;
export const SOURCE_CONFIGS = [
  { frequency: 220.00, timbre: 'string',    beatInterval: BEAT_SEC,  isTarget: true  },
  { frequency: 277.18, timbre: 'pad',       beatInterval: HALF_SEC,  isTarget: false },
  { frequency: 329.63, timbre: 'woodblock', beatInterval: DOT_Q_SEC, isTarget: false },
];
export const TIMBRE_NAMES = { string: 'bowed string', pad: 'soft pad', woodblock: 'woodblock' };

let noise = new WeakMap();
function noiseBuffer(ctx) {
  if (noise.has(ctx)) return noise.get(ctx);
  const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let s = 12345;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823 - 1; }
  noise.set(ctx, b); return b;
}

export class ToneSource {
  constructor(ctx, scene, config) {
    Object.assign(this, { ctx, scene, timbre: config.timbre, frequency: config.frequency, beatInterval: config.beatInterval, isTarget: config.isTarget });
    this.position = { x: 0, y: 0, z: -1 }; this.resonanceSource = null; this.onBeat = null;
    this.master = null; this.nodes = []; this.sustain = 0.12; this._stopped = true; this._nextBeat = 0; this._tid = null;
  }
  _osc(type, freq, dest, gain = 1, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = detune; g.gain.value = gain; o.connect(g); g.connect(dest); o.start(this._t0); this.nodes.push(o, g); return o;
  }
  _noise(dest, gain, type, freq, q) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuffer(ctx); s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(dest); s.start(this._t0); this.nodes.push(s, f, g); return g;
  }
  /** Builds the voice. t0: when its oscillators start (the audio clock; default now). */
  init(t0 = this.ctx.currentTime) {
    const ctx = this.ctx; this._t0 = t0;
    this.resonanceSource = this.scene.createSource({ minDistance: 1.5, maxDistance: 12, rolloff: 'logarithmic', gain: 1, sourceWidth: 0 });
    this.resonanceSource.setPosition(this.position.x, this.position.y, this.position.z);
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(this.resonanceSource.input);
    // a gentle presence lift around 3 kHz, where the ear leans on level cues to place a sound
    const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.8; presence.gain.value = 4; presence.connect(this.master); this.nodes.push(presence);
    const f = this.frequency;
    if (this.timbre === 'string') {
      this.sustain = 0.17;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; lp.Q.value = 0.9; lp.connect(presence); this.filter = lp; this.nodes.push(lp);
      const a = this._osc('sawtooth', f, lp, 0.5, -4), b = this._osc('sawtooth', f, lp, 0.5, 5), c = this._osc('sawtooth', f * 2, lp, 0.18, 0);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.3; vg.gain.value = 9; vib.connect(vg); [a, b, c].forEach(o => vg.connect(o.detune)); vib.start(this._t0); this.nodes.push(vib, vg);
      this._noise(lp, 0.085, 'bandpass', 3800, 0.5);   // the rasp of the bow: broadband, so it can be placed
    } else if (this.timbre === 'pad') {
      this.sustain = 0.12;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4600; lp.Q.value = 0.6; lp.connect(presence); this.nodes.push(lp);
      [-9, 0, 8].forEach(d => this._osc('sawtooth', f, lp, 0.3, d)); this._osc('sawtooth', f * 4, lp, 0.22, 5); this._osc('triangle', f * 2, lp, 0.3, 3);
      this._noise(lp, 0.06, 'bandpass', 4300, 0.6);   // an airy top, so the pad has something to be placed by
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.23; lg.gain.value = 900; l.connect(lg); lg.connect(lp.frequency); l.start(this._t0); this.nodes.push(l, lg);
    } else {
      this.sustain = 1;   // the woodblock's loudness comes from its own strikes; a faint rattle keeps it placeable between them
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.4; bp.connect(presence); this.nodes.push(bp);
      const rattle = this._noise(bp, 0.018, 'highpass', 1500, 0.5); const fl = ctx.createOscillator(), fg = ctx.createGain(); fl.frequency.value = 7; fg.gain.value = 0.009; fl.connect(fg); fg.connect(rattle.gain); fl.start(this._t0); this.nodes.push(fl, fg);
      this.strikeDest = presence;
    }
  }
  /** One accent at time t (on the audio clock). */
  _accent(t) {
    const ctx = this.ctx, g = this.master.gain;
    if (this.timbre === 'string') {
      g.setValueAtTime(this.sustain, t); g.linearRampToValueAtTime(0.55, t + 0.03); g.exponentialRampToValueAtTime(this.sustain + 0.001, t + 0.5); g.linearRampToValueAtTime(this.sustain, t + 0.52);
      const c = this.filter.frequency; c.setValueAtTime(3200, t); c.linearRampToValueAtTime(6500, t + 0.03); c.exponentialRampToValueAtTime(3800, t + 0.5);
    } else if (this.timbre === 'pad') {
      g.setValueAtTime(this.sustain, t); g.linearRampToValueAtTime(0.3, t + 0.16); g.exponentialRampToValueAtTime(this.sustain + 0.001, t + 0.95); g.linearRampToValueAtTime(this.sustain, t + 0.98);
    } else {   // a strike: a burst of noise through two wooden resonances, and a short falling tick
      const src = ctx.createBufferSource(), env = ctx.createGain(); src.buffer = noiseBuffer(ctx);
      const r1 = ctx.createBiquadFilter(), r2 = ctx.createBiquadFilter(); r1.type = r2.type = 'bandpass'; r1.frequency.value = 1150; r1.Q.value = 9; r2.frequency.value = 2700; r2.Q.value = 11;
      const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 1.0; g2.gain.value = 0.7;
      src.connect(r1); src.connect(r2); r1.connect(g1); r2.connect(g2); g1.connect(env); g2.connect(env); env.connect(this.strikeDest || this.master);
      env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.9, t + 0.003); env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      src.start(t, Math.random() * 1.5); src.stop(t + 0.25);
      const tick = ctx.createOscillator(), tg = ctx.createGain(); tick.type = 'sine'; tick.frequency.setValueAtTime(1500, t); tick.frequency.exponentialRampToValueAtTime(700, t + 0.04); tg.gain.setValueAtTime(0.3, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      tick.connect(tg); tg.connect(this.strikeDest || this.master); tick.start(t); tick.stop(t + 0.08);
    }
  }
  /** Schedules every accent that falls before the horizon. */
  scheduleUntil(horizon) {
    while (this._nextBeat < horizon) {
      const t = this._nextBeat; this._accent(t);
      if (this.onBeat) { const ms = Math.max(0, (t - this.ctx.currentTime) * 1000); setTimeout(() => { if (!this._stopped && this.onBeat) this.onBeat(); }, ms); }
      this._nextBeat += this.beatInterval;
    }
  }
  startRhythm(at = this.ctx.currentTime + 0.05, live = true) {
    this._stopped = false; this._nextBeat = at; this.master.gain.setValueAtTime(this.sustain, at);
    if (live) { const tick = () => { if (this._stopped) return; this.scheduleUntil(this.ctx.currentTime + 0.35); this._tid = setTimeout(tick, 100); }; tick(); }
  }
  stopRhythm() {
    this._stopped = true; clearTimeout(this._tid); this._tid = null;
    if (this.master) { const g = this.master.gain, now = this.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.08); }
  }
  destroy() {
    this.stopRhythm();
    for (const n of this.nodes) { try { n.stop && n.stop(); } catch { /* not started or stopped */ } try { n.disconnect(); } catch { /* gone */ } }
    this.nodes = []; if (this.master) { try { this.master.disconnect(); } catch { /* gone */ } this.master = null; }
    if (this.resonanceSource) { try { this.resonanceSource.input.disconnect(); } catch { /* gone */ } this.resonanceSource = null; }
  }
  setPosition(x, y, z) { this.position = { x, y, z }; if (this.resonanceSource) this.resonanceSource.setPosition(x, y, z); }
}
