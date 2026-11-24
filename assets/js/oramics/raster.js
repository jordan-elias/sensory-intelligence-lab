/**
 * /assets/js/oramics/raster.js
 * Paint-style raster operations on ImageData-like objects ({ width, height, data: Uint8ClampedArray RGBA }): flood fill, regions
 * (copy, flip, paste) and a spray pattern. Pure, so they can be tested without a canvas.
 */
const idx = (img, x, y) => (y * img.width + x) * 4;

/** Fills the connected area around (x, y) whose colour is within tol of the seed colour. Returns the number of pixels changed. */
export function floodFill(img, x, y, rgba, tol = 0) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
  const d = img.data, s = idx(img, x, y), seed = [d[s], d[s + 1], d[s + 2], d[s + 3]];
  if (seed.every((v, i) => v === rgba[i])) return 0;
  const near = i => Math.abs(d[i] - seed[0]) + Math.abs(d[i + 1] - seed[1]) + Math.abs(d[i + 2] - seed[2]) + Math.abs(d[i + 3] - seed[3]) <= tol * 4;
  const seen = new Uint8Array(img.width * img.height), stack = [x, y]; let n = 0;
  while (stack.length) {
    let cy = stack.pop(), cx = stack.pop();
    while (cx >= 0 && !seen[cy * img.width + cx] && near(idx(img, cx, cy)) && (cx--, true));   // walk left to the edge of the run
    cx++;
    let up = false, down = false;
    while (cx < img.width && !seen[cy * img.width + cx] && near(idx(img, cx, cy))) {
      const i = idx(img, cx, cy); d[i] = rgba[0]; d[i + 1] = rgba[1]; d[i + 2] = rgba[2]; d[i + 3] = rgba[3]; seen[cy * img.width + cx] = 1; n++;
      if (cy > 0) { const ok = !seen[(cy - 1) * img.width + cx] && near(idx(img, cx, cy - 1)); if (ok && !up) { stack.push(cx, cy - 1); up = true; } else if (!ok) up = false; }
      if (cy < img.height - 1) { const ok = !seen[(cy + 1) * img.width + cx] && near(idx(img, cx, cy + 1)); if (ok && !down) { stack.push(cx, cy + 1); down = true; } else if (!ok) down = false; }
      cx++;
    }
  }
  return n;
}

/** Copies a rectangle (clipped to the image) into a new { width, height, data }. */
export function copyRegion(img, x, y, w, h) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(img.width, Math.ceil(x + w)), y1 = Math.min(img.height, Math.ceil(y + h));
  const rw = Math.max(0, x1 - x0), rh = Math.max(0, y1 - y0), out = { width: rw, height: rh, data: new Uint8ClampedArray(rw * rh * 4), x: x0, y: y0 };
  for (let r = 0; r < rh; r++) out.data.set(img.data.subarray(idx(img, x0, y0 + r), idx(img, x0, y0 + r) + rw * 4), r * rw * 4);
  return out;
}
/** Clears a rectangle to transparent. */
export function clearRegion(img, x, y, w, h) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(img.width, Math.ceil(x + w)), y1 = Math.min(img.height, Math.ceil(y + h));
  for (let r = y0; r < y1; r++) img.data.fill(0, idx(img, x0, r), idx(img, x1, r));
}
/** Mirrors a region left to right (in time) — the tune backwards. Returns a new region. */
export function flipRegionH(reg) {
  const out = { ...reg, data: new Uint8ClampedArray(reg.data.length) };
  for (let r = 0; r < reg.height; r++) for (let c = 0; c < reg.width; c++) { const a = (r * reg.width + c) * 4, b = (r * reg.width + (reg.width - 1 - c)) * 4; out.data.set(reg.data.subarray(a, a + 4), b); }
  return out;
}
/** Mirrors a region top to bottom — the tune upside down (inverted pitch). Returns a new region. */
export function flipRegionV(reg) {
  const out = { ...reg, data: new Uint8ClampedArray(reg.data.length) };
  for (let r = 0; r < reg.height; r++) out.data.set(reg.data.subarray(r * reg.width * 4, (r + 1) * reg.width * 4), (reg.height - 1 - r) * reg.width * 4);
  return out;
}
/** Draws a region onto the image with its top-left at (x, y); transparent pixels leave the image as it was (alpha "over"). */
export function pasteRegion(img, reg, x, y) {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < reg.height; r++) for (let c = 0; c < reg.width; c++) {
    const tx = x + c, ty = y + r; if (tx < 0 || ty < 0 || tx >= img.width || ty >= img.height) continue;
    const s = (r * reg.width + c) * 4, t = idx(img, tx, ty), sa = reg.data[s + 3] / 255; if (!sa) continue;
    const ta = img.data[t + 3] / 255, oa = sa + ta * (1 - sa);
    for (let k = 0; k < 3; k++) img.data[t + k] = Math.round((reg.data[s + k] * sa + img.data[t + k] * ta * (1 - sa)) / (oa || 1));
    img.data[t + 3] = Math.round(oa * 255);
  }
}
/** Points for an airbrush dab: n points spread evenly over a disc of radius r. */
export function sprayPoints(cx, cy, r, n, rand = Math.random) {
  const pts = []; for (let i = 0; i < n; i++) { const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r; pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d }); }
  return pts;
}
/** The rectangle between two corners, any way round: { x, y, w, h }. */
export const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
/** Snaps b so the rectangle from a is square (for Shift while dragging). */
export function squareTo(a, b) { const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)); return { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s }; }
