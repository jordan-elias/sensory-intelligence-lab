/**
 * neural-synthesis/audio-worklet.js
 *
 * AudioWorkletProcessor — runs on the dedicated audio rendering thread.
 * Implements the full RNN matrix equation at sample rate:
 *
 *   x(t) = tanh( W · x(t-1) + I(t) + bias )
 *
 * where:
 *   x(t)    — node activation vector, length N (max 12)
 *   W       — weight matrix, N×N, updated from main thread via SharedArrayBuffer
 *   I(t)    — external input vector (environment node, energy injections)
 *   bias    — per-node bias vector
 *
 * Communication with main thread:
 *   SharedArrayBuffer layout (Float32Array):
 *     [0..N-1]       — x: current activation outputs (written here, read main)
 *     [N..N+N-1]     — freq: oscillator frequency targets (written main, read here)
 *     [N*2..N*3-1]   — bias: per-node bias (written main, read here)
 *     [N*3..N*3+N*N-1] — W: weight matrix row-major (written main, read here)
 *     [N*3+N*N]      — energyLevel: scalar 0..1 (written here, read main)
 *     [N*3+N*N+1]    — nodeCount: active node count (written main, read here)
 *     [N*3+N*N+2..N*3+N*N+2+N-1] — nodeTypes: 0=osc,1=filt,2=nl,3=delay,4=pred,5=env
 *     [N*3+N*N+2+N..N*3+N*N+2+N*2-1] — injections: one-shot energy (written main, cleared here)
 *     [N*3+N*N+2+N*2] — instability: scalar param
 *     [N*3+N*N+2+N*2+1] — recurrence: scalar param
 *     [N*3+N*N+2+N*2+2] — saturation: scalar param
 *     [N*3+N*N+2+N*2+3] — metabolism: scalar param
 *     [N*3+N*N+2+N*2+4] — envGain: environment node input level
 *
 * The processor outputs a stereo signal built from the node activations,
 * with per-node panning derived from spatial position data passed via
 * a separate Int16Array (pan values scaled -1000..1000).
 *
 * Node type behaviours inside the RNN loop:
 *   oscillator  — adds a sine component at its target frequency to its activation
 *   filter      — applies a one-pole IIR lowpass to its activation history
 *   nonlinear   — applies an additional wavefold on top of tanh
 *   delay       — taps a per-node ring buffer at a metabolically-derived offset
 *   predictive  — computes a rolling mean of its input; outputs mean - current (inverse)
 *   environment — receives external mic input mixed into its activation
 */

const MAX_N       = 12;
const SAMPLE_RATE = 44100;

/* SharedArrayBuffer index helpers — must match main thread layout exactly */
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
/* total floats: OFF_ENVGAIN + 1 */
const SAB_LENGTH   = OFF_ENVGAIN + 1;

/* Pan SAB: Int16Array, length MAX_N, values -1000..1000 */

/* ─── Activation functions ─────────────────────────────────────── */
function tanhClip(x) {
  /* fast approximation of tanh for |x| < 4, hard clip outside */
  if (x >  4) return  1;
  if (x < -4) return -1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

function wavefold(x, amount) {
  /* Triangle wavefolder — folds signal back on itself */
  const a = amount * 2 + 1;
  const v = x * a;
  /* fold into -1..1 */
  const period = 4;
  const mod = ((v % period) + period) % period;
  return mod < 2 ? mod - 1 : 3 - mod;
}

function sigmoid(x) {
  return 2 / (1 + Math.exp(-x * 2)) - 1;
}

/* ─── One-pole IIR ─────────────────────────────────────────────── */
function onePole(prev, input, coeff) {
  return prev * coeff + input * (1 - coeff);
}

/* ─── Ring buffer for delay nodes ──────────────────────────────── */
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
    delaySamples = Math.max(1, Math.min(this.size - 1, Math.round(delaySamples)));
    const idx = (this.ptr - delaySamples + this.size) % this.size;
    return this.buf[idx];
  }
}

/* ─── Predictive node rolling statistics ───────────────────────── */
class RollingMean {
  constructor(windowSamples) {
    this.buf  = new Float32Array(windowSamples);
    this.size = windowSamples;
    this.ptr  = 0;
    this.sum  = 0;
  }
  update(v) {
    this.sum -= this.buf[this.ptr];
    this.buf[this.ptr] = v;
    this.sum += v;
    this.ptr = (this.ptr + 1) % this.size;
    return this.sum / this.size;
  }
}

/* ─── Per-node oscillator phase ────────────────────────────────── */
class OscillatorPhase {
  constructor() {
    this.phase = Math.random() * Math.PI * 2;
  }
  next(freqHz, sampleRate) {
    this.phase += (2 * Math.PI * freqHz) / sampleRate;
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

    /* Shared memory — handed off from main thread via options */
    this._sab    = options.processorOptions.sab;
    this._panSab = options.processorOptions.panSab;
    this._data   = new Float32Array(this._sab);
    this._pan    = new Int16Array(this._panSab);

    /* Per-node state — allocated for MAX_N regardless of active count */
    this._x     = new Float32Array(MAX_N);   /* current activations */
    this._xPrev = new Float32Array(MAX_N);   /* previous activations */

    /* Oscillator phases */
    this._oscPhase = Array.from({ length: MAX_N }, () => new OscillatorPhase());

    /* Filter one-pole state */
    this._filterState = new Float32Array(MAX_N);

    /* Delay ring buffers — 2 seconds max */
    const maxDelaySamples = SAMPLE_RATE * 2;
    this._delayBufs = Array.from(
      { length: MAX_N },
      () => new RingBuffer(maxDelaySamples)
    );

    /* Predictive rolling means — 0.1s window */
    const predWindow = Math.floor(SAMPLE_RATE * 0.1);
    this._predMeans = Array.from(
      { length: MAX_N },
      () => new RollingMean(predWindow)
    );

    /* Smooth energy accumulator for status display */
    this._smoothEnergy = new Float32Array(MAX_N);

    /* Synaptic depression per edge — flat array N×N */
    this._depression = new Float32Array(MAX_N * MAX_N).fill(1.0);

    /* Environment microphone input accumulator */
    this._envInput = 0;

    /* Running sample counter for sub-sample events */
    this._sampleCount = 0;

    /* Metabolic rhythm detector — tracks dominant inter-onset interval */
    this._onsetHistory  = new Float32Array(16);
    this._onsetPtr      = 0;
    this._lastOnset     = 0;
    this._dominantPeriod = SAMPLE_RATE * 0.5; /* default 0.5s */

    /* Message from main thread: microphone sample buffer */
    this.port.onmessage = (e) => {
      if (e.data.type === 'env') {
        this._envInput = e.data.level;
      }
    };
  }

  /* ── Helpers ──────────────────────────────────────────────────── */

  _readParam(offset) {
    return this._data[offset];
  }

  _getNodeCount() {
    return Math.max(1, Math.min(MAX_N, Math.round(this._data[OFF_COUNT])));
  }

  _getNodeType(i) {
    return Math.round(this._data[OFF_TYPES + i]);
  }

  _getWeight(i, j, N) {
    /* W is stored row-major: W[i][j] = sab[OFF_W + i*N + j] */
    return this._data[OFF_W + i * MAX_N + j];
  }

  _getFreq(i) {
    return Math.max(20, Math.min(8000, this._data[OFF_FREQ + i]));
  }

  _getBias(i) {
    return this._data[OFF_BIAS + i];
  }

  _getPan(i) {
    return this._pan[i] / 1000;   /* -1..1 */
  }

  /* ── Metabolic period detection ───────────────────────────────── */
  _updateMetabolicPeriod(totalEnergy, N) {
    const threshold = 0.4 * N;
    if (totalEnergy > threshold && this._sampleCount - this._lastOnset > 512) {
      const interval = this._sampleCount - this._lastOnset;
      this._lastOnset = this._sampleCount;
      this._onsetHistory[this._onsetPtr] = interval;
      this._onsetPtr = (this._onsetPtr + 1) % this._onsetHistory.length;

      /* Median of recent intervals as dominant period */
      const sorted = this._onsetHistory.slice().sort((a, b) => a - b);
      this._dominantPeriod = sorted[Math.floor(sorted.length / 2)];
    }
  }

  /* ── Main process callback ────────────────────────────────────── */
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outL   = output[0];
    const outR   = output[1] || output[0];

    const blockSize = outL ? outL.length : 128;
    if (!outL) return true;

    const data        = this._data;
    const instability = Math.max(0, Math.min(1, data[OFF_INST]));
    const recurrence  = Math.max(0, Math.min(1, data[OFF_REC]));
    const saturation  = Math.max(0, Math.min(1, data[OFF_SAT]));
    const metabolism  = Math.max(0.01, Math.min(1, data[OFF_META]));
    const envGain     = Math.max(0, Math.min(1, data[OFF_ENVGAIN]));
    const N           = this._getNodeCount();

    /* Read one-shot injections (cleared after reading) */
    const injections = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      injections[i] = data[OFF_INJ + i];
      if (data[OFF_INJ + i] > 0) data[OFF_INJ + i] = 0;
    }

    /* Energy decay constant derived from metabolism */
    const decayCoeff = 1 - (metabolism * 0.0003 + 0.0001);

    /* Per-sample loop */
    for (let s = 0; s < blockSize; s++) {
      this._sampleCount++;

      /* ── Compute weighted input sum for each node ───────────── */
      const netInput = new Float32Array(N);

      for (let j = 0; j < N; j++) {
        let sum = this._getBias(j);

        for (let i = 0; i < N; i++) {
          if (i === j) continue;
          const w   = this._getWeight(i, j, N);
          if (w === 0) continue;

          const depIdx = i * MAX_N + j;
          const dep    = this._depression[depIdx];
          const sig    = this._xPrev[i] * w * dep * recurrence;

          sum += sig;

          /* Synaptic depression update — runs every sample, fast recovery */
          const absSig = Math.abs(sig);
          if (absSig > 0.05) {
            this._depression[depIdx] = Math.max(0.15, dep - 0.0002 * instability);
          } else {
            this._depression[depIdx] = Math.min(1.0,  dep + 0.00008);
          }
        }

        /* One-shot energy injection */
        sum += injections[j];

        /* Thermal noise proportional to instability */
        sum += (Math.random() - 0.5) * instability * 0.18;

        netInput[j] = sum;
      }

      /* ── Compute new activation per node type ───────────────── */
      let totalEnergy = 0;

      for (let i = 0; i < N; i++) {
        const type = this._getNodeType(i);
        const inp  = netInput[i];
        let   out  = 0;

        switch (type) {

          case 0: { /* oscillator */
            const sine = this._oscPhase[i].next(this._getFreq(i), SAMPLE_RATE);
            const mixed = inp * 0.55 + sine * (0.45 + this._smoothEnergy[i] * 0.3);
            out = tanhClip(mixed * (1 + saturation));
            break;
          }

          case 1: { /* filter — one-pole IIR lowpass */
            /* Cutoff coeff: high inp energy → more open */
            const energy  = this._smoothEnergy[i];
            const coeff   = 0.75 - energy * 0.45;
            const filtered = onePole(this._filterState[i], inp, Math.max(0.1, coeff));
            this._filterState[i] = filtered;
            out = tanhClip(filtered * 1.2);
            break;
          }

          case 2: { /* nonlinear — tanh + wavefold */
            const folded = wavefold(inp, saturation * 0.8);
            out = tanhClip(folded + inp * 0.3);
            break;
          }

          case 3: { /* delay — ring buffer tap */
            /* Delay time in samples: sub-multiple of dominant metabolic period */
            const subdivisions = [1, 0.75, 0.5, 0.333, 0.25, 0.167];
            const subIdx = i % subdivisions.length;
            const delaySamples = this._dominantPeriod * subdivisions[subIdx];
            this._delayBufs[i].write(inp);
            const delayed = this._delayBufs[i].read(delaySamples);
            out = tanhClip(delayed * 0.85 + inp * 0.15);
            break;
          }

          case 4: { /* predictive — inverse of rolling mean */
            const rollingMean = this._predMeans[i].update(inp);
            /* Output is the negated residual: pushes against expectation */
            const residual = inp - rollingMean;
            out = tanhClip(-residual * (1.5 + saturation));
            break;
          }

          case 5: { /* environment — microphone input */
            const envIn = this._envInput * envGain;
            out = tanhClip(inp * 0.5 + envIn * 0.9);
            break;
          }

          default:
            out = tanhClip(inp);
        }

        this._x[i] = out;
        this._smoothEnergy[i] = this._smoothEnergy[i] * decayCoeff + Math.abs(out) * (1 - decayCoeff);
        totalEnergy += this._smoothEnergy[i];
      }

      /* ── Write activations to output audio ──────────────────── */
      let outSampleL = 0;
      let outSampleR = 0;

      for (let i = 0; i < N; i++) {
        const pan  = this._getPan(i);               /* -1..1 */
        const gainL = Math.max(0, 1 - pan) * 0.5;
        const gainR = Math.max(0, 1 + pan) * 0.5;
        const sig   = this._x[i] * this._smoothEnergy[i];
        outSampleL += sig * gainL;
        outSampleR += sig * gainR;
      }

      /* Soft master clip */
      outL[s] = tanhClip(outSampleL * 0.35);
      outR[s] = tanhClip(outSampleR * 0.35);

      /* ── Advance state ──────────────────────────────────────── */
      for (let i = 0; i < N; i++) {
        this._xPrev[i] = this._x[i];
      }

      /* ── Metabolic period detection (every 64 samples) ──────── */
      if (this._sampleCount % 64 === 0) {
        this._updateMetabolicPeriod(totalEnergy, N);
      }
    }

    /* ── Write state to SharedArrayBuffer for main thread ──────── */
    const normalizedEnergy = Math.min(1, totalEnergy / Math.max(1, N));
    data[OFF_ENERGY] = normalizedEnergy;
    for (let i = 0; i < N; i++) {
      data[OFF_X + i] = this._x[i];
    }

    return true; /* keep processor alive */
  }
}

registerProcessor('neural-synth-processor', NeuralSynthProcessor);
