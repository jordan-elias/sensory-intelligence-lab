/**
 * /assets/js/experiments/synth.js
 * Four small instruments made of browser oscillators, for the note editor and the keyboard. The same function plays live
 * and into an offline render, so what you hear is what the saved file contains. Nothing is sampled or downloaded.
 */
export function playNote(ctx, dest, voice, hz, t, dur, vel = 0.8) {
  const g = ctx.createGain(), end = t + Math.max(0.06, dur);
  const nodes = [];
  const osc = (type, f, level) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); og.gain.value = level; o.connect(og); og.connect(g); o.start(t); o.stop(end + 0.5); nodes.push(o); };
  let lp = null;
  if (voice === 'pluck') { lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.35); osc('sawtooth', hz, 0.35); osc('square', hz * 1.003, 0.15); }
  else if (voice === 'bass') { lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; osc('sine', hz / 2, 0.7); osc('triangle', hz / 2, 0.3); }
  else if (voice === 'bell') { osc('sine', hz, 0.5); osc('sine', hz * 2.76, 0.18); osc('sine', hz * 5.4, 0.06); }
  else { osc('triangle', hz, 0.55); osc('sine', hz * 2, 0.12); }
  const peak = 0.4 * vel, hold = voice === 'pluck' || voice === 'bell' ? Math.min(dur, 0.12) : dur;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  if (voice === 'pluck' || voice === 'bell') g.gain.exponentialRampToValueAtTime(peak * 0.25, t + Math.max(0.15, hold + 0.2));
  g.gain.setValueAtTime(g.gain.value || peak * 0.25, Math.max(t + 0.02, end)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
  if (lp) { g.connect(lp); lp.connect(dest); } else g.connect(dest);
  return { stop(at = ctx.currentTime) { try { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, 0.02); nodes.forEach(n => n.stop(at + 0.15)); } catch { /* ended */ } } };
}
