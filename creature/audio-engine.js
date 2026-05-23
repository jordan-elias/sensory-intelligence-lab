/**
 * neural-synthesis/audio-engine.js
 *
 * Owns the complete Web Audio graph.
 * One audio object per network node. One GainNode per edge.
 * Parameter changes are audio graph changes — not number changes.
 *
 * Signal flow per node:
 *
 *   [edge GainNodes from neighbours]  ──┐
 *   [feedback worklet output]         ──┤→ inputMixer → processing → envGain → panner ──→ masterGain
 *   [injection GainNode]              ──┘
 *
 * Node types map to Web Audio objects:
 *   oscillator  → OscillatorNode (+ detuned second partial)
 *   filter      → BiquadFilterNode (cutoff driven by input envelope)
 *   nonlinear   → WaveShaperNode (curve fixed, input gain = saturation)
 *   delay       → DelayNode + feedback GainNode
 *   predictive  → AudioWorkletNode (feedback-worklet.js handles this at
 *                 graph level; individual predictive nodes use a
 *                 dedicated ScriptProcessor-free approach below)
 *   environment → MediaStreamSourceNode (mic) via AnalyserNode
 *
 * Recurrent feedback (edges that form loops) is handled by the
 * FeedbackProcessor worklet (feedback-worklet.js).
 * Feedforward edges are native GainNodes.
 *
 * Public API (called by network.js and harmonic.js):
 *   initAudio()
 *   start(volume)
 *   stop()
 *   setVolume(v)
 *   addNode(node)
 *   removeNode(nodeId)
 *   updateNodeType(nodeId, type)
 *   addEdge(from, to, weight, isRecurrent)
 *   removeEdge(from, to)
 *   setEdgeWeight(from, to, weight)
 *   setOscillatorFrequency(nodeId, hz, glideTime)
 *   setSaturation(value)
 *   setInstability(value)
 *   setRecurrence(value)
 *   injectEnergy(nodeId, amount)
 *   setNodePan(nodeId, panValue)
 *   setNodeEnvelope(nodeId, energyLevel)
 *   setFilterCutoff(nodeId, hz)
 *   setEnvironmentActive(active)
 *   getAnalyserData(nodeId)
 */

const MAX_N = 12;

/* ── Activation function curve builders ─────────────────────────── */

/**
 * Build a normalized waveshaper curve.
 * Input gain is controlled separately (saturation).
 * Output is always in -1..1 regardless of input level.
 */
function buildWaveshaperCurve(type, samples = 512) {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;   /* -1..1 */
    let y;
    switch (type) {
      case 'tanh':
        y = Math.tanh(x * 2);
        break;
      case 'fold': {
        /* Wavefold — reflects signal back into -1..1 */
        const v = x * 2;
        const p = 4;
        const m = ((v % p) + p) % p;
        y = m < 2 ? m - 1 : 3 - m;
        break;
      }
      case 'soft':
        y = x / (1 + Math.abs(x));
        break;
      default:
        y = Math.tanh(x * 1.5);
    }
    /* Normalize to -1..1 peak */
    curve[i] = Math.max(-1, Math.min(1, y));
  }
  return curve;
}

/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE
   ═══════════════════════════════════════════════════════════════════ */

let _ctx             = null;
let _masterGain      = null;
let _limiter         = null;
let _reverb          = null;
let _reverbSend      = null;
let _dryGain         = null;
let _feedbackWorklet = null;   /* FeedbackProcessor node */
let _isRunning       = false;

/* Per-node audio state */
const _nodes = {};   /* nodeId → NodeAudio */

/* Per-edge audio state */
const _edges = {};   /* `${from}_${to}` → EdgeAudio */

/* Microphone state */
let _micStream   = null;
let _micSource   = null;
let _micAnalyser = null;
let _micActive   = false;
let _micBuf      = null;
let _micFrameId  = null;

/* Global parameters */
let _saturation  = 0.35;
let _instability = 0.4;
let _recurrence  = 0.5;

/* Envelope follower intervals (per filter node) */
const _filterFollowers = {};

/**
 * NodeAudio: all Web Audio objects associated with one network node.
 * {
 *   inputMixer:   GainNode     — sums all incoming signals
 *   processing:   Web Audio node specific to type
 *   satGain:      GainNode     — pre-waveshaper input gain (nonlinear only)
 *   envGain:      GainNode     — amplitude envelope (driven by energy level)
 *   panner:       StereoPannerNode
 *   injection:    GainNode     — one-shot energy injection
 *   analyser:     AnalyserNode — for filter cutoff tracking
 *   type:         number
 *   osc2:         OscillatorNode (oscillator only, detuned partial)
 *   osc2Gain:     GainNode
 * }
 */

/**
 * EdgeAudio: GainNode representing one directed edge weight.
 * { gainNode: GainNode }
 */

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT + OUTPUT CHAIN
   ═══════════════════════════════════════════════════════════════════ */

function _buildImpulse(ctx, durationSec, decay) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function _getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate:  44100,
      latencyHint: 'playback',
    });
  }
  return _ctx;
}

async function _resumeCtx() {
  const ctx = _getCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

function _buildOutputChain(ctx) {
  _masterGain = ctx.createGain();
  _masterGain.gain.value = 0;

  _limiter = ctx.createDynamicsCompressor();
  _limiter.threshold.value = -10;
  _limiter.knee.value      =  6;
  _limiter.ratio.value     = 20;
  _limiter.attack.value    = 0.003;
  _limiter.release.value   = 0.22;

  _reverb        = ctx.createConvolver();
  _reverb.buffer = _buildImpulse(ctx, 2.8, 2.6);

  _reverbSend = ctx.createGain();
  _reverbSend.gain.value = 0.12;

  _dryGain = ctx.createGain();
  _dryGain.gain.value = 0.88;

  _masterGain.connect(_dryGain);
  _dryGain.connect(_limiter);
  _limiter.connect(ctx.destination);

  _masterGain.connect(_reverbSend);
  _reverbSend.connect(_reverb);
  _reverb.connect(ctx.destination);
}

async function _loadFeedbackWorklet(ctx) {
  await ctx.audioWorklet.addModule('./feedback-worklet.js');
  _feedbackWorklet = new AudioWorkletNode(ctx, 'feedback-processor', {
    numberOfInputs:     MAX_N,
    numberOfOutputs:    MAX_N,
    outputChannelCount: new Array(MAX_N).fill(1),
    channelCount:       1,
    channelCountMode:   'explicit',
  });
  /* Worklet does not connect to destination — its outputs connect
     to individual node inputMixers below */
}

/* ═══════════════════════════════════════════════════════════════════
   NODE AUDIO CREATION
   ═══════════════════════════════════════════════════════════════════ */

function _createNodeAudio(node) {
  const ctx  = _getCtx();
  const id   = node.id;
  const type = node.type;

  /* Every node gets these regardless of type */
  const inputMixer = ctx.createGain();
  inputMixer.gain.value = 1.0;

  const envGain = ctx.createGain();
  envGain.gain.value = 0.0;   /* starts silent, driven by network energy */

  const panner = ctx.createStereoPanner
    ? ctx.createStereoPanner()
    : null;

  const injection = ctx.createGain();
  injection.gain.value = 1.0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.8;

  /* Connect injection → inputMixer */
  injection.connect(inputMixer);

  /* Connect feedback worklet output for this node → inputMixer */
  if (_feedbackWorklet) {
    _feedbackWorklet.connect(inputMixer, id % MAX_N, 0);
  }

  /* Build processing chain based on type */
  let processing = null;
  let osc2       = null;
  let osc2Gain   = null;
  let satGain    = null;

  switch (type) {

    case 0: { /* oscillator */
      processing = ctx.createOscillator();
      processing.type      = 'sine';
      processing.frequency.value = node.freq || 110;
      processing.start();

      /* Second detuned partial for warmth */
      osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = (node.freq || 110) * 1.0031;
      osc2.start();

      osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.28;

      /* Both oscillators → inputMixer (mix with incoming signals) */
      processing.connect(inputMixer);
      osc2.connect(osc2Gain);
      osc2Gain.connect(inputMixer);

      /* inputMixer → analyser → envGain */
      inputMixer.connect(analyser);
      analyser.connect(envGain);
      break;
    }

    case 1: { /* filter */
      processing = ctx.createBiquadFilter();
      processing.type            = 'bandpass';
      processing.frequency.value = 400;
      processing.Q.value         = 2.5;

      inputMixer.connect(analyser);
      inputMixer.connect(processing);
      processing.connect(envGain);
      break;
    }

    case 2: { /* nonlinear */
      /* satGain controls how hard we push into the waveshaper */
      satGain = ctx.createGain();
      satGain.gain.value = 1.0 + _saturation * 3.0;

      processing = ctx.createWaveShaper();
      processing.curve     = buildWaveshaperCurve('fold');
      processing.oversample = '2x';

      /* Post-shape normalization — keeps volume constant */
      const normGain = ctx.createGain();
      normGain.gain.value = 0.7;

      inputMixer.connect(analyser);
      inputMixer.connect(satGain);
      satGain.connect(processing);
      processing.connect(normGain);
      normGain.connect(envGain);
      break;
    }

    case 3: { /* delay */
      processing = ctx.createDelay(2.0);
      processing.delayTime.value = 0.25;

      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.3 + _recurrence * 0.35;

      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type            = 'lowpass';
      delayFilter.frequency.value = 3500;

      inputMixer.connect(analyser);
      inputMixer.connect(processing);
      processing.connect(delayFilter);
      delayFilter.connect(envGain);

      /* Internal delay feedback loop — DelayNode makes this valid */
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(processing);

      /* Store for recurrence updates */
      _nodes[id] = _nodes[id] || {};
      _nodes[id]._delayFeedback = delayFeedback;
      break;
    }

    case 4: { /* predictive */
      /* The predictive node's inversion is done on the main thread
         by computing a rolling mean and adjusting the injection signal.
         Here it is a simple passthrough with a phase-inverted gain. */
      processing = ctx.createGain();
      processing.gain.value = -0.85;   /* phase inversion = output inverse */

      inputMixer.connect(analyser);
      inputMixer.connect(processing);
      processing.connect(envGain);
      break;
    }

    case 5: { /* environment */
      /* Mic source is connected externally by setEnvironmentActive().
         Processing node is an identity gain. */
      processing = ctx.createGain();
      processing.gain.value = 1.0;

      inputMixer.connect(analyser);
      inputMixer.connect(processing);
      processing.connect(envGain);
      break;
    }

    default: {
      processing = ctx.createGain();
      processing.gain.value = 1.0;
      inputMixer.connect(processing);
      processing.connect(envGain);
    }
  }

  /* envGain → panner → masterGain */
  if (panner) {
    envGain.connect(panner);
    panner.connect(_masterGain);
  } else {
    envGain.connect(_masterGain);
  }

  /* Also route oscillator output into feedback worklet input */
  if (_feedbackWorklet && type === 0) {
    envGain.connect(_feedbackWorklet, 0, id % MAX_N);
  }

  const nodeAudio = {
    inputMixer,
    processing,
    satGain,
    envGain,
    panner,
    injection,
    analyser,
    type,
    osc2,
    osc2Gain,
  };

  _nodes[id] = { ..._nodes[id], ...nodeAudio };

  /* Start filter envelope follower */
  if (type === 1) _startFilterFollower(id);

  return nodeAudio;
}

function _destroyNodeAudio(nodeId) {
  const na = _nodes[nodeId];
  if (!na) return;

  _stopFilterFollower(nodeId);

  const safeDisconnect = n => {
    if (!n) return;
    try { n.disconnect(); } catch (_) {}
    if (n.stop) try { n.stop(); } catch (_) {}
  };

  safeDisconnect(na.osc2);
  safeDisconnect(na.osc2Gain);
  safeDisconnect(na.processing);
  safeDisconnect(na.satGain);
  safeDisconnect(na.envGain);
  safeDisconnect(na.panner);
  safeDisconnect(na.injection);
  safeDisconnect(na.analyser);
  safeDisconnect(na.inputMixer);

  delete _nodes[nodeId];
}

/* ═══════════════════════════════════════════════════════════════════
   FILTER ENVELOPE FOLLOWER
   Tracks input energy to drive filter cutoff frequency.
   Runs on a setInterval — no audio thread needed.
   ═══════════════════════════════════════════════════════════════════ */

function _startFilterFollower(nodeId) {
  _stopFilterFollower(nodeId);

  _filterFollowers[nodeId] = setInterval(() => {
    const na = _nodes[nodeId];
    if (!na || na.type !== 1 || !_ctx) return;

    const buf = new Uint8Array(na.analyser.frequencyBinCount);
    na.analyser.getByteTimeDomainData(buf);

    /* RMS of time-domain signal = signal energy */
    let rms = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      rms += v * v;
    }
    rms = Math.sqrt(rms / buf.length);

    /* Map energy to cutoff: 150Hz (silence) → 3500Hz (full energy) */
    const cutoff = 150 + rms * 3350;
    na.processing.frequency.setTargetAtTime(cutoff, _ctx.currentTime, 0.15);

  }, 50);   /* 20Hz update rate — smooth but not heavy */
}

function _stopFilterFollower(nodeId) {
  if (_filterFollowers[nodeId]) {
    clearInterval(_filterFollowers[nodeId]);
    delete _filterFollowers[nodeId];
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EDGE AUDIO
   ═══════════════════════════════════════════════════════════════════ */

function _edgeKey(from, to) { return `${from}_${to}`; }

function _createEdgeAudio(from, to, weight) {
  const ctx = _getCtx();
  const naFrom = _nodes[from];
  const naTo   = _nodes[to];
  if (!naFrom || !naTo) return null;

  const gainNode = ctx.createGain();
  /* Use absolute weight for gain; sign is handled by phase inversion
     for inhibitory edges */
  gainNode.gain.value = Math.abs(weight) * 0.5;

  /* Inhibitory edge: insert phase inverter */
  if (weight < 0) {
    const inverter = ctx.createGain();
    inverter.gain.value = -1;
    naFrom.envGain.connect(inverter);
    inverter.connect(gainNode);
    gainNode.connect(naTo.inputMixer);
    _edges[_edgeKey(from, to)] = { gainNode, inverter };
  } else {
    naFrom.envGain.connect(gainNode);
    gainNode.connect(naTo.inputMixer);
    _edges[_edgeKey(from, to)] = { gainNode, inverter: null };
  }

  return _edges[_edgeKey(from, to)];
}

function _destroyEdgeAudio(from, to) {
  const key = _edgeKey(from, to);
  const ea  = _edges[key];
  if (!ea) return;
  try { ea.gainNode.disconnect(); } catch (_) {}
  try { ea.inverter?.disconnect(); } catch (_) {}
  delete _edges[key];
}

/* ═══════════════════════════════════════════════════════════════════
   MICROPHONE
   ═══════════════════════════════════════════════════════════════════ */

async function _startMic() {
  if (_micActive) return;
  try {
    _micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation:  false,
        noiseSuppression:  false,
        autoGainControl:   false,
      },
      video: false,
    });

    const ctx    = _getCtx();
    _micSource   = ctx.createMediaStreamSource(_micStream);
    _micAnalyser = ctx.createAnalyser();
    _micAnalyser.fftSize = 256;
    _micAnalyser.smoothingTimeConstant = 0.75;
    _micBuf      = new Uint8Array(_micAnalyser.frequencyBinCount);
    _micSource.connect(_micAnalyser);
    _micActive = true;

    /* Connect mic to all environment nodes */
    Object.values(_nodes).forEach(na => {
      if (na.type === 5 && na.inputMixer) {
        try { _micSource.connect(na.inputMixer); } catch (_) {}
      }
    });

    _pollMic();
  } catch (err) {
    console.warn('[AudioEngine] Mic unavailable:', err.message);
    _micActive = false;
  }
}

function _stopMic() {
  if (!_micActive) return;
  if (_micFrameId) cancelAnimationFrame(_micFrameId);
  if (_micSource) {
    try { _micSource.disconnect(); } catch (_) {}
  }
  if (_micStream) _micStream.getTracks().forEach(t => t.stop());
  _micSource = null; _micAnalyser = null; _micStream = null;
  _micActive = false; _micFrameId = null;
}

function _pollMic() {
  if (!_micActive || !_micAnalyser) return;
  _micAnalyser.getByteFrequencyData(_micBuf);

  let sum = 0;
  for (let i = 0; i < _micBuf.length; i++) sum += _micBuf[i];
  const level = Math.min(1, (sum / (_micBuf.length * 255)) * 4);

  const bc  = _micBuf.length;
  const lE  = Math.floor(bc * 0.15);
  const mE  = Math.floor(bc * 0.55);
  let lv    = 0, mv = 0, hv = 0;
  for (let i = 0;  i < lE; i++) lv += _micBuf[i];
  for (let i = lE; i < mE; i++) mv += _micBuf[i];
  for (let i = mE; i < bc; i++) hv += _micBuf[i];
  lv /= (lE       * 255) || 1;
  mv /= ((mE - lE)* 255) || 1;
  hv /= ((bc - mE)* 255) || 1;

  window._micSpectrum = { low: lv, mid: mv, high: hv, level };
  _micFrameId = requestAnimationFrame(_pollMic);
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Initialize audio context and output chain.
 * Must be called before any other method.
 * Safe to await — resolves when worklet is loaded.
 */
export async function initAudio() {
  const ctx = await _resumeCtx();
  _buildOutputChain(ctx);
  await _loadFeedbackWorklet(ctx);
}

/**
 * Start audio — fade in master gain.
 */
export async function start(volume = 0.7) {
  if (_isRunning) return;
  await initAudio();
  const ctx = _getCtx();
  const now = ctx.currentTime;
  _masterGain.gain.setValueAtTime(0, now);
  _masterGain.gain.linearRampToValueAtTime(
    Math.max(0, Math.min(1, volume)) * 0.75,
    now + 1.4
  );
  _isRunning = true;
}

/**
 * Stop audio — fade out and disconnect.
 */
export function stop() {
  if (!_ctx || !_masterGain) return;
  const now = _ctx.currentTime;
  _masterGain.gain.setValueAtTime(_masterGain.gain.value, now);
  _masterGain.gain.linearRampToValueAtTime(0, now + 0.65);
  _stopMic();
  _isRunning = false;
  setTimeout(() => {
    Object.keys(_nodes).forEach(id => _destroyNodeAudio(Number(id)));
    Object.keys(_edges).forEach(k => {
      try { _edges[k].gainNode?.disconnect(); } catch (_) {}
      delete _edges[k];
    });
  }, 750);
}

export function setVolume(v) {
  if (!_masterGain || !_ctx) return;
  _masterGain.gain.setTargetAtTime(
    Math.max(0, Math.min(1, v)) * 0.75,
    _ctx.currentTime, 0.08
  );
}

/**
 * Unified parameter setter — delegates to specific setters.
 * Allows main.js to call audioSetParam('instability', 0.4) etc.
 */
export function setParam(key, value) {
  switch (key) {
    case 'instability': setInstability(value); break;
    case 'recurrence':  setRecurrence(value);  break;
    case 'saturation':  setSaturation(value);  break;
    default: break;
  }
}

/* ── Node lifecycle ───────────────────────────────────────────────── */

/**
 * Add a new node to the audio graph.
 * Called by network.js when a node is created or grows.
 */
export function addNode(node) {
  if (_nodes[node.id]?.inputMixer) {
    /* Already exists — update type if changed */
    updateNodeType(node.id, node.type);
    return;
  }
  _createNodeAudio(node);
}

/**
 * Remove a node and all its audio objects.
 */
export function removeNode(nodeId) {
  /* Remove all edges touching this node first */
  Object.keys(_edges).forEach(key => {
    const [from, to] = key.split('_').map(Number);
    if (from === nodeId || to === nodeId) _destroyEdgeAudio(from, to);
  });
  _destroyNodeAudio(nodeId);
}

/**
 * Change a node's type — rebuild its processing chain in place.
 */
export function updateNodeType(nodeId, newType) {
  const na = _nodes[nodeId];
  if (!na) return;

  /* Disconnect and destroy old processing objects */
  try { na.processing?.disconnect(); } catch (_) {}
  try { na.satGain?.disconnect(); } catch (_) {}
  try { na.osc2?.stop(); na.osc2?.disconnect(); } catch (_) {}
  try { na.osc2Gain?.disconnect(); } catch (_) {}
  _stopFilterFollower(nodeId);

  /* Remove type-specific stored refs */
  delete na.processing;
  delete na.satGain;
  delete na.osc2;
  delete na.osc2Gain;
  delete na._delayFeedback;

  na.type = newType;

  /* Re-create processing with existing inputMixer and envGain */
  const ctx = _getCtx();
  const node = { id: nodeId, type: newType, freq: 110 };

  /* Rebuild just the processing section */
  _rebuildProcessing(nodeId, newType, na);
}

function _rebuildProcessing(nodeId, type, na) {
  const ctx = _getCtx();

  switch (type) {
    case 0: {
      na.processing = ctx.createOscillator();
      na.processing.type = 'sine';
      na.processing.frequency.value = 110;
      na.processing.start();
      na.osc2 = ctx.createOscillator();
      na.osc2.type = 'sine';
      na.osc2.frequency.value = 110.34;
      na.osc2.start();
      na.osc2Gain = ctx.createGain();
      na.osc2Gain.gain.value = 0.28;
      na.processing.connect(na.inputMixer);
      na.osc2.connect(na.osc2Gain);
      na.osc2Gain.connect(na.inputMixer);
      na.inputMixer.connect(na.analyser);
      na.analyser.connect(na.envGain);
      break;
    }
    case 1: {
      na.processing = ctx.createBiquadFilter();
      na.processing.type = 'bandpass';
      na.processing.frequency.value = 400;
      na.processing.Q.value = 2.5;
      na.inputMixer.connect(na.analyser);
      na.inputMixer.connect(na.processing);
      na.processing.connect(na.envGain);
      _startFilterFollower(nodeId);
      break;
    }
    case 2: {
      na.satGain = ctx.createGain();
      na.satGain.gain.value = 1.0 + _saturation * 3.0;
      na.processing = ctx.createWaveShaper();
      na.processing.curve = buildWaveshaperCurve('fold');
      na.processing.oversample = '2x';
      const norm = ctx.createGain();
      norm.gain.value = 0.7;
      na.inputMixer.connect(na.analyser);
      na.inputMixer.connect(na.satGain);
      na.satGain.connect(na.processing);
      na.processing.connect(norm);
      norm.connect(na.envGain);
      break;
    }
    case 3: {
      na.processing = ctx.createDelay(2.0);
      na.processing.delayTime.value = 0.25;
      const fb = ctx.createGain();
      fb.gain.value = 0.3 + _recurrence * 0.35;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 3500;
      na.inputMixer.connect(na.analyser);
      na.inputMixer.connect(na.processing);
      na.processing.connect(flt);
      flt.connect(na.envGain);
      flt.connect(fb);
      fb.connect(na.processing);
      na._delayFeedback = fb;
      break;
    }
    case 4: {
      na.processing = ctx.createGain();
      na.processing.gain.value = -0.85;
      na.inputMixer.connect(na.analyser);
      na.inputMixer.connect(na.processing);
      na.processing.connect(na.envGain);
      break;
    }
    case 5: {
      na.processing = ctx.createGain();
      na.processing.gain.value = 1.0;
      na.inputMixer.connect(na.analyser);
      na.inputMixer.connect(na.processing);
      na.processing.connect(na.envGain);
      if (_micActive && _micSource) {
        try { _micSource.connect(na.inputMixer); } catch (_) {}
      }
      break;
    }
  }
}

/* ── Edge lifecycle ───────────────────────────────────────────────── */

/**
 * Add an edge as a GainNode connection.
 * isRecurrent: if true, also register with feedback worklet.
 */
export function addEdge(from, to, weight, isRecurrent = false) {
  _destroyEdgeAudio(from, to);   /* remove if already exists */
  _createEdgeAudio(from, to, weight);

  if (isRecurrent && _feedbackWorklet) {
    /* Worklet weights are updated via setEdgeWeight → _flushWorkletWeights */
    _scheduleWorkletWeightFlush();
  }
}

export function removeEdge(from, to) {
  _destroyEdgeAudio(from, to);
  _scheduleWorkletWeightFlush();
}

/**
 * Update an edge's weight.
 * Called every Hebbian tick — smooth ramp avoids zipper noise.
 */
export function setEdgeWeight(from, to, weight) {
  const key = _edgeKey(from, to);
  const ea  = _edges[key];
  if (!ea || !_ctx) return;

  const absW = Math.abs(weight);

  /* If sign flipped, rebuild the edge to add/remove phase inverter */
  const wasInhibitory = ea.inverter !== null;
  const isInhibitory  = weight < 0;
  if (wasInhibitory !== isInhibitory) {
    /* Sign changed — rebuild */
    _destroyEdgeAudio(from, to);
    _createEdgeAudio(from, to, weight);
    return;
  }

  ea.gainNode.gain.setTargetAtTime(absW * 0.5, _ctx.currentTime, 0.08);
}

/* ── Oscillator frequency ─────────────────────────────────────────── */

/**
 * Set oscillator frequency with a smooth glide.
 * glideTime: AudioParam time constant in seconds (default 0.3s).
 */
export function setOscillatorFrequency(nodeId, hz, glideTime = 0.3) {
  const na  = _nodes[nodeId];
  if (!na || !_ctx) return;
  if (na.type !== 0) return;

  const freq = Math.max(20, Math.min(8000, hz));
  const now  = _ctx.currentTime;

  if (na.processing?.frequency) {
    na.processing.frequency.setTargetAtTime(freq, now, glideTime);
  }
  if (na.osc2?.frequency) {
    na.osc2.frequency.setTargetAtTime(freq * 1.0031, now, glideTime + 0.05);
  }
}

/* ── Node envelope (energy level) ────────────────────────────────── */

/**
 * Set the output amplitude of a node based on its activation energy.
 * Called from network.js every animation frame.
 * energyLevel: 0..1
 */
export function setNodeEnvelope(nodeId, energyLevel) {
  const na = _nodes[nodeId];
  if (!na || !_ctx) return;
  const gain = Math.max(0, Math.min(0.6, energyLevel * 0.65));
  na.envGain.gain.setTargetAtTime(gain, _ctx.currentTime, 0.05);
}

/* ── Spatial pan ─────────────────────────────────────────────────── */

export function setNodePan(nodeId, panValue) {
  const na = _nodes[nodeId];
  if (!na || !na.panner || !_ctx) return;
  const p = Math.max(-1, Math.min(1, panValue));
  na.panner.pan.setTargetAtTime(p, _ctx.currentTime, 0.3);
}

/* ── Saturation ──────────────────────────────────────────────────── */

/**
 * Update saturation — changes input gain for all nonlinear nodes.
 * No effect on output volume.
 */
export function setSaturation(value) {
  _saturation = Math.max(0, Math.min(1, value));
  const inputGain = 1.0 + _saturation * 3.0;
  if (!_ctx) return;
  Object.entries(_nodes).forEach(([id, na]) => {
    if (na.type === 2 && na.satGain) {
      na.satGain.gain.setTargetAtTime(inputGain, _ctx.currentTime, 0.12);
    }
  });
}

/* ── Instability ─────────────────────────────────────────────────── */

/**
 * Update instability — sent to feedback worklet as operating point scalar.
 * Does not add noise to signal path.
 */
export function setInstability(value) {
  _instability = Math.max(0, Math.min(1, value));
  _feedbackWorklet?.port.postMessage({
    type:  'setInstability',
    value: _instability,
  });
}

/* ── Recurrence ──────────────────────────────────────────────────── */

/**
 * Update recurrence — sent to feedback worklet, also updates
 * delay node internal feedback gains.
 */
export function setRecurrence(value) {
  _recurrence = Math.max(0, Math.min(1, value));
  _feedbackWorklet?.port.postMessage({
    type:  'setRecurrence',
    value: _recurrence,
  });
  /* Update delay feedback gains */
  if (!_ctx) return;
  Object.values(_nodes).forEach(na => {
    if (na.type === 3 && na._delayFeedback) {
      na._delayFeedback.gain.setTargetAtTime(
        0.3 + _recurrence * 0.35,
        _ctx.currentTime, 0.2
      );
    }
  });
}

/* ── Delay time ──────────────────────────────────────────────────── */

export function setDelayTime(nodeId, seconds) {
  const na = _nodes[nodeId];
  if (!na || na.type !== 3 || !na.processing || !_ctx) return;
  const t = Math.max(0.01, Math.min(1.95, seconds));
  na.processing.delayTime.setTargetAtTime(t, _ctx.currentTime, 0.4);
}

/* ── Energy injection ────────────────────────────────────────────── */

/**
 * Inject a brief energy pulse into a node.
 * Implemented as a short envelope on the injection GainNode.
 */
export function injectEnergy(nodeId, amount = 0.8) {
  const na  = _nodes[nodeId];
  if (!na || !_ctx) return;
  const now  = _ctx.currentTime;
  const gain = Math.max(0, Math.min(2, amount));
  na.injection.gain.cancelScheduledValues(now);
  na.injection.gain.setValueAtTime(gain, now);
  na.injection.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  na.injection.gain.setValueAtTime(1.0, now + 0.36);
}

/* ── Analyser data ───────────────────────────────────────────────── */

export function getAnalyserData(nodeId) {
  const na = _nodes[nodeId];
  if (!na || !na.analyser) return null;
  const buf = new Uint8Array(na.analyser.frequencyBinCount);
  na.analyser.getByteTimeDomainData(buf);
  return buf;
}

/* ── Environment node ────────────────────────────────────────────── */

export async function setEnvironmentActive(active) {
  if (active) {
    await _startMic();
  } else {
    _stopMic();
    /* Disconnect mic from all environment nodes */
    Object.values(_nodes).forEach(na => {
      if (na.type === 5 && na.inputMixer && _micSource) {
        try { _micSource.disconnect(na.inputMixer); } catch (_) {}
      }
    });
  }
}

export function getMicSpectrum() {
  return window._micSpectrum || { low: 0, mid: 0, high: 0, level: 0 };
}

/* ── Feedback worklet weight flush ───────────────────────────────── */

let _weightFlushScheduled = false;

/* Debounced: only send once per animation frame maximum */
function _scheduleWorkletWeightFlush() {
  if (_weightFlushScheduled) return;
  _weightFlushScheduled = true;
  requestAnimationFrame(() => {
    _weightFlushScheduled = false;
    _flushWorkletWeights();
  });
}

/**
 * Send the current recurrent weight submatrix to the feedback worklet.
 * Called by network.js via scheduleWorkletWeightFlush after Hebbian updates.
 */
export function flushWorkletWeights(recurrentWeights, nodeCount) {
  if (!_feedbackWorklet) return;
  _feedbackWorklet.port.postMessage({
    type:    'setWeights',
    weights: Array.from(recurrentWeights),
  });
  _feedbackWorklet.port.postMessage({
    type:  'setNodeCount',
    count: nodeCount,
  });
}

function _flushWorkletWeights() {
  /* Called internally — network.js is the authority on weights,
     so this internal version is a no-op. network.js calls the
     exported flushWorkletWeights() directly. */
}

/* ── Utility ─────────────────────────────────────────────────────── */

export function isRunning()     { return _isRunning; }
export function getAudioContext(){ return _ctx; }
export function isMicActive()   { return _micActive; }
