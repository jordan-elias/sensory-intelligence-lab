/**
 * /assets/js/experiments/rng.js
 * Pure helpers for the experiments' number generators. A seed makes any result repeatable:
 * the page shows the seed, so a roll can be re-run or shared. Nothing here touches the network.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Math.floor(Math.random() * 4294967296); }
};

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES = {
  'major': [0, 2, 4, 5, 7, 9, 11],
  'natural minor': [0, 2, 3, 5, 7, 8, 10],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10],
};

export const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

export function shuffle(rng, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** k different items. */
export const sample = (rng, list, k) => shuffle(rng, list).slice(0, Math.min(k, list.length));

/** Note names for scale degrees (1-based) in a key. */
export function degreeNotes(rootIndex, scaleName, degrees) {
  const sc = SCALES[scaleName] || SCALES.major;
  return degrees.map(d => NOTE_NAMES[(rootIndex + sc[(d - 1) % sc.length]) % 12]);
}

/**
 * One roll. Returns { kind, items: [{ label, text }], pitchClasses?: number[] , summary }.
 * kinds: degrees, notes, tuning, range, choice, shuffle, pattern
 */
export function generate(spec, rng) {
  switch (spec.kind) {
    case 'degrees': {
      const scale = SCALES[spec.scale] || SCALES.major, root = spec.root ?? 0, n = spec.count ?? 7;
      const degs = Array.from({ length: n }, () => int(rng, 1, scale.length));
      const names = degreeNotes(root, spec.scale || 'major', degs);
      return { kind: 'degrees', items: degs.map((d, i) => ({ label: `${i + 1}`, text: `${names[i]} (degree ${d})` })),
        pitchClasses: degs.map(d => (root + scale[d - 1]) % 12), summary: names.join(' – ') };
    }
    case 'notes': {
      const pcs = sample(rng, [...Array(12).keys()], spec.count ?? 5).sort((a, b) => a - b);
      return { kind: 'notes', items: pcs.map(p => ({ label: '', text: NOTE_NAMES[p] })), pitchClasses: pcs, summary: pcs.map(p => NOTE_NAMES[p]).join(' ') };
    }
    case 'tuning': {
      const strings = spec.strings || ['6 (lowest)', '5', '4', '3', '2', '1 (highest)'];
      const lo = spec.min ?? -5, hi = spec.max ?? 5; let semis = 0;
      while (semis === 0) semis = int(rng, lo, hi);
      const s = strings[int(rng, 0, strings.length - 1)];
      return { kind: 'tuning', items: [{ label: 'String', text: s }, { label: 'Retune by', text: `${semis > 0 ? '+' : ''}${semis} semitone${Math.abs(semis) === 1 ? '' : 's'}` }],
        summary: `String ${s}, ${semis > 0 ? '+' : ''}${semis}` };
    }
    case 'range': {
      const n = spec.count ?? 1, v = Array.from({ length: n }, () => int(rng, spec.min, spec.max));
      return { kind: 'range', items: v.map((x, i) => ({ label: n > 1 ? `${i + 1}` : '', text: String(x) })), values: v, summary: v.join(', ') };
    }
    case 'choice': {
      const picks = sample(rng, spec.options, spec.count ?? 1);
      return { kind: 'choice', items: picks.map(t => ({ label: '', text: t })), summary: picks.join(' / ') };
    }
    case 'shuffle': {
      const order = shuffle(rng, spec.options);
      return { kind: 'shuffle', items: order.map((t, i) => ({ label: `${i + 1}`, text: t })), summary: order.join(' → ') };
    }
    case 'pattern': {
      const set = sample(rng, [...Array(12).keys()], spec.setSize ?? 5).sort((a, b) => a - b), steps = spec.steps ?? 8;
      const seq = Array.from({ length: steps }, () => set[int(rng, 0, set.length - 1)]);
      return { kind: 'pattern', items: seq.map((p, i) => ({ label: `${i + 1}`, text: NOTE_NAMES[p] })), pitchClasses: seq,
        summary: `Note set ${set.map(p => NOTE_NAMES[p]).join(' ')} · ${seq.map(p => NOTE_NAMES[p]).join(' ')}` };
    }
    default: throw new Error('Unknown generator kind: ' + spec.kind);
  }
}

/** Every item moves to a different place: nobody keeps the original position. */
export function rotateAssign(rng, names) {
  if (names.length < 2) return names.map(n => ({ from: n, to: n }));
  let to;
  do { to = shuffle(rng, names); } while (to.some((t, i) => t === names[i]));
  return names.map((n, i) => ({ from: n, to: to[i] }));
}
