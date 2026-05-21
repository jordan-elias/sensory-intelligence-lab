/**
 * neural-synthesis/audio-engine.js
 *
 * Owns the AudioContext and everything downstream of the worklet.
 *
 * SharedArrayBuffer availability:
 *   SAB requires COOP/COEP headers. If unavailable we fall back to a
 *   plain Float32Array (local copy) and sync state to/from the worklet
 *   via postMessage on every parameter change and via a periodic
 *   readback message for activations/energy. Audio quality is identical;
 *   only the inter-thread latency for control changes increases slightly.
 *
 * SharedArrayBuffer layout (Float32Array, length SAB_LENGTH):
 *   [0..11]       x         node activations  (worklet writes, main reads)
 *   [12..23]      freq      osc targets        (main writes, worklet reads)
 *   [24..35]      bias      per-node bias      (main writes, worklet reads)
 *   [36..179]     W         weight matrix 12×12 row-major
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
const SAB_LENGTH = 211;

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

/* ── Module-level state ─────────────────────────────────────────── */
let _ctx          = null;
let _workletNode  = null;
let _masterGain   = null;
let _limiter      = null;
let _reverb       = null;
let _reverbSend   = null;

let _micStream    = null;
let _micSource    = null;
let _micAnalyser  = null;
let _micActive    = false;
let _micFrameId   = null;
let _micBuf       = null;

let _isRunning    = false;

/* ── Shared / fallback buffers ─────────────────────────────────── */
let _sabAvailable = false;

/* Public buffer references */
export let sab    = null;
export let panSab = null;
export let data   = null;   /* Float32Array view of sab */
export let pan    = null;   /* Int16Array view of panSab */

/* Fallback plain arrays (used when SAB unavailable) */
let _localData    = null;   /* Float32Array */
let _localPan     = null;   /* Int16Array via regular ArrayBuffer */

/* Pending worklet messages when worklet not yet ready */
let _workletReady = false;
let _pendingMsgs  = [];

/* Readback state (fallback mode) */
let _readbackActivations = new Float32Array(MAX_N);
let _readbackEnergy      = 0;

/* ─────────────────────────────────────────────────────────────── */

function _detectSAB() {
  try {
    if (typeof SharedArrayBuffer === 'undefined') return false;
    /* Quick allocation test */
    const test = new SharedArrayBuffer(4);
    return !!test;
  } catch {
    return false;
  }
}

/* ── Impulse response ───────────────────────────────────────────── */
function buildImpulse(ctx, durationSec, decay) {
  const rate = ctx.sampleRate;
  const len  = Math.floor(rate * durationSec);
  const buf  = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/* ── AudioContext ───────────────────────────────────────────────── */
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

/* ── Buffer allocation ──────────────────────────────────────────── */
function allocateSharedBuffers() {
  _sabAvailable = _detectSAB();

  if (_sabAvailable) {
    sab    = new SharedArrayBuffer(SAB_LENGTH * Float32Array.BYTES_PER_ELEMENT);
    panSab = new SharedArrayBuffer(MAX_N * Int16Array.BYTES_PER_ELEMENT);
    data   = new Float32Array(sab);
    pan    = new Int16Array(panSab);
  } else {
    /* Fallback: plain typed arrays — worklet gets a copy via postMessage */
    const floatBuf = new ArrayBuffer(SAB_LENGTH * Float32Array.BYTES_PER_ELEMENT);
    const panBuf   = new ArrayBuffer(MAX_N * Int16Array.BYTES_PER_ELEMENT);
    _localData     = new Float32Array(floatBuf);
    _localPan      = new Int16Array(panBuf);
    /* Public references point to local arrays */
    data = _localData;
    pan  = _localPan;
    console.info('[AudioEngine] SharedArrayBuffer unavailable — using postMessage fallback.');
  }

  /* Default parameter values */
  data[OFF.INST]    = 0.4;
  data[OFF.REC]     = 0.5;
  data[OFF.SAT]     = 0.35;
  data[OFF.META]    = 0.4;
  data[OFF.ENVGAIN] = 0.0;
  data[OFF.COUNT]   = 4;

  for (let i = 0; i < MAX_N; i++) {
    pan[i] = Math.round(((i / (MAX_N - 1)) * 2 - 1) * 800);
  }
}

/* ── Output chain ───────────────────────────────────────────────── */
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

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.86;

  _masterGain.connect(dryGain);
  dryGain.connect(_limiter);
  _limiter.connect(ctx.destination);

  _masterGain.connect(_reverbSend);
  _reverbSend.connect(_reverb);
  _reverb.connect(ctx.destination);
}

/* ── Worklet loading ────────────────────────────────────────────── */
async function loadWorklet(ctx) {
  await ctx.audioWorklet.addModule('./audio-worklet.js');

  const processorOptions = _sabAvailable
    ? { sab, panSab, useSAB: true }
    : { useSAB: false, sabLength: SAB_LENGTH, maxN: MAX_N };

  _workletNode = new AudioWorkletNode(ctx, 'neural-synth-processor', {
    numberOfInputs:     0,
    numberOfOutputs:    1,
    outputChannelCount: [2],
    processorOptions,
  });

  /* Message handler — receives activation readback in fallback mode */
  _workletNode.port.onmessage = e => {
    const msg = e.data;
    if (!msg) return;

    switch (msg.type) {
      case 'ready':
        _workletReady = true;
        /* Flush pending messages */
        _pendingMsgs.forEach(m => _workletNode.port.postMessage(m));
        _pendingMsgs = [];
        /* In fallback mode, send the initial full state */
        if (!_sabAvailable) _sendFullState();
        break;

      case 'readback':
        /* Worklet sending activation snapshot back (fallback mode) */
        if (msg.activations) {
          _readbackActivations = new Float32Array(msg.activations);
          for (let i = 0; i < _readbackActivations.length; i++) {
            data[OFF.X + i] = _readbackActivations[i];
          }
        }
        if (msg.energy !== undefined) {
          _readbackEnergy = msg.energy;
          data[OFF.ENERGY] = msg.energy;
        }
        break;

      default:
        break;
    }
  };

  _workletNode.connect(_masterGain);
}

/* ── Fallback: send full state snapshot to worklet ──────────────── */
function _sendFullState() {
  if (!_workletNode || !_localData) return;
  const msg = {
    type: 'setState',
    data: Array.from(_localData),
    pan:  Array.from(_localPan),
  };
  if (_workletReady) {
    _workletNode.port.postMessage(msg);
  } else {
    _pendingMsgs.push(msg);
  }
}

/* ── Fallback: send a targeted param update ─────────────────────── */
function _sendParam(offset, value) {
  if (_sabAvailable) return;   /* SAB mode: write already done */
  const msg = { type: 'setParam', offset, value };
  if (_workletReady && _workletNode) {
    _workletNode.port.postMessage(msg);
  } else {
    _pendingMsgs.push(msg);
  }
}

/* ── Fallback: send injection ───────────────────────────────────── */
function _sendInjection(i, amount) {
  if (_sabAvailable) return;
  const msg = { type: 'inject', index: i, amount };
  if (_workletReady && _workletNode) {
    _workletNode.port.postMessage(msg);
  } else {
    _pendingMsgs.push(msg);
  }
}

/* ── Fallback: send weight matrix ───────────────────────────────── */
function _sendWeightMatrix(W, N) {
  if (_sabAvailable) return;
  /* Slice only the active portion */
  const slice = new Float32Array(MAX_N * MAX_N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      slice[i * MAX_N + j] = W[i * N + j] ?? 0;
    }
  }
  const msg = { type: 'setWeights', weights: Array.from(slice) };
  if (_workletReady && _workletNode) {
    _workletNode.port.postMessage(msg);
  } else {
    _pendingMsgs.push(msg);
  }
}

/* ── Microphone pipeline ────────────────────────────────────────── */
async function startMicrophone() {
  if (_micActive) return;
  try {
    _micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const ctx    = getContext();
    _micSource   = ctx.createMediaStreamSource(_micStream);
    _micAnalyser = ctx.createAnalyser();
    _micAnalyser.fftSize = 256;
    _micAnalyser.smoothingTimeConstant = 0.75;
    _micBuf      = new Uint8Array(_micAnalyser.frequencyBinCount);
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
  _micSource = _micAnalyser = _micStream = null;
  _micActive = _micFrameId = false;
  if (data) data[OFF.ENVGAIN] = 0;
}

function _pollMic() {
  if (!_micActive || !_micAnalyser) return;
  _micAnalyser.getByteFrequencyData(_micBuf);

  let sum = 0;
  for (let i = 0; i < _micBuf.length; i++) sum += _micBuf[i];
  const level = Math.min(1, sum / (_micBuf.length * 255) * 4);

  if (_workletNode) {
    _workletNode.port.postMessage({ type: 'env', level });
  }

  const bc  = _micBuf.length;
  const lE  = Math.floor(bc * 0.15);
  const mS  = lE;
  const mE  = Math.floor(bc * 0.55);
  const hS  = mE;
  let lowE  = 0, midE = 0, highE = 0;
  for (let i = 0;  i < lE; i++) lowE  += _micBuf[i];
  for (let i = mS; i < mE; i++) midE  += _micBuf[i];
  for (let i = hS; i < bc; i++) highE += _micBuf[i];
  lowE  /= (lE       * 255);
  midE  /= ((mE - mS)* 255);
  highE /= ((bc - hS)* 255);

  if (data) data[OFF.ENVGAIN] = level;
  window._micSpectrum = { low: lowE, mid: midE, high: highE };

  _micFrameId = requestAnimationFrame(_pollMic);
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════════ */

export function initBuffers() {
  if (!data) allocateSharedBuffers();
}

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

export function stop() {
  if (!_isRunning || !_ctx || !_masterGain) return;
  const now = _ctx.currentTime;
  _masterGain.gain.setValueAtTime(_masterGain.gain.value, now);
  _masterGain.gain.linearRampToValueAtTime(0, now + 0.7);
  setTimeout(() => {
    try { _workletNode?.disconnect(); } catch (_) {}
    try { _masterGain?.disconnect();  } catch (_) {}
    _workletNode  = null;
    _masterGain   = null;
    _workletReady = false;
    _pendingMsgs  = [];
  }, 800);
  stopMicrophone();
  _isRunning = false;
}

export function setVolume(v) {
  if (!_masterGain || !_ctx) return;
  _masterGain.gain.setTargetAtTime(
    Math.max(0, Math.min(1, v)) * 0.75,
    _ctx.currentTime, 0.08
  );
}

export function setParam(key, value) {
  if (!data) return;
  const offsets = {
    instability: OFF.INST,
    recurrence:  OFF.REC,
    saturation:  OFF.SAT,
    metabolism:  OFF.META,
  };
  const off = offsets[key];
  if (off === undefined) return;
  const clamped = Math.max(0, Math.min(1, value));
  data[off] = clamped;
  _sendParam(off, clamped);
}

export function setWeightMatrix(W, N) {
  if (!data) return;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      data[OFF.W + i * MAX_N + j] = W[i * N + j] ?? 0;
    }
  }
  _sendWeightMatrix(W, N);
}

export function setFrequencies(freqs) {
  if (!data) return;
  for (let i = 0; i < freqs.length && i < MAX_N; i++) {
    data[OFF.FREQ + i] = freqs[i];
  }
  if (!_sabAvailable) {
    const msg = { type: 'setFreqs', freqs: Array.from(freqs) };
    if (_workletReady && _workletNode) _workletNode.port.postMessage(msg);
    else _pendingMsgs.push(msg);
  }
}

export function setBiases(biases) {
  if (!data) return;
  for (let i = 0; i < biases.length && i < MAX_N; i++) {
    data[OFF.BIAS + i] = biases[i];
  }
  if (!_sabAvailable) {
    const msg = { type: 'setBiases', biases: Array.from(biases) };
    if (_workletReady && _workletNode) _workletNode.port.postMessage(msg);
    else _pendingMsgs.push(msg);
  }
}

export function setNodeTypes(types) {
  if (!data) return;
  for (let i = 0; i < types.length && i < MAX_N; i++) {
    data[OFF.TYPES + i] = types[i];
  }
  if (!_sabAvailable) {
    const msg = { type: 'setTypes', types: Array.from(types) };
    if (_workletReady && _workletNode) _workletNode.port.postMessage(msg);
    else _pendingMsgs.push(msg);
  }
}

export function setNodeCount(n) {
  if (!data) return;
  const count = Math.max(1, Math.min(MAX_N, n));
  data[OFF.COUNT] = count;
  _sendParam(OFF.COUNT, count);
}

export function injectEnergy(i, amount) {
  if (!data || i < 0 || i >= MAX_N) return;
  const val = Math.max(0, Math.min(2, (data[OFF.INJ + i] || 0) + amount));
  data[OFF.INJ + i] = val;
  _sendInjection(i, val);
}

export function getActivation(i) {
  if (!data) return 0;
  return data[OFF.X + i];
}

export function getActivations(N) {
  if (!data) return new Float32Array(N);
  return data.slice(OFF.X, OFF.X + N);
}

export function getEnergyLevel() {
  if (!data) return 0;
  return data[OFF.ENERGY];
}

export function setNodePan(i, panValue) {
  if (!pan || i < 0 || i >= MAX_N) return;
  pan[i] = Math.round(Math.max(-1, Math.min(1, panValue)) * 1000);
  if (!_sabAvailable) {
    const msg = { type: 'setPan', index: i, value: pan[i] };
    if (_workletReady && _workletNode) _workletNode.port.postMessage(msg);
    else _pendingMsgs.push(msg);
  }
}

export async function setEnvironmentActive(active) {
  if (active) await startMicrophone();
  else stopMicrophone();
}

export function isRunning() { return _isRunning; }
export function getAudioContext() { return _ctx; }
