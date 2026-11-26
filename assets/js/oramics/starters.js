/**
 * /assets/js/oramics/starters.js
 * Pictures to begin from, and "Surprise me". Each is a list of marks in picture coordinates (0..1 across and down; size is a share of
 * the picture's height) that the page draws with the same brush as everything else, so it is yours to paint over straight away.
 * A mark is { ink, kind: 'stroke' | 'dots', pts: [[x, y], …], size }.
 */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = v => Math.max(0.02, Math.min(0.98, v));
const line = (ink, x0, x1, y, size, wob = 0, r = Math.random, n = 24) => ({ ink, kind: 'stroke', size, pts: Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, clamp(y + (wob ? Math.sin(i * 0.9 + r() * 6) * wob : 0))]) });
const dots = (ink, list, size) => ({ ink, kind: 'dots', size, pts: list.map(([x, y]) => [clamp(x), clamp(y)]) });
const chord = (x0, x1, ys, size = 0.026) => ys.map(y => line('harmony', x0, x1, y, size, 0, Math.random, 2));

export const STARTERS = [
  { id: 'dawn', name: 'Dawn', blurb: 'A slow rising line over a warm chord.' },
  { id: 'rain', name: 'Rain', blurb: 'Scattered drops and a bright wash.' },
  { id: 'heartbeat', name: 'Heartbeat', blurb: 'A low pulse that settles you.' },
];

export function starterMarks(id, seed = 1) {
  const r = rng(seed * 9973 + 17);
  if (id === 'dawn') return [
    { ink: 'melody', kind: 'stroke', size: 0.024, pts: Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [0.08 + t * 0.84, clamp(0.66 - 0.4 * Math.sin(t * Math.PI * 0.62) + Math.sin(t * 17) * 0.012)]; }) },
    line('bass', 0.05, 0.48, 0.86, 0.04), line('bass', 0.5, 0.95, 0.8, 0.04),
    ...chord(0.04, 0.34, [0.5, 0.58, 0.66]), ...chord(0.36, 0.66, [0.46, 0.54, 0.64]), ...chord(0.68, 0.97, [0.4, 0.5, 0.6]),
    line('texture', 0.02, 0.98, 0.3, 0.07),
    dots('rhythm', Array.from({ length: 14 }, (_, i) => [0.1 + i * 0.062, 0.3]), 0.014), dots('rhythm', [[0.06, 0.9], [0.31, 0.9], [0.56, 0.9], [0.81, 0.9]], 0.03),
  ];
  if (id === 'rain') return [
    line('texture', 0.02, 0.98, 0.14, 0.12), line('bass', 0.06, 0.9, 0.9, 0.035),
    dots('rhythm', Array.from({ length: 46 }, () => [0.04 + r() * 0.92, 0.12 + r() * 0.5]), 0.012),
    dots('melody', Array.from({ length: 9 }, (_, i) => [0.1 + i * 0.1 + r() * 0.03, 0.25 + r() * 0.4]), 0.02),
    ...chord(0.08, 0.5, [0.52, 0.62, 0.72]), ...chord(0.52, 0.94, [0.5, 0.6, 0.7]),
  ];
  if (id === 'heartbeat') return [
    dots('rhythm', [0.08, 0.33, 0.58, 0.83].flatMap(x => [[x, 0.9], [x + 0.055, 0.86]]), 0.034),
    ...[0.08, 0.33, 0.58, 0.83].map(x => line('bass', x, x + 0.1, 0.82 + (x > 0.5 ? -0.06 : 0), 0.04, 0, r, 4)),
    ...chord(0.02, 0.98, [0.54, 0.64, 0.74], 0.034), line('texture', 0.02, 0.98, 0.72, 0.06),
    { ink: 'melody', kind: 'stroke', size: 0.02, pts: Array.from({ length: 21 }, (_, i) => [0.62 + i * 0.016, clamp(0.4 + Math.sin(i * 0.5) * 0.06 - i * 0.004)]) },
  ];
  return surprise(seed);
}

/** A new picture every seed: a few phrases, two or three chords, a bass line, a drum pattern and a wash. */
export function surprise(seed = 1) {
  const r = rng(seed * 7919 + 3), marks = [], pick = a => a[Math.floor(r() * a.length)];
  // melody: 2 to 4 phrases, each a wandering line
  const phrases = 2 + Math.floor(r() * 3); let x = 0.04 + r() * 0.06;
  for (let p = 0; p < phrases && x < 0.9; p++) {
    const len = 0.12 + r() * 0.16; let y = 0.25 + r() * 0.35, drift = (r() - 0.5) * 0.4; const pts = [];
    for (let i = 0; i <= 18; i++) { y = clamp(y + (r() - 0.5) * 0.07 + drift * 0.02); pts.push([Math.min(0.98, x + len * i / 18), y]); }
    marks.push({ ink: 'melody', kind: 'stroke', size: 0.018 + r() * 0.014, pts }); x += len + 0.04 + r() * 0.08;
  }
  // harmony: chords of three stacked bars
  const spans = pick([[0, 0.5, 1], [0, 0.34, 0.67, 1], [0, 0.25, 0.5, 0.75, 1]]);
  for (let i = 0; i < spans.length - 1; i++) { const base = 0.36 + r() * 0.3; marks.push(...chord(spans[i] + 0.02, spans[i + 1] - 0.01, [base, base + 0.08, base + 0.17 + r() * 0.04])); }
  // bass: a few long low notes
  const notes = 3 + Math.floor(r() * 3); for (let i = 0; i < notes; i++) { const a = i / notes; marks.push(line('bass', a + 0.02, a + 0.8 / notes, 0.72 + r() * 0.2, 0.034, 0, r, 4)); }
  // rhythm: 16 steps; kick on the first beat and a few more, snare on 5 and 13, hats on every other step
  const step = s => 0.04 + s * 0.058, kick = [], snare = [], hat = [];
  for (let s = 0; s < 16; s++) { if (s % 4 === 0 || (s % 4 === 2 && r() < 0.35)) kick.push([step(s), 0.9]); if (s === 4 || s === 12) snare.push([step(s), 0.5]); if (s % 2 === 0 || r() < 0.2) hat.push([step(s), 0.28]); }
  marks.push(dots('rhythm', kick, 0.03), dots('rhythm', snare, 0.026), dots('rhythm', hat, 0.014));
  marks.push(line('texture', 0.02, 0.98, 0.1 + r() * 0.5, 0.05 + r() * 0.05));
  return marks;
}
