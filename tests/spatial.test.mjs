import test from 'node:test'; import assert from 'node:assert/strict';
import { trialSeed, ROOMS, DEFAULT_ROOM, roomKey } from '../assets/js/spatial/daily.js';
test('the same day, level and trial give the same seed; any change gives another', () => {
  assert.equal(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-21', 3, 0));
  assert.notEqual(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-22', 3, 0));
  assert.notEqual(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-21', 4, 0));
  assert.notEqual(trialSeed('2026-11-21', 3, 0), trialSeed('2026-11-21', 3, 1));
});
test('rooms are complete, the default exists, and unknown names fall back', () => {
  for (const r of Object.values(ROOMS)) { assert.ok(r.label && r.size.width > 0 && r.size.height > 0 && r.size.depth > 0); assert.deepEqual(Object.keys(r.materials).sort(), ['back', 'down', 'front', 'left', 'right', 'up']); }
  assert.ok(ROOMS[DEFAULT_ROOM]); assert.equal(roomKey('nope'), DEFAULT_ROOM); assert.equal(roomKey('hall'), 'hall'); assert.equal(roomKey('__proto__'), DEFAULT_ROOM);
});
