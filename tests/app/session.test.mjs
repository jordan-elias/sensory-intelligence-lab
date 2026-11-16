import test from 'node:test'; import assert from 'node:assert/strict';
const calls = []; Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { vibrate: p => { calls.push(p); return true; } } });
const mem = new Map(); globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const { cue, setHaptics, hapticsOn, canVibrate } = await import('../../assets/js/app/session.js');
test('the end-of-session buzz always happens; phase buzzes only when turned on', () => {
  assert.ok(canVibrate()); assert.equal(hapticsOn(), false);
  assert.equal(cue('inhale'), false); assert.equal(calls.length, 0);
  assert.equal(cue('done'), true); assert.deepEqual(calls.at(-1), [140, 70, 140]);
  setHaptics(true); assert.ok(hapticsOn()); cue('exhale'); assert.deepEqual(calls.at(-1), [18]);
  assert.equal(cue('nonsense'), false);
});
