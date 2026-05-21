/**
 * neural-synthesis/audio-worklet.js
 *
 * AudioWorkletProcessor — dedicated audio thread.
 * Implements: x(t) = tanh( W · x(t-1) + I(t) + bias )
 *
 * Dual communication mode:
 *   SAB mode    — reads/writes shared Float32Array directly (zero-copy)
 *   Fallback mode — receives state via postMessage, sends readback
 *
 * processorOptions:
 *   useSAB: boolean
 *   SAB mode:      { sab, panSab }
 *   Fallback mode: { sabLength, maxN }
 */

const MAX_N       = 12;
const SAMPLE_RATE = 44100;

/* Offsets — must match audio-engine.js */
const OFF_X        = 0;
const OFF_FREQ     = MAX_N;
const OFF_BIAS     = MAX_N * 2;
const OFF_W        = MAX_N * 3;
const OFF_ENERGY   = MAX_N * 3 + MAX_N * MAX_N;
const OFF_COUNT    = OFF_ENERGY + 1;
const OFF_TYPES    = OFF_COUNT  + 1;
const OFF_INJ      = OFF_TYPES  + MAX_N;
const OFF_INST     = OFF_INJ    + MAX_N;
const OFF_REC      = OFF_INST   + 1;
const OFF_SAT      = OFF_REC    + 1;
const OFF_META     = OFF_SAT    + 1;
const OFF_ENVGAIN  = OFF_META   + 1;
const SAB_LENGTH   = OFF_ENVGAIN + 1;

/* ── Math helpers ───────────────────────────────────────────────── */
function tanhClip(x) {
  if (x >  4) return  1;
  if (x < -4) return -1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

function wavefold(x, amount) {
  const v      = x * (amount * 2 + 1);
  const period = 4;
  const mod    = ((v % period) + period) % period;
  return mod < 2 ? mod - 1 : 3 - mod;
}

function onePole(prev, input, coeff) {
  return prev * coeff + input * (1 - coeff);
}

/* ── Ring buffer ────────────────────────────────────────────────── */
class RingBuffer {
  constructor(maxSamples) {
    this.buf  = new Float32Array(maxSamples);
    this.size = maxSamples;
    this.ptr  = 0;
  }
  write(v) {
    this.buf[this.ptr] = v;
    this.ptr = (this.ptr + 1) % this.size;
  }
  read(delaySamples) {
    const d = Math.max(1, Math.min(this.size - 1, Math.round(delaySamples)));
    return this.buf[(this.ptr - d + this.size) % this.size];
  }
}

/* ── Rolling mean ───────────────────────────────────────────────── */
class RollingMean {
  constructor(n) {
    this.buf = new Float32Array(n);
    this.size = n; this.ptr = 0; this.sum = 0;
  }
  update(v) {
    this.sum -= this.buf[this.ptr];
    this.buf[this.ptr] = v;
    this.sum += v;
    this.ptr = (this.ptr + 1) % this.size;
    return this.sum / this.size;
  }
}

/* ── Oscillator phase ───────────────────────────────────────────── */
class OscPhase {
  constructor() { this.phase = Math.random() * Math.PI * 2; }
  next(freqHz) {
    this.phase += (2 * Math.PI * freqHz) / SAMPLE_RATE;
    if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;
    return Math.sin(this.phase);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PROCESSOR
   ═══════════════════════════════════════════════════════════════════ */
class NeuralSynthProcessor extends AudioWorkletProcessor {

  constructor(options) {
    super();

    const opts    = options.processorOptions || {};
    this._useSAB  = opts.useSAB === true;

    if (this._useSAB && opts.sab) {
      /* SAB mode */
      this._data = new Float32Array(opts.sab);
      this._pan  = new Int16Array(opts.panSab);
    } else {
      /* Fallback mode — local arrays, populated via postMessage */
      this._data = new Float32Array(SAB_LENGTH);
      this._pan  = new Int16Array(MAX_N);
      /* Default params */
      this._data[OFF_INST]  = 0.4;
      this._data[OFF_REC]   = 0.5;
      this._data[OFF_SAT]   = 0.35;
      this._data[OFF_META]  = 0.4;
      this._data[OFF_COUNT] = 4;
    }

    /* Per-node processing state */
    this._x           = new Float32Array(MAX_N);
    this._xPrev       = new Float32Array(MAX_N);
    this._oscPhase    = Array.from({ length: MAX_N }, () => new OscPhase());
    this._filterState = new Float32Array(MAX_N);
    this._delayBufs   = Array.from({ length: MAX_N },
      () => new RingBuffer(SAMPLE_RATE * 2));
    this._predMeans   = Array.from({ length: MAX_N },
      () => new RollingMean(Math.floor(SAMPLE_RATE * 0.1)));
    this._smoothE     = new Float32Array(MAX_N);
    this._depression  = new Float32Array(MAX_N * MAX_N).fill(1.0);

    this._envInput    = 0;
    this._sampleCount = 0;

    /* Metabolic rhythm */
    this._onsetHistory   = new Float32Array(16);
    this._onsetPtr       = 0;
    this._lastOnset      = 0;
    this._dominantPeriod = SAMPLE_RATE * 0.5;

    /* Readback scheduling (fallback mode) */
    this._readbackCounter = 0;
    this._READBACK_EVERY  = 512;   /* send activation snapshot every 512 samples */

    /* postMessage handler */
    this.port.onmessage = e => this._handleMessage(e.data);

    /* Signal ready */
    this.port.postMessage({ type: 'ready' });
  }

  /* ── Message handler (fallback mode) ────────────────────────── */
  _handleMessage(msg) {
    if (!msg) return;
    const d = this._data;

    switch (msg.type) {
      case 'env':
        this._envInput = msg.level || 0;
        break;

      case 'setState':
        if (msg.data) {
          for (let i = 0; i < Math.min(msg.data.length, SAB_LENGTH); i++) {
            d[i] = msg.data[i];
          }
        }
        if (msg.pan) {
          for (let i = 0; i < Math.min(msg.pan.length, MAX_N); i++) {
            this._pan[i] = msg.pan[i];
          }
        }
        break;

      case 'setParam':
        if (msg.offset >= 0 && msg.offset < SAB_LENGTH) {
          d[msg.offset] = msg.value;
        }
        break;

      case 'setWeights':
        if (msg.weights) {
          const maxW = MAX_N * MAX_N;
          for (let i = 0; i < Math.min(msg.weights.length, maxW); i++) {
            d[OFF_W + i] = msg.weights[i];
          }
        }
        break;

      case 'setFreqs':
        if (msg.freqs) {
          for (let i = 0; i < Math.min(msg.freqs.length, MAX_N); i++) {
            d[OFF_FREQ + i] = msg.freqs[i];
          }
        }
        break;

      case 'setBiases':
        if (msg.biases) {
          for (let i = 0; i < Math.min(msg.biases.length, MAX_N); i++) {
            d[OFF_BIAS + i] = msg.biases[i];
          }
        }
        break;

      case 'setTypes':
        if (msg.types) {
          for (let i = 0; i < Math.min(msg.types.length, MAX_N); i++) {
            d[OFF_TYPES + i] = msg.types[i];
          }
        }
        break;

      case 'inject':
        if (msg.index >= 0 && msg.index < MAX_N) {
          d[OFF_INJ + msg.index] = Math.max(0,
            Math.min(2, (d[OFF_INJ + msg.index] || 0) + (msg.amount || 0)));
        }
        break;

      case 'setPan':
        if (msg.index >= 0 && msg.index < MAX_N) {
          this._pan[msg.index] = msg.value;
        }
        break;

      default:
        break;
    }
  }

  /* ── Metabolic period detection ─────────────────────────────── */
  _updateMetabolicPeriod(totalEnergy, N) {
    const threshold = 0.4 * N;
    if (totalEnergy > threshold && this._sampleCount - this._lastOnset > 512) {
      const interval = this._sampleCount - this._lastOnset;
      this._lastOnset = this._sampleCount;
      this._onsetHistory[this._onsetPtr] = interval;
      this._onsetPtr = (this._onsetPtr + 1) % this._onsetHistory.length;
      const sorted = this._onsetHistory.slice().sort((a, b) => a - b);
      this._dominantPeriod = sorted[Math.floor(sorted.length / 2)];
    }
  }

  /* ── Process ─────────────────────────────────────────────────── */
  process(inputs, outputs) {
    const output = outputs[0];
    const outL   = output[0];
    const outR   = output[1] || output[0];
    if (!outL) return true;

    const blockSize   = outL.length;
    const d           = this._data;
    const instability = Math.max(0, Math.min(1, d[OFF_INST]));
    const recurrence  = Math.max(0, Math.min(1, d[OFF_REC]));
    const saturation  = Math.max(0, Math.min(1, d[OFF_SAT]));
    const metabolism  = Math.max(0.01, Math.min(1, d[OFF_META]));
    const envGain     = Math.max(0, Math.min(1, d[OFF_ENVGAIN]));
    const N           = Math.max(1, Math.min(MAX_N, Math.round(d[OFF_COUNT])));
    const decayCoeff  = 1 - (metabolism * 0.0003 + 0.0001);

    /* Read one-shot injections */
    const injections = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      injections[i] = d[OFF_INJ + i];
      if (d[OFF_INJ + i] > 0) d[OFF_INJ + i] = 0;
    }

    let totalEnergy = 0;

    for (let s = 0; s < blockSize; s++) {
      this._sampleCount++;

      /* Weighted input sums */
      const netInput = new Float32Array(N);
      for (let j = 0; j < N; j++) {
        let sum = d[OFF_BIAS + j];
        for (let i = 0; i < N; i++) {
          if (i === j) continue;
          const w = d[OFF_W + i * MAX_N + j];
          if (w === 0) continue;
          const depIdx = i * MAX_N + j;
          const dep    = this._depression[depIdx];
          const sig    = this._xPrev[i] * w * dep * recurrence;
          sum += sig;
          const absSig = Math.abs(sig);
          if (absSig > 0.05) {
            this._depression[depIdx] = Math.max(0.15, dep - 0.0002 * instability);
          } else {
            this._depression[depIdx] = Math.min(1.0, dep + 0.00008);
          }
        }
        sum += injections[j];
        sum += (Math.random() - 0.5) * instability * 0.18;
        netInput[j] = sum;
      }

      /* Node activations */
      totalEnergy = 0;
      for (let i = 0; i < N; i++) {
        const type = Math.round(d[OFF_TYPES + i]);
        const inp  = netInput[i];
        let   out  = 0;

        switch (type) {
          case 0: { /* oscillator */
            const sine  = this._oscPhase[i].next(Math.max(20, d[OFF_FREQ + i]));
            const mixed = inp * 0.55 + sine * (0.45 + this._smoothE[i] * 0.3);
            out = tanhClip(mixed * (1 + saturation));
            break;
          }
          case 1: { /* filter */
            const coeff    = Math.max(0.1, 0.75 - this._smoothE[i] * 0.45);
            const filtered = onePole(this._filterState[i], inp, coeff);
            this._filterState[i] = filtered;
            out = tanhClip(filtered * 1.2);
            break;
          }
          case 2: { /* nonlinear */
            out = tanhClip(wavefold(inp, saturation * 0.8) + inp * 0.3);
            break;
          }
          case 3: { /* delay */
            const subdivs   = [1, 0.75, 0.5, 0.333, 0.25, 0.167];
            const delaySamp = this._dominantPeriod * subdivs[i % subdivs.length];
            this._delayBufs[i].write(inp);
            out = tanhClip(this._delayBufs[i].read(delaySamp) * 0.85 + inp * 0.15);
            break;
          }
          case 4: { /* predictive */
            const mean   = this._predMeans[i].update(inp);
            out = tanhClip(-(inp - mean) * (1.5 + saturation));
            break;
          }
          case 5: { /* environment */
            out = tanhClip(inp * 0.5 + this._envInput * envGain * 0.9);
            break;
          }
          default:
            out = tanhClip(inp);
        }

        this._x[i]      = out;
        this._smoothE[i]= this._smoothE[i] * decayCoeff + Math.abs(out) * (1 - decayCoeff);
        totalEnergy     += this._smoothE[i];
      }

      /* Stereo output */
      let outSampleL = 0, outSampleR = 0;
      for (let i = 0; i < N; i++) {
        const panVal = this._pan[i] / 1000;
        const gainL  = Math.max(0, 1 - panVal) * 0.5;
        const gainR  = Math.max(0, 1 + panVal) * 0.5;
        const sig    = this._x[i] * this._smoothE[i];
        outSampleL  += sig * gainL;
        outSampleR  += sig * gainR;
      }
      outL[s] = tanhClip(outSampleL * 0.35);
      outR[s] = tanhClip(outSampleR * 0.35);

      /* Advance state */
      for (let i = 0; i < N; i++) this._xPrev[i] = this._x[i];

      if (this._sampleCount % 64 === 0) {
        this._updateMetabolicPeriod(totalEnergy, N);
      }
    }

    /* Write back to shared state */
    const normalizedEnergy = Math.min(1, totalEnergy / Math.max(1, N));
    d[OFF_ENERGY] = normalizedEnergy;
    for (let i = 0; i < N; i++) d[OFF_X + i] = this._x[i];

    /* Fallback readback — send activations to main thread periodically */
    if (!this._useSAB) {
      this._readbackCounter += blockSize;
      if (this._readbackCounter >= this._READBACK_EVERY) {
        this._readbackCounter = 0;
        this.port.postMessage({
          type:        'readback',
          activations: Array.from(this._x.slice(0, N)),
          energy:      normalizedEnergy,
        });
      }
    }

    return true;
  }
}

registerProcessor('neural-synth-processor', NeuralSynthProcessor);
