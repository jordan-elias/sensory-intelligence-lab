import test from 'node:test'; import assert from 'node:assert/strict';
import { trialSeed, LISTENING_ROOM } from '../assets/js/spatial/daily.js';
import { R, RADIUS_M, toSpatial, polarToXY, generatePath, sampleAt, buildPaths, pointAngle, angularDist } from '../assets/js/spatial/paths.js';
import { mulberry32 } from '../assets/js/experiments/rng.js';
test('the same day, level and trial give the same seed; any change gives another', () => {
  assert.equal(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-21', 3, 0));
  assert.notEqual(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-22', 3, 0));
  assert.notEqual(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-21', 4, 0));
  assert.notEqual(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-21', 3, 1));
});
test('the listening room is complete', () => {
  assert.ok(LISTENING_ROOM.size.width > 0 && LISTENING_ROOM.size.height > 0 && LISTENING_ROOM.size.depth > 0);
  assert.deepEqual(Object.keys(LISTENING_ROOM.materials).sort(), ['back', 'down', 'front', 'left', 'right', 'up']);
});
test('the top of the arena is in front of the listener (-z), the right is +x', () => {
  const front = toSpatial(0, -R), right = toSpatial(R, 0), back = toSpatial(0, R);
  assert.ok(front.sz < 0 && Math.abs(front.sz + RADIUS_M) < 1e-9); assert.ok(back.sz > 0); assert.ok(right.sx > 0 && Math.abs(right.sx - RADIUS_M) < 1e-9); assert.equal(front.sy, 0);
  const p = polarToXY(0, 100); assert.ok(Math.abs(p.x) < 1e-9 && p.y < 0);   // angle 0 is straight up the screen
});
test('every path stays inside the arena, whatever the complexity and seed', () => {
  for (const c of ['simple', 'medium', 'complex']) for (let seed = 1; seed <= 12; seed++) {
    const rnd = mulberry32(seed), path = generatePath(c, 5, rnd() * 360, 1, rnd);
    assert.ok(path.length > 60); for (const q of path) assert.ok(Math.hypot(q.x, q.y) <= R * 0.99, `${c} ${seed}`);
  }
});
test('sampling is smooth between frames and clamps at the ends', () => {
  const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.equal(sampleAt(path, 0).x, 0); assert.equal(sampleAt(path, 1).y, 10); assert.equal(sampleAt(path, 5).y, 10); assert.equal(sampleAt(path, -3).x, 0);
  assert.ok(Math.abs(sampleAt(path, 0.25).x - 5) < 1e-9);
});
test('final positions respect the separation each level asks for', () => {
  for (const [sources, complexity, speed, minSep] of [[2, 'simple', 0.5, 120], [3, 'medium', 1.2, 60], [3, 'complex', 1.8, 15]]) for (let seed = 1; seed <= 8; seed++) {
    const paths = buildPaths({ sources, complexity, speed, minSep }, mulberry32(seed)); assert.equal(paths.length, sources);
    for (let i = 0; i < sources; i++) for (let j = i + 1; j < sources; j++) { const a = paths[i].at(-1), b = paths[j].at(-1); assert.ok(angularDist(pointAngle(a.x, a.y), pointAngle(b.x, b.y)) >= minSep - 1e-6 || Math.hypot(a.x - b.x, a.y - b.y) >= 26); }
  }
  const a = buildPaths({ sources: 3, complexity: 'medium', speed: 1, minSep: 60 }, mulberry32(9)), b = buildPaths({ sources: 3, complexity: 'medium', speed: 1, minSep: 60 }, mulberry32(9));
  assert.deepEqual(a, b);   // the day's challenge: the same seed gives the same paths
});
