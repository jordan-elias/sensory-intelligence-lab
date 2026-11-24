/**
 * /assets/js/oramics/voices.js
 * One voice bank and master chain, used by both the live instrument and the WAV export so the file sounds like the page.
 * apply(params, when, { instant }) takes what voiceParams (curves.js) returned: live it glides (setTargetAtTime), offline it steps (setValueAtTime).
 */
import { voiceHz } from './curves.js';

/** The master chain: gain → limiter → (analyser) → destination. Returns the node to connect voices to. */
export function makeMaster(ctx, { analyser = false } = {}) {
  const gain = ctx.createGain(); gain.gain.value = 0.7;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.005; lim.release.value = 0.1;
  gain.connect(lim); let an = null;
  if (analyser) { an = ctx.createAnalyser(); an.fftSize = 256; lim.connect(an); an.connect(ctx.destination); } else lim.connect(ctx.destination);
  return { input: gain, analyser: an };
}

export function createVoiceBank(ctx, dest, { count = 1, wave = 'sine', analog = false, rand = Math.random } = {}) {
  let voices = [], lfo = null, lfoGain = null, opts = { count, wave, analog };
  const ensureLfo = () => {
    if (lfo) return;
    lfo = ctx.createOscillator(); lfoGain = ctx.createGain(); lfo.type = 'sine'; lfo.frequency.value = 0.7; lfoGain.gain.value = opts.analog ? 8 : 0; lfo.connect(lfoGain); lfo.start();
  };
  function dispose() { for (const v of voices) for (const n of [v.osc, v.vibLFO, v.fmLFO]) { try { n.stop(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* gone */ } } voices = []; }
  function build() {
    dispose(); ensureLfo();
    for (let i = 0; i < opts.count; i++) {
      const osc = ctx.createOscillator(), oscGain = ctx.createGain(), filter = ctx.createBiquadFilter(), vGain = ctx.createGain();
      const vibLFO = ctx.createOscillator(), vibGain = ctx.createGain(), fmLFO = ctx.createOscillator(), fmGain = ctx.createGain();
      vibLFO.type = 'sine'; vibLFO.frequency.value = 5.5; vibGain.gain.value = 0; vibLFO.connect(vibGain); vibGain.connect(osc.frequency);
      fmLFO.type = 'sine'; fmLFO.frequency.value = 2.3; fmGain.gain.value = 0; fmLFO.connect(fmGain); fmGain.connect(osc.frequency);
      lfoGain.connect(osc.frequency);
      filter.type = 'lowpass'; filter.frequency.value = 2000; filter.Q.value = 1.2;
      osc.type = opts.wave; osc.frequency.value = 220; oscGain.gain.value = 0; vGain.gain.value = 0;
      osc.connect(oscGain); oscGain.connect(filter); filter.connect(vGain); vGain.connect(dest);
      osc.start(); vibLFO.start(); fmLFO.start();
      voices.push({ osc, oscGain, filter, vGain, vibLFO, vibGain, fmLFO, fmGain });
    }
  }
  build();
  const bank = {
    get voices() { return voices; }, get count() { return opts.count; },
    setCount(n) { opts.count = Math.max(1, Math.min(6, n | 0)); build(); },
    setWave(w) { opts.wave = w; for (const v of voices) v.osc.type = w; },
    setAnalog(on) { opts.analog = on; ensureLfo(); lfoGain.gain.setTargetAtTime(on ? 8 : 0, ctx.currentTime, 0.3); },
    apply(p, when = ctx.currentTime, { instant = false, tc = 0.06 } = {}) {
      const set = (param, v, k = 1) => instant ? param.setValueAtTime(v, when) : param.setTargetAtTime(v, when, tc * k);
      const drift = opts.analog && p.hz ? (rand() - 0.5) * p.hz * 0.004 : 0;
      voices.forEach((v, i) => {
        if (p.hz > 0 && p.amp > 0) { set(v.osc.frequency, voiceHz(p.hz + drift, i, opts.count)); set(v.oscGain.gain, p.amp * 0.6); } else set(v.oscGain.gain, 0);
        set(v.filter.frequency, p.cutoff, 2); set(v.vGain.gain, 1); set(v.vibGain.gain, p.vibrato); set(v.fmGain.gain, p.fmDepth);
        if (instant) v.fmLFO.frequency.setValueAtTime(p.fmRate, when); else v.fmLFO.frequency.setTargetAtTime(p.fmRate, when, tc);
      });
    },
    /** A short preview tone while drawing on the pitch layer. */
    preview(hz, level = 0.35) { const v = voices[0]; if (!v) return; v.osc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.02); v.oscGain.gain.setTargetAtTime(level, ctx.currentTime, 0.02); v.vGain.gain.value = 1; },
    silence(tc = 0.08) { for (const v of voices) v.oscGain.gain.setTargetAtTime(0, ctx.currentTime, tc); },
    dispose,
  };
  return bank;
}
