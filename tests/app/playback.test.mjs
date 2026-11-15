import test from 'node:test'; import assert from 'node:assert/strict';
import { createTracker, rms, AUDIBLE } from '../../assets/js/app/playback.js';
const make = () => { let t = 0; const log = []; const tr = createTracker({ onStart: () => log.push('start'), onStop: () => log.push('stop'), holdMs: 20000, now: () => t }); return { tr, log, at: ms => { t = ms; } }; };
test('sound starts the service once', () => { const { tr, log } = make(); tr.report(true); tr.report(true); assert.deepEqual(log, ['start']); assert.equal(tr.isOn(), true); });
test('a short gap does not stop it, a long silence does', () => {
  const { tr, log, at } = make(); at(0); tr.report(true); at(10000); tr.report(false); assert.deepEqual(log, ['start']);
  at(19999); tr.report(false); assert.deepEqual(log, ['start']); at(20000); tr.report(false); assert.deepEqual(log, ['start', 'stop']);
});
test('sound resumes after the gap: a new start', () => { const { tr, log, at } = make(); at(0); tr.report(true); at(30000); tr.report(false); at(31000); tr.report(true); assert.deepEqual(log, ['start', 'stop', 'start']); });
test('silence with nothing playing never starts it', () => { const { tr, log } = make(); tr.report(false); assert.deepEqual(log, []); });
test('pause from the notification stops it at once', () => { const { tr, log } = make(); tr.report(true); tr.reset(); tr.reset(); assert.deepEqual(log, ['start', 'stop']); });
test('level measure: silence is below the threshold, a tone is above', () => {
  assert.ok(rms(new Float32Array(256)) < AUDIBLE); assert.ok(rms(Float32Array.from({ length: 256 }, (_, i) => 0.1 * Math.sin(i))) > AUDIBLE); assert.equal(rms([]), 0);
});
test('the page code never records or sends audio', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../assets/js/app/playback.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/fetch\(|XMLHttp|sendBeacon|MediaRecorder|getUserMedia|WebSocket/.test(src));
});
