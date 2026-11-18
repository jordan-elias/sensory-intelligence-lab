/**
 * /assets/js/seq/voices.js
 * The Sequencer's drum, bass and lead sounds as functions of an AudioContext, so that other pages (the Experiments
 * workbench) play exactly what the Sequencer plays. Each takes `dest`, the node to send sound to.
 */
const noise = (ctx, secs) => { const n = Math.max(1, Math.floor(ctx.sampleRate * secs)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; };

export function makeVoices(ctx, dest) {
  const out = dest || ctx.destination;
  return {
    kick(time, vol) {
      const g = ctx.createGain(), o = ctx.createOscillator(), click = ctx.createOscillator(), cg = ctx.createGain();
      o.connect(g); g.connect(out); o.type = 'sine'; o.frequency.setValueAtTime(150, time); o.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      g.gain.setValueAtTime(vol * 1.2, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
      click.connect(cg); cg.connect(out); click.type = 'square'; click.frequency.value = 800;
      cg.gain.setValueAtTime(vol * 0.4, time); cg.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
      o.start(time); o.stop(time + 0.4); click.start(time); click.stop(time + 0.03);
    },
    snare(time, vol) {
      const src = ctx.createBufferSource(), hpf = ctx.createBiquadFilter(), g = ctx.createGain(), o = ctx.createOscillator(), og = ctx.createGain();
      src.buffer = noise(ctx, 0.2); hpf.type = 'highpass'; hpf.frequency.value = 1500; src.connect(hpf); hpf.connect(g); g.connect(out);
      g.gain.setValueAtTime(vol * 0.9, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      o.type = 'triangle'; o.frequency.value = 180; o.connect(og); og.connect(out);
      og.gain.setValueAtTime(vol * 0.4, time); og.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      src.start(time); src.stop(time + 0.22); o.start(time); o.stop(time + 0.1);
    },
    hihat(time, vol, open) {
      const len = open ? 0.35 : 0.06, src = ctx.createBufferSource(), hpf = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noise(ctx, len); hpf.type = 'highpass'; hpf.frequency.value = 7000; hpf.Q.value = 0.7; src.connect(hpf); hpf.connect(g); g.connect(out);
      g.gain.setValueAtTime(vol * 0.6, time); g.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.32 : 0.055));
      src.start(time); src.stop(time + len + 0.01);
    },
    cymbal(time, vol) {
      const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noise(ctx, 0.7); bp.type = 'bandpass'; bp.frequency.value = 5000; bp.Q.value = 0.5; src.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(vol * 0.55, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.65);
      src.start(time); src.stop(time + 0.72);
    },
    bass(time, hz, vol) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lpf = ctx.createBiquadFilter(), g = ctx.createGain(), g2 = ctx.createGain();
      lpf.type = 'lowpass'; lpf.frequency.value = 500; lpf.Q.value = 1.5; o.type = 'sawtooth'; o.frequency.value = hz; o2.type = 'square'; o2.frequency.value = hz; g2.gain.value = 0.3;
      o.connect(lpf); o2.connect(g2); g2.connect(lpf); lpf.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.001, time); g.gain.linearRampToValueAtTime(vol * 0.7, time + 0.015); g.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
      o.start(time); o.stop(time + 0.32); o2.start(time); o2.stop(time + 0.32);
    },
    lead(time, hz, vol, variant = 0) {
      const o = ctx.createOscillator(), lpf = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = ['triangle', 'sawtooth', 'sine'][variant % 3]; lpf.type = 'lowpass'; lpf.frequency.value = [1800, 2400, 1200][variant % 3]; lpf.Q.value = 1.2; o.frequency.value = hz * 2;
      o.connect(lpf); lpf.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.001, time); g.gain.linearRampToValueAtTime(vol * 0.5, time + 0.02); g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
      o.start(time); o.stop(time + 0.25);
    },
  };
}
