/**
 * /assets/js/spatial/paths.js
 * The paths the sound sources travel, as pure functions (no page, no audio). A path is a list of { x, y } points in arena units:
 * the arena is a circle of radius R, the listener is at the centre, the top of the screen is straight ahead.
 * toSpatial turns a point into metres for the audio engine (Resonance: +x right, -z in front of the listener).
 */
export const R = 150;           // arena radius in arena units; the page scales this to pixels
export const RADIUS_M = 2.6;    // arena radius in metres: wider than before, so left and right are further apart
export const FPS = 60;

/** Arena point → audio position. Top of the screen (y < 0) is in FRONT of the listener (-z). */
export const toSpatial = (x, y) => ({ sx: (x / R) * RADIUS_M, sy: 0, sz: (y / R) * RADIUS_M });
export const polarToXY = (angleDeg, distance) => { const a = (angleDeg - 90) * Math.PI / 180; return { x: distance * Math.cos(a), y: distance * Math.sin(a) }; };
export const pointAngle = (x, y) => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
export const angularDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export function generatePath(complexity, durationSec, startAngleDeg, speedMul, rnd = Math.random) {
  const frames = Math.max(2, Math.round((durationSec / speedMul) * FPS)), pts = [];
  if (complexity === 'simple') {
    const baseR = R * (0.55 + rnd() * 0.3), wobble = R * 0.08;
    for (let i = 0; i <= frames; i++) { const t = i / frames, p = polarToXY(startAngleDeg + 270 * t, baseR + wobble * Math.sin(t * Math.PI * 3)); pts.push(p); }
  } else if (complexity === 'medium') {
    const A = R * 0.85, offset = startAngleDeg * Math.PI / 180, [p, q] = [[3, 2], [4, 3], [5, 3]][Math.floor(startAngleDeg / 120) % 3];
    for (let i = 0; i <= frames; i++) { const t = (i / frames) * Math.PI * 2; pts.push({ x: A * Math.sin(p * t + offset), y: A * Math.sin(q * t) }); }
    const far = Math.max(...pts.map(q2 => Math.hypot(q2.x, q2.y)));   // a square-ish figure must still fit the round arena
    if (far > R * 0.92) { const k = (R * 0.92) / far; for (const q2 of pts) { q2.x *= k; q2.y *= k; } }
  } else {
    let angle = startAngleDeg, dist = R * 0.55; const raw = [];
    for (let i = 0; i <= frames; i++) { angle += (rnd() - 0.5) * 38; dist = Math.max(R * 0.22, Math.min(R * 0.92, dist + (rnd() - 0.5) * 24)); raw.push(polarToXY(angle, dist)); }
    for (let i = 0; i <= frames; i++) { const lo = Math.max(0, i - 2), hi = Math.min(frames, i + 2); let ax = 0, ay = 0; for (let j = lo; j <= hi; j++) { ax += raw[j].x; ay += raw[j].y; } const n = hi - lo + 1; pts.push({ x: ax / n, y: ay / n }); }
  }
  return pts;
}

/** The point u of the way (0 to 1) along a path, smoothly between its frames, with its audio position. */
export function sampleAt(path, u) {
  const last = path.length - 1, f = Math.max(0, Math.min(1, u)) * last, i = Math.min(last - 1, Math.floor(f)), k = f - i, a = path[i], b = path[i + 1] || a;
  const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
  return { x, y, ...toSpatial(x, y) };
}

/** One path per source, with the final positions kept apart by at least minSep degrees (and a minimum distance). */
export function buildPaths(levelCfg, rnd = Math.random) {
  const { sources, complexity, speed, minSep } = levelCfg, MIN_PIXEL_DIST = 26;
  for (let attempt = 0; attempt < 40; attempt++) {
    const paths = []; for (let i = 0; i < sources; i++) paths.push(generatePath(complexity, 5.0, rnd() * 360, speed, rnd));
    let ok = true;
    for (let i = 0; i < sources && ok; i++) for (let j = i + 1; j < sources && ok; j++) {
      const a = paths[i][paths[i].length - 1], b = paths[j][paths[j].length - 1];
      if (angularDist(pointAngle(a.x, a.y), pointAngle(b.x, b.y)) < minSep || Math.hypot(a.x - b.x, a.y - b.y) < MIN_PIXEL_DIST) ok = false;
    }
    if (ok) return paths;
  }
  const paths = [], step = 360 / sources;
  for (let i = 0; i < sources; i++) { const p = generatePath(complexity, 5.0, rnd() * 360, speed, rnd); p[p.length - 1] = polarToXY(i * step + rnd() * step * 0.4, R * 0.68); paths.push(p); }
  return paths;
}
