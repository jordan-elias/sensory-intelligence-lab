/**
 * neural-synthesis/network.js
 *
 * Single source of truth for all network state and learning.
 * The Web Audio graph in audio-engine.js is the physical instantiation
 * of what this module describes. Every state change here produces
 * a corresponding audio graph change via audio-engine.js calls.
 *
 * Timescales:
 *   Fast   — every animation frame (~16ms): read analyser data,
 *             update node envelope gains, update pan from position,
 *             run Kuramoto phase coupling on oscillators
 *   Medium — every 1s: Hebbian learning, frequency drift, homeostasis,
 *             specialization, harmonic accumulator update
 *   Slow   — every 10s: pruning, synaptogenesis, node growth check,
 *             environment node emergence check
 *
 * Node types:
 *   0 oscillator  1 filter  2 nonlinear  3 delay  4 predictive  5 environment
 *
 * Starting configuration (all species):
 *   3 nodes — node 0 always oscillator, nodes 1–2 from species distribution
 *   No environment node at start — it emerges via slow layer
 *   Growth: new node ~every 10min (stochastic), max 12
 */

import {
  initAudio,
  start        as audioStart,
  stop         as audioStop,
  setVolume,
  addNode      as audioAddNode,
  removeNode   as audioRemoveNode,
  updateNodeType as audioUpdateNodeType,
  addEdge      as audioAddEdge,
  removeEdge   as audioRemoveEdge,
  setEdgeWeight,
  setOscillatorFrequency,
  setNodeEnvelope,
  setNodePan,
  setSaturation,
  setInstability,
  setRecurrence,
  setDelayTime,
  injectEnergy as audioInjectEnergy,
  setEnvironmentActive,
  flushWorkletWeights,
  getAnalyserData,
  getMicSpectrum,
  isMicActive,
  isRunning    as audioIsRunning,
} from './audio-engine.js';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

export const MAX_NODES   = 12;
export const INIT_NODES  = 3;

export const NODE_TYPES  = Object.freeze({
  OSCILLATOR:  0,
  FILTER:      1,
  NONLINEAR:   2,
  DELAY:       3,
  PREDICTIVE:  4,
  ENVIRONMENT: 5,
});

export const TYPE_NAMES   = ['oscillator','filter','nonlinear','delay','predictive','environment'];
export const TYPE_SYMBOLS = ['○','◈','◆','◫','◎','◉'];

/* Just-intonation harmonic series — A1 = 55Hz root */
const BASE_HZ   = 55;
const HARMONICS = [1,2,3,4,5,6,7,8,9,10,12,15,16,18,20,24,27,32];

/* Growth timing */
const GROWTH_MS_MIN = 8  * 60 * 1000;
const GROWTH_MS_MAX = 12 * 60 * 1000;

/* Pruning thresholds */
const PRUNE_WEIGHT  = 0.032;
const PRUNE_AGE     = 80;

/* Specialization commit threshold */
const SPEC_COMMIT   = 0.62;

/* Environment node emergence: minimum conditions */
const ENV_MIN_NODES    = 8;
const ENV_MIN_RUNTIME  = 15 * 60 * 1000;   /* 15 minutes */
const ENV_MIN_LOCKS    = 5;

/* Just interval ratios for consonance attraction */
const JUST_RATIOS = [1, 9/8, 6/5, 5/4, 4/3, 3/2, 8/5, 5/3, 7/4, 2, 3, 4];

/* Kuramoto coupling: maximum frequency nudge per second (Hz) */
const KURAMOTO_MAX_NUDGE = 1.2;

/* ═══════════════════════════════════════════════════════════════════
   EVENT BUS
   ═══════════════════════════════════════════════════════════════════ */

const _listeners = {};

export const NetworkEvents = {
  on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  },
  off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  },
  emit(event, payload) {
    (_listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.warn('[NetworkEvents]', e); }
    });
  },
};

/* ═══════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════ */

export const NS = {
  nodes:          [],
  edges:          [],

  /* Parameters */
  instability:    0.4,
  recurrence:     0.5,
  saturation:     0.35,
  metabolism:     0.4,
  learningRate:   0.3,
  phaseCoupling:  0.35,
  harmonicGravity:0.45,
  volume:         0.7,

  /* Toggles */
  hebbianOn:      true,
  driftOn:        true,
  homeostasisOn:  true,
  depressionOn:   true,
  pruningOn:      true,
  predictiveOn:   true,
  fastOn:         true,
  mediumOn:       true,
  slowOn:         true,

  /* Runtime */
  isRunning:      false,
  selectedNode:   null,
  hoveredNode:    null,
  anchorMode:     false,
  listenNodeId:   null,

  startTime:      0,
  elapsedMs:      0,

  /* Derived display */
  energyLevel:    0,
  phaseLockCount: 0,
  totalPhaseLocks:0,
  dominantHarmonic:'—',
  envNodeId:      null,   /* id of environment node, null until emerged */

  /* Timing */
  nextNodeGrowth: 0,
  envEmergeChecked: false,

  /* Species */
  currentSpecies: null,

  /* Biography priors */
  biography:      null,
};

/* ═══════════════════════════════════════════════════════════════════
   NODE FACTORY
   ═══════════════════════════════════════════════════════════════════ */

let _nodeIdCounter = 0;

function _harmonicFreq(idx) {
  return BASE_HZ * HARMONICS[idx % HARMONICS.length];
}

function _freqToHue(hz) {
  const t = Math.max(0, Math.min(1,
    Math.log(hz / 40) / Math.log(1200 / 40)
  ));
  return 150 + t * 200;
}

function _makeNode(overrides = {}) {
  const id   = _nodeIdCounter++;
  const type = overrides.type ?? NODE_TYPES.OSCILLATOR;
  const freq = overrides.freq ?? _harmonicFreq(id);

  return {
    id,
    type,
    x:    overrides.x ?? 300,
    y:    overrides.y ?? 200,
    vx:   0,
    vy:   0,

    /* Audio parameters */
    freq,
    targetFreq: freq,

    /* Activation state — read from analyser, not computed here */
    output:       0,
    smoothEnergy: 0,
    recentActivity: 0,

    /* Phase for Kuramoto */
    phase:        Math.random() * Math.PI * 2,
    phaseLocked:  false,
    lockPartner:  -1,

    /* Homeostasis */
    actThreshold:   0.5,

    /* Specialization vector [osc, filt, nl, delay, pred, env] */
    specialization: _defaultSpec(type),
    committedType:  type,

    /* Harmonic event accumulator */
    harmonicAccum:     0,
    harmonicThreshold: 0.55 + Math.random() * 0.9,

    /* Visual */
    color:   _freqToHue(freq),
    _flash:  0,
    history: new Float32Array(48),
    histIdx: 0,

    /* Metadata */
    locked:   false,
    isolated: false,
    age:      0,

    ...overrides,
  };
}

function _defaultSpec(type) {
  const s = new Float32Array(6);
  s[Math.min(5, Math.max(0, type))] = 1.0;
  return s;
}

/* ═══════════════════════════════════════════════════════════════════
   EDGE FACTORY
   ═══════════════════════════════════════════════════════════════════ */

function _makeEdge(from, to, weight) {
  return {
    from,
    to,
    weight:       weight ?? (Math.random() * 0.7 - 0.05),
    age:          0,
    locked:       false,
    signal:       0,
    signalHistory:0,
    isRecurrent:  false,   /* set by _classifyEdges() */
    hasEmittedSat:false,
  };
}

/**
 * Classify which edges form feedback loops (recurrent).
 * A simple heuristic: an edge i→j is recurrent if there exists
 * a path j→...→i. We use a DFS reachability check.
 * Called after any structural change.
 */
function _classifyEdges() {
  const N = NS.nodes.length;
  NS.edges.forEach(e => {
    e.isRecurrent = _canReach(e.to, e.from);
  });
}

function _canReach(start, target) {
  const visited = new Set();
  const stack   = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    NS.edges.forEach(e => {
      if (e.from === current && !visited.has(e.to)) {
        stack.push(e.to);
      }
    });
  }
  return false;
}

/**
 * Build the recurrent weight submatrix (MAX_NODES × MAX_NODES, row-major)
 * for the feedback worklet.
 */
function _buildRecurrentMatrix() {
  const W = new Float32Array(MAX_NODES * MAX_NODES);
  NS.edges.forEach(e => {
    if (e.isRecurrent) {
      W[e.from * MAX_NODES + e.to] = e.weight;
    }
  });
  return W;
}

/* ── Edge helpers ─────────────────────────────────────────────────── */

export function edgeExists(from, to) {
  return NS.edges.some(e => e.from === from && e.to === to);
}

export function addEdge(from, to, weight) {
  if (from === to || edgeExists(from, to)) return null;
  const e = _makeEdge(from, to, weight);
  NS.edges.push(e);
  _classifyEdges();
  audioAddEdge(from, to, e.weight, e.isRecurrent);
  if (e.isRecurrent) {
    flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
  }
  NetworkEvents.emit('edgeAdded', { edge: e });
  return e;
}

export function removeEdge(from, to) {
  NS.edges = NS.edges.filter(e => !(e.from === from && e.to === to));
  audioRemoveEdge(from, to);
  _classifyEdges();
  flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
}

export function severNode(nodeId) {
  NS.edges = NS.edges.filter(e => {
    if (e.from === nodeId || e.to === nodeId) {
      audioRemoveEdge(e.from, e.to);
      return false;
    }
    return true;
  });
  _classifyEdges();
  flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
  NetworkEvents.emit('emergence', { text: `severed — node ${nodeId} disconnected` });
}

/* ═══════════════════════════════════════════════════════════════════
   SPECIES DEFINITIONS
   ═══════════════════════════════════════════════════════════════════ */

export const SPECIES = [
  {
    id:      'lull',
    name:    'Lull',
    color:   'var(--lull)',
    tagline: 'moves slowly toward light',
    guide: [
      'sparse connections, low instability',
      'strong unison and fifth attraction',
      'long harmonic event intervals',
      'receptive to environment input',
    ],
    /* Distribution for nodes 1 and 2 (node 0 always oscillator) */
    supportTypeDist: [0.3, 0.35, 0.05, 0.25, 0.05],   /* osc, filt, nl, delay, pred */
    instability:     0.18,
    recurrence:      0.42,
    saturation:      0.18,
    metabolism:      0.22,
    lrate:           0.14,
    coupling:        0.58,
    hgravity:        0.72,
    envSensitivity:  0.8,
    buildTopology(nodes, edges) {
      /* Sparse chain */
      for (let i = 0; i < nodes.length - 1; i++) {
        _tryAdd(edges, nodes[i].id, nodes[i+1].id, 0.45 + Math.random()*0.22);
      }
      _tryAdd(edges, nodes[nodes.length-1].id, nodes[0].id, 0.28 + Math.random()*0.15);
    },
  },
  {
    id:      'weft',
    name:    'Weft',
    color:   'var(--weft)',
    tagline: 'things fitting together without knowing why',
    guide: [
      'bilateral symmetry in connections',
      'structured interval vocabulary',
      'rhythmic regularity emerges early',
      'moderate instability',
    ],
    supportTypeDist: [0.25, 0.2, 0.15, 0.3, 0.1],
    instability:     0.38,
    recurrence:      0.5,
    saturation:      0.32,
    metabolism:      0.45,
    lrate:           0.28,
    coupling:        0.48,
    hgravity:        0.52,
    envSensitivity:  0.3,
    buildTopology(nodes, edges) {
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        _tryAdd(edges, nodes[i].id, nodes[(i+1)%N].id, 0.4 + Math.random()*0.22);
      }
    },
  },
  {
    id:      'brine',
    name:    'Brine',
    color:   'var(--brine)',
    tagline: 'the feeling of dread that has no object',
    guide: [
      'dense inhibitory inter-connections',
      'dissonant harmonic vocabulary',
      'predictive nodes dominate',
      'averse to environment input',
    ],
    supportTypeDist: [0.2, 0.1, 0.25, 0.1, 0.35],
    instability:     0.68,
    recurrence:      0.62,
    saturation:      0.60,
    metabolism:      0.55,
    lrate:           0.45,
    coupling:        0.22,
    hgravity:        0.25,
    envSensitivity: -0.4,
    buildTopology(nodes, edges) {
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        const nc = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < nc; k++) {
          const j = Math.floor(Math.random() * N);
          const w = Math.random() < 0.5
            ? -(0.2 + Math.random()*0.35)
            :  (0.15 + Math.random()*0.3);
          _tryAdd(edges, nodes[i].id, nodes[j].id, w);
        }
      }
    },
  },
  {
    id:      'murk',
    name:    'Murk',
    color:   'var(--murk)',
    tagline: 'the feeling of beautiful disorientation',
    guide: [
      'asymmetric, sparse connections',
      'unresolved harmonic intervals',
      'slow drift, minimal locking',
      'neutral to environment input',
    ],
    supportTypeDist: [0.3, 0.3, 0.2, 0.15, 0.05],
    instability:     0.32,
    recurrence:      0.44,
    saturation:      0.28,
    metabolism:      0.30,
    lrate:           0.10,
    coupling:        0.20,
    hgravity:        0.35,
    envSensitivity:  0.1,
    buildTopology(nodes, edges) {
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        if (Math.random() < 0.6) {
          const j = Math.floor(Math.random() * N);
          _tryAdd(edges, nodes[i].id, nodes[j].id, 0.1 + Math.random()*0.4);
        }
      }
    },
  },
  {
    id:      'fray',
    name:    'Fray',
    color:   'var(--fray)',
    tagline: 'unresolved argument that has become affectionate',
    guide: [
      'oscillators in tension, inhibitory bridges',
      'call-and-response rhythmic character',
      'alternating activity, dynamic interplay',
      'receptive to environment input',
    ],
    supportTypeDist: [0.45, 0.15, 0.15, 0.1, 0.15],
    instability:     0.44,
    recurrence:      0.52,
    saturation:      0.38,
    metabolism:      0.42,
    lrate:           0.30,
    coupling:        0.58,
    hgravity:        0.48,
    envSensitivity:  0.6,
    buildTopology(nodes, edges) {
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i !== j && Math.random() < 0.45) {
            const w = Math.random() < 0.3
              ? -(0.15 + Math.random()*0.2)
              :  (0.28 + Math.random()*0.28);
            _tryAdd(edges, nodes[i].id, nodes[j].id, w);
          }
        }
      }
    },
  },
  {
    id:      'loam',
    name:    'Loam',
    color:   'var(--loam)',
    tagline: 'grief that has composted into something generative',
    guide: [
      'filter-heavy, deeply textured',
      'very slow learning, patient structure',
      'rich harmonic vocabulary over time',
      'shy — mildly averse to environment',
    ],
    supportTypeDist: [0.1, 0.5, 0.15, 0.15, 0.1],
    instability:     0.22,
    recurrence:      0.55,
    saturation:      0.40,
    metabolism:      0.25,
    lrate:           0.07,
    coupling:        0.42,
    hgravity:        0.65,
    envSensitivity: -0.2,
    buildTopology(nodes, edges) {
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i !== j && Math.random() < 0.35) {
            _tryAdd(edges, nodes[i].id, nodes[j].id, 0.2 + Math.random()*0.32);
          }
        }
      }
    },
  },
];

function _tryAdd(edges, from, to, weight) {
  if (from === to) return;
  if (edges.some(e => e.from === from && e.to === to)) return;
  edges.push(_makeEdge(from, to, weight));
}

function _sampleSupportType(dist) {
  /* dist covers [osc, filt, nl, delay, pred] — never env */
  let r = Math.random();
  for (let i = 0; i < dist.length; i++) {
    r -= dist[i];
    if (r <= 0) return i;
  }
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

export function buildNetwork(speciesId, canvasW, canvasH) {
  const species = SPECIES.find(s => s.id === speciesId) || SPECIES[0];
  NS.currentSpecies = species;
  NS.envNodeId      = null;
  NS.envEmergeChecked = false;

  _nodeIdCounter    = 0;
  NS.nodes          = [];
  NS.edges          = [];
  NS.phaseLockCount = 0;
  NS.totalPhaseLocks= 0;

  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const r  = Math.min(canvasW, canvasH) * 0.28;

  /* Node 0 — always oscillator */
  const angle0 = -Math.PI / 2;
  NS.nodes.push(_makeNode({
    type: NODE_TYPES.OSCILLATOR,
    freq: _harmonicFreq(0),
    x: cx + Math.cos(angle0) * r,
    y: cy + Math.sin(angle0) * r,
  }));

  /* Nodes 1 and 2 — from species support distribution */
  for (let i = 1; i < INIT_NODES; i++) {
    const angle = angle0 + (i / INIT_NODES) * Math.PI * 2;
    const type  = _sampleSupportType(species.supportTypeDist);
    const freq  = type === NODE_TYPES.OSCILLATOR ? _harmonicFreq(i) : _harmonicFreq(0);
    NS.nodes.push(_makeNode({
      type,
      freq,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    }));
  }

  /* Apply biography priors */
  if (NS.biography) _applyBiographyPriors(species);

  /* Build topology */
  const edgeList = [];
  species.buildTopology(NS.nodes, edgeList);
  NS.edges = edgeList;

  /* Classify recurrent edges */
  _classifyEdges();

  /* Schedule growth */
  NS.nextNodeGrowth = Date.now() + _growthInterval();
}

/**
 * Create all Web Audio objects for the current network.
 * Called after buildNetwork(), once audio context is ready.
 */
export function instantiateAudio() {
  NS.nodes.forEach(n => audioAddNode(n));
  NS.edges.forEach(e => audioAddEdge(e.from, e.to, e.weight, e.isRecurrent));
  flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
}

function _growthInterval() {
  return GROWTH_MS_MIN + Math.random() * (GROWTH_MS_MAX - GROWTH_MS_MIN);
}

/* ═══════════════════════════════════════════════════════════════════
   BIOGRAPHY PRIORS
   ═══════════════════════════════════════════════════════════════════ */

function _applyBiographyPriors(species) {
  const bio = NS.biography;
  if (!bio) return;

  const sleepMs   = Date.now() - (new Date(bio.lastSessionAt).getTime() || Date.now());
  const sleepDays = sleepMs / (1000 * 60 * 60 * 24);
  const k         = Math.log(50) / 14;
  const retention = Math.max(0, Math.min(1, Math.exp(-k * sleepDays)));

  if (bio.harmonicVocabulary && retention > 0.1) {
    NS.nodes.forEach((n, i) => {
      if (n.type !== NODE_TYPES.OSCILLATOR) return;
      const prior = bio.harmonicVocabulary[i % bio.harmonicVocabulary.length];
      if (prior) {
        n.freq       = n.freq * (1 - retention * 0.6) + prior * retention * 0.6;
        n.targetFreq = n.freq;
        n.color      = _freqToHue(n.freq);
      }
    });
  }

  if (bio.specialization && retention > 0.2) {
    NS.nodes.forEach((n, i) => {
      const ps = bio.specialization[i % bio.specialization.length];
      if (!ps) return;
      for (let t = 0; t < 6; t++) {
        n.specialization[t] =
          n.specialization[t] * (1 - retention * 0.5) + (ps[t] || 0) * retention * 0.5;
      }
      const sum = n.specialization.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        for (let t = 0; t < 6; t++) n.specialization[t] /= sum;
      }
    });
  }

  if (bio.weightMatrix && retention > 0.35) {
    const tr = retention * 0.4;
    NS.edges.forEach(e => {
      const prior = bio.weightMatrix[e.from * MAX_NODES + e.to];
      if (prior !== undefined) {
        e.weight = e.weight * (1 - tr) + prior * tr;
      }
    });
  }

  const label = retention > 0.7 ? 'remembering — waking from short sleep'
              : retention > 0.3 ? 'faint traces — long sleep'
              : 'nearly forgotten — beginning again';
  NetworkEvents.emit('emergence', { text: label });
}

/* ═══════════════════════════════════════════════════════════════════
   PARAMETER SYNC
   ═══════════════════════════════════════════════════════════════════ */

export function setParam(key, value) {
  NS[key] = value;
  /* Mirror to audio engine for relevant params */
  switch (key) {
    case 'instability': setInstability(value); break;
    case 'recurrence':  setRecurrence(value);  break;
    case 'saturation':  setSaturation(value);  break;
    case 'volume':      setVolume(value);       break;
    default: break;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN TICK — called from main.js RAF loop
   ═══════════════════════════════════════════════════════════════════ */

const MEDIUM_MS = 1000;
const SLOW_MS   = 10000;

let _lastMedium = 0;
let _lastSlow   = 0;

export function tick(nowMs, canvasW) {
  if (!NS.isRunning) return;
  NS.elapsedMs = nowMs - NS.startTime;

  /* ── Fast layer ─────────────────────────────────────────────── */
  if (NS.fastOn) _fastTick(canvasW);

  /* ── Medium layer ───────────────────────────────────────────── */
  if (NS.mediumOn && nowMs - _lastMedium >= MEDIUM_MS) {
    _lastMedium = nowMs;
    _mediumTick();
  }

  /* ── Slow layer ─────────────────────────────────────────────── */
  if (NS.slowOn && nowMs - _lastSlow >= SLOW_MS) {
    _lastSlow = nowMs;
    _slowTick(nowMs, canvasW);
  }

  /* ── Node growth ────────────────────────────────────────────── */
  if (nowMs >= NS.nextNodeGrowth && NS.nodes.length < MAX_NODES) {
    _growNode(canvasW);
    NS.nextNodeGrowth = nowMs + _growthInterval();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   FAST LAYER — per animation frame
   ═══════════════════════════════════════════════════════════════════ */

function _fastTick(canvasW) {
  let totalEnergy = 0;
  let activeOscs  = [];

  NS.nodes.forEach((n, i) => {
    n.age++;
    if (n._flash > 0) n._flash = Math.max(0, n._flash - 0.04);

    /* Read energy from analyser */
    const adata = getAnalyserData(n.id);
    if (adata) {
      let rms = 0;
      for (let k = 0; k < adata.length; k++) {
        const v = (adata[k] - 128) / 128;
        rms += v * v;
      }
      const energy     = Math.sqrt(rms / adata.length);
      n.smoothEnergy   = n.smoothEnergy * 0.88 + energy * 0.12;
      n.recentActivity = n.recentActivity * 0.996 + energy * 0.004;

      /* Update history ring buffer */
      const scaled = (energy * 2 - 1);   /* -1..1 for display */
      n.history[n.histIdx] = scaled;
      n.histIdx = (n.histIdx + 1) % n.history.length;
    }

    /* Push energy level to audio engine */
    if (!n.isolated) {
      setNodeEnvelope(n.id, n.smoothEnergy);
    } else {
      setNodeEnvelope(n.id, 0);
    }

    /* Pan from position */
    if (canvasW > 0) {
      setNodePan(n.id, (n.x / canvasW) * 2 - 1);
    }

    totalEnergy += n.smoothEnergy;

    if (n.type === NODE_TYPES.OSCILLATOR && n.smoothEnergy > 0.02) {
      activeOscs.push(n);
    }
  });

  NS.energyLevel = Math.min(1, totalEnergy / Math.max(1, NS.nodes.length));

  /* ── Kuramoto phase coupling ───────────────────────────────── */
  if (NS.phaseCoupling > 0) {
    activeOscs.forEach(n => {
      let phaseSum = 0, count = 0;
      NS.edges
        .filter(e => e.from === n.id && e.weight > 0.12)
        .forEach(e => {
          const nb = NS.nodes.find(x => x.id === e.to);
          if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
          phaseSum += e.weight * Math.sin(nb.phase - n.phase);
          count++;
        });

      if (count > 0) {
        const nudgeHz = NS.phaseCoupling * KURAMOTO_MAX_NUDGE
                      * phaseSum / count;
        const newFreq = Math.max(20, Math.min(8000, n.freq + nudgeHz));
        if (Math.abs(newFreq - n.freq) > 0.05) {
          n.freq = newFreq;
          setOscillatorFrequency(n.id, n.freq, 0.25);
        }
      }

      /* Advance phase tracker */
      n.phase += (n.freq / 44100) * 2 * Math.PI * 16;   /* ~1 frame */
      n.phase  = n.phase % (Math.PI * 2);
    });
  }

  /* ── Phase lock detection ──────────────────────────────────── */
  let newLocks = 0;
  activeOscs.forEach(n => {
    const wasLocked = n.phaseLocked;
    n.phaseLocked   = false;
    n.lockPartner   = -1;

    NS.edges
      .filter(e => e.from === n.id && e.weight > 0.2)
      .forEach(e => {
        const nb = NS.nodes.find(x => x.id === e.to);
        if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
        if (Math.abs(n.freq - nb.freq) > 3.5) return;
        const diff = Math.abs(
          ((n.phase - nb.phase) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
        );
        if (diff < 0.3 || diff > Math.PI * 2 - 0.3) {
          n.phaseLocked = true;
          n.lockPartner = nb.id;
        }
      });

    if (n.phaseLocked && !wasLocked) {
      newLocks++;
      NS.totalPhaseLocks++;
      NetworkEvents.emit('phaseLock', { nodeA: n.id, nodeB: n.lockPartner });
    }
  });

  NS.phaseLockCount = NS.nodes.filter(n => n.phaseLocked).length;

  if (newLocks > 0) {
    NetworkEvents.emit('emergence', {
      text: `phase lock — ${newLocks} oscillator${newLocks > 1 ? 's' : ''} synchronizing`,
    });
  }

  /* ── Edge signal tracking ──────────────────────────────────── */
  NS.edges.forEach(e => {
    const fromNode = NS.nodes.find(n => n.id === e.from);
    const toNode   = NS.nodes.find(n => n.id === e.to);
    if (!fromNode || !toNode) return;
    const sig      = Math.abs(fromNode.smoothEnergy * e.weight);
    e.signal       = sig;
    e.signalHistory= e.signalHistory * 0.9 + sig * 0.1;
  });

  /* ── Dominant harmonic ─────────────────────────────────────── */
  if (activeOscs.length > 0) {
    const minFreq = Math.min(...activeOscs.map(n => n.freq));
    const nearestH = HARMONICS.reduce((best, h) => {
      const f = BASE_HZ * h;
      return Math.abs(f - minFreq) < Math.abs(best - minFreq) ? f : best;
    }, BASE_HZ);
    NS.dominantHarmonic = nearestH.toFixed(1) + ' Hz';
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIUM LAYER — Hebbian, drift, homeostasis
   ═══════════════════════════════════════════════════════════════════ */

function _mediumTick() {
  const lrScale = 0.12 + NS.learningRate * 2.0;
  let weightChanged = false;
  let recurrentChanged = false;

  /* ── Hebbian learning ───────────────────────────────────────── */
  if (NS.hebbianOn) {
    NS.edges.forEach(e => {
      if (e.locked) return;
      const nFrom = NS.nodes.find(n => n.id === e.from);
      const nTo   = NS.nodes.find(n => n.id === e.to);
      if (!nFrom || !nTo) return;

      /* Co-activation Hebbian rule */
      const hebb = nFrom.smoothEnergy * nTo.smoothEnergy * lrScale * 0.001;
      e.weight  += hebb;
      e.weight  *= (1 - 0.0005);   /* weight decay */
      e.weight   = Math.max(-1.6, Math.min(1.6, e.weight));
      e.age++;

      /* Update audio graph */
      setEdgeWeight(e.from, e.to, e.weight);
      weightChanged = true;
      if (e.isRecurrent) recurrentChanged = true;

      if (Math.abs(e.weight) > 1.1 && !e.hasEmittedSat) {
        e.hasEmittedSat = true;
        NetworkEvents.emit('emergence', {
          text: `hebbian saturation — ${e.from}→${e.to} dominant`,
        });
      }
    });
  }

  /* Flush recurrent weights to worklet if any changed */
  if (recurrentChanged) {
    flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
  }

  /* ── Frequency drift + harmonic attraction ──────────────────── */
  if (NS.driftOn) {
    NS.nodes.forEach(n => {
      if (n.type !== NODE_TYPES.OSCILLATOR || n.isolated) return;

      /* Small stochastic drift */
      n.freq += (Math.random() - 0.5) * 0.06 * NS.instability;

      /* Attract toward nearest harmonic partial */
      const nearestH = HARMONICS.reduce((best, h) => {
        const f = BASE_HZ * h;
        return Math.abs(f - n.freq) < Math.abs(best - n.freq) ? f : best;
      }, BASE_HZ);
      n.freq += (nearestH - n.freq) * NS.harmonicGravity * 0.003;

      /* Attract toward consonance with connected neighbors */
      NS.edges
        .filter(e => e.from === n.id && e.weight > 0.25)
        .forEach(e => {
          const nb = NS.nodes.find(x => x.id === e.to);
          if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
          const ratio   = nb.freq / n.freq;
          const nearest = JUST_RATIOS.reduce((best, r) =>
            Math.abs(r - ratio) < Math.abs(best - ratio) ? r : best, JUST_RATIOS[0]);
          const target  = n.freq * nearest;
          nb.freq      += (target - nb.freq) * 0.0015 * e.weight;
        });

      n.freq  = Math.max(35, Math.min(1400, n.freq));
      n.color = _freqToHue(n.freq);

      /* Push to audio engine — smooth glide */
      setOscillatorFrequency(n.id, n.freq, 0.5);
    });
  }

  /* ── Delay time quantization toward endogenous rhythm ────────── */
  NS.nodes
    .filter(n => n.type === NODE_TYPES.DELAY)
    .forEach(n => {
      /* Use metabolism to derive a base period in seconds */
      const basePeriod = 0.5 + (1 - NS.metabolism) * 2.0;
      const subdivs    = [1, 0.75, 0.5, 0.333, 0.25];
      const targets    = subdivs.map(s => basePeriod * s);
      const current    = n.delayTime || 0.25;
      const nearest    = targets.reduce((best, t) =>
        Math.abs(t - current) < Math.abs(best - current) ? t : best, current);
      n.delayTime      = current + (nearest - current) * NS.harmonicGravity * 0.04;
      n.delayTime      = Math.max(0.01, Math.min(1.95, n.delayTime));
      setDelayTime(n.id, n.delayTime);
    });

  /* ── Homeostasis ─────────────────────────────────────────────── */
  if (NS.homeostasisOn) {
    NS.nodes.forEach(n => {
      const err       = n.recentActivity - 0.25;
      n.actThreshold += err * 0.005;
      n.actThreshold  = Math.max(0.08, Math.min(2.2, n.actThreshold));
    });
  }

  /* ── Specialization drift ───────────────────────────────────── */
  NS.nodes.forEach(n => {
    n.specialization[Math.min(5, n.type)] += 0.004;
    const sum = n.specialization.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let t = 0; t < 6; t++) n.specialization[t] /= sum;
    }
    let maxV = 0, maxT = n.committedType;
    for (let t = 0; t < 6; t++) {
      if (n.specialization[t] > maxV) { maxV = n.specialization[t]; maxT = t; }
    }
    if (maxV > SPEC_COMMIT && maxT !== n.committedType) {
      n.committedType = maxT;
      NetworkEvents.emit('emergence', {
        text: `node ${n.id} committed — ${TYPE_NAMES[maxT]}`,
      });
    }
  });

  /* ── Harmonic accumulator ───────────────────────────────────── */
  NS.nodes.forEach(n => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    const incomingEnergy = NS.edges
      .filter(e => e.to === n.id)
      .reduce((s, e) => s + e.signalHistory, 0);
    n.harmonicAccum += incomingEnergy * 0.06;
    n.harmonicAccum *= 0.95;
  });

  /* ── Environment node contribution ─────────────────────────── */
  if (NS.envNodeId !== null && NS.isRunning) {
    const spec    = getMicSpectrum();
    const envNode = NS.nodes.find(n => n.id === NS.envNodeId);
    if (envNode && spec.level > 0.05) {
      const sensitivity = NS.currentSpecies?.envSensitivity ?? 0.3;
      /* Positive sensitivity: mic energizes connected oscillators */
      NS.edges
        .filter(e => e.from === NS.envNodeId)
        .forEach(e => {
          const nb = NS.nodes.find(n => n.id === e.to);
          if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
          const injection = spec.level * sensitivity * e.weight * 0.3;
          if (injection > 0.01) audioInjectEnergy(nb.id, injection);
        });
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SLOW LAYER — structural changes
   ═══════════════════════════════════════════════════════════════════ */

function _slowTick(nowMs, canvasW) {
  const N = NS.nodes.length;

  /* ── Edge pruning ───────────────────────────────────────────── */
  if (NS.pruningOn) {
    const toRemove = NS.edges.filter(e =>
      !e.locked &&
      Math.abs(e.weight) < PRUNE_WEIGHT &&
      e.age > PRUNE_AGE
    );
    if (toRemove.length > 0) {
      toRemove.forEach(e => removeEdge(e.from, e.to));
      NetworkEvents.emit('emergence', {
        text: `pruned ${toRemove.length} dormant connection${toRemove.length > 1 ? 's' : ''}`,
      });
    }
  }

  /* ── Synaptogenesis ─────────────────────────────────────────── */
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const ni = NS.nodes[i], nj = NS.nodes[j];
      if (!ni || !nj) continue;
      if (ni.recentActivity > 0.22 && nj.recentActivity > 0.22) {
        if (!edgeExists(ni.id, nj.id) && Math.random() < 0.015) {
          addEdge(ni.id, nj.id, 0.05 + Math.random() * 0.1);
          NetworkEvents.emit('emergence', {
            text: `new synapse — node ${ni.id} → ${nj.id}`,
          });
        }
      }
    }
  }

  /* ── Node pruning ───────────────────────────────────────────── */
  if (NS.pruningOn && N > INIT_NODES) {
    NS.nodes.forEach(n => {
      if (n.id === 0) return;
      if (n.type === NODE_TYPES.ENVIRONMENT) return;
      const totalW = NS.edges
        .filter(e => e.from === n.id || e.to === n.id)
        .reduce((s, e) => s + Math.abs(e.weight), 0);
      if (totalW < 0.06 && n.recentActivity < 0.02 && n.age > 600 && Math.random() < 0.1) {
        _removeNode(n.id);
        NetworkEvents.emit('emergence', { text: `node ${n.id} faded — disconnected` });
      }
    });
  }

  /* ── Environment node emergence ─────────────────────────────── */
  if (
    !NS.envNodeId &&
    !NS.envEmergeChecked &&
    N >= ENV_MIN_NODES &&
    NS.elapsedMs >= ENV_MIN_RUNTIME &&
    NS.totalPhaseLocks >= ENV_MIN_LOCKS &&
    Math.random() < 0.25   /* stochastic — not guaranteed on first check */
  ) {
    _emergeEnvironmentNode(canvasW);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   NODE GROWTH
   ═══════════════════════════════════════════════════════════════════ */

function _growNode(canvasW) {
  const species = NS.currentSpecies || SPECIES[0];
  const N       = NS.nodes.length;
  if (N >= MAX_NODES) return;

  /* Find most active node to grow near */
  const host = NS.nodes.reduce((best, n) =>
    n.smoothEnergy > best.smoothEnergy ? n : best, NS.nodes[0]);

  /* Type differentiation: find underrepresented type near host */
  const neighborTypes = NS.edges
    .filter(e => e.from === host.id || e.to === host.id)
    .map(e => {
      const other = NS.nodes.find(n =>
        n.id === (e.from === host.id ? e.to : e.from));
      return other?.type;
    })
    .filter(t => t !== undefined && t !== NODE_TYPES.ENVIRONMENT);

  const counts = new Array(5).fill(0);
  neighborTypes.forEach(t => { if (t < 5) counts[t]++; });

  /* Sample from species distribution, biased toward underrepresented */
  const dist = species.supportTypeDist.map((prob, t) => {
    const deficit = Math.max(0, prob - (counts[t] / Math.max(1, neighborTypes.length)));
    return deficit + 0.04;
  });
  const newType = _sampleSupportType(dist);

  const angle   = Math.random() * Math.PI * 2;
  const dist2   = 55 + Math.random() * 75;
  const newFreq = newType === NODE_TYPES.OSCILLATOR
    ? _harmonicFreq(N)
    : _harmonicFreq(0);

  const newNode = _makeNode({
    type: newType,
    freq: newFreq,
    targetFreq: newFreq,
    x: Math.max(30, Math.min(canvasW - 30, host.x + Math.cos(angle) * dist2)),
    y: Math.max(30, Math.min(400, host.y + Math.sin(angle) * dist2)),
  });

  NS.nodes.push(newNode);
  audioAddNode(newNode);

  /* Connect to host and optionally one other node */
  addEdge(host.id, newNode.id, 0.14 + Math.random() * 0.18);
  if (NS.nodes.length > 2 && Math.random() < 0.55) {
    const other = NS.nodes[Math.floor(Math.random() * (NS.nodes.length - 1))];
    if (other.id !== newNode.id) {
      addEdge(newNode.id, other.id, 0.08 + Math.random() * 0.14);
    }
  }

  NetworkEvents.emit('nodeAdded', { node: newNode });
  NetworkEvents.emit('emergence', {
    text: `new node — ${TYPE_NAMES[newType]} differentiating`,
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ENVIRONMENT NODE EMERGENCE
   A notable, singular event.
   ═══════════════════════════════════════════════════════════════════ */

function _emergeEnvironmentNode(canvasW) {
  NS.envEmergeChecked = true;   /* only attempt once per session */

  const N       = NS.nodes.length;
  const canvasH = 400;
  const cx      = canvasW / 2;
  const cy      = canvasH / 2;

  /* Place at periphery */
  const angle   = Math.random() * Math.PI * 2;
  const r       = Math.min(canvasW, canvasH) * 0.42;

  const envNode = _makeNode({
    type: NODE_TYPES.ENVIRONMENT,
    freq: BASE_HZ,
    x: Math.max(30, Math.min(canvasW - 30, cx + Math.cos(angle) * r)),
    y: Math.max(30, Math.min(canvasH - 30, cy + Math.sin(angle) * r)),
  });

  NS.nodes.push(envNode);
  NS.envNodeId = envNode.id;
  audioAddNode(envNode);

  /* Connect to 2–3 oscillator nodes */
  const oscs = NS.nodes
    .filter(n => n.type === NODE_TYPES.OSCILLATOR && n.id !== envNode.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  oscs.forEach(osc => {
    addEdge(envNode.id, osc.id, 0.12 + Math.random() * 0.15);
  });

  NetworkEvents.emit('nodeAdded', { node: envNode, isEnvironment: true });
  NetworkEvents.emit('emergence', {
    text: 'the network has grown complex enough to sense the world',
  });
  NetworkEvents.emit('environmentNodeEmerged', { nodeId: envNode.id });
}

/* ═══════════════════════════════════════════════════════════════════
   NODE REMOVAL
   ═══════════════════════════════════════════════════════════════════ */

function _removeNode(nodeId) {
  NS.edges = NS.edges.filter(e => {
    if (e.from === nodeId || e.to === nodeId) {
      audioRemoveEdge(e.from, e.to);
      return false;
    }
    return true;
  });
  NS.nodes = NS.nodes.filter(n => n.id !== nodeId);
  if (NS.selectedNode === nodeId) NS.selectedNode = null;
  if (NS.envNodeId    === nodeId) NS.envNodeId    = null;

  audioRemoveNode(nodeId);
  _classifyEdges();
  flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
  NetworkEvents.emit('nodeRemoved', { nodeId });
}

/* ═══════════════════════════════════════════════════════════════════
   MUTATIONS
   ═══════════════════════════════════════════════════════════════════ */

export function mutate() {
  NS.edges.forEach(e => {
    if (e.locked) return;
    e.weight += (Math.random() - 0.5) * 0.4 * NS.instability;
    e.weight  = Math.max(-1.6, Math.min(1.6, e.weight));
    e.hasEmittedSat = false;
    setEdgeWeight(e.from, e.to, e.weight);
  });
  NS.nodes.forEach(n => {
    if (n.type === NODE_TYPES.OSCILLATOR) {
      const h = HARMONICS[Math.floor(Math.random() * HARMONICS.length)];
      n.freq  = BASE_HZ * h;
      n.color = _freqToHue(n.freq);
      setOscillatorFrequency(n.id, n.freq, 0.2);
    }
  });
  _classifyEdges();
  flushWorkletWeights(_buildRecurrentMatrix(), NS.nodes.length);
  NetworkEvents.emit('mutated', {});
  NetworkEvents.emit('emergence', { text: 'mutation — weights and frequencies randomized' });
}

export function rewire() {
  const removable = NS.edges.filter(e => !e.locked);
  const nRemove   = Math.min(3, Math.floor(removable.length * 0.14));
  for (let k = 0; k < nRemove; k++) {
    const idx = Math.floor(Math.random() * NS.edges.length);
    const e   = NS.edges[idx];
    if (e && !e.locked) removeEdge(e.from, e.to);
  }
  const N   = NS.nodes.length;
  const add = 1 + Math.floor(Math.random() * 3);
  for (let k = 0; k < add; k++) {
    const a = NS.nodes[Math.floor(Math.random() * N)];
    const b = NS.nodes[Math.floor(Math.random() * N)];
    if (a && b) addEdge(a.id, b.id, Math.random() * 0.55 - 0.05);
  }
  NetworkEvents.emit('rewired', {});
  NetworkEvents.emit('emergence', {
    text: `rewired — ${NS.edges.length} connections`,
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ENERGY INJECTION
   ═══════════════════════════════════════════════════════════════════ */

export function injectNode(nodeId, amount = 0.8) {
  const n = NS.nodes.find(x => x.id === nodeId);
  if (!n) return;
  n._flash = 1.0;
  audioInjectEnergy(nodeId, amount + Math.random() * 0.2);
}

/* ═══════════════════════════════════════════════════════════════════
   FORCE LAYOUT
   ═══════════════════════════════════════════════════════════════════ */

export function applyForces(canvasW, canvasH, dragNode) {
  if (NS.anchorMode) return;

  NS.nodes.forEach((n, i) => {
    if (n === dragNode) return;
    n.vx *= 0.80;
    n.vy *= 0.80;

    NS.nodes.forEach((m, j) => {
      if (i === j) return;
      const dx = n.x - m.x, dy = n.y - m.y;
      const d2 = dx * dx + dy * dy + 1;
      n.vx += (dx / d2) * 2200;
      n.vy += (dy / d2) * 2200;
    });

    n.vx += (canvasW / 2 - n.x) * 0.005;
    n.vy += (canvasH / 2 - n.y) * 0.005;
  });

  NS.edges.forEach(e => {
    const a = NS.nodes.find(n => n.id === e.from);
    const b = NS.nodes.find(n => n.id === e.to);
    if (!a || !b || a === dragNode || b === dragNode) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 1;
    const target = 95 + Math.abs(e.weight) * 22;
    const f      = (d - target) * 0.042;
    const fx     = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  });

  NS.nodes.forEach(n => {
    if (n === dragNode) return;
    n.x += Math.max(-11, Math.min(11, n.vx));
    n.y += Math.max(-11, Math.min(11, n.vy));
    n.x  = Math.max(28, Math.min(canvasW - 28, n.x));
    n.y  = Math.max(28, Math.min(canvasH - 28, n.y));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

export function getNodeAt(x, y, radius = 22) {
  for (let i = NS.nodes.length - 1; i >= 0; i--) {
    const n  = NS.nodes[i];
    const dx = n.x - x, dy = n.y - y;
    if (dx * dx + dy * dy < radius * radius) return n;
  }
  return null;
}

export function getWeightMatrix() {
  const N = NS.nodes.length;
  const W = new Float32Array(N * N);
  NS.edges.forEach(e => {
    const fi = NS.nodes.findIndex(n => n.id === e.from);
    const ti = NS.nodes.findIndex(n => n.id === e.to);
    if (fi >= 0 && ti >= 0) W[fi * N + ti] = e.weight;
  });
  return { W, N };
}

export function getSpecializationLabel(node) {
  const max = node.specialization.reduce(
    (m, v, i) => v > m.v ? { v, i } : m, { v: 0, i: node.type }
  );
  return `${TYPE_NAMES[max.i]} ${Math.round(max.v * 100)}%`;
}

export function getBiographySnapshot() {
  const N = NS.nodes.length;
  return {
    nodeCount:          N,
    harmonicVocabulary: NS.nodes.map(n => n.freq),
    specialization:     NS.nodes.map(n => Array.from(n.specialization)),
    weightMatrix:       Array.from(getWeightMatrix().W),
    dominantHarmonic:   NS.dominantHarmonic,
    totalPhaseLocks:    NS.totalPhaseLocks,
    speciesId:          NS.currentSpecies?.id ?? 'lull',
    lastSessionAt:      Date.now(),
    envNodeEmerged:     NS.envNodeId !== null,
  };
}

export function applyBiography(bio) {
  NS.biography = bio;
}

export function reset(speciesId, canvasW, canvasH) {
  NS.nodes           = [];
  NS.edges           = [];
  NS.selectedNode    = null;
  NS.hoveredNode     = null;
  NS.phaseLockCount  = 0;
  NS.totalPhaseLocks = 0;
  NS.dominantHarmonic= '—';
  NS.energyLevel     = 0;
  NS.envNodeId       = null;
  NS.envEmergeChecked= false;
  _nodeIdCounter     = 0;
  _lastMedium        = 0;
  _lastSlow          = 0;

  buildNetwork(speciesId || NS.currentSpecies?.id || 'lull', canvasW, canvasH);
}
