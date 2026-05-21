/**
 * neural-synthesis/audio-engine.js
 *
 * Owns the AudioContext and everything downstream of the worklet.
 * Responsibilities:
 *   - Create and manage AudioContext
 *   - Allocate SharedArrayBuffers and hand them to the worklet
 *   - Build output chain: worklet → dynamics → reverb → master gain → destination
 *   - Handle microphone input: getUserMedia → analyser → spectral energy → worklet
 *   - Expose read/write API to main thread (network.js, main.js)
 *   - Manage graceful start/stop with fade in/out
 *
 * SharedArrayBuffer layout — must match audio-worklet.js exactly:
 *   Float32Array, length SAB_LENGTH
 *   [0..11]       x         current node activations (read by main)
 *   [12..23]      freq      oscillator frequency targets (written by main)
 *   [24..35]      bias      per-node bias (written by main)
 *   [36..179]     W         weight matrix 12×12 row-major (written by main)
 *   [180]         energyLevel
 *   [181]         nodeCount
 *   [182..193]    nodeTypes
 *   [194..205]    injections one-shot energy
 *   [206]         instability
 *   [207]         recurrence
 *   [208]         saturation
 *   [209]         metabolism
 *   [210]         envGain
 *
 *   Int16Array panSab, length 12 — spatial pan -1000..1000
 */

const MAX_N      = 12;
const SAB_LENGTH = 211;   /* must match worklet constant */

/* ── Shared buffer offsets ─────────────────────────────────────── */
export const OFF = Object.freeze({
  X:       0,
  FREQ:    MAX_N,
  BIAS:    MAX_N * 2,
  W:       MAX_N * 3,
  ENERGY:  MAX_N * 3 + MAX_N * MAX_N,
  COUNT:   MAX_N * 3 + MAX_N * MAX_N + 1,
  TYPES:   MAX_N * 3 + MAX_N * MAX_N + 2,
  INJ:     MAX_N * 3 + MAX_N * MAX_N + 2 + MAX_N,
  INST:    MAX_N * 3 + MAX_N * MAX_N + 2 + MAX_N * 2,
  REC:     MAX_N * 3 + MAX_N * MAX_N + 2 + MAX_N * 2 + 1,
  SAT:     MAX_N * 3 + MAX_N * MAX_N + 2 + MAX_N * 2 + 2,
  META:    MAX_N * 3 + MAX_N * MAX_N + 2 + MAX_N * 2 + 3,
  ENVGAIN: MAX_N * 3 + MAX_N * MAX_N + 2 + MAX_N * 2 + 4,
});

/* ── Module-level state ────────────────────────────────────────── */
let _ctx          = null;
let _workletNode  = null;
let _masterGain   = null;
let _limiter      = null;
let _reverb       = null;
let _reverbSend   = null;
let _dryGain      = null;

let _micStream    = null;
let _micSource    = null;
let _micAnalyser  = null;
let _micActive    = false;
let _micFrameId   = null;
let _micBuf       = null;

/* SharedArrayBuffers exposed for main thread access */
export let sab    = null;   /* Float32Array backing */
export let panSab = null;   /* Int16Array backing */
export let data   = null;   /* Float32Array view */
export let pan    = null;   /* Int16Array view */

let _isRunning = false;

/* ── Impulse response for convolution reverb ───────────────────── */
function buildImpulse(ctx, durationSec, decay) {
  const rate   = ctx.sampleRate;
  const len    = Math.floor(rate * durationSec);
  const buf    = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/* ── AudioContext creation ─────────────────────────────────────── */
function getContext() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate:  44100,
      latencyHint: 'playback',
    });
  }
  return _ctx;
}

async function resumeContext() {
  const ctx = getContext();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

/* ── Allocate shared memory ────────────────────────────────────── */
function allocateSharedBuffers() {
  const floatBytes = SAB_LENGTH * Float32Array.BYTES_PER_ELEMENT;
  const panBytes   = MAX_N     * Int16Array.BYTES_PER_ELEMENT;

  sab    = new SharedArrayBuffer(floatBytes);
  panSab = new SharedArrayBuffer(panBytes);
  data   = new Float32Array(sab);
  pan    = new Int16Array(panSab);

  /* Default parameter values */
  data[OFF.INST]    = 0.4;
  data[OFF.REC]     = 0.5;
  data[OFF.SAT]     = 0.35;
  data[OFF.META]    = 0.4;
  data[OFF.ENVGAIN] = 0.0;
  data[OFF.COUNT]   = 4;   /* start with 4 nodes */

  /* Default pan: evenly spread */
  for (let i = 0; i < MAX_N; i++) {
    pan[i] = Math.round(((i / (MAX_N - 1)) * 2 - 1) * 800);
  }
}

/* ── Build output audio graph ─────────────────────────────────── */
function buildOutputChain(ctx) {
  _masterGain = ctx.createGain();
  _masterGain.gain.value = 0;

  _limiter = ctx.createDynamicsCompressor();
  _limiter.threshold.value = -10;
  _limiter.knee.value      =  6;
  _limiter.ratio.value     = 20;
  _limiter.attack.value    = 0.004;
  _limiter.release.value   = 0.25;

  _reverb     = ctx.createConvolver();
  _reverb.buffer = buildImpulse(ctx, 3.2, 2.8);

  _reverbSend = ctx.createGain();
  _reverbSend.gain.value = 0.14;

  _dryGain    = ctx.createGain();
  _dryGain.gain.value = 0.86;

  /* Routing: worklet → masterGain → dryGain → limiter → destination
   *                                → reverbSend → reverb → destination */
  _masterGain.connect(_dryGain);
  _dryGain.connect(_limiter);
  _limiter.connect(ctx.destination);

  _masterGain.connect(_reverbSend);
  _reverbSend.connect(_reverb);
  _reverb.connect(ctx.destination);
}

/* ── Load and connect the AudioWorklet ────────────────────────── */
async function loadWorklet(ctx) {
  await ctx.audioWorklet.addModule('./audio-worklet.js');

  _workletNode = new AudioWorkletNode(ctx, 'neural-synth-processor', {
    numberOfInputs:  0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      sab:    sab,
      panSab: panSab,
    },
  });

  _workletNode.connect(_masterGain);
}

/* ── Microphone pipeline ──────────────────────────────────────── */
async function startMicrophone() {
  if (_micActive) return;
  try {
    _micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });

    const ctx     = getContext();
    _micSource    = ctx.createMediaStreamSource(_micStream);
    _micAnalyser  = ctx.createAnalyser();
    _micAnalyser.fftSize         = 256;
    _micAnalyser.smoothingTimeConstant = 0.75;
    _micBuf       = new Uint8Array(_micAnalyser.frequencyBinCount);

    _micSource.connect(_micAnalyser);
    _micActive = true;

    _pollMic();
  } catch (err) {
    console.warn('[AudioEngine] Microphone unavailable:', err.message);
    _micActive = false;
  }
}

function stopMicrophone() {
  if (!_micActive) return;
  if (_micFrameId) cancelAnimationFrame(_micFrameId);
  if (_micSource)  _micSource.disconnect();
  if (_micStream)  _micStream.getTracks().forEach(t => t.stop());
  _micSource   = null;
  _micAnalyser = null;
  _micStream   = null;
  _micActive   = false;
  _micFrameId  = null;

  /* Clear environment gain */
  if (data) data[OFF.ENVGAIN] = 0;
}

function _pollMic() {
  if (!_micActive || !_micAnalyser) return;
  _micAnalyser.getByteFrequencyData(_micBuf);

  /* Compute spectral centroid energy 0..1 */
  let sum = 0;
  for (let i = 0; i < _micBuf.length; i++) sum += _micBuf[i];
  const level = Math.min(1, sum / (_micBuf.length * 255) * 4);

  /* Send to worklet via message port */
  if (_workletNode) {
    _workletNode.port.postMessage({ type: 'env', level });
  }

  /* Also write spectral band energies into injection slots for
     environment nodes — node types are read in main thread,
     so we do a lightweight approximation here:
     low band → node 0 injection, mid → node 1, high → node 2 */
  if (data) {
    const binCount  = _micBuf.length;
    const lowEnd    = Math.floor(binCount * 0.15);
    const midStart  = Math.floor(binCount * 0.15);
    const midEnd    = Math.floor(binCount * 0.55);
    const highStart = Math.floor(binCount * 0.55);

    let lowE  = 0, midE = 0, highE = 0;
    for (let i = 0;         i < lowEnd;   i++) lowE  += _micBuf[i];
    for (let i = midStart;  i < midEnd;   i++) midE  += _micBuf[i];
    for (let i = highStart; i < binCount; i++) highE += _micBuf[i];

    lowE  = lowE  / (lowEnd              * 255);
    midE  = midE  / ((midEnd - midStart) * 255);
    highE = highE / ((binCount - highStart) * 255);

    data[OFF.ENVGAIN] = level;

    /* These will be read by network.js to distribute to env nodes */
    if (!window._micSpectrum) window._micSpectrum = { low: 0, mid: 0, high: 0 };
    window._micSpectrum.low  = lowE;
    window._micSpectrum.mid  = midE;
    window._micSpectrum.high = highE;
  }

  _micFrameId = requestAnimationFrame(_pollMic);
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Initialize shared buffers. Must be called before start().
 * Safe to call multiple times.
 */
export function initBuffers() {
  if (!sab) allocateSharedBuffers();
}

/**
 * Start the audio engine.
 * Creates AudioContext, loads worklet, builds output chain, fades in.
 */
export async function start(volumeNorm) {
  if (_isRunning) return;
  initBuffers();

  const ctx = await resumeContext();
  buildOutputChain(ctx);
  await loadWorklet(ctx);

  const vol = Math.max(0, Math.min(1, volumeNorm ?? 0.7));
  const now = ctx.currentTime;
  _masterGain.gain.setValueAtTime(0, now);
  _masterGain.gain.linearRampToValueAtTime(vol * 0.75, now + 1.4);

  _isRunning = true;
}

/**
 * Stop the audio engine with a short fade out.
 */
export function stop() {
  if (!_isRunning || !_ctx || !_masterGain) return;
  const now = _ctx.currentTime;
  _masterGain.gain.setValueAtTime(_masterGain.gain.value, now);
  _masterGain.gain.linearRampToValueAtTime(0, now + 0.7);

  setTimeout(() => {
    try { _workletNode?.disconnect(); } catch (_) {}
    try { _masterGain?.disconnect();  } catch (_) {}
    _workletNode = null;
    _masterGain  = null;
  }, 800);

  stopMicrophone();
  _isRunning = false;
}

/**
 * Set master volume (0..1) with smooth ramp.
 */
export function setVolume(v) {
  if (!_masterGain || !_ctx) return;
  _masterGain.gain.setTargetAtTime(
    Math.max(0, Math.min(1, v)) * 0.75,
    _ctx.currentTime,
    0.08
  );
}

/**
 * Set a scalar parameter in the shared buffer.
 * key: 'instability' | 'recurrence' | 'saturation' | 'metabolism'
 */
export function setParam(key, value) {
  if (!data) return;
  const offsets = {
    instability: OFF.INST,
    recurrence:  OFF.REC,
    saturation:  OFF.SAT,
    metabolism:  OFF.META,
  };
  if (offsets[key] !== undefined) {
    data[offsets[key]] = Math.max(0, Math.min(1, value));
  }
}

/**
 * Write the full weight matrix (Float32Array, length N*N, row-major).
 */
export function setWeightMatrix(W, N) {
  if (!data) return;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      data[OFF.W + i * MAX_N + j] = W[i * N + j] ?? 0;
    }
  }
}

/**
 * Write frequency targets for oscillator nodes (Hz).
 */
export function setFrequencies(freqs) {
  if (!data) return;
  for (let i = 0; i < freqs.length && i < MAX_N; i++) {
    data[OFF.FREQ + i] = freqs[i];
  }
}

/**
 * Write bias values for all nodes.
 */
export function setBiases(biases) {
  if (!data) return;
  for (let i = 0; i < biases.length && i < MAX_N; i++) {
    data[OFF.BIAS + i] = biases[i];
  }
}

/**
 * Write node types array (0=osc, 1=filter, 2=nl, 3=delay, 4=pred, 5=env).
 */
export function setNodeTypes(types) {
  if (!data) return;
  for (let i = 0; i < types.length && i < MAX_N; i++) {
    data[OFF.TYPES + i] = types[i];
  }
}

/**
 * Set active node count.
 */
export function setNodeCount(n) {
  if (!data) return;
  data[OFF.COUNT] = Math.max(1, Math.min(MAX_N, n));
}

/**
 * One-shot energy injection into node i.
 * Value is added to the injection slot; worklet reads and clears it.
 */
export function injectEnergy(i, amount) {
  if (!data || i < 0 || i >= MAX_N) return;
  data[OFF.INJ + i] = Math.max(0, Math.min(2, (data[OFF.INJ + i] || 0) + amount));
}

/**
 * Read current activation for node i (written by worklet).
 */
export function getActivation(i) {
  if (!data) return 0;
  return data[OFF.X + i];
}

/**
 * Read all activations as a snapshot Float32Array (copy).
 */
export function getActivations(N) {
  if (!data) return new Float32Array(N);
  return data.slice(OFF.X, OFF.X + N);
}

/**
 * Read current energy level scalar 0..1.
 */
export function getEnergyLevel() {
  if (!data) return 0;
  return data[OFF.ENERGY];
}

/**
 * Update spatial pan for node i (-1..1).
 */
export function setNodePan(i, panValue) {
  if (!pan || i < 0 || i >= MAX_N) return;
  pan[i] = Math.round(Math.max(-1, Math.min(1, panValue)) * 1000);
}

/**
 * Enable or disable microphone environment input.
 */
export async function setEnvironmentActive(active) {
  if (active) {
    await startMicrophone();
  } else {
    stopMicrophone();
  }
}

/**
 * Returns whether audio engine is currently running.
 */
export function isRunning() {
  return _isRunning;
}

/**
 * Returns the AudioContext (for any downstream use).
 */
export function getAudioContext() {
  return _ctx;
}
