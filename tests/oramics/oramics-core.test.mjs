import test from 'node:test';
import assert from 'node:assert/strict';
import { floodFill, copyRegion, clearRegion, flipRegionH, flipRegionV, pasteRegion, sprayPoints, rectOf, squareTo } from '../../assets/js/oramics/raster.js';
import { createHistory } from '../../assets/js/oramics/history.js';

const img = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const put = (im, x, y, a = 255, c = [10, 20, 30]) => { const i = (y * im.width + x) * 4; im.data.set([...c, a], i); };

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

