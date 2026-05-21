/**
 * neural-synthesis/harmonic.js
 *
 * Harmonic event system — sits above the continuous signal layer.
 * Responsibilities:
 *   - Watch oscillator node harmonicAccum values from network.js
 *   - Trigger motivated harmonic interval moves when threshold crossed
 *   - Manage bass voice: lowest-frequency oscillator anchors the field
 *   - Reorient full harmonic field when bass voice moves
 *   - Maintain continuous glissando — all frequency changes are smooth,
 *     minimum drift rate prevents stasis
 *   - Track endogenous metabolic rhythm from network energy patterns
 *   - Maintain harmonic vocabulary (which intervals have resolved tension)
 *   - Export state for persistence.js biography snapshot
 *
 * Harmonic event selection:
 *   Each triggered event draws from a probability-weighted set of
 *   just-intoned intervals. Weights evolve: intervals that were followed
 *   by increased phase locking or energy resolution are reinforced.
 *   Intervals that increased instability are down-weighted.
 *   This produces a harmonic vocabulary that is specific to each session
 *   and persists (slowly forgetting) across sessions via biography.
 *
 * Glissando model:
 *   Every oscillator has a currentFreq (what the audio engine plays)
 *   and a targetFreq (where it is headed).
 *   Each tick, currentFreq moves toward targetFreq at a rate determined
 *   by glide speed. A minimum drift rate ensures no oscillator is
 *   ever completely static — small random perturbations keep frequencies
 *   alive even between events.
 *
 * Endogenous rhythm:
 *   The harmonic system tracks the inter-onset intervals of energy peaks
 *   in the network (via energyLevel from audio-engine.js) to detect the
 *   network's intrinsic metabolic period. Delay node targets and
 *   harmonic event pacing are influenced by this endogenous period
 *   rather than any external clock.
 */

import { NS, NODE_TYPES, NetworkEvents, setParam } from './network.js';
import { setFrequencies, getEnergyLevel }           from './audio-engine.js';

/* ═══════════════════════════════════════════════════════════════════
   JUST INTONATION INTERVAL TABLE
   ═══════════════════════════════════════════════════════════════════ */

/*
 * Each interval entry:
 *   ratio    — frequency multiplier (just-intoned)
 *   name     — descriptive label for emergence log
 *   tension  — perceptual tension 0..1 (0 = consonant, 1 = dissonant)
 *   weight   — current probability weight (evolved via reinforcement)
 *   baseWeight — initial weight, used for decay toward baseline
 */
const INTERVALS = [
  { ratio: 1,       name: 'unison',       tension: 0.00, weight: 0.5,  baseWeight: 0.5  },
  { ratio: 9/8,     name: 'major second', tension: 0.40, weight: 0.25, baseWeight: 0.25 },
  { ratio: 6/5,     name: 'minor third',  tension: 0.25, weight: 0.55, baseWeight: 0.55 },
  { ratio: 5/4,     name: 'major third',  tension: 0.20, weight: 0.60, baseWeight: 0.60 },
  { ratio: 4/3,     name: 'fourth',       tension: 0.12, weight: 0.65, baseWeight: 0.65 },
  { ratio: 7/5,     name: 'tritone',      tension: 0.85, weight: 0.15, baseWeight: 0.15 },
  { ratio: 3/2,     name: 'fifth',        tension: 0.08, weight: 0.70, baseWeight: 0.70 },
  { ratio: 8/5,     name: 'minor sixth',  tension: 0.28, weight: 0.45, baseWeight: 0.45 },
  { ratio: 5/3,     name: 'major sixth',  tension: 0.22, weight: 0.50, baseWeight: 0.50 },
  { ratio: 7/4,     name: 'harmonic seventh', tension: 0.35, weight: 0.30, baseWeight: 0.30 },
  { ratio: 2,       name: 'octave',       tension: 0.05, weight: 0.60, baseWeight: 0.60 },
  { ratio: 2/1*5/4, name: 'tenth',        tension: 0.22, weight: 0.35, baseWeight: 0.35 },
];

/* Downward inversions — each interval can move up or down */
const DIRECTIONS = ['up', 'down'];

/* Base frequency for the harmonic series */
const BASE_HZ      = 55;
const FREQ_MIN     = 35;
const FREQ_MAX     = 1400;

/* ═══════════════════════════════════════════════════════════════════
   HARMONIC STATE
   ═══════════════════════════════════════════════════════════════════ */

const HS = {
  /* Glissando state — parallel to NS.nodes */
  glide: [],         /* [{ currentFreq, targetFreq, glideRate, driftVel }] */

  /* Harmonic vocabulary weights (evolved per session) */
  intervals: INTERVALS.map(iv => ({ ...iv })),

  /* Bass voice tracking */
  bassNodeId:     -1,
  bassFreq:       BASE_HZ,
  lastBassEvent:  0,

  /* Field root — all consonance targets are relative to this */
  fieldRoot:      BASE_HZ,

  /* Endogenous rhythm detection */
  energyHistory:  new Float32Array(256),
  energyPtr:      0,
  onsetTimes:     [],
  metabolicPeriod: 2000,   /* ms — default 2s, evolves from network */
  lastOnset:      0,

  /* Reinforcement tracking */
  lastEventTime:   0,
  lastEventNodeId: -1,
  lastLockCount:   0,
  lastEnergyLevel: 0,

  /* Minimum drift — keeps frequencies alive between events */
  DRIFT_RATE:    0.008,    /* Hz per ms */
  DRIFT_JITTER:  0.004,

  /* Glide speed multipliers */
  GLIDE_SLOW:    0.0008,   /* per ms — gradual field reorientation */
  GLIDE_EVENT:   0.0022,   /* per ms — triggered harmonic move */
  GLIDE_FAST:    0.004,    /* per ms — immediate injection response */

  /* Minimum silence before another bass event (ms) */
  BASS_EVENT_COOLDOWN: 8000,

  /* Event cooldown per node (ms) */
  NODE_EVENT_COOLDOWN: 3500,
  nodeLastEvent: {},       /* nodeId → timestamp */
};

/* ═══════════════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

export function initHarmonic() {
  HS.glide          = [];
  HS.bassNodeId     = -1;
  HS.bassFreq       = BASE_HZ;
  HS.fieldRoot      = BASE_HZ;
  HS.metabolicPeriod= 2000;
  HS.lastOnset      = 0;
  HS.onsetTimes     = [];
  HS.nodeLastEvent  = {};
  HS.lastEventTime  = 0;
  HS.energyHistory.fill(0);
  HS.energyPtr      = 0;

  /* Reset interval weights toward baseline with small perturbation */
  HS.intervals = INTERVALS.map(iv => ({
    ...iv,
    weight: iv.baseWeight * (0.8 + Math.random() * 0.4),
  }));

  _syncGlideArray();
}

/**
 * Apply biography vocabulary to interval weights.
 * Called by persistence.js after loading session data.
 */
export function applyHarmonicVocabulary(vocabWeights, retention) {
  if (!vocabWeights || retention <= 0) return;
  HS.intervals.forEach((iv, i) => {
    const prior = vocabWeights[i];
    if (prior === undefined) return;
    iv.weight = iv.weight * (1 - retention * 0.7) + prior * retention * 0.7;
  });
}

/**
 * Sync the glide array length to current node count.
 * Called whenever nodes are added or removed.
 */
export function syncNodes() {
  _syncGlideArray();
  _detectBassNode();
}

function _syncGlideArray() {
  const N = NS.nodes.length;
  while (HS.glide.length < N) {
    const n = NS.nodes[HS.glide.length];
    HS.glide.push({
      currentFreq: n ? n.freq : BASE_HZ,
      targetFreq:  n ? n.freq : BASE_HZ,
      glideRate:   HS.GLIDE_SLOW,
      driftVel:    (Math.random() - 0.5) * HS.DRIFT_JITTER,
    });
  }
  /* Trim if nodes removed */
  if (HS.glide.length > N) HS.glide.length = N;
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN TICK — called from main.js RAF loop
   ═══════════════════════════════════════════════════════════════════ */

let _lastTickMs = 0;

export function harmonicTick(nowMs) {
  if (!NS.isRunning) return;

  const dtMs = Math.min(50, nowMs - (_lastTickMs || nowMs));
  _lastTickMs = nowMs;

  const N = NS.nodes.length;
  if (N === 0) return;

  _syncGlideArray();

  /* ── Endogenous rhythm detection ─────────────────────────────── */
  _updateMetabolicPeriod(nowMs);

  /* ── Check harmonic event triggers ──────────────────────────── */
  _checkHarmonicEvents(nowMs);

  /* ── Evaluate reinforcement from last event ──────────────────── */
  _evaluateReinforcement(nowMs);

  /* ── Advance glissando + drift ──────────────────────────────── */
  _advanceGlide(dtMs, N);

  /* ── Write updated frequencies to audio engine ───────────────── */
  _flushFrequencies(N);

  /* ── Decay interval weights toward baseline ──────────────────── */
  _decayVocabulary();
}

/* ═══════════════════════════════════════════════════════════════════
   ENDOGENOUS RHYTHM DETECTION
   ═══════════════════════════════════════════════════════════════════ */

function _updateMetabolicPeriod(nowMs) {
  const energy = getEnergyLevel();

  /* Store energy history */
  HS.energyHistory[HS.energyPtr] = energy;
  HS.energyPtr = (HS.energyPtr + 1) % HS.energyHistory.length;

  /* Onset detection: energy crosses threshold from below */
  const threshold = 0.35;
  const prevEnergy = HS.lastEnergyLevel;
  HS.lastEnergyLevel = energy;

  if (energy > threshold && prevEnergy <= threshold) {
    const interval = nowMs - HS.lastOnset;
    if (interval > 150 && interval < 8000) {
      HS.onsetTimes.push(interval);
      if (HS.onsetTimes.length > 16) HS.onsetTimes.shift();

      /* Median interval as metabolic period */
      const sorted = HS.onsetTimes.slice().sort((a, b) => a - b);
      HS.metabolicPeriod = sorted[Math.floor(sorted.length / 2)];
    }
    HS.lastOnset = nowMs;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HARMONIC EVENT TRIGGERS
   ═══════════════════════════════════════════════════════════════════ */

function _checkHarmonicEvents(nowMs) {
  NS.nodes.forEach((n, i) => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    if (n.isolated) return;
    if (n.smoothEnergy < 0.04) return;

    /* Per-node cooldown */
    const lastEv = HS.nodeLastEvent[n.id] || 0;
    if (nowMs - lastEv < HS.NODE_EVENT_COOLDOWN) return;

    /* Threshold crossing */
    if (n.harmonicAccum >= n.harmonicThreshold) {
      _triggerHarmonicEvent(n, i, nowMs);
      n.harmonicAccum = 0;
      /* Randomize next threshold so events don't synchronize */
      n.harmonicThreshold = 0.5 + Math.random() * 0.9;
      HS.nodeLastEvent[n.id] = nowMs;
    }
  });
}

function _triggerHarmonicEvent(node, nodeIdx, nowMs) {
  const isBass = (node.id === HS.bassNodeId);

  /* Select interval from weighted distribution */
  const interval = _sampleInterval();
  const direction = _selectDirection(node, interval);
  const ratio = direction === 'up' ? interval.ratio : (1 / interval.ratio);

  /* Compute new target frequency */
  let newTarget;
  if (isBass) {
    /* Bass moves relative to its own current freq */
    newTarget = _clampFreq(HS.glide[nodeIdx].currentFreq * ratio);
  } else {
    /* Non-bass moves relative to field root to maintain consonance */
    const consonantTarget = _nearestConsonant(
      HS.glide[nodeIdx].currentFreq,
      HS.fieldRoot,
      interval
    );
    newTarget = _clampFreq(consonantTarget);
  }

  /* Apply glide toward new target */
  HS.glide[nodeIdx].targetFreq = newTarget;
  HS.glide[nodeIdx].glideRate  = HS.GLIDE_EVENT;

  /* Record for reinforcement */
  HS.lastEventTime    = nowMs;
  HS.lastEventNodeId  = node.id;
  HS.lastLockCount    = NS.phaseLockCount;

  NetworkEvents.emit('harmonicEvent', {
    nodeId:    node.id,
    interval:  interval.name,
    direction,
    isBass,
  });

  NetworkEvents.emit('emergence', {
    text: isBass
      ? `bass — ${interval.name} ${direction} — field reorienting`
      : `${interval.name} ${direction} — node ${node.id}`,
  });

  /* Bass voice reorientation */
  if (isBass) {
    _reorientField(newTarget, nodeIdx, nowMs);
  }
}

/* ── Interval selection — weighted probability ─────────────────── */
function _sampleInterval() {
  const totalWeight = HS.intervals.reduce((s, iv) => s + Math.max(0, iv.weight), 0);
  let r = Math.random() * totalWeight;
  for (const iv of HS.intervals) {
    r -= Math.max(0, iv.weight);
    if (r <= 0) return iv;
  }
  return HS.intervals[HS.intervals.length - 1];
}

/* ── Direction selection ─────────────────────────────────────────
   Prefer upward movement when below field root,
   downward when above. Adds a slight downward bias
   for non-bass nodes to encourage harmonic grounding. */
function _selectDirection(node, interval) {
  const glideState = HS.glide[NS.nodes.indexOf(node)];
  if (!glideState) return 'up';

  const currentFreq = glideState.currentFreq;
  const distUp   = Math.abs(_clampFreq(currentFreq * interval.ratio) - currentFreq);
  const distDown = Math.abs(_clampFreq(currentFreq / interval.ratio) - currentFreq);

  /* Bias toward whichever keeps freq closer to field root */
  const targetUp   = currentFreq * interval.ratio;
  const targetDown = currentFreq / interval.ratio;
  const distRootUp   = Math.abs(targetUp   - HS.fieldRoot);
  const distRootDown = Math.abs(targetDown - HS.fieldRoot);

  /* Weighted random: 60% field-root proximity, 40% pure random */
  if (Math.random() < 0.60) {
    return distRootUp < distRootDown ? 'up' : 'down';
  }
  return Math.random() < 0.5 ? 'up' : 'down';
}

/* ── Nearest consonant target relative to field root ────────────── */
function _nearestConsonant(currentFreq, fieldRoot, interval) {
  /* Find the octave-equivalent consonant target nearest to currentFreq */
  const ratio = interval.ratio;
  const candidates = [];
  for (let octave = -2; octave <= 2; octave++) {
    const base = fieldRoot * Math.pow(2, octave);
    candidates.push(base * ratio);
    candidates.push(base / ratio);
    candidates.push(base);
  }
  return candidates.reduce((nearest, candidate) => {
    const fc = _clampFreq(candidate);
    const fn = _clampFreq(nearest);
    return Math.abs(fc - currentFreq) < Math.abs(fn - currentFreq) ? fc : fn;
  }, candidates[0]);
}

/* ═══════════════════════════════════════════════════════════════════
   BASS VOICE AND FIELD REORIENTATION
   ═══════════════════════════════════════════════════════════════════ */

function _detectBassNode() {
  /* Bass = lowest-frequency active oscillator */
  let minFreq = Infinity;
  let bassId  = -1;

  NS.nodes.forEach(n => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    if (n.smoothEnergy < 0.03) return;
    const g = HS.glide[NS.nodes.indexOf(n)];
    if (!g) return;
    if (g.currentFreq < minFreq) {
      minFreq = g.currentFreq;
      bassId  = n.id;
    }
  });

  const changed = bassId !== HS.bassNodeId;
  HS.bassNodeId = bassId;
  HS.bassFreq   = minFreq === Infinity ? BASE_HZ : minFreq;
  return changed;
}

/**
 * Reorient the full harmonic field around a new bass frequency.
 * All non-bass oscillators recalculate their consonance targets
 * relative to the new root.
 */
function _reorientField(newBassFreq, bassIdx, nowMs) {
  HS.fieldRoot = newBassFreq;
  HS.bassFreq  = newBassFreq;

  NS.nodes.forEach((n, i) => {
    if (i === bassIdx) return;
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    if (n.isolated) return;

    const g = HS.glide[i];
    if (!g) return;

    /* Find nearest just-intoned interval relative to new bass */
    const currentRatio = g.currentFreq / newBassFreq;
    const allRatios    = HS.intervals.map(iv => iv.ratio).concat(
      HS.intervals.map(iv => iv.ratio * 2),
      HS.intervals.map(iv => iv.ratio / 2)
    );
    const nearestRatio = allRatios.reduce((best, r) =>
      Math.abs(r - currentRatio) < Math.abs(best - currentRatio) ? r : best,
      allRatios[0]
    );
    const newTarget = _clampFreq(newBassFreq * nearestRatio);

    /* Slow glide to new position — not instantaneous */
    g.targetFreq = newTarget;
    g.glideRate  = HS.GLIDE_SLOW * 0.6;  /* extra slow for field reorientation */
  });

  NetworkEvents.emit('harmonicEvent', {
    nodeId:   HS.bassNodeId,
    type:     'fieldReorientation',
    newRoot:  newBassFreq,
  });
}

/* ═══════════════════════════════════════════════════════════════════
   GLISSANDO + DRIFT
   ═══════════════════════════════════════════════════════════════════ */

function _advanceGlide(dtMs, N) {
  for (let i = 0; i < N; i++) {
    const n = NS.nodes[i];
    const g = HS.glide[i];
    if (!n || !g) continue;

    if (n.type !== NODE_TYPES.OSCILLATOR) continue;

    const diff = g.targetFreq - g.currentFreq;

    /* Glide toward target */
    if (Math.abs(diff) > 0.05) {
      const step = diff * g.glideRate * dtMs;
      g.currentFreq += step;

      /* Slow glide rate once close */
      if (Math.abs(diff) < 2) g.glideRate = HS.GLIDE_SLOW;
    } else {
      g.currentFreq = g.targetFreq;
      g.glideRate   = HS.GLIDE_SLOW;

      /* Minimum drift — prevent complete stasis */
      g.driftVel += (Math.random() - 0.5) * HS.DRIFT_JITTER * dtMs;
      g.driftVel *= 0.98;   /* dampen drift velocity */
      const maxDrift = HS.DRIFT_RATE * dtMs;
      g.driftVel = Math.max(-maxDrift, Math.min(maxDrift, g.driftVel));
      g.currentFreq += g.driftVel;
    }

    g.currentFreq = _clampFreq(g.currentFreq);

    /* Write back to node (for canvas display and SAB flush) */
    n.freq = g.currentFreq;
  }

  /* Update bass detection periodically */
  _detectBassNode();
}

/* ═══════════════════════════════════════════════════════════════════
   REINFORCEMENT LEARNING ON INTERVAL VOCABULARY
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Evaluate outcome of the last harmonic event.
 * Called on each tick; checks ~2s after the last event.
 */
function _evaluateReinforcement(nowMs) {
  if (HS.lastEventTime === 0) return;
  const elapsed = nowMs - HS.lastEventTime;
  if (elapsed < 2000 || elapsed > 4000) return;   /* evaluate in 2–4s window */

  const currentLocks  = NS.phaseLockCount;
  const currentEnergy = getEnergyLevel();

  /* Positive outcome: more phase locks or stable energy */
  const lockDelta   = currentLocks  - HS.lastLockCount;
  const energyDelta = currentEnergy - HS.lastEnergyLevel;

  /* Find the interval that was last selected (by rechecking last event) */
  /* Simplified: reinforce or punish the most recently sampled interval */
  const reinforcement = lockDelta * 0.08 + energyDelta * 0.12;

  if (Math.abs(reinforcement) > 0.005) {
    /* Reinforce intervals near the one that triggered the event */
    const lastInterval = HS.intervals[_lastSelectedIntervalIdx];
    if (lastInterval) {
      lastInterval.weight = Math.max(0.02,
        Math.min(1.5, lastInterval.weight + reinforcement)
      );
    }
  }

  HS.lastEventTime = 0;   /* clear so we don't evaluate again */
}

let _lastSelectedIntervalIdx = 0;

/* Override _sampleInterval to track which was selected */
const _origSampleInterval = _sampleInterval;
function _sampleIntervalTracked() {
  const totalWeight = HS.intervals.reduce((s, iv) => s + Math.max(0, iv.weight), 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < HS.intervals.length; i++) {
    r -= Math.max(0, HS.intervals[i].weight);
    if (r <= 0) {
      _lastSelectedIntervalIdx = i;
      return HS.intervals[i];
    }
  }
  _lastSelectedIntervalIdx = HS.intervals.length - 1;
  return HS.intervals[_lastSelectedIntervalIdx];
}

/* ── Slow vocabulary weight decay toward baseline ─────────────── */
function _decayVocabulary() {
  HS.intervals.forEach(iv => {
    iv.weight += (iv.baseWeight - iv.weight) * 0.0004;
  });
}

/* ═══════════════════════════════════════════════════════════════════
   FREQUENCY FLUSH
   ═══════════════════════════════════════════════════════════════════ */

function _flushFrequencies(N) {
  const freqs = new Array(N);
  for (let i = 0; i < N; i++) {
    const g = HS.glide[i];
    freqs[i] = g ? g.currentFreq : BASE_HZ;
  }
  setFrequencies(freqs);
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function _clampFreq(hz) {
  return Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz));
}

/* ═══════════════════════════════════════════════════════════════════
   EXTERNAL TRIGGERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Force an immediate harmonic event on a specific node.
 * Used by food/object interactions in creature.js.
 */
export function forceHarmonicEvent(nodeId, intervalName, direction) {
  const nodeIdx = NS.nodes.findIndex(n => n.id === nodeId);
  if (nodeIdx < 0) return;
  const n = NS.nodes[nodeIdx];
  if (n.type !== NODE_TYPES.OSCILLATOR) return;

  const interval = HS.intervals.find(iv => iv.name === intervalName)
                || HS.intervals[4];   /* default: fourth */
  const dir      = direction || (Math.random() < 0.5 ? 'up' : 'down');
  const ratio    = dir === 'up' ? interval.ratio : (1 / interval.ratio);
  const newFreq  = _clampFreq(HS.glide[nodeIdx].currentFreq * ratio);

  HS.glide[nodeIdx].targetFreq = newFreq;
  HS.glide[nodeIdx].glideRate  = HS.GLIDE_FAST;
  HS.nodeLastEvent[nodeId]     = Date.now();

  if (nodeId === HS.bassNodeId) _reorientField(newFreq, nodeIdx, Date.now());

  NetworkEvents.emit('harmonicEvent', { nodeId, interval: interval.name, direction: dir, forced: true });
}

/**
 * Set glide rate for a specific node — used by inject energy
 * to create a brief excited response.
 */
export function exciteNode(nodeId) {
  const idx = NS.nodes.findIndex(n => n.id === nodeId);
  if (idx < 0 || !HS.glide[idx]) return;
  /* Brief pitch drift then settle — excited jitter */
  HS.glide[idx].driftVel = (Math.random() - 0.5) * 0.08;
}

/* ═══════════════════════════════════════════════════════════════════
   GETTERS FOR PERSISTENCE + STATUS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns current interval weight array for biography saving.
 */
export function getVocabularyWeights() {
  return HS.intervals.map(iv => iv.weight);
}

/**
 * Returns endogenous metabolic period in ms.
 */
export function getMetabolicPeriod() {
  return HS.metabolicPeriod;
}

/**
 * Returns dominant interval name (highest-weight non-unison interval).
 */
export function getDominantInterval() {
  let best = HS.intervals[0];
  HS.intervals.forEach(iv => {
    if (iv.name !== 'unison' && iv.weight > best.weight) best = iv;
  });
  return best.name;
}

/**
 * Returns current field root frequency.
 */
export function getFieldRoot() {
  return HS.fieldRoot;
}

/**
 * Returns all current glide states (for canvas display).
 */
export function getGlideState() {
  return HS.glide;
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════ */

NetworkEvents.on('nodeAdded', () => syncNodes());
NetworkEvents.on('nodeRemoved', () => syncNodes());

NetworkEvents.on('phaseLock', ({ nodeA, nodeB }) => {
  /* Phase lock: slightly reinforce the current dominant interval */
  const dominant = HS.intervals.reduce((best, iv) =>
    iv.weight > best.weight ? iv : best, HS.intervals[0]);
  dominant.weight = Math.min(1.5, dominant.weight + 0.04);
});

NetworkEvents.on('mutated', () => {
  /* After mutation, add a small random perturbation to all glide targets */
  HS.glide.forEach((g, i) => {
    if (!NS.nodes[i] || NS.nodes[i].type !== NODE_TYPES.OSCILLATOR) return;
    g.driftVel = (Math.random() - 0.5) * 0.15;
  });
});
