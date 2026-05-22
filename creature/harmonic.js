/**
 * neural-synthesis/harmonic.js
 *
 * Harmonic event system.
 * Reads network state from network.js.
 * Writes frequency changes directly to audio-engine.js via
 * setOscillatorFrequency() — no shared buffer, no indirection.
 *
 * Responsibilities:
 *   - Watch oscillator harmonicAccum values for threshold crossings
 *   - Trigger motivated interval moves when threshold crossed
 *   - Track bass voice — lowest active oscillator anchors the field
 *   - Reorient full harmonic field when bass voice moves
 *   - Maintain continuous glissando — minimum drift prevents stasis
 *   - Track endogenous metabolic rhythm from network energy patterns
 *   - Maintain harmonic vocabulary — interval weights evolve via
 *     reinforcement learning based on phase lock outcomes
 *
 * Glissando model:
 *   Every node has currentFreq (what the oscillator is playing now,
 *   as tracked here) and targetFreq (where it is heading).
 *   On each tick, currentFreq glides toward targetFreq.
 *   setOscillatorFrequency() is called with a time constant that
 *   matches the glide rate — the audio engine handles the actual
 *   AudioParam ramp. We track currentFreq here for logic purposes.
 *
 * Minimum drift:
 *   No oscillator is ever completely static. A small stochastic
 *   drift velocity keeps frequencies alive between events.
 *   This is separate from the Hebbian/Kuramoto drift in network.js.
 */

import { NS, NODE_TYPES, NetworkEvents } from './network.js';
import { setOscillatorFrequency }        from './audio-engine.js';

/* ═══════════════════════════════════════════════════════════════════
   INTERVAL TABLE
   ═══════════════════════════════════════════════════════════════════ */

const INTERVALS = [
  { ratio: 1,       name: 'unison',           tension: 0.00, weight: 0.50, base: 0.50 },
  { ratio: 9/8,     name: 'major second',      tension: 0.40, weight: 0.25, base: 0.25 },
  { ratio: 6/5,     name: 'minor third',       tension: 0.25, weight: 0.55, base: 0.55 },
  { ratio: 5/4,     name: 'major third',       tension: 0.20, weight: 0.60, base: 0.60 },
  { ratio: 4/3,     name: 'fourth',            tension: 0.12, weight: 0.65, base: 0.65 },
  { ratio: 7/5,     name: 'tritone',           tension: 0.85, weight: 0.15, base: 0.15 },
  { ratio: 3/2,     name: 'fifth',             tension: 0.08, weight: 0.70, base: 0.70 },
  { ratio: 8/5,     name: 'minor sixth',       tension: 0.28, weight: 0.45, base: 0.45 },
  { ratio: 5/3,     name: 'major sixth',       tension: 0.22, weight: 0.50, base: 0.50 },
  { ratio: 7/4,     name: 'harmonic seventh',  tension: 0.35, weight: 0.30, base: 0.30 },
  { ratio: 2,       name: 'octave',            tension: 0.05, weight: 0.60, base: 0.60 },
  { ratio: 2*(5/4), name: 'tenth',             tension: 0.22, weight: 0.35, base: 0.35 },
];

/* ═══════════════════════════════════════════════════════════════════
   HARMONIC STATE
   ═══════════════════════════════════════════════════════════════════ */

const HS = {
  /* Per-node glide state — indexed by node array position */
  glide: [],   /* [{ currentFreq, targetFreq, glideRate, driftVel }] */

  /* Evolved interval weights */
  intervals: INTERVALS.map(iv => ({ ...iv })),

  /* Bass voice */
  bassNodeId:  -1,
  fieldRoot:   55,     /* Hz — all consonance targets relative to this */

  /* Endogenous rhythm */
  onsetTimes:      [],
  metabolicPeriod: 2000,   /* ms */
  lastOnset:       0,
  lastEnergyLevel: 0,

  /* Reinforcement */
  lastEventMs:           0,
  lastEventIntervalIdx:  -1,
  lastLockCount:         0,

  /* Cooldowns */
  NODE_COOLDOWN_MS: 3500,
  BASS_COOLDOWN_MS: 8000,
  nodeLastEvent:    {},   /* nodeId → timestamp */
  lastBassEvent:    0,

  /* Glide rates (fraction of gap closed per ms) */
  GLIDE_SLOW:  0.0008,
  GLIDE_EVENT: 0.0020,
  GLIDE_FAST:  0.0040,

  /* Minimum drift */
  DRIFT_MAX:    0.010,   /* Hz per ms */
  DRIFT_JITTER: 0.003,
};

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */

export function initHarmonic() {
  HS.glide         = [];
  HS.bassNodeId    = -1;
  HS.fieldRoot     = 55;
  HS.metabolicPeriod = 2000;
  HS.lastOnset     = 0;
  HS.onsetTimes    = [];
  HS.nodeLastEvent = {};
  HS.lastBassEvent = 0;
  HS.lastEventMs   = 0;
  HS.lastEnergyLevel = 0;

  HS.intervals = INTERVALS.map(iv => ({
    ...iv,
    weight: iv.base * (0.85 + Math.random() * 0.3),
  }));

  _syncGlide();
}

export function applyHarmonicVocabulary(weights, retention) {
  if (!weights || retention <= 0) return;
  HS.intervals.forEach((iv, i) => {
    if (weights[i] === undefined) return;
    iv.weight = iv.weight * (1 - retention * 0.7) + weights[i] * retention * 0.7;
  });
}

export function syncNodes() {
  _syncGlide();
  _detectBass();
}

function _syncGlide() {
  const N = NS.nodes.length;

  /* Add entries for new nodes */
  while (HS.glide.length < N) {
    const n = NS.nodes[HS.glide.length];
    HS.glide.push({
      currentFreq: n ? n.freq : 55,
      targetFreq:  n ? n.freq : 55,
      glideRate:   HS.GLIDE_SLOW,
      driftVel:    (Math.random() - 0.5) * HS.DRIFT_JITTER,
    });
  }

  /* Trim removed nodes */
  if (HS.glide.length > N) HS.glide.length = N;

  /* Sync frequencies for any existing entries whose node freq changed */
  for (let i = 0; i < N; i++) {
    const n = NS.nodes[i];
    const g = HS.glide[i];
    if (!n || !g) continue;
    /* If network.js changed n.freq significantly, adopt it as new target */
    if (Math.abs(n.freq - g.targetFreq) > 2.0) {
      g.targetFreq = n.freq;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN TICK
   ═══════════════════════════════════════════════════════════════════ */

let _lastTickMs = 0;

export function harmonicTick(nowMs) {
  if (!NS.isRunning) return;

  const dtMs = Math.min(60, nowMs - (_lastTickMs || nowMs));
  _lastTickMs = nowMs;

  const N = NS.nodes.length;
  if (N === 0) return;

  _syncGlide();

  /* ── Endogenous rhythm ────────────────────────────────────────── */
  _updateMetabolicPeriod(nowMs);

  /* ── Harmonic event triggers ─────────────────────────────────── */
  _checkEvents(nowMs);

  /* ── Reinforcement ───────────────────────────────────────────── */
  _evaluateReinforcement(nowMs);

  /* ── Advance glide + drift ───────────────────────────────────── */
  _advanceGlide(dtMs, N);

  /* ── Vocabulary decay toward baseline ────────────────────────── */
  HS.intervals.forEach(iv => {
    iv.weight += (iv.base - iv.weight) * 0.0003;
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ENDOGENOUS RHYTHM
   ═══════════════════════════════════════════════════════════════════ */

function _updateMetabolicPeriod(nowMs) {
  const energy   = NS.energyLevel;
  const prev     = HS.lastEnergyLevel;
  HS.lastEnergyLevel = energy;

  /* Onset: energy crosses threshold from below */
  if (energy > 0.32 && prev <= 0.32) {
    const interval = nowMs - HS.lastOnset;
    if (interval > 120 && interval < 9000) {
      HS.onsetTimes.push(interval);
      if (HS.onsetTimes.length > 16) HS.onsetTimes.shift();
      const sorted         = HS.onsetTimes.slice().sort((a, b) => a - b);
      HS.metabolicPeriod   = sorted[Math.floor(sorted.length / 2)];
    }
    HS.lastOnset = nowMs;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HARMONIC EVENT TRIGGERS
   ═══════════════════════════════════════════════════════════════════ */

function _checkEvents(nowMs) {
  NS.nodes.forEach((n, i) => {
    if (n.type !== NODE_TYPES.OSCILLATOR) return;
    if (n.isolated || n.smoothEnergy < 0.03) return;

    const lastEv = HS.nodeLastEvent[n.id] || 0;
    if (nowMs - lastEv < HS.NODE_COOLDOWN_MS) return;

    if (n.harmonicAccum >= n.harmonicThreshold) {
      _triggerEvent(n, i, nowMs);
      n.harmonicAccum   = 0;
      n.harmonicThreshold = 0.45 + Math.random() * 0.95;
      HS.nodeLastEvent[n.id] = nowMs;
    }
  });
}

function _triggerEvent(node, nodeIdx, nowMs) {
  const isBass = node.id === HS.bassNodeId;
  if (isBass && nowMs - HS.lastBassEvent < HS.BASS_COOLDOWN_MS) return;

  const { interval, idx } = _sampleInterval();
  const direction = _pickDirection(nodeIdx, interval);
  const ratio     = direction === 'up' ? interval.ratio : (1 / interval.ratio);

  let newTarget;
  if (isBass) {
    newTarget = _clamp(HS.glide[nodeIdx].currentFreq * ratio);
  } else {
    newTarget = _clamp(
      _nearestConsonant(HS.glide[nodeIdx].currentFreq, HS.fieldRoot, interval)
    );
  }

  HS.glide[nodeIdx].targetFreq = newTarget;
  HS.glide[nodeIdx].glideRate  = isBass ? HS.GLIDE_EVENT * 0.6 : HS.GLIDE_EVENT;

  HS.lastEventMs          = nowMs;
  HS.lastEventIntervalIdx = idx;
  HS.lastLockCount        = NS.phaseLockCount;

  if (isBass) {
    HS.lastBassEvent = nowMs;
    _reorientField(newTarget, nodeIdx);
  }

  NetworkEvents.emit('harmonicEvent', {
    nodeId: node.id, interval: interval.name, direction, isBass,
  });
  NetworkEvents.emit('emergence', {
    text: isBass
      ? `bass — ${interval.name} ${direction} — field reorienting`
      : `${interval.name} ${direction} — node ${node.id}`,
  });
}

/* ── Interval sampling ───────────────────────────────────────────── */

function _sampleInterval() {
  const total = HS.intervals.reduce((s, iv) => s + Math.max(0, iv.weight), 0);
  let r = Math.random() * total;
  for (let i = 0; i < HS.intervals.length; i++) {
    r -= Math.max(0, HS.intervals[i].weight);
    if (r <= 0) return { interval: HS.intervals[i], idx: i };
  }
  const last = HS.intervals.length - 1;
  return { interval: HS.intervals[last], idx: last };
}

/* ── Direction selection ─────────────────────────────────────────── */

function _pickDirection(nodeIdx, interval) {
  const g       = HS.glide[nodeIdx];
  if (!g) return 'up';
  const upFreq   = _clamp(g.currentFreq * interval.ratio);
  const downFreq = _clamp(g.currentFreq / interval.ratio);
  const dUp      = Math.abs(upFreq   - HS.fieldRoot);
  const dDown    = Math.abs(downFreq - HS.fieldRoot);
  /* 65% chance to pick direction that keeps us closer to field root */
  if (Math.random() < 0.65) return dUp < dDown ? 'up' : 'down';
  return Math.random() < 0.5 ? 'up' : 'down';
}

/* ── Nearest consonant target relative to field root ─────────────── */

function _nearestConsonant(currentFreq, fieldRoot, interval) {
  const candidates = [];
  for (let octave = -2; octave <= 2; octave++) {
    const base = fieldRoot * Math.pow(2, octave);
    candidates.push(base * interval.ratio);
    candidates.push(base / interval.ratio);
    candidates.push(base);
  }
  return candidates.reduce((nearest, c) => {
    const fc = _clamp(c), fn = _clamp(nearest);
    return Math.abs(fc - currentFreq) < Math.abs(fn - currentFreq) ? fc : fn;
  }, candidates[0]);
}

/* ═══════════════════════════════════════════════════════════════════
   BASS VOICE AND FIELD REORIENTATION
   ═══════════════════════════════════════════════════════════════════ */

function _detectBass() {
  let minFreq = Infinity, bassId = -1;
  NS.nodes.forEach((n, i) => {
    if (n.type !== NODE_TYPES.OSCILLATOR || n.smoothEnergy < 0.025) return;
    const g = HS.glide[i];
    if (!g) return;
    if (g.currentFreq < minFreq) {
      minFreq = g.currentFreq;
      bassId  = n.id;
    }
  });
  HS.bassNodeId = bassId;
  if (minFreq < Infinity) HS.fieldRoot = minFreq;
}

function _reorientField(newBassFreq, bassIdx) {
  HS.fieldRoot = newBassFreq;

  NS.nodes.forEach((n, i) => {
    if (i === bassIdx || n.type !== NODE_TYPES.OSCILLATOR || n.isolated) return;
    const g = HS.glide[i];
    if (!g) return;

    /* Find nearest just ratio relative to new bass */
    const currentRatio = g.currentFreq / newBassFreq;
    const allRatios = [
      ...INTERVALS.map(iv => iv.ratio),
      ...INTERVALS.map(iv => iv.ratio * 2),
      ...INTERVALS.map(iv => iv.ratio / 2),
    ];
    const nearestRatio = allRatios.reduce((best, r) =>
      Math.abs(r - currentRatio) < Math.abs(best - currentRatio) ? r : best,
      allRatios[0]
    );

    g.targetFreq = _clamp(newBassFreq * nearestRatio);
    g.glideRate  = HS.GLIDE_SLOW * 0.55;   /* extra slow reorientation */
  });
}

/* ═══════════════════════════════════════════════════════════════════
   GLISSANDO + DRIFT
   ═══════════════════════════════════════════════════════════════════ */

function _advanceGlide(dtMs, N) {
  let bassChanged = false;

  for (let i = 0; i < N; i++) {
    const n = NS.nodes[i];
    const g = HS.glide[i];
    if (!n || !g || n.type !== NODE_TYPES.OSCILLATOR || n.isolated) continue;

    const diff = g.targetFreq - g.currentFreq;

    if (Math.abs(diff) > 0.08) {
      /* Glide toward target */
      const step    = diff * g.glideRate * dtMs;
      g.currentFreq = _clamp(g.currentFreq + step);

      /* Slow the rate as we approach */
      if (Math.abs(diff) < 3.0) {
        g.glideRate = Math.max(HS.GLIDE_SLOW, g.glideRate * 0.98);
      }
    } else {
      g.currentFreq = g.targetFreq;
      g.glideRate   = HS.GLIDE_SLOW;

      /* Minimum drift — keeps frequency alive */
      g.driftVel += (Math.random() - 0.5) * HS.DRIFT_JITTER;
      g.driftVel *= 0.97;
      const maxDrift = HS.DRIFT_MAX * dtMs;
      g.driftVel = Math.max(-maxDrift, Math.min(maxDrift, g.driftVel));
      g.currentFreq = _clamp(g.currentFreq + g.driftVel);
    }

    /* Write to audio engine — glide time constant matches our rate */
    const glideTimeConst = 0.08 + (1 - g.glideRate / HS.GLIDE_FAST) * 0.4;
    setOscillatorFrequency(n.id, g.currentFreq, glideTimeConst);

    /* Keep network.js node freq in sync for display */
    n.freq = g.currentFreq;
  }

  /* Update bass detection */
  _detectBass();
}

/* ═══════════════════════════════════════════════════════════════════
   REINFORCEMENT
   ═══════════════════════════════════════════════════════════════════ */

function _evaluateReinforcement(nowMs) {
  if (HS.lastEventMs === 0 || HS.lastEventIntervalIdx < 0) return;
  const elapsed = nowMs - HS.lastEventMs;
  if (elapsed < 2000 || elapsed > 5000) return;

  const lockDelta = NS.phaseLockCount - HS.lastLockCount;
  const reinforcement = lockDelta * 0.07 + NS.energyLevel * 0.05;

  if (Math.abs(reinforcement) > 0.003) {
    const iv = HS.intervals[HS.lastEventIntervalIdx];
    if (iv) {
      iv.weight = Math.max(0.02, Math.min(1.8, iv.weight + reinforcement));
    }
  }

  HS.lastEventMs = 0;
}

/* ═══════════════════════════════════════════════════════════════════
   EXTERNAL TRIGGERS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Force an immediate harmonic event on a node.
 * Used by food/object interactions in creature.js.
 */
export function forceHarmonicEvent(nodeId, intervalName, direction) {
  const i = NS.nodes.findIndex(n => n.id === nodeId);
  if (i < 0) return;
  const n = NS.nodes[i];
  if (n.type !== NODE_TYPES.OSCILLATOR) return;

  const iv  = HS.intervals.find(x => x.name === intervalName) || HS.intervals[4];
  const dir = direction || (Math.random() < 0.5 ? 'up' : 'down');
  const ratio = dir === 'up' ? iv.ratio : 1 / iv.ratio;
  const newFreq = _clamp(HS.glide[i].currentFreq * ratio);

  HS.glide[i].targetFreq = newFreq;
  HS.glide[i].glideRate  = HS.GLIDE_FAST;
  HS.nodeLastEvent[nodeId] = Date.now();

  if (nodeId === HS.bassNodeId) _reorientField(newFreq, i);

  NetworkEvents.emit('harmonicEvent', {
    nodeId, interval: iv.name, direction: dir, forced: true,
  });
}

/**
 * Add a brief excited pitch flutter to a node after energy injection.
 */
export function exciteNodeHarmonic(nodeId) {
  const i = NS.nodes.findIndex(n => n.id === nodeId);
  if (i < 0 || !HS.glide[i]) return;
  HS.glide[i].driftVel = (Math.random() - 0.5) * 0.12;
}

/* ═══════════════════════════════════════════════════════════════════
   GETTERS
   ═══════════════════════════════════════════════════════════════════ */

export function getVocabularyWeights() {
  return HS.intervals.map(iv => iv.weight);
}

export function getMetabolicPeriod() {
  return HS.metabolicPeriod;
}

export function getDominantInterval() {
  return HS.intervals
    .filter(iv => iv.name !== 'unison')
    .reduce((best, iv) => iv.weight > best.weight ? iv : best, HS.intervals[0])
    .name;
}

export function getFieldRoot() {
  return HS.fieldRoot;
}

export function getGlideState() {
  return HS.glide;
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function _clamp(hz) {
  return Math.max(32, Math.min(1400, hz));
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════ */

NetworkEvents.on('nodeAdded',   () => syncNodes());
NetworkEvents.on('nodeRemoved', () => syncNodes());

NetworkEvents.on('phaseLock', () => {
  /* Reinforce the dominant interval slightly on phase lock */
  const best = HS.intervals
    .filter(iv => iv.name !== 'unison')
    .reduce((b, iv) => iv.weight > b.weight ? iv : b, HS.intervals[0]);
  best.weight = Math.min(1.8, best.weight + 0.03);
});

NetworkEvents.on('mutated', () => {
  /* Add flutter to all oscillator glide states after mutation */
  HS.glide.forEach((g, i) => {
    const n = NS.nodes[i];
    if (!n || n.type !== NODE_TYPES.OSCILLATOR) return;
    g.driftVel = (Math.random() - 0.5) * 0.18;
    /* Adopt new frequency from network as new target */
    g.targetFreq  = n.freq;
    g.currentFreq = n.freq;
    g.glideRate   = HS.GLIDE_FAST;
  });
});
