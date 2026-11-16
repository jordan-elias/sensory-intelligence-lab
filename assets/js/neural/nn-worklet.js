/**
 * /assets/js/neural/nn-worklet.js
 * The network as an oscillator, running in the audio thread. For every sample it advances a phase φ (0 to 1, many times a
 * second), feeds [sin φ, cos φ, sin 2φ, cos 2φ, knob A, knob B] through the network, and plays the first two outputs.
 * The forward pass is the same arithmetic as net.js; tests/neural/synth.test.mjs checks the two agree.
 */
const TAU = Math.PI * 2;
const ACT = { tanh: Math.tanh, softsign: z => z / (1 + Math.abs(z)), relu: z => (z > 0 ? z : 0.05 * z), sine: Math.sin };

class NNOsc extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = null; this.phase = 0; this.freq = 220; this.f = 220; this.gate = 0; this.env = 0; this.a = 0; this.b = 0; this.sa = 0; this.sb = 0;
    this.wob = 0; this.wobRate = 0; this.wobPh = 0; this.level = 0.3; this.dcL = 0; this.dcR = 0; this.bufs = [new Float64Array(6), new Float64Array(16), new Float64Array(16), new Float64Array(16)];
    this.port.onmessage = e => {
      const m = e.data;
      if (m.type === 'net') this.p = m.p;
      else if (m.type === 'play') { if (m.freq != null) this.freq = m.freq; if (m.gate != null) this.gate = m.gate; if (m.a != null) this.a = m.a; if (m.b != null) this.b = m.b; if (m.wob != null) this.wob = m.wob; if (m.wobRate != null) this.wobRate = m.wobRate; if (m.level != null) this.level = m.level; }
    };
  }
  run(x) {
    const p = this.p, L = p.sizes.length - 1;
    let a = x;
    for (let l = 0; l < L; l++) {
      const nin = p.sizes[l], nout = p.sizes[l + 1], W = p.W[l], B = p.B[l], mute = p.mute[l + 1], f = l === L - 1 ? Math.tanh : (ACT[p.act[l]] || Math.tanh), out = this.bufs[l + 1];
      for (let j = 0; j < nout; j++) { let s = B[j]; const row = j * nin; for (let i = 0; i < nin; i++) s += W[row + i] * a[i]; out[j] = mute[j] ? 0 : f(s); }
      a = out;
    }
    return a;
  }
  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    if (!this.p) return true;
    const gl = 1 - Math.exp(-1 / (0.012 * sampleRate)), up = 1 - Math.exp(-1 / (0.006 * sampleRate)), down = 1 - Math.exp(-1 / (0.12 * sampleRate)), sm = 1 - Math.exp(-1 / (0.02 * sampleRate)), hp = 1 - Math.exp(-TAU * 18 / sampleRate);
    const x = this.bufs[0];
    for (let k = 0; k < n; k++) {
      this.env += ((this.gate ? 1 : 0) - this.env) * (this.gate ? up : down);
      if (this.env < 1e-4 && !this.gate) { L[k] = 0; R[k] = 0; continue; }
      this.f += (this.freq - this.f) * gl; this.phase += this.f / sampleRate; if (this.phase >= 1) this.phase -= 1;
      this.sa += (this.a - this.sa) * sm; this.sb += (this.b - this.sb) * sm;
      this.wobPh += this.wobRate / sampleRate; if (this.wobPh >= 1) this.wobPh -= 1;
      const A = Math.max(-1, Math.min(1, this.sa + this.wob * Math.sin(TAU * this.wobPh)));
      x[0] = Math.sin(TAU * this.phase); x[1] = Math.cos(TAU * this.phase); x[2] = Math.sin(2 * TAU * this.phase); x[3] = Math.cos(2 * TAU * this.phase); x[4] = A; x[5] = this.sb;
      const y = this.run(x), l = y[0], r = y[1];
      this.dcL += (l - this.dcL) * hp; this.dcR += (r - this.dcR) * hp;          // the steady part of a wave is silent but eats headroom
      L[k] = (l - this.dcL) * this.env * this.level; R[k] = (r - this.dcR) * this.env * this.level;
    }
    return true;
  }
}
registerProcessor('nn-osc', NNOsc);
