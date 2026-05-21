/**
 * neural-synthesis/network.js
 *
 * Main-thread network state and learning engine.
 * Responsibilities:
 *   - Own the authoritative node/edge data structures
 *   - Mirror activation state from SharedArrayBuffer (written by worklet)
 *   - Run medium-timescale Hebbian learning (1s cadence)
 *   - Run slow-timescale structural evolution (10s cadence)
 *   - Manage node growth (new node every ~10min, stochastic)
 *   - Manage node pruning (weakly connected nodes may vanish)
 *   - Write updated weights, frequencies, biases, types to SAB
 *   - Expose network state for rendering (canvas, creature, matrix)
 *   - Emit events for harmonic system and creature system to consume
 *
 * Node types (must match audio-worklet.js):
 *   0 — oscillator
 *   1 — filter
 *   2 — nonlinear
 *   3 — delay
 *   4 — predictive
 *   5 — environment
 *
 * Node specialization:
 *   Each node tracks a specialization vector [osc, filt, nl, delay, pred, env]
 *   summing to 1. It drifts toward the type it has most frequently behaved as.
 *   After long sessions a node's dominant specialization becomes its committed type.
 *
 * Edge structure:
 *   { from, to, weight, age, locked, depressionFactor, signal, signalHistory }
 *
 * Events emitted (via NetworkEvents):
 *   'nodeAdded'       { node }
 *   'nodeRemoved'     { nodeId }
 *   'edgeAdded'       { edge }
 *   'edgePruned'      { from, to }
 *   'phaseLock'       { nodeA, nodeB }
 *   'phaseUnlock'     { nodeA, nodeB }
 *   'harmonicEvent'   { nodeId, interval, direction }
 *   'emergence'       { text }
 *   'mutated'         {}
 *   'rewired'         {}
 */

import {
  OFF,
  data        as sabData,
  pan         as sabPan,
  setWeightMatrix,
  setFrequencies,
  setBiases,
  setNodeTypes,
  setNodeCount,
  injectEnergy,
  getActivations,
  getEnergyLevel,
  setNodePan,
  initBuffers,
} from './audio-engine.js';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

export const MAX_NODES   = 12;
export const INIT_NODES  = 4;
export const NODE_TYPES  = Object.freeze({
  OSCILLATOR:  0,
  FILTER:      1,
  NONLINEAR:   2,
  DELAY:       3,
  PREDICTIVE:  4,
  ENVIRONMENT: 5,
});
export const TYPE_NAMES  = ['oscillator','filter','nonlinear','delay','predictive','environment'];
export const TYPE_SYMBOLS= ['○','◈','◆','◫','◎','◉'];

/* Just-intonation harmonic series above A1 = 55 Hz */
const BASE_HZ   = 55;
const HARMONICS = [1,2,3,4,5,6,7,8,9,10,12,15,16,18,20,24,27,32];

/* Growth: new node every 8–12 minutes (stochastic) */
const NODE_GROWTH_MS_MIN = 8  * 60 * 1000;
const NODE_GROWTH_MS_MAX = 12 * 60 * 1000;

/* Pruning: edge removed if |weight| < threshold for this many slow ticks */
const PRUNE_WEIGHT_THRESHOLD = 0.035;
const PRUNE_AGE_THRESHOLD    = 80;

/* Specialization: committed after this dominance ratio */
const SPEC_COMMIT_RATIO = 0.65;

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
  /* Core graph */
  nodes: [],     /* Node objects */
  edges: [],     /* Edge objects */

  /* Parameters (mirrored to SAB by setParams) */
  instability:  0.4,
  recurrence:   0.5,
  saturation:   0.35,
  metabolism:   0.4,
  learningRate: 0.3,
  phaseCoupling:0.35,
  harmonicGravity: 0.45,

  /* Toggles */
  hebbianOn:    true,
  driftOn:      true,
  homeostasisOn:true,
  depressionOn: true,
  pruningOn:    true,
  predictiveOn: true,
  fastOn:       true,
  mediumOn:     true,
  slowOn:       true,
  envOn:        false,

  /* Runtime */
  isRunning:      false,
  selectedNode:   null,
  hoveredNode:    null,
  anchorMode:     false,
  listenNode:     null,   /* node being auditioned in isolation */

  /* Timers */
  startTime:      0,
  elapsedMs:      0,
  mediumTimer:    0,
  slowTimer:      0,
  nextNodeGrowth: 0,   /* timestamp for next node arrival */

  /* Derived display state */
  energyLevel:    0,
  phaseLockCount: 0,
  totalPhaseLocks:0,
  dominantHarmonic: '—',

  /* Species */
  currentSpecies: null,

  /* Biography priors (loaded from Supabase, applied at init) */
  biography: null,
};

/* ═══════════════════════════════════════════════════════════════════
   NODE FACTORY
   ═══════════════════════════════════════════════════════════════════ */

let _nodeIdCounter = 0;

function harmonicFreq(idx) {
  return BASE_HZ * HARMONICS[idx % HARMONICS.length];
}

function freqToHue(hz) {
  const t = Math.max(0, Math.min(1,
    Math.log(hz / 40) / Math.log(1200 / 40)
  ));
  return 150 + t * 200;
}

function makeNode(overrides = {}) {
  const id   = _nodeIdCounter++;
  const type = overrides.type ?? NODE_TYPES.OSCILLATOR;
  const freq = overrides.freq ?? harmonicFreq(id);

  /* Canvas position — will be set by caller or layout engine */
  const x = overrides.x ?? 300;
  const y = overrides.y ?? 200;

  return {
    id,
    type,
    x, y,
    vx: 0, vy: 0,

    /* Audio parameters */
    freq,
    targetFreq: freq,
    bias: (Math.random() - 0.5) * 0.06,

    /* Activation state (mirrored from SAB) */
    output:      0,
    prevOutput:  0,
    smoothEnergy:0,
    energy:      0,
    phase:       Math.random() * Math.PI * 2,
    phaseLocked: false,
    lockPartner: -1,

    /* Homeostasis */
    actThreshold:  0.5,
    recentActivity:0,

    /* Specialization vector [osc, filt, nl, delay, pred, env] */
    specialization: _defaultSpec(type),
    committedType:  type,

    /* Harmonic event accumulator */
    harmonicAccum: 0,
    harmonicThreshold: 0.6 + Math.random() * 0.8,

    /* Visual */
    color: freqToHue(freq),
    _flash: 0,
    history: new Float32Array(48),
    histIdx: 0,

    /* Metadata */
    locked:   false,
    isolated: false,
    age:      0,         /* ticks alive, for pruning */

    ...overrides,
  };
}

function _defaultSpec(type) {
  const s = new Float32Array(6);
  s[type] = 1.0;
  return s;
}

/* ═══════════════════════════════════════════════════════════════════
   EDGE FACTORY
   ═══════════════════════════════════════════════════════════════════ */

function makeEdge(from, to, weight) {
  return {
    from,
    to,
    weight:          weight ?? (Math.random() * 0.7 - 0.05),
    age:             0,
    locked:          false,
    depressionFactor:1.0,
    signal:          0,
    signalHistory:   0,
    hasEmittedSat:   false,
  };
}

/* ── Edge helpers ─────────────────────────────────────────────── */

export function edgeExists(from, to) {
  return NS.edges.some(e => e.from === from && e.to === to);
}

export function addEdge(from, to, weight) {
  if (from === to) return null;
  if (edgeExists(from, to)) return null;
  const e = makeEdge(from, to, weight);
  NS.edges.push(e);
  NetworkEvents.emit('edgeAdded', { edge: e });
  _flushWeightMatrix();
  return e;
}

export function removeEdge(from, to) {
  const before = NS.edges.length;
  NS.edges = NS.edges.filter(e => !(e.from === from && e.to === to));
  if (NS.edges.length < before) _flushWeightMatrix();
}

export function severNode(nodeId) {
  NS.edges = NS.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  _flushWeightMatrix();
  NetworkEvents.emit('emergence', { text: `severed — node ${nodeId} disconnected` });
}

/* ═══════════════════════════════════════════════════════════════════
   TOPOLOGY BUILDERS
   ═══════════════════════════════════════════════════════════════════ */

export const SPECIES = [
  {
    id: 'lull',
    name: 'Lull',
    color: 'var(--lull)',
    tagline: 'moves slowly toward light',
    guide: [
      'sparse connections, low instability',
      'strong unison and fifth attraction',
      'long harmonic event intervals',
      'receptive to environment input',
    ],
    nodeTypeDist: [0.6, 0.2, 0.05, 0.1, 0.05, 0],
    instability:  0.18,
    recurrence:   0.42,
    saturation:   0.18,
    metabolism:   0.22,
    lrate:        0.14,
    coupling:     0.58,
    hgravity:     0.72,
    envSensitivity: 0.8,
    buildTopology(nodes, edges) {
      /* Sparse chain with a single long-range connection */
      const N = nodes.length;
      for (let i = 0; i < N - 1; i++) {
        _tryAdd(edges, nodes[i].id, nodes[i+1].id, 0.45 + Math.random() * 0.25);
      }
      if (N > 3) _tryAdd(edges, nodes[N-1].id, nodes[0].id, 0.3 + Math.random() * 0.15);
    },
  },
  {
    id: 'weft',
    name: 'Weft',
    color: 'var(--weft)',
    tagline: 'things fitting together without knowing why',
    guide: [
      'bilateral symmetry in connections',
      'structured interval vocabulary',
      'rhythmic regularity emerges early',
      'moderate instability',
    ],
    nodeTypeDist: [0.35, 0.2, 0.15, 0.2, 0.1, 0],
    instability:  0.38,
    recurrence:   0.5,
    saturation:   0.32,
    metabolism:   0.45,
    lrate:        0.28,
    coupling:     0.48,
    hgravity:     0.52,
    envSensitivity: 0.3,
    buildTopology(nodes, edges) {
      /* Ring with cross-connections */
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        _tryAdd(edges, nodes[i].id, nodes[(i+1)%N].id, 0.4 + Math.random() * 0.25);
        if (N > 4) {
          _tryAdd(edges, nodes[i].id, nodes[(i + Math.floor(N/2)) % N].id,
            0.15 + Math.random() * 0.2);
        }
      }
    },
  },
  {
    id: 'brine',
    name: 'Brine',
    color: 'var(--brine)',
    tagline: 'the feeling of dread that has no object',
    guide: [
      'dense inhibitory inter-connections',
      'dissonant harmonic vocabulary',
      'predictive nodes dominate',
      'averse to environment input',
    ],
    nodeTypeDist: [0.25, 0.1, 0.2, 0.1, 0.3, 0.05],
    instability:  0.68,
    recurrence:   0.62,
    saturation:   0.6,
    metabolism:   0.55,
    lrate:        0.45,
    coupling:     0.22,
    hgravity:     0.25,
    envSensitivity: -0.4,
    buildTopology(nodes, edges) {
      /* Dense random with inhibitory bias */
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        const nc = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < nc; k++) {
          const j = Math.floor(Math.random() * N);
          const w = Math.random() < 0.45
            ? -(0.2 + Math.random() * 0.4)
            :  (0.15 + Math.random() * 0.35);
          _tryAdd(edges, nodes[i].id, nodes[j].id, w);
        }
      }
    },
  },
  {
    id: 'murk',
    name: 'Murk',
    color: 'var(--murk)',
    tagline: 'the feeling of beautiful disorientation',
    guide: [
      'asymmetric, sparse connections',
      'unresolved harmonic intervals',
      'slow drift, minimal locking',
      'neutral to environment input',
    ],
    nodeTypeDist: [0.3, 0.25, 0.2, 0.15, 0.1, 0],
    instability:  0.32,
    recurrence:   0.44,
    saturation:   0.28,
    metabolism:   0.3,
    lrate:        0.1,
    coupling:     0.2,
    hgravity:     0.35,
    envSensitivity: 0.1,
    buildTopology(nodes, edges) {
      /* Sparse random — deliberately uneven */
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        if (Math.random() < 0.55) {
          const j = Math.floor(Math.random() * N);
          _tryAdd(edges, nodes[i].id, nodes[j].id, 0.1 + Math.random() * 0.4);
        }
      }
    },
  },
  {
    id: 'fray',
    name: 'Fray',
    color: 'var(--fray)',
    tagline: 'unresolved argument that has become affectionate',
    guide: [
      'two oscillator clusters, inhibitory bridges',
      'call-and-response rhythmic character',
      'alternating activity, dynamic interplay',
      'receptive to environment input',
    ],
    nodeTypeDist: [0.45, 0.15, 0.15, 0.1, 0.15, 0],
    instability:  0.44,
    recurrence:   0.52,
    saturation:   0.38,
    metabolism:   0.42,
    lrate:        0.3,
    coupling:     0.58,
    hgravity:     0.48,
    envSensitivity: 0.6,
    buildTopology(nodes, edges) {
      /* Two clusters with inhibitory inter-connections */
      const N    = nodes.length;
      const half = Math.floor(N / 2);
      const A    = nodes.slice(0, half);
      const B    = nodes.slice(half);

      /* Intra-cluster: excitatory */
      [A, B].forEach(cluster => {
        for (let i = 0; i < cluster.length; i++) {
          for (let j = 0; j < cluster.length; j++) {
            if (i !== j && Math.random() < 0.5) {
              _tryAdd(edges, cluster[i].id, cluster[j].id,
                0.3 + Math.random() * 0.3);
            }
          }
        }
      });

      /* Inter-cluster: inhibitory bridges */
      for (let k = 0; k < Math.ceil(N / 3); k++) {
        const a = A[Math.floor(Math.random() * A.length)];
        const b = B[Math.floor(Math.random() * B.length)];
        _tryAdd(edges, a.id, b.id, -(0.15 + Math.random() * 0.25));
      }
    },
  },
  {
    id: 'loam',
    name: 'Loam',
    color: 'var(--loam)',
    tagline: 'grief that has composted into something generative',
    guide: [
      'filter-heavy, deeply textured',
      'very slow learning, patient structure',
      'rich harmonic vocabulary over time',
      'shy — mildly averse to environment',
    ],
    nodeTypeDist: [0.2, 0.35, 0.15, 0.1, 0.1, 0.1],
    instability:  0.22,
    recurrence:   0.55,
    saturation:   0.4,
    metabolism:   0.25,
    lrate:        0.07,
    coupling:     0.42,
    hgravity:     0.65,
    envSensitivity: -0.2,
    buildTopology(nodes, edges) {
      /* Layered: input → processing → output */
      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i !== j && Math.random() < 0.3) {
            _tryAdd(edges, nodes[i].id, nodes[j].id,
              0.2 + Math.random() * 0.35);
          }
        }
      }
      /* A few inhibitory self-regulation edges */
      for (let k = 0; k < Math.ceil(N / 3); k++) {
        const i = Math.floor(Math.random() * N);
        const j = Math.floor(Math.random() * N);
        if (i !== j) {
          _tryAdd(edges, nodes[i].id, nodes[j].id,
            -(0.1 + Math.random() * 0.2));
        }
      }
    },
  },
];

function _tryAdd(edges, from, to, weight) {
  if (from === to) return;
  if (edges.some(e => e.from === from && e.to === to)) return;
  edges.push(makeEdge(from, to, weight));
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

export function buildNetwork(speciesId, canvasW, canvasH) {
  const species = SPECIES.find(s => s.id === speciesId) || SPECIES[0];
  NS.currentSpecies = species;

  _nodeIdCounter = 0;
  NS.nodes = [];
  NS.edges = [];
  NS.phaseLockCount  = 0;
  NS.totalPhaseLocks = 0;

  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const r  = Math.min(canvasW, canvasH) * 0.32;

  /* Build initial INIT_NODES nodes */
  for (let i = 0; i < INIT_NODES; i++) {
    const angle = (i / INIT_NODES) * Math.PI * 2 - Math.PI / 2;
    const type  = _sampleType(species.nodeTypeDist);
    const freq  = harmonicFreq(i);
    NS.nodes.push(makeNode({
      type,
      freq,
      targetFreq: freq,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    }));
  }

  /* Apply biography priors if present */
  if (NS.biography) _applyBiographyPriors(species);

  /* Build topology */
  const edgeList = [];
  species.buildTopology(NS.nodes, edgeList);
  NS.edges = edgeList;

  /* Schedule first node growth */
  NS.nextNodeGrowth = Date.now() + _growthInterval();

  /* Flush to SAB */
  _flushAll();

  NetworkEvents.emit('emergence', { text: `${species.name} awakening — ${INIT_NODES} nodes` });
}

function _growthInterval() {
  return NODE_GROWTH_MS_MIN +
    Math.random() * (NODE_GROWTH_MS_MAX - NODE_GROWTH_MS_MIN);
}

function _sampleType(dist) {
  let r = Math.random();
  for (let i = 0; i < dist.length; i++) {
    r -= dist[i];
    if (r <= 0) return i;
  }
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════
   BIOGRAPHY PRIORS
   ═══════════════════════════════════════════════════════════════════ */

function _applyBiographyPriors(species) {
  const bio = NS.biography;
  if (!bio) return;

  /* Entropy proportional to sleep duration */
  const sleepMs    = Date.now() - (bio.lastSessionAt || Date.now());
  const sleepDays  = sleepMs / (1000 * 60 * 60 * 24);
  /* Full memory at 0 days, ~0 at 14 days */
  const retention  = Math.max(0, 1 - sleepDays / 14);

  /* Apply harmonic vocabulary priors to initial frequencies */
  if (bio.harmonicVocabulary && retention > 0.1) {
    NS.nodes.forEach((n, i) => {
      if (n.type !== NODE_TYPES.OSCILLATOR) return;
      const priorFreq = bio.harmonicVocabulary[i % bio.harmonicVocabulary.length];
      if (priorFreq) {
        n.freq       = n.freq * (1 - retention * 0.6) + priorFreq * retention * 0.6;
        n.targetFreq = n.freq;
        n.color      = freqToHue(n.freq);
      }
    });
  }

  /* Apply specialization priors */
  if (bio.specialization && retention > 0.2) {
    NS.nodes.forEach((n, i) => {
      const priorSpec = bio.specialization[i % bio.specialization.length];
      if (priorSpec) {
        for (let t = 0; t < 6; t++) {
          n.specialization[t] = n.specialization[t] * (1 - retention * 0.5)
                              + (priorSpec[t] || 0)  *  retention * 0.5;
        }
        /* Normalize */
        const sum = n.specialization.reduce((a, b) => a + b, 0);
        if (sum > 0) n.specialization = n.specialization.map(v => v / sum);
      }
    });
  }

  /* Apply weight matrix prior (topology forgets fastest) */
  if (bio.weightMatrix && retention > 0.35) {
    const wt       = bio.weightMatrix;
    const topRet   = retention * 0.45;   /* topology retains less */
    NS.edges.forEach(e => {
      const priorW = wt[e.from * MAX_NODES + e.to];
      if (priorW !== undefined) {
        e.weight = e.weight * (1 - topRet) + priorW * topRet;
      }
    });
  }

  NetworkEvents.emit('emergence', {
    text: retention > 0.7
      ? 'remembering — waking from short sleep'
      : retention > 0.3
      ? 'faint traces — long sleep'
      : 'nearly forgotten — beginning again',
  });
}

/* ═══════════════════════════════════════════════════════════════════
   SAB FLUSH HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _flushWeightMatrix() {
  const N  = NS.nodes.length;
  const W  = new Float32Array(MAX_NODES * MAX_NODES);
  NS.edges.forEach(e => {
    if (e.from < N && e.to < N) {
      W[e.from * MAX_NODES + e.to] = e.weight;
    }
  });
  setWeightMatrix(W, N);
}

function _flushFrequencies() {
  setFrequencies(NS.nodes.map(n => n.freq));
}

function _flushBiases() {
  setBiases(NS.nodes.map(n => n.bias));
}

function _flushTypes() {
  setNodeTypes(NS.nodes.map(n => n.type));
}

function _flushPan(canvasW) {
  NS.nodes.forEach((n, i) => {
    const panVal = canvasW > 0 ? (n.x / canvasW) * 2 - 1 : 0;
    setNodePan(i, Math.max(-1, Math.min(1, panVal)));
  });
}

function _flushAll(canvasW = 800) {
  setNodeCount(NS.nodes.length);
  _flushTypes();
  _flushFrequencies();
  _flushBiases();
  _flushWeightMatrix();
  _flushPan(canvasW);
}

/* ═══════════════════════════════════════════════════════════════════
   PARAMETER SYNC
   ═══════════════════════════════════════════════════════════════════ */

export function setParam(key, value) {
  NS[key] = value;
  /* Mirror scalar params to SAB */
  const sabKeys = {
    instability:  OFF.INST,
    recurrence:   OFF.REC,
    saturation:   OFF.SAT,
    metabolism:   OFF.META,
  };
  if (sabKeys[key] !== undefined && sabData) {
    sabData[sabKeys[key]] = value;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN TICK — called from main.js RAF loop
   ═══════════════════════════════════════════════════════════════════ */

const MEDIUM_INTERVAL_MS = 1000;   /* Hebbian update cadence */
const SLOW_INTERVAL_MS   = 10000;  /* Structural update cadence */

let _lastMedium = 0;
let _lastSlow   = 0;

export function tick(nowMs, canvasW) {
  if (!NS.isRunning) return;

  NS.elapsedMs = nowMs - NS.startTime;

  /* ── Mirror activations from SAB ─────────────────────────────── */
  const N        = NS.nodes.length;
  const acts     = getActivations(N);
  NS.energyLevel = getEnergyLevel();

  NS.nodes.forEach((n, i) => {
    n.prevOutput  = n.output;
    n.output      = acts[i];
    n.energy      = Math.abs(acts[i]);
    n.smoothEnergy = n.smoothEnergy * 0.88 + n.energy * 0.12;
    n.recentActivity = n.recentActivity * 0.995 + n.energy * 0.005;
    n.age++;

    /* Waveform history for canvas render */
    n.history[n.histIdx] = n.output;
    n.histIdx = (n.histIdx + 1) % n.history.length;

    /* Flash decay */
    if (n._flash > 0) n._flash = Math.max(0, n._flash - 0.04);
  });

  /* Update edge signal history */
  NS.edges.forEach(e => {
    const fromOut = NS.nodes[e.from]?.output ?? 0;
    const sig     = Math.abs(fromOut * e.weight);
    e.signal        = sig;
    e.signalHistory = e.signalHistory * 0.92 + sig * 0.08;
  });

  /* ── Medium timescale ─────────────────────────────────────────── */
  if (NS.mediumOn && nowMs - _lastMedium >= MEDIUM_INTERVAL_MS) {
    _lastMedium = nowMs;
    _mediumTick(canvasW);
  }

  /* ── Slow timescale ───────────────────────────────────────────── */
  if (NS.slowOn && nowMs - _lastSlow >= SLOW_INTERVAL_MS) {
    _lastSlow = nowMs;
    _slowTick(canvasW);
  }

  /* ── Node growth ─────────────────────────────────────────────── */
  if (nowMs >= NS.nextNodeGrowth && NS.nodes.length < MAX_NODES) {
    _growNode(canvasW);
    NS.nextNodeGrowth = nowMs + _growthInterval();
  }

  /* ── Flush pan if anchor mode off ────────────────────────────── */
  _flushPan(canvasW);
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIUM LAYER — Hebbian + phase coupling + homeostasis
   ═══════════════════════════════════════════════════════════════════ */

/* Just interval ratios for harmonic consonance */
const JUST_RATIOS = [1, 9/8, 6/5, 5/4, 4/3, 3/2, 8/5, 5/3, 7/4, 2, 3, 4];

function _mediumTick(canvasW) {
  const lrScale = 0.15 + NS.learningRate * 2.2;

  /* ── Hebbian learning ───────────────────────────────────────── */
  if (NS.hebbianOn) {
    NS.edges.forEach(e => {
      if (e.locked) return;
      const a = NS.nodes[e.from]?.output ?? 0;
      const b = NS.nodes[e.to]?.output   ?? 0;
      const hebb = a * b * lrScale * 0.0012;
      e.weight  += hebb;
      e.weight  *= (1 - 0.0006);   /* weight decay */
      e.weight   = Math.max(-1.6, Math.min(1.6, e.weight));
      e.age++;

      /* Saturation emergence event */
      if (Math.abs(e.weight) > 1.1 && !e.hasEmittedSat) {
        e.hasEmittedSat = true;
        NetworkEvents.emit('emergence', {
          text: `hebbian saturation — edge ${e.from}→${e.to} dominant`,
        });
      }
    });
    _flushWeightMatrix();
  }

  /* ── Frequency drift + harmonic attraction ──────────────────── */
  if (NS.driftOn) {
    NS.nodes.forEach(n => {
      if (n.type !== NODE_TYPES.OSCILLATOR) return;

      /* Small stochastic drift */
      n.freq += (Math.random() - 0.5) * 0.08 * NS.instability;

      /* Attract toward nearest harmonic partial */
      const nearestH = HARMONICS.reduce((best, h) => {
        const f = BASE_HZ * h;
        return Math.abs(f - n.freq) < Math.abs(best - n.freq) ? f : best;
      }, BASE_HZ);
      n.freq += (nearestH - n.freq) * NS.harmonicGravity * 0.004;

      /* Attract toward consonance with strongly-connected neighbors */
      NS.edges
        .filter(e => e.from === n.id && e.weight > 0.28)
        .forEach(e => {
          const nb = NS.nodes[e.to];
          if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
          const ratio     = nb.freq / n.freq;
          const nearest   = JUST_RATIOS.reduce((best, r) =>
            Math.abs(r - ratio) < Math.abs(best - ratio) ? r : best, JUST_RATIOS[0]);
          const target    = n.freq * nearest;
          nb.freq        += (target - nb.freq) * 0.0018 * e.weight;
        });

      n.freq = Math.max(35, Math.min(1400, n.freq));
      n.color = freqToHue(n.freq);
    });
    _flushFrequencies();
  }

  /* ── Phase coupling (Kuramoto) — oscillator nodes only ──────── */
  NS.nodes.forEach(n => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    let   phaseSum = 0;
    let   count    = 0;

    NS.edges
      .filter(e => e.from === n.id && e.weight > 0.12)
      .forEach(e => {
        const nb = NS.nodes[e.to];
        if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
        phaseSum += e.weight * Math.sin(nb.phase - n.phase);
        count++;
      });

    if (count > 0) {
      n.phase += NS.phaseCoupling * 0.04 * phaseSum / count;
    }

    /* Advance phase */
    n.phase += (n.freq / 44100) * 2 * Math.PI * MEDIUM_INTERVAL_MS * 0.001 * 44100;
    n.phase  = n.phase % (Math.PI * 2);
  });

  /* ── Phase lock detection ───────────────────────────────────── */
  let newLocks = 0;
  NS.nodes.forEach(n => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    const wasLocked  = n.phaseLocked;
    n.phaseLocked    = false;
    n.lockPartner    = -1;

    NS.edges
      .filter(e => e.from === n.id && e.weight > 0.22)
      .forEach(e => {
        const nb = NS.nodes[e.to];
        if (!nb || nb.type !== NODE_TYPES.OSCILLATOR) return;
        if (Math.abs(n.freq - nb.freq) > 4.0) return;
        const diff = Math.abs(
          ((n.phase - nb.phase) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
        );
        if (diff < 0.28 || diff > Math.PI * 2 - 0.28) {
          n.phaseLocked = true;
          n.lockPartner = nb.id;
        }
      });

    if (n.phaseLocked && !wasLocked) {
      newLocks++;
      NS.totalPhaseLocks++;
      NetworkEvents.emit('phaseLock', { nodeA: n.id, nodeB: n.lockPartner });
    } else if (!n.phaseLocked && wasLocked) {
      NetworkEvents.emit('phaseUnlock', { nodeA: n.id, nodeB: n.lockPartner });
    }
  });

  NS.phaseLockCount = NS.nodes.filter(n => n.phaseLocked).length;

  if (newLocks > 0) {
    NetworkEvents.emit('emergence', {
      text: `phase lock — ${newLocks} oscillator${newLocks > 1 ? 's' : ''} synchronizing`,
    });
  }

  /* ── Homeostasis ────────────────────────────────────────────── */
  if (NS.homeostasisOn) {
    NS.nodes.forEach(n => {
      const err       = n.recentActivity - 0.28;
      n.actThreshold += err * 0.006;
      n.actThreshold  = Math.max(0.08, Math.min(2.2, n.actThreshold));
      n.bias         -= err * 0.0008;
      n.bias          = Math.max(-0.3, Math.min(0.3, n.bias));
    });
    _flushBiases();
  }

  /* ── Specialization drift ───────────────────────────────────── */
  NS.nodes.forEach(n => {
    /* Nudge specialization toward current committed type */
    n.specialization[n.type] += 0.005;
    const sum = n.specialization.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let t = 0; t < 6; t++) n.specialization[t] /= sum;
    }

    /* Check for committed type change */
    let maxSpec = 0, maxType = n.committedType;
    for (let t = 0; t < 6; t++) {
      if (n.specialization[t] > maxSpec) {
        maxSpec = n.specialization[t];
        maxType = t;
      }
    }
    if (maxSpec > SPEC_COMMIT_RATIO && maxType !== n.committedType) {
      n.committedType = maxType;
      NetworkEvents.emit('emergence', {
        text: `node ${n.id} committed — ${TYPE_NAMES[maxType]}`,
      });
    }
  });

  /* ── Harmonic accumulator update (for harmonic.js) ─────────── */
  NS.nodes.forEach(n => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    const incomingSum = NS.edges
      .filter(e => e.to === n.id)
      .reduce((s, e) => s + Math.abs(e.signal), 0);
    n.harmonicAccum += incomingSum * 0.08;

    /* Decay accumulator */
    n.harmonicAccum *= 0.96;
  });

  /* ── Dominant harmonic detection for status bar ─────────────── */
  const activeOscs = NS.nodes.filter(n =>
    n.type === NODE_TYPES.OSCILLATOR && n.smoothEnergy > 0.05
  );
  if (activeOscs.length > 0) {
    const minFreq = Math.min(...activeOscs.map(n => n.freq));
    const nearest = HARMONICS.reduce((best, h) => {
      const f = BASE_HZ * h;
      return Math.abs(f - minFreq) < Math.abs(best - minFreq) ? f : best;
    }, BASE_HZ);
    NS.dominantHarmonic = nearest.toFixed(1) + ' Hz';
  }

  /* ── Environment node sensitivity ──────────────────────────── */
  if (NS.envOn && NS.currentSpecies) {
    const sensitivity = NS.currentSpecies.envSensitivity ?? 0.3;
    const spec = window._micSpectrum || { low: 0, mid: 0, high: 0 };
    NS.nodes.forEach(n => {
      if (n.type === NODE_TYPES.ENVIRONMENT) {
        /* Inject energy proportional to spectral match and sensitivity */
        const envEnergy = (spec.low + spec.mid + spec.high) / 3 * sensitivity;
        if (envEnergy > 0.01) injectEnergy(n.id, envEnergy * 0.4);
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SLOW LAYER — pruning, synaptogenesis, node growth
   ═══════════════════════════════════════════════════════════════════ */

function _slowTick(canvasW) {
  const N = NS.nodes.length;

  /* ── Edge pruning ───────────────────────────────────────────── */
  if (NS.pruningOn) {
    const before = NS.edges.length;
    NS.edges = NS.edges.filter(e => {
      if (e.locked) return true;
      return !(Math.abs(e.weight) < PRUNE_WEIGHT_THRESHOLD && e.age > PRUNE_AGE_THRESHOLD);
    });
    const pruned = before - NS.edges.length;
    if (pruned > 0) {
      _flushWeightMatrix();
      NetworkEvents.emit('emergence', {
        text: `pruned ${pruned} dormant connection${pruned > 1 ? 's' : ''}`,
      });
    }
  }

  /* ── Synaptogenesis — form new edges between co-active nodes ── */
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const ni = NS.nodes[i], nj = NS.nodes[j];
      if (!ni || !nj) continue;
      if (ni.recentActivity > 0.25 && nj.recentActivity > 0.25) {
        if (!edgeExists(i, j) && Math.random() < 0.018) {
          addEdge(i, j, 0.06 + Math.random() * 0.1);
          NetworkEvents.emit('emergence', {
            text: `new synapse — node ${i} → ${j}`,
          });
        }
      }
    }
  }

  /* ── Node pruning — vanish weakly-connected, long-dormant nodes */
  if (NS.pruningOn && N > INIT_NODES) {
    NS.nodes.forEach(n => {
      if (n.id === 0) return;   /* root node never pruned */
      const totalW = NS.edges
        .filter(e => e.from === n.id || e.to === n.id)
        .reduce((s, e) => s + Math.abs(e.weight), 0);
      const isolated = totalW < 0.08 && n.recentActivity < 0.03;
      if (isolated && n.age > 500 && Math.random() < 0.12) {
        _removeNode(n.id);
        NetworkEvents.emit('emergence', {
          text: `node ${n.id} faded — disconnected`,
        });
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   NODE GROWTH
   ═══════════════════════════════════════════════════════════════════ */

function _growNode(canvasW) {
  const species  = NS.currentSpecies || SPECIES[0];
  const N        = NS.nodes.length;
  if (N >= MAX_NODES) return;

  /* Find the most active neighborhood to differentiate into */
  const mostActive = NS.nodes.reduce((best, n) =>
    n.smoothEnergy > best.smoothEnergy ? n : best, NS.nodes[0]);

  /* Type differentiation: bias toward what's needed near that node */
  const neighborTypes = NS.edges
    .filter(e => e.from === mostActive.id || e.to === mostActive.id)
    .map(e => {
      const other = NS.nodes[e.from === mostActive.id ? e.to : e.from];
      return other?.type;
    })
    .filter(t => t !== undefined);

  /* Count neighbor types and pick underrepresented */
  const typeCounts = new Array(6).fill(0);
  neighborTypes.forEach(t => typeCounts[t]++);
  const specDist = species.nodeTypeDist.map((prob, t) => {
    const deficit = Math.max(0, prob - (typeCounts[t] / Math.max(1, neighborTypes.length)));
    return deficit + 0.05;
  });
  const newType = _sampleType(specDist);

  /* Position near most active node with jitter */
  const angle   = Math.random() * Math.PI * 2;
  const dist    = 60 + Math.random() * 80;
  const newFreq = harmonicFreq(N);

  const newNode = makeNode({
    type:      newType,
    freq:      newFreq,
    targetFreq:newFreq,
    x: Math.max(30, Math.min(canvasW - 30, mostActive.x + Math.cos(angle) * dist)),
    y: Math.max(30, Math.min(400,          mostActive.y + Math.sin(angle) * dist)),
  });

  NS.nodes.push(newNode);

  /* Connect to 1–2 neighbors */
  addEdge(mostActive.id, newNode.id, 0.15 + Math.random() * 0.2);
  if (NS.nodes.length > 2 && Math.random() < 0.6) {
    const randNode = NS.nodes[Math.floor(Math.random() * (NS.nodes.length - 1))];
    addEdge(newNode.id, randNode.id, 0.1 + Math.random() * 0.15);
  }

  setNodeCount(NS.nodes.length);
  _flushTypes();
  _flushFrequencies();
  _flushBiases();
  _flushWeightMatrix();

  NetworkEvents.emit('nodeAdded', { node: newNode });
  NetworkEvents.emit('emergence', {
    text: `new node — ${TYPE_NAMES[newType]} differentiating`,
  });
}

function _removeNode(nodeId) {
  NS.nodes   = NS.nodes.filter(n => n.id !== nodeId);
  NS.edges   = NS.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  if (NS.selectedNode === nodeId) NS.selectedNode = null;

  setNodeCount(NS.nodes.length);
  _flushAll();

  NetworkEvents.emit('nodeRemoved', { nodeId });
}

/* ═══════════════════════════════════════════════════════════════════
   MUTATIONS
   ═══════════════════════════════════════════════════════════════════ */

export function mutate() {
  NS.edges.forEach(e => {
    if (e.locked) return;
    e.weight += (Math.random() - 0.5) * 0.42 * NS.instability;
    e.weight  = Math.max(-1.6, Math.min(1.6, e.weight));
    e.hasEmittedSat = false;
  });
  NS.nodes.forEach(n => {
    if (n.type === NODE_TYPES.OSCILLATOR) {
      const h  = HARMONICS[Math.floor(Math.random() * HARMONICS.length)];
      n.freq   = BASE_HZ * h;
      n.color  = freqToHue(n.freq);
    }
  });
  _flushFrequencies();
  _flushWeightMatrix();
  NetworkEvents.emit('mutated', {});
  NetworkEvents.emit('emergence', { text: 'mutation — weights and frequencies randomized' });
}

export function rewire() {
  /* Remove a few non-locked edges */
  const removable = NS.edges.filter(e => !e.locked);
  const toRemove  = Math.min(3, Math.floor(removable.length * 0.14));
  for (let k = 0; k < toRemove; k++) {
    const idx = Math.floor(Math.random() * NS.edges.length);
    if (!NS.edges[idx]?.locked) NS.edges.splice(idx, 1);
  }
  /* Add new random edges */
  const N   = NS.nodes.length;
  const add = 1 + Math.floor(Math.random() * 3);
  for (let k = 0; k < add; k++) {
    const a = Math.floor(Math.random() * N);
    const b = Math.floor(Math.random() * N);
    addEdge(NS.nodes[a]?.id, NS.nodes[b]?.id, Math.random() * 0.6 - 0.05);
  }
  _flushWeightMatrix();
  NetworkEvents.emit('rewired', {});
  NetworkEvents.emit('emergence', {
    text: `rewired — ${NS.edges.length} connections`,
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ENERGY INJECTION
   ═══════════════════════════════════════════════════════════════════ */

export function injectNode(nodeId, amount = 0.75) {
  const n = NS.nodes.find(n => n.id === nodeId);
  if (!n) return;
  n._flash = 1.0;
  injectEnergy(nodeId, amount + Math.random() * 0.25);
}

/* ═══════════════════════════════════════════════════════════════════
   FORCE LAYOUT
   ═══════════════════════════════════════════════════════════════════ */

export function applyForces(canvasW, canvasH, dragNode) {
  if (NS.anchorMode) return;

  const repulse = 2400;
  const attract = 0.045;

  NS.nodes.forEach((n, i) => {
    if (n === dragNode) return;
    n.vx *= 0.80;
    n.vy *= 0.80;

    /* Node-node repulsion */
    NS.nodes.forEach((m, j) => {
      if (i === j) return;
      const dx = n.x - m.x, dy = n.y - m.y;
      const d2 = dx * dx + dy * dy + 1;
      n.vx += (dx / d2) * repulse;
      n.vy += (dy / d2) * repulse;
    });

    /* Center gravity */
    n.vx += (canvasW / 2 - n.x) * 0.005;
    n.vy += (canvasH / 2 - n.y) * 0.005;
  });

  /* Edge spring attraction */
  NS.edges.forEach(e => {
    const a = NS.nodes.find(n => n.id === e.from);
    const b = NS.nodes.find(n => n.id === e.to);
    if (!a || !b || a === dragNode || b === dragNode) return;
    const dx     = b.x - a.x, dy = b.y - a.y;
    const d      = Math.sqrt(dx * dx + dy * dy) || 1;
    const target = 100 + Math.abs(e.weight) * 25;
    const f      = (d - target) * attract;
    const fx     = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  });

  /* Integrate */
  NS.nodes.forEach(n => {
    if (n === dragNode) return;
    n.x += Math.max(-12, Math.min(12, n.vx));
    n.y += Math.max(-12, Math.min(12, n.vy));
    n.x  = Math.max(28, Math.min(canvasW - 28, n.x));
    n.y  = Math.max(28, Math.min(canvasH - 28, n.y));
  });
}

/* ═══════════════════════════════════════════════════════════════════
   GETTERS FOR EXTERNAL USE
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
    if (e.from < N && e.to < N) W[e.from * N + e.to] = e.weight;
  });
  return { W, N };
}

export function getSpecializationLabel(node) {
  const max = node.specialization.reduce((m, v, i) =>
    v > m.v ? { v, i } : m, { v: 0, i: node.type });
  return `${TYPE_NAMES[max.i]} ${Math.round(max.v * 100)}%`;
}

/* ═══════════════════════════════════════════════════════════════════
   RESET
   ═══════════════════════════════════════════════════════════════════ */

export function reset(speciesId, canvasW, canvasH) {
  NS.nodes = [];
  NS.edges = [];
  NS.selectedNode    = null;
  NS.hoveredNode     = null;
  NS.phaseLockCount  = 0;
  NS.totalPhaseLocks = 0;
  NS.dominantHarmonic= '—';
  NS.energyLevel     = 0;
  _nodeIdCounter     = 0;
  _lastMedium        = 0;
  _lastSlow          = 0;

  initBuffers();
  buildNetwork(speciesId || NS.currentSpecies?.id || 'lull', canvasW, canvasH);
}

/* ═══════════════════════════════════════════════════════════════════
   BIOGRAPHY SNAPSHOT — called by persistence.js before saving
   ═══════════════════════════════════════════════════════════════════ */

export function getBiographySnapshot() {
  const N = NS.nodes.length;
  return {
    nodeCount: N,
    harmonicVocabulary: NS.nodes.map(n => n.freq),
    specialization:     NS.nodes.map(n => Array.from(n.specialization)),
    weightMatrix:       Array.from(getWeightMatrix().W),
    dominantHarmonic:   NS.dominantHarmonic,
    totalPhaseLocks:    NS.totalPhaseLocks,
    speciesId:          NS.currentSpecies?.id ?? 'lull',
    lastSessionAt:      Date.now(),
  };
}

export function applyBiography(bio) {
  NS.biography = bio;
}
