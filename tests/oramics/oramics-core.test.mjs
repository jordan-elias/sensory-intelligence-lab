import test from 'node:test';
import assert from 'node:assert/strict';
import { normToRange, rangeToNorm, scanColumns, emptyCurve, curveAt, snapHz, scaleNotes, voiceParams, voiceHz, midiOf, PITCH, SCALES } from '../../assets/js/oramics/curves.js';
import { floodFill, copyRegion, clearRegion, flipRegionH, flipRegionV, pasteRegion, sprayPoints, rectOf, squareTo } from '../../assets/js/oramics/raster.js';
import { createHistory } from '../../assets/js/oramics/history.js';

const img = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const put = (im, x, y, a = 255, c = [10, 20, 30]) => { const i = (y * im.width + x) * 4; im.data.set([...c, a], i); };

test('ranges are exponential and invert', () => {
  assert.ok(Math.abs(normToRange(0, PITCH) - 2000) < 1e-6); assert.ok(Math.abs(normToRange(1, PITCH) - 80) < 1e-6);
  for (const n of [0, 0.2, 0.5, 0.9, 1]) assert.ok(Math.abs(rangeToNorm(normToRange(n, PITCH), PITCH) - n) < 1e-9);
  assert.ok(Math.abs(normToRange(0.5, PITCH) - Math.sqrt(80 * 2000)) < 1e-6);
});
test('scanColumns finds the centre of marks, -1 for empty columns, and only the asked range', () => {
  const im = img(6, 10); for (let y = 2; y <= 4; y++) put(im, 1, y); put(im, 3, 9); put(im, 4, 0, 4);   // faint (alpha 4) pixel is ignored
  const c = emptyCurve(6); scanColumns(im, c, 0, 3);
  assert.ok(Math.abs(c[1] - 0.3) < 1e-6); assert.equal(c[0], -1); assert.ok(Math.abs(c[3] - 0.9) < 1e-6); assert.equal(c[4], -1);
  assert.equal(curveAt(c, 1.2), c[1]); assert.equal(curveAt(c, 99), c[5]); assert.equal(curveAt(null, 1), -1);
});
test('snapping lands on scale notes, and free glide leaves pitch alone', () => {
  const hz = 261.6 * Math.pow(2, 0.3 / 12);
  const s = snapHz(hz, 0, 'major'); assert.ok(Math.abs(midiOf(s) - 60) < 1e-6);
  const f = voiceParams({ pitch: 0.5, amp: 0.2, timbre: 0.5, mod: -1 }); assert.ok(Math.abs(f.hz - Math.sqrt(80 * 2000)) < 1e-6);
  const q = voiceParams({ pitch: 0.5, amp: 0.2, timbre: 0.5, mod: -1 }, { snap: { on: true, root: 0, scale: 'major' } });
  const pc = ((Math.round(midiOf(q.hz)) % 12) + 12) % 12; assert.ok(SCALES.major.includes(pc)); assert.ok(Math.abs(midiOf(q.hz) - Math.round(midiOf(q.hz))) < 1e-6);
  for (const m of scaleNotes(2, 'pentatonic')) assert.ok(SCALES.pentatonic.includes((((m - 2) % 12) + 12) % 12));
});
test('voice params: silence, fallback level, amp from height, modulation depth', () => {
  assert.equal(voiceParams({ pitch: -1, amp: 0.1, timbre: -1, mod: -1 }).amp, 0);
  assert.equal(voiceParams({ pitch: 0.4, amp: -1, timbre: -1, mod: -1 }).amp, 0.6);
  assert.ok(Math.abs(voiceParams({ pitch: 0.4, amp: 0.25, timbre: -1, mod: -1 }).amp - 0.75) < 1e-9);
  const m = voiceParams({ pitch: 0.4, amp: -1, timbre: 0.5, mod: 0 }); assert.equal(m.mod, 1); assert.equal(m.vibrato, 25); assert.equal(m.cutoff, Math.sqrt(200 * 8000));
  assert.equal(voiceHz(440, 1, 1), 440); assert.equal(voiceHz(440, 1, 3), 515); assert.equal(voiceHz(30, 3, 4), 20);
});
test('floodFill fills a bounded area and respects walls', () => {
  const im = img(8, 8); for (let i = 0; i < 8; i++) { put(im, 4, i); }   // a wall down column 4
  const n = floodFill(im, 1, 1, [200, 0, 0, 255]); assert.equal(n, 4 * 8);
  assert.equal(im.data[(1 * 8 + 0) * 4], 200); assert.equal(im.data[(1 * 8 + 6) * 4 + 3], 0);
  assert.equal(floodFill(im, 1, 1, [200, 0, 0, 255]), 0);   // already that colour
  assert.equal(floodFill(im, -1, 2, [1, 1, 1, 255]), 0);
});
test('flood fill with tolerance spreads across similar colours', () => {
  const im = img(4, 1); put(im, 0, 0, 255, [100, 0, 0]); put(im, 1, 0, 255, [104, 0, 0]); put(im, 2, 0, 255, [200, 0, 0]);
  assert.equal(floodFill(im, 0, 0, [0, 255, 0, 255], 5), 2);
});
test('regions: copy, flip, paste, clear', () => {
  const im = img(6, 4); put(im, 1, 1, 255, [1, 2, 3]); put(im, 2, 2, 255, [4, 5, 6]);
  const r = copyRegion(im, 1, 1, 2, 2); assert.equal(r.width, 2); assert.equal(r.height, 2);
  const h = flipRegionH(r), v = flipRegionV(r);
  assert.equal(h.data[(0 * 2 + 1) * 4], 1); assert.equal(v.data[(1 * 2 + 0) * 4], 1);
  assert.equal(flipRegionH(flipRegionH(r)).data.join(), r.data.join());
  clearRegion(im, 1, 1, 2, 2); assert.equal(im.data[(1 * 6 + 1) * 4 + 3], 0);
  pasteRegion(im, r, 3, 1); assert.equal(im.data[(1 * 6 + 3) * 4], 1); assert.equal(im.data[(2 * 6 + 4) * 4], 4);
  pasteRegion(im, r, 5, 3); pasteRegion(im, r, -9, -9);   // clipped, no throw
  assert.equal(copyRegion(im, 10, 10, 3, 3).width, 0);
});
test('paste over existing marks blends rather than punches holes', () => {
  const im = img(2, 1); put(im, 0, 0, 255, [50, 50, 50]); const reg = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 255]) };
  pasteRegion(im, reg, 0, 0); assert.equal(im.data[3], 255); assert.equal(im.data[0], 50); assert.equal(im.data[4], 9);
});
test('spray stays in its disc, rect helpers work any way round', () => {
  let s = 7; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const p of sprayPoints(10, 10, 5, 200, rand)) assert.ok(Math.hypot(p.x - 10, p.y - 10) <= 5 + 1e-9);
  assert.deepEqual(rectOf({ x: 5, y: 9 }, { x: 1, y: 2 }), { x: 1, y: 2, w: 4, h: 7 });
  const sq = squareTo({ x: 0, y: 0 }, { x: 10, y: -4 }); assert.equal(Math.abs(sq.x), Math.abs(sq.y));
});
test('history: undo, redo, per layer and across layers', () => {
  const h = createHistory({ max: 2 }); const state = { a: 'a0', b: 'b0' };
  h.record('a', state.a); state.a = 'a1'; h.record('b', state.b); state.b = 'b1'; h.record('a', state.a); state.a = 'a2';
  const cur = l => state[l];
  let e = h.undo('a', cur); assert.equal(e.img, 'a1'); state.a = e.img; assert.ok(h.canRedo('a')); assert.ok(!h.canRedo('b'));
  e = h.redo('a', cur); assert.equal(e.img, 'a2'); state.a = e.img;
  e = h.undo(null, cur); assert.equal(e.layer, 'a'); state.a = e.img;   // the most recent change anywhere
  e = h.undo(null, cur); assert.equal(e.layer, 'b'); assert.equal(e.img, 'b0');
  h.record('a', 'x'); assert.ok(!h.canRedo(null));   // a new change clears redo
  for (let i = 0; i < 5; i++) h.record('a', 'n' + i); assert.ok(h.sizes.undo <= 3);
  assert.equal(h.undo('zzz', cur), null);
});

import { cleanProject, cleanSettings, loadSlots, saveSlot, deleteSlot, KEY } from '../../assets/js/oramics/store.js';
import { makeMaster, createVoiceBank } from '../../assets/js/oramics/voices.js';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, m }; };
test('projects are validated; settings default to free glide', () => {
  assert.equal(cleanProject(null), null); assert.equal(cleanProject({ layers: {} }), null); assert.equal(cleanProject({ layers: { pitch: 'javascript:alert(1)' } }), null);
  const p = cleanProject({ name: '<b>x</b>', w: 900, h: 400, layers: { pitch: PNG, evil: PNG } }); assert.equal(p.name, 'bx/b'); assert.deepEqual(Object.keys(p.layers), ['pitch']);
  const s = cleanSettings({ wave: 'noise', voices: 99, snap: { on: 'yes', scale: 'nope' } }); assert.equal(s.wave, 'sine'); assert.equal(s.voices, 6); assert.equal(s.snap.on, false); assert.equal(s.snap.scale, 'major');
  assert.equal(cleanSettings(undefined).snap.on, false);
});
test('slots save, replace by name, cap, delete and survive bad storage', () => {
  const st = mem(); assert.deepEqual(loadSlots(st), []);
  assert.equal(saveSlot({ name: 'a', layers: { pitch: PNG } }, st).ok, true); assert.equal(saveSlot({ name: 'a', layers: { amp: PNG } }, st).ok, true);
  assert.equal(loadSlots(st).length, 1); assert.deepEqual(Object.keys(loadSlots(st)[0].layers), ['amp']);
  for (let i = 0; i < 12; i++) saveSlot({ name: 'n' + i, layers: { pitch: PNG } }, st); assert.equal(loadSlots(st).length, 8);
  deleteSlot('n11', st); assert.ok(!loadSlots(st).some(s => s.name === 'n11'));
  assert.equal(saveSlot({ name: 'e', layers: {} }, st).ok, false);
  st.setItem(KEY, '{not json'); assert.deepEqual(loadSlots(st), []);
  assert.equal(saveSlot({ name: 'q', layers: { pitch: PNG } }, { getItem: () => '[]', setItem() { throw new Error('quota'); } }).ok, false);
});
test('voice bank applies params with a fake audio context (live glide and offline step)', () => {
  const calls = []; const param = n => ({ value: 0, setTargetAtTime: (v, t, c) => calls.push(['t', n, v]), setValueAtTime: (v, t) => calls.push(['v', n, v]) });
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param('g'), frequency: param('f'), Q: { value: 0 }, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, fftSize: 0, type: '' });
  const ctx = { currentTime: 0, createOscillator: node, createGain: node, createBiquadFilter: node, createDynamicsCompressor: node, createAnalyser: node, destination: {} };
  const bank = createVoiceBank(ctx, {}, { count: 2 }); assert.equal(bank.voices.length, 2);
  bank.apply({ hz: 440, amp: 0.5, cutoff: 1000, vibrato: 0, fmDepth: 0, fmRate: 2 }, 1, { instant: true });
  assert.ok(calls.some(c => c[0] === 'v' && c[2] === 440) && calls.some(c => c[0] === 'v' && c[2] === 515));
  calls.length = 0; bank.apply({ hz: 0, amp: 0, cutoff: 2000, vibrato: 0, fmDepth: 0, fmRate: 2 }); assert.ok(calls.some(c => c[0] === 't' && c[2] === 0));
  bank.setCount(3); assert.equal(bank.voices.length, 3); assert.ok(makeMaster(ctx, { analyser: true }).analyser);
});
