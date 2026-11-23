/**
 * /assets/js/ambience/synth.js
 * Small, soft instruments built from oscillators, shared by Ambience and the Semantic Synth so they sound like one family.
 * `makeSynth(ctx)` returns { rhodes, pad, bass, pluck, bell }, each (out, time, hz, dur, vel): `out` is the node to play into,
 * `time` and `dur` are in seconds on the context's clock, `vel` is 0 to 1. Nothing here keeps state, and every oscillator stops itself.
 */
export function makeSynth(ctx) {
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
  return synth;
}
