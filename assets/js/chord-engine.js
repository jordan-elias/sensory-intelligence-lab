/**
 * /assets/js/chord-engine.js
 *
 * Chord identification and warm piano-like audio synthesis
 * for the Check-In note selection grid.
 *
 * Exports:
 *   identifyChord(pitchClasses)  — identify chord from array of pitch class ints (0–11)
 *   playNote(pitchClass, octave) — play a single warm tone
 *   playChord(notes)             — play an array of {pitchClass, octave} together
 *   getNoteName(pitchClass)      — return flat note name string
 *   releaseAll()                 — stop all currently ringing notes
 */

'use strict';

// ─────────────────────────────────────────────────────────
// NOTE NAMES (flats)
// ─────────────────────────────────────────────────────────
const NOTE_NAMES = [
  'C', 'D♭', 'D', 'E♭', 'E', 'F',
  'G♭', 'G', 'A♭', 'A', 'B♭', 'B',
];

export function getNoteName(pc) {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

// ─────────────────────────────────────────────────────────
// MIDI / FREQUENCY
// ─────────────────────────────────────────────────────────
function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function pcOctaveToMidi(pitchClass, octave) {
  return (octave + 1) * 12 + pitchClass;
}

// ─────────────────────────────────────────────────────────
// AUDIO CONTEXT (lazy init)
// ─────────────────────────────────────────────────────────
let _ctx = null;
let _reverbNode = null;

function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _buildReverb();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// Simple feedback reverb using delay + filter loop
function _buildReverb() {
  const ctx = _ctx;

  // Convolution reverb using a synthesised impulse response
  const sr     = ctx.sampleRate;
  const length = sr * 1.8;
  const ir     = ctx.createBuffer(2, length, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // Exponential decay with slight early reflection bump
      const t     = i / sr;
      const decay = Math.exp(-t * 3.5);
      const early = i < sr * 0.02 ? 0.3 * Math.exp(-t * 40) : 0;
      d[i] = (Math.random() * 2 - 1) * decay + early;
    }
  }

  _reverbNode = ctx.createConvolver();
  _reverbNode.buffer = ir;
  _reverbNode.connect(ctx.destination);
}

function getReverb() {
  getCtx();
  return _reverbNode;
}

// ─────────────────────────────────────────────────────────
// WARM TONE SYNTHESIS
//
// Layered harmonics + amplitude envelope + brightness filter
// + subtle stereo spread to approximate a soft piano tone.
// ─────────────────────────────────────────────────────────

// Track active nodes so we can clean them up
const _activeNodes = new Set();

/**
 * Synthesise and play a single warm tone.
 *
 * @param {number} pitchClass  — 0–11
 * @param {number} octave      — 4 or 5
 * @param {object} [opts]
 * @param {number} [opts.velocity=0.7]   — 0–1 loudness
 * @param {number} [opts.duration=2.0]   — seconds before release begins
 * @param {number} [opts.startOffset=0]  — seconds from now to start
 */
export function playNote(pitchClass, octave = 4, opts = {}) {
  const ctx      = getCtx();
  const reverb   = getReverb();
  const now      = ctx.currentTime;

  const velocity    = opts.velocity    ?? 0.7;
  const duration    = opts.duration    ?? 2.0;
  const startOffset = opts.startOffset ?? 0;
  const t0          = now + startOffset;

  const midi = pcOctaveToMidi(pitchClass, octave);
  const freq = midiToHz(midi);

  // Stereo panning — low notes slightly left, high notes slightly right
  const panAmount = ((midi - 60) / 36) * 0.4; // -0.4 to +0.4
  const panner    = ctx.createStereoPanner();
  panner.pan.value = Math.max(-0.8, Math.min(0.8, panAmount));

  // Master gain for this note
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, t0);

  // Brightness (lowpass) filter — starts open, closes as note decays
  const filter  = ctx.createBiquadFilter();
  filter.type   = 'lowpass';
  filter.Q.value = 0.5;
  filter.frequency.setValueAtTime(5000 + velocity * 3000, t0);
  filter.frequency.exponentialRampToValueAtTime(800, t0 + duration * 0.8);

  // Harmonic partials: [multiplier, relative_amplitude, detune_cents]
  const partials = [
    [1,    1.00,   0  ],
    [2,    0.45,   1.2],
    [3,    0.22,   2.1],
    [4,    0.10,   3.0],
    [5,    0.06,   4.2],
    [6,    0.03,   5.5],
    [7,    0.015,  7.0],
  ];

  const oscNodes = [];

  partials.forEach(([mult, amp, detuneCents]) => {
    const osc   = ctx.createOscillator();
    const gPart = ctx.createGain();

    // Sawtooth for upper harmonics gives warmth;
    // sine for fundamental keeps the tone clean at the root
    osc.type = mult === 1 ? 'sine' : 'triangle';
    osc.frequency.value = freq * mult;
    osc.detune.value    = detuneCents;

    gPart.gain.value = amp * velocity * 0.18;

    osc.connect(gPart);
    gPart.connect(filter);

    osc.start(t0);
    oscNodes.push(osc);
    oscNodes.push(gPart);
  });

  // ADSR envelope on master gain
  const attack  = 0.008;
  const decay   = 0.18;
  const sustain = 0.55;
  const release = 1.6;

  masterGain.gain.setValueAtTime(0, t0);
  masterGain.gain.linearRampToValueAtTime(velocity, t0 + attack);
  masterGain.gain.exponentialRampToValueAtTime(
    velocity * sustain, t0 + attack + decay
  );
  masterGain.gain.setValueAtTime(velocity * sustain, t0 + duration);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);

  // Routing: filter → masterGain → panner → dry out + reverb send
  filter.connect(masterGain);

  const dryGain   = ctx.createGain();
  const reverbSend = ctx.createGain();
  dryGain.gain.value    = 0.72;
  reverbSend.gain.value = 0.28;

  masterGain.connect(panner);
  panner.connect(dryGain);
  panner.connect(reverbSend);
  dryGain.connect(ctx.destination);
  reverbSend.connect(reverb);

  // Schedule cleanup
  const stopAt = t0 + duration + release + 0.1;
  oscNodes.forEach(n => {
    if (n.stop) n.stop(stopAt);
    _activeNodes.add(n);
    setTimeout(() => {
      try { n.disconnect(); } catch(e) {}
      _activeNodes.delete(n);
    }, (stopAt - now + 0.2) * 1000);
  });

  [masterGain, panner, dryGain, reverbSend, filter].forEach(n => {
    _activeNodes.add(n);
    setTimeout(() => {
      try { n.disconnect(); } catch(e) {}
      _activeNodes.delete(n);
    }, (stopAt - now + 0.2) * 1000);
  });
}

/**
 * Play multiple notes as a chord with a natural strum feel.
 * Notes are sorted low to high and staggered by 12ms.
 *
 * @param {Array<{pitchClass: number, octave: number}>} notes
 * @param {object} [opts]
 * @param {number} [opts.duration=2.0]
 * @param {number} [opts.strum=0.012]  — seconds between each note onset
 */
export function playChord(notes, opts = {}) {
  if (!notes || notes.length === 0) return;

  const duration = opts.duration ?? 2.0;
  const strum    = opts.strum    ?? 0.012;

  // Sort lowest pitch first
  const sorted = [...notes].sort((a, b) => {
    const midiA = pcOctaveToMidi(a.pitchClass, a.octave);
    const midiB = pcOctaveToMidi(b.pitchClass, b.octave);
    return midiA - midiB;
  });

  sorted.forEach((note, i) => {
    playNote(note.pitchClass, note.octave, {
      velocity:    0.65,
      duration,
      startOffset: i * strum,
    });
  });
}

/**
 * Stop all currently active audio nodes immediately.
 */
export function releaseAll() {
  const ctx = _ctx;
  if (!ctx) return;
  _activeNodes.forEach(n => {
    try {
      if (n.stop) n.stop(ctx.currentTime + 0.05);
      n.disconnect();
    } catch(e) {}
  });
  _activeNodes.clear();
}

// ─────────────────────────────────────────────────────────
// CHORD TEMPLATE LIBRARY
//
// Each entry: { intervals: Set<number>, quality: string, priority: number }
// intervals — set of semitones above root (mod 12), NOT including root (0)
// priority  — lower = preferred when multiple roots match equally
// ─────────────────────────────────────────────────────────

const CHORD_TEMPLATES = [

  // ── Triads (priority 10–19) ──────────────────────────
  { intervals: [4, 7],       quality: '',        priority: 10 }, // Major
  { intervals: [3, 7],       quality: 'm',       priority: 11 }, // Minor
  { intervals: [3, 6],       quality: 'dim',     priority: 12 }, // Diminished
  { intervals: [4, 8],       quality: 'aug',     priority: 13 }, // Augmented
  { intervals: [2, 7],       quality: 'sus2',    priority: 14 }, // Suspended 2
  { intervals: [5, 7],       quality: 'sus4',    priority: 15 }, // Suspended 4
  { intervals: [4, 6],       quality: '(♭5)',    priority: 16 }, // Major flat 5
  { intervals: [3, 8],       quality: 'm(♯5)',   priority: 17 }, // Minor sharp 5
  { intervals: [2, 5],       quality: 'sus2sus4',priority: 18 }, // Quartal triad
  { intervals: [5, 10],      quality: 'quar',    priority: 19 }, // Stacked 4ths

  // ── Sixth chords (priority 20–22) ───────────────────
  { intervals: [4, 7, 9],    quality: '6',       priority: 20 }, // Major 6
  { intervals: [3, 7, 9],    quality: 'm6',      priority: 21 }, // Minor 6
  { intervals: [2, 7, 9],    quality: '6sus2',   priority: 22 }, // 6sus2

  // ── Seventh chords (priority 30–45) ─────────────────
  { intervals: [4, 7, 11],   quality: 'maj7',    priority: 30 }, // Major 7
  { intervals: [4, 7, 10],   quality: '7',       priority: 31 }, // Dominant 7
  { intervals: [3, 7, 10],   quality: 'm7',      priority: 32 }, // Minor 7
  { intervals: [3, 7, 11],   quality: 'mMaj7',   priority: 33 }, // Minor major 7
  { intervals: [4, 8, 11],   quality: 'augMaj7', priority: 34 }, // Aug major 7
  { intervals: [4, 8, 10],   quality: 'aug7',    priority: 35 }, // Augmented 7
  { intervals: [3, 6, 9],    quality: 'dim7',    priority: 36 }, // Diminished 7
  { intervals: [3, 6, 10],   quality: 'ø7',      priority: 37 }, // Half diminished
  { intervals: [2, 7, 10],   quality: '7sus2',   priority: 38 }, // 7sus2
  { intervals: [5, 7, 10],   quality: '7sus4',   priority: 39 }, // 7sus4
  { intervals: [4, 6, 10],   quality: '7(♭5)',   priority: 40 }, // Dominant 7 flat 5
  { intervals: [4, 8, 10],   quality: '7(♯5)',   priority: 41 }, // Dominant 7 sharp 5
  { intervals: [3, 6, 11],   quality: 'dimMaj7', priority: 42 }, // Diminished major 7
  { intervals: [2, 6, 10],   quality: '7(♭5)alt',priority: 43 }, // Alt dominant
  { intervals: [5, 9, 10],   quality: '7sus4(6)',priority: 44 }, // 7sus4 add6
  { intervals: [4, 9, 11],   quality: 'maj7(13)',priority: 45 }, // Maj7 add 13

  // ── Added note chords (priority 50–58) ──────────────
  { intervals: [2, 4, 7],    quality: 'add9',    priority: 50 }, // Add 9
  { intervals: [2, 3, 7],    quality: 'madd9',   priority: 51 }, // Minor add 9
  { intervals: [4, 5, 7],    quality: 'add11',   priority: 52 }, // Add 11
  { intervals: [3, 5, 7],    quality: 'madd11',  priority: 53 }, // Minor add 11
  { intervals: [2, 4, 6, 7], quality: 'add9(♯11)',priority:54 }, // Add 9 sharp 11
  { intervals: [4, 6, 7],    quality: '(♯11)',   priority: 55 }, // Sharp 11 triad
  { intervals: [3, 6, 7],    quality: 'm(♯11)',  priority: 56 }, // Minor sharp 11

  // ── Ninth chords (priority 60–75) ───────────────────
  { intervals: [2, 4, 7, 10],  quality: '9',         priority: 60 }, // Dominant 9
  { intervals: [2, 4, 7, 11],  quality: 'maj9',      priority: 61 }, // Major 9
  { intervals: [2, 3, 7, 10],  quality: 'm9',        priority: 62 }, // Minor 9
  { intervals: [2, 3, 7, 11],  quality: 'mMaj9',     priority: 63 }, // Minor major 9
  { intervals: [1, 4, 7, 10],  quality: '7(♭9)',     priority: 64 }, // Dominant flat 9
  { intervals: [3, 4, 7, 10],  quality: '7(♯9)',     priority: 65 }, // Dominant sharp 9
  { intervals: [1, 3, 6, 10],  quality: 'ø7(♭9)',    priority: 66 }, // Half dim flat 9
  { intervals: [2, 4, 8, 10],  quality: 'aug9',      priority: 67 }, // Augmented 9
  { intervals: [2, 3, 6, 10],  quality: 'ø9',        priority: 68 }, // Half dim 9
  { intervals: [2, 4, 6, 10],  quality: '9(♯11)',    priority: 69 }, // Lydian dominant 9
  { intervals: [2, 4, 6, 11],  quality: 'maj9(♯11)', priority: 70 }, // Major 9 sharp 11
  { intervals: [2, 3, 6, 11],  quality: 'mMaj9(♯11)',priority: 71 }, // Minor major 9 sharp 11
  { intervals: [2, 5, 7, 10],  quality: '9sus4',     priority: 72 }, // 9sus4
  { intervals: [2, 2, 7, 10],  quality: '9sus2',     priority: 73 }, // (dedup handles)
  { intervals: [1, 4, 8, 10],  quality: 'aug7(♭9)',  priority: 74 }, // Aug 7 flat 9
  { intervals: [3, 4, 8, 10],  quality: 'aug7(♯9)',  priority: 75 }, // Aug 7 sharp 9

  // ── Eleventh chords (priority 80–90) ────────────────
  { intervals: [2, 4, 5, 7, 10], quality: '11',        priority: 80 }, // Dominant 11
  { intervals: [2, 4, 5, 7, 11], quality: 'maj11',     priority: 81 }, // Major 11
  { intervals: [2, 3, 5, 7, 10], quality: 'm11',       priority: 82 }, // Minor 11
  { intervals: [2, 3, 5, 7, 11], quality: 'mMaj11',    priority: 83 }, // Minor major 11
  { intervals: [2, 4, 6, 7, 10], quality: '11(♯11)',   priority: 84 }, // Lydian dominant 11
  { intervals: [2, 4, 6, 7, 11], quality: 'maj11(♯11)',priority: 85 }, // Major sharp 11
  { intervals: [1, 4, 5, 7, 10], quality: '11(♭9)',    priority: 86 }, // 11 flat 9
  { intervals: [2, 5, 7, 10, 0], quality: '11sus',     priority: 87 }, // 11sus (catch-all)
  { intervals: [2, 3, 6, 7, 10], quality: 'm11(♯11)',  priority: 88 }, // Minor 11 sharp 11
  { intervals: [2, 4, 5, 8, 10], quality: 'aug11',     priority: 89 }, // Augmented 11

  // ── Thirteenth chords (priority 90–99) ──────────────
  { intervals: [2, 4, 5, 7, 9, 10], quality: '13',         priority: 90 }, // Dominant 13
  { intervals: [2, 4, 5, 7, 9, 11], quality: 'maj13',      priority: 91 }, // Major 13
  { intervals: [2, 3, 5, 7, 9, 10], quality: 'm13',        priority: 92 }, // Minor 13
  { intervals: [2, 3, 5, 7, 9, 11], quality: 'mMaj13',     priority: 93 }, // Minor major 13
  { intervals: [1, 4, 5, 7, 9, 10], quality: '13(♭9)',     priority: 94 }, // 13 flat 9
  { intervals: [3, 4, 5, 7, 9, 10], quality: '13(♯9)',     priority: 95 }, // 13 sharp 9
  { intervals: [2, 4, 6, 7, 9, 10], quality: '13(♯11)',    priority: 96 }, // Lydian 13
  { intervals: [2, 4, 5, 7, 8, 10], quality: '13(♭13)',    priority: 97 }, // 13 flat 13
  { intervals: [2, 3, 5, 7, 8, 10], quality: 'm13(♭13)',   priority: 98 }, // Minor 13 flat 13
  { intervals: [2, 4, 6, 7, 9, 11], quality: 'maj13(♯11)', priority: 99 }, // Major 13 sharp 11
];

// Normalise template intervals to sorted unique Set for fast comparison
const _TEMPLATES = CHORD_TEMPLATES.map(t => ({
  ...t,
  set: new Set(t.intervals.map(i => ((i % 12) + 12) % 12)),
}));

// ─────────────────────────────────────────────────────────
// INTERVAL NAMES (dyads)
// ─────────────────────────────────────────────────────────
const INTERVAL_NAMES = [
  'Unison',
  'Minor 2nd',
  'Major 2nd',
  'Minor 3rd',
  'Major 3rd',
  'Perfect 4th',
  'Tritone',
  'Perfect 5th',
  'Minor 6th',
  'Major 6th',
  'Minor 7th',
  'Major 7th',
];

// ─────────────────────────────────────────────────────────
// CLUSTER DETECTION
// ─────────────────────────────────────────────────────────

function detectCluster(pcs) {
  const sorted = [...pcs].sort((a, b) => a - b);
  const n      = sorted.length;

  // Whole tone — all intervals are 2 semitones
  const intervals = [];
  for (let i = 1; i < n; i++) {
    intervals.push(sorted[i] - sorted[i - 1]);
  }
  // Also check wrap-around interval
  const wrapInterval = (12 + sorted[0] - sorted[n - 1]) % 12;

  const allWholeTone = intervals.every(v => v === 2) && (wrapInterval === 2 || wrapInterval === 0);
  if (allWholeTone && n >= 3) return 'Whole tone';

  // Chromatic cluster — 3+ consecutive semitones
  let maxConsec = 1, curConsec = 1;
  for (let i = 1; i < n; i++) {
    if (sorted[i] - sorted[i - 1] === 1) {
      curConsec++;
      maxConsec = Math.max(maxConsec, curConsec);
    } else {
      curConsec = 1;
    }
  }
  if (maxConsec >= 3) return 'Chromatic cluster';

  // Quartal — all intervals are 5 or 7 semitones (4ths and 5ths)
  const quartalIntervals = new Set([5, 7]);
  const allQuartal = intervals.every(v => quartalIntervals.has(v));
  if (allQuartal && n >= 3) return 'Quartal';

  // Quintal — all intervals are 7 semitones
  const allQuintal = intervals.every(v => v === 7);
  if (allQuintal && n >= 3) return 'Quintal';

  // Symmetric diminished — all intervals divisible by 3
  const allDim = intervals.every(v => v % 3 === 0);
  if (allDim && n >= 3) return 'Symmetric (diminished)';

  // Symmetric augmented — all intervals divisible by 4
  const allAug = intervals.every(v => v % 4 === 0);
  if (allAug && n >= 3) return 'Symmetric (augmented)';

  // Pentatonic — all notes belong to one of the 12 pentatonic scale rotations
  const PENTATONIC_INTERVALS = new Set([0, 2, 4, 7, 9]);
  for (let root = 0; root < 12; root++) {
    const inScale = pcs.every(pc => PENTATONIC_INTERVALS.has((pc - root + 12) % 12));
    if (inScale) return 'Pentatonic';
  }

  return null;
}

// ─────────────────────────────────────────────────────────
// CHORD IDENTIFICATION
// ─────────────────────────────────────────────────────────

/**
 * Identify a chord from an array of pitch class integers.
 *
 * @param {number[]} pitchClasses — array of ints 0–11 (duplicates ignored)
 * @returns {ChordResult}
 */
export function identifyChord(pitchClasses) {
  // Deduplicate and normalise
  const pcs = [...new Set(pitchClasses.map(pc => ((pc % 12) + 12) % 12))];

  const result = {
    name:        null,
    root:        null,
    quality:     null,
    bassNote:    null,
    isInversion: false,
    slashName:   null,
    isCluster:   false,
    clusterType: null,
    notes:       pcs.map(getNoteName),
    tooComplex:  false,
    subsetOf:    null, // e.g. "Cmaj7 no 5"
  };

  // ── 0 notes ──
  if (pcs.length === 0) return result;

  // ── 1 note ──
  if (pcs.length === 1) {
    result.root    = pcs[0];
    result.name    = getNoteName(pcs[0]);
    result.quality = 'note';
    return result;
  }

  // ── 2 notes — interval ──
  if (pcs.length === 2) {
    const interval = (pcs[1] - pcs[0] + 12) % 12;
    const altInt   = (pcs[0] - pcs[1] + 12) % 12;
    const semitones = Math.min(interval, altInt);
    result.root    = pcs[0];
    result.bassNote = pcs[0];
    result.quality = 'interval';
    result.name    = INTERVAL_NAMES[semitones] || `Interval (${semitones} st)`;
    return result;
  }

  // ── 3+ notes — attempt template matching ──
  const candidates = [];

  for (let rootIdx = 0; rootIdx < pcs.length; rootIdx++) {
    const root = pcs[rootIdx];

    // Calculate intervals above this root (mod 12), exclude root itself
    const ivSet = new Set(
      pcs
        .filter(pc => pc !== root)
        .map(pc => (pc - root + 12) % 12)
    );

    // Try exact match first
    for (const tmpl of _TEMPLATES) {
      if (_setsEqual(ivSet, tmpl.set)) {
        candidates.push({
          root,
          quality:   tmpl.quality,
          priority:  tmpl.priority,
          matchType: 'exact',
          missing:   [],
        });
      }
    }

    // Try subset match — template has one extra note not in selection
    // (common omissions: 5th = 7, root doubling, 11th = 5)
    for (const tmpl of _TEMPLATES) {
      if (tmpl.set.size <= ivSet.size) continue; // can't be subset if template is smaller
      if (tmpl.set.size - ivSet.size > 2) continue; // too many missing notes

      const missing = [...tmpl.set].filter(i => !ivSet.has(i));
      const extra   = [...ivSet].filter(i => !tmpl.set.has(i));

      if (extra.length === 0 && missing.length >= 1 && missing.length <= 2) {
        // Check if missing notes are commonly omitted (5th=7, root=0, 11th=5)
        const omittable = new Set([7, 5]);
        const allOmittable = missing.every(m => omittable.has(m));
        if (allOmittable) {
          const missingNames = missing.map(m => {
            const degreeMap = {5:'♭3',7:'5',10:'♭7',11:'7',2:'9',5:'11',9:'13'};
            return degreeMap[m] || `(+${m}st)`;
          });
          candidates.push({
            root,
            quality:   tmpl.quality,
            priority:  tmpl.priority + 200, // penalise subset matches
            matchType: 'subset',
            missing:   missingNames,
          });
        }
      }
    }
  }

  // ── Score and select best candidate ──
  if (candidates.length > 0) {
    // Determine bass note (lowest pitch class — approximate without full octave info)
    const bassPC = pcs[0]; // caller should pass sorted or we treat first as bass

    candidates.sort((a, b) => {
      // Exact over subset
      if (a.matchType !== b.matchType) {
        return a.matchType === 'exact' ? -1 : 1;
      }
      // Lower priority number = simpler = preferred
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Prefer root = bass note
      const aBass = a.root === bassPC ? 0 : 1;
      const bBass = b.root === bassPC ? 0 : 1;
      return aBass - bBass;
    });

    const best = candidates[0];
    result.root    = best.root;
    result.quality = best.quality;
    result.bassNote = bassPC;

    const rootName = getNoteName(best.root);
    const missingStr = best.missing.length > 0
      ? ` (no ${best.missing.join(', ')})`
      : '';

    const chordName = `${rootName}${best.quality}${missingStr}`;

    // Slash chord if bass is not root
    if (bassPC !== best.root) {
      result.isInversion = true;
      result.slashName   = `${chordName}/${getNoteName(bassPC)}`;
      result.name        = result.slashName;
    } else {
      result.name = chordName;
    }

    if (best.matchType === 'subset') {
      result.subsetOf = chordName;
    }

    return result;
  }

  // ── No template match — try cluster detection ──
  const clusterType = detectCluster(pcs);
  if (clusterType) {
    result.isCluster  = true;
    result.clusterType = clusterType;
    result.name       = clusterType;
    return result;
  }

  // ── Too complex to name ──
  if (pcs.length > 5) {
    result.tooComplex = true;
    result.name       = 'Too complex to name';
    return result;
  }

  // ── Unrecognised but not too complex — show note names ──
  result.name = pcs.map(getNoteName).join(' ');
  return result;
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function _setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * @typedef {Object} ChordResult
 * @property {string|null}  name        — display name
 * @property {number|null}  root        — pitch class of root
 * @property {string|null}  quality     — chord quality string
 * @property {number|null}  bassNote    — pitch class of lowest note
 * @property {boolean}      isInversion — bass ≠ root
 * @property {string|null}  slashName   — slash notation if inversion
 * @property {boolean}      isCluster   — identified as tonal cluster
 * @property {string|null}  clusterType — cluster classification
 * @property {string[]}     notes       — note names
 * @property {boolean}      tooComplex  — no name found for >5 notes
 * @property {string|null}  subsetOf    — if subset match, full chord name
 */
