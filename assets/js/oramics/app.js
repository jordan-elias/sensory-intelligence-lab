/**
 * /assets/js/oramics/app.js
 * The Oramics page: a painting canvas where each ink is a layer and a part of the music.
 * Layers are coloured paint on their own canvases; the music is read from their transparency only (scan.js), so recolouring an ink
 * never changes what it plays. Everything stays in this browser.
 */
import { INKS, INK_ORDER, inkColor } from './inks.js';
import { SCALES, NOTE_NAMES, scaleNotes, hzAt } from './music.js';
import { emptyScan, scanLayer, runsAt, onsetsAt, melodyAt } from './scan.js';
import { createEngine, renderPiece, encodeWav } from './engine.js';
import { STARTERS, starterMarks, surprise } from './starters.js';
import { floodFill, sprayPoints, rectOf, squareTo } from './raster.js';
import { createHistory } from './history.js';
import { createProgress } from '/assets/js/experiments/progress.js';
import { putAudio } from '/assets/js/experiments/shelf-audio.js';
import { cleanProject, cleanSettings, saveSlot, loadSlots, deleteSlot, saveDraft, loadDraft, clearDraft } from './store.js';

const $ = id => document.getElementById(id);
const cv = $('stage'), g = cv.getContext('2d'), wrap = $('stageWrap');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const portrait = innerWidth < 861;

const S = {
  w: portrait ? 960 : 1280, h: portrait ? 960 : 800,
  ink: 'melody', tool: 'brush', size: 16, echo: 1, echoGap: 0.12, mirror: false, filled: false, guides: true,
  settings: cleanSettings({ shade: {}, mix: {} }), playing: false, solo: null, seed: 1,
};
const layers = {}, an = {}, dirty = {};
const hist = createHistory({ max: 12 });
let ctx = null, engine = null, timer = 0, t0 = 0, nextCol = 0, nextTime = 0, lastShown = 0, raf = 0, painted = false, saveTimer = 0, previewMark = null;
const ripples = [];

/* ── layers ── */
function makeLayers() {
  for (const id of INK_ORDER) {
    const c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
    layers[id] = { cv: c, g: c.getContext('2d', { willReadFrequently: true }) }; an[id] = emptyScan(S.w, S.h); dirty[id] = null;
  }
}
const colour = id => inkColor(id, S.settings.shade[id]);
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function recolour(id) { const l = layers[id]; l.g.globalCompositeOperation = 'source-in'; l.g.fillStyle = colour(id); l.g.fillRect(0, 0, S.w, S.h); l.g.globalCompositeOperation = 'source-over'; }
function touch(id, x0, x1) { const d = dirty[id]; x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(S.w - 1, Math.ceil(x1)); dirty[id] = d ? [Math.min(d[0], x0), Math.max(d[1], x1)] : [x0, x1]; }
function flush(id) {
  const d = dirty[id]; if (!d) return; dirty[id] = null;
  const w = d[1] - d[0] + 1, sub = layers[id].g.getImageData(d[0], 0, w, S.h), tmp = scanLayer(sub, emptyScan(w, S.h));
  for (let i = 0; i < w; i++) an[id].runs[d[0] + i] = tmp.runs[i];
}
const flushAll = () => INK_ORDER.forEach(flush);
const alphaOf = id => { const d = layers[id].g.getImageData(0, 0, S.w, S.h).data, a = new Uint8Array(S.w * S.h); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; };
function putAlpha(id, a) {
  const [r, gg, b] = hex(colour(id)), im = layers[id].g.createImageData(S.w, S.h), d = im.data;
  for (let i = 0; i < a.length; i++) { const o = i * 4; if (a[i]) { d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = a[i]; } }
  layers[id].g.putImageData(im, 0, 0); touch(id, 0, S.w - 1); flush(id);
}
const snapshot = id => (id === 'all' ? Object.fromEntries(INK_ORDER.map(k => [k, alphaOf(k)])) : alphaOf(id));
const restore = (id, snap) => { if (id === 'all') INK_ORDER.forEach(k => putAlpha(k, snap[k])); else putAlpha(id, snap); };
function record(id) { hist.record(id, snapshot(id)); syncHistory(); scheduleSave(); }
function syncHistory() { $('undo').disabled = !hist.canUndo(null); $('redo').disabled = !hist.canRedo(null); }
function doUndo(redo) { const r = (redo ? hist.redo : hist.undo)(null, snapshot); if (r) { restore(r.layer, r.img); invalidate(); scheduleSave(); } syncHistory(); }

/* ── drawing ── */
const copies = () => { const out = []; for (let i = 0; i < S.echo; i++) for (const m of (S.mirror ? [false, true] : [false])) out.push({ dx: i * S.echoGap * S.w, m }); return out; };
function withCopies(c, fn) { for (const k of copies()) { c.save(); c.translate(k.dx, 0); if (k.m) { c.translate(0, S.h); c.scale(1, -1); } fn(c); c.restore(); } }
function paintStyle(c, erase) { c.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; c.fillStyle = c.strokeStyle = erase ? '#000' : colour(S.ink); c.lineCap = c.lineJoin = 'round'; }
const bounds = pts => { let a = Infinity, b = -Infinity; for (const p of pts) { a = Math.min(a, p.x); b = Math.max(b, p.x); } return [a, b]; };
function spanOf(pts, pad) { const [a, b] = bounds(pts), n = S.echo, lo = a - pad, hi = b + pad + (n - 1) * S.echoGap * S.w; return [lo, hi]; }

function dotAt(c, p, r) { c.beginPath(); c.arc(p.x, p.y, Math.max(1, r), 0, 7); c.fill(); }
function strokePath(c, pts, w) { c.lineWidth = w; if (pts.length === 1) { dotAt(c, pts[0], w / 2); return; } c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2); const l = pts.at(-1); c.lineTo(l.x, l.y); c.stroke(); }
function shapePath(c, kind, a, b, w, filled) {
  c.lineWidth = w;
  if (kind === 'line') { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); return; }
  const r = rectOf(a, b); c.beginPath();
  if (kind === 'rect') c.rect(r.x, r.y, r.w, r.h); else c.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
  filled ? c.fill() : c.stroke();
}

/* ── pointer handling ── */
let drag = null;
const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * S.w / r.width, y: (e.clientY - r.top) * S.h / r.height }; };
const pressure = e => (e.pointerType === 'pen' && e.pressure > 0 ? 0.35 + 0.65 * e.pressure : 1);
let lastAud = 0;
function audition(p) {
  if (S.playing || !engine || S.tool === 'erase' || S.tool === 'move' || S.tool === 'fill') return;
  const now = performance.now(); if (now - lastAud < 90) return; lastAud = now;
  engine.audition(S.ink, Math.max(0, Math.min(1, p.y / S.h)), { snap: S.settings.snap, root: S.settings.root, scale: S.settings.scale });
}
function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { say('This browser cannot make sound.'); return false; }
  ctx = new AC(); engine = createEngine(ctx); applyAll(); return true;
}
function applyAll() {
  if (!engine) return;
  for (const id of INK_ORDER) { engine.setShade(id, S.settings.shade[id]); engine.setMix(id, S.settings.mix[id], true); }
  engine.setSolo(S.solo, true); engine.setSpace(S.settings.space);
}

cv.addEventListener('pointerdown', e => {
  if (e.button > 0 && e.pointerType === 'mouse') return;
  cv.setPointerCapture(e.pointerId); ensureAudio(); hideEmpty();
  const p = pos(e), id = S.ink, erase = S.tool === 'erase'; flush(id);
  if (S.tool === 'fill') { record(id); fillAt(p); drag = null; return; }
  record(id);
  drag = { id, pts: [p], a: p, last: p, origin: S.tool === 'move' ? alphaOf(id) : null, erase };
  if (S.tool === 'brush' || erase) { const l = layers[id].g, w = S.size * pressure(e); withCopies(l, c => { paintStyle(c, erase); dotAt(c, p, w / 2); }); touch(id, ...spanOf([p], w)); }
  else if (S.tool === 'dots') dab(p, pressure(e));
  else if (S.tool === 'spray') spray(p);
  audition(p); invalidate();
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs.push(e);
  for (const ev of evs) step(pos(ev), pressure(ev), ev.shiftKey);
  audition(pos(e)); invalidate();
});
const end = e => { if (!drag) return; const p = pos(e); if (['line', 'rect', 'ellipse'].includes(S.tool)) commitShape(p, e.shiftKey); flush(drag.id); previewMark = null; drag = null; painted = true; invalidate(); scheduleSave(); };
cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

function step(p, pr, shift) {
  const d = drag, l = layers[d.id].g;
  if (S.tool === 'brush' || d.erase) {
    d.pts.push(p); const w = S.size * pr, pts = d.pts.slice(-3);
    withCopies(l, c => { paintStyle(c, d.erase); strokePath(c, pts.length === 3 ? [{ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, pts[1], { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 }] : pts, w); });
    touch(d.id, ...spanOf(pts, w)); if (S.playing) flush(d.id);
  } else if (S.tool === 'dots') {
    const gap = Math.max(10, S.size * 2.4); let q = d.last, dist = Math.hypot(p.x - q.x, p.y - q.y);
    while (dist >= gap) { const f = gap / dist; q = { x: q.x + (p.x - q.x) * f, y: q.y + (p.y - q.y) * f }; dab(q, pr); dist = Math.hypot(p.x - q.x, p.y - q.y); }
    d.last = q;
  } else if (S.tool === 'spray') spray(p);
  else if (S.tool === 'move') moveBy(p.x - d.a.x, p.y - d.a.y);
  else { previewMark = { kind: S.tool, a: d.a, b: shift && S.tool !== 'line' ? squareTo(d.a, p) : p, ink: d.id }; }
}
function dab(p, pr) { const r = S.size * pr / 2 + 1, id = drag.id; withCopies(layers[id].g, c => { paintStyle(c, false); dotAt(c, p, r); }); touch(id, ...spanOf([p], r)); if (S.playing) flush(id); }
function spray(p) {
  const r = S.size * 1.6, id = drag.id, dr = Math.max(1.2, S.size / 7);
  const pts = sprayPoints(p.x, p.y, r, 14); withCopies(layers[id].g, c => { paintStyle(c, drag.erase); for (const q of pts) dotAt(c, q, dr); }); touch(id, ...spanOf([p], r + dr)); if (S.playing) flush(id);
}
function commitShape(p, shift) {
  const id = drag.id, b = shift && S.tool !== 'line' ? squareTo(drag.a, p) : p;
  withCopies(layers[id].g, c => { paintStyle(c, false); shapePath(c, S.tool, drag.a, b, S.size, S.filled); });
  touch(id, ...spanOf([drag.a, b], S.size));
}
function moveBy(dx, dy) {
  const id = drag.id, src = drag.origin, out = new Uint8Array(src.length), ox = Math.round(dx), oy = Math.round(dy), w = S.w, h = S.h;
  for (let y = 0; y < h; y++) { const sy = y - oy; if (sy < 0 || sy >= h) continue; for (let x = 0; x < w; x++) { const sx = (((x - ox) % w) + w) % w; out[y * w + x] = src[sy * w + sx]; } }
  putAlpha(id, out); invalidate();
}
function fillAt(p) {
  const id = S.ink, l = layers[id].g, im = l.getImageData(0, 0, S.w, S.h), [r, gg, b] = hex(colour(id));
  const n = floodFill(im, Math.round(p.x), Math.round(p.y), [r, gg, b, 255], 24); if (n) { l.putImageData(im, 0, 0); touch(id, 0, S.w - 1); flush(id); painted = true; scheduleSave(); }
  invalidate();
}

/* ── showing the picture ── */
const paperCol = () => (S.settings.paper === 'light' ? '#f6f3ea' : '#15151d');
function invalidate() { if (!raf && !S.playing) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function curPos() { if (!S.playing || !ctx) return 0; const el = Math.max(0, ctx.currentTime - t0 - (ctx.outputLatency || 0)), d = S.settings.seconds; return S.settings.loop ? (el / d) % 1 : Math.min(1, el / d); }

function drawGuides(c) {
  const light = S.settings.paper === 'light', ink = light ? '0,0,0' : '255,255,255';
  c.lineWidth = 1; c.font = '12px system-ui,sans-serif'; c.textBaseline = 'middle';
  for (let i = 1; i < 16; i++) { c.strokeStyle = `rgba(${ink},${i % 4 ? 0.035 : 0.08})`; c.beginPath(); c.moveTo(Math.round(i * S.w / 16) + 0.5, 0); c.lineTo(Math.round(i * S.w / 16) + 0.5, S.h); c.stroke(); }
  if (S.ink === 'rhythm') {
    const zs = [['open hat', 0.18], ['hat', 0.38], ['snare', 0.58], ['tom', 0.78], ['kick', 1]]; let y0 = 0;
    zs.forEach(([n, to], i) => { c.fillStyle = `rgba(${ink},${i % 2 ? 0.03 : 0})`; c.fillRect(0, y0 * S.h, S.w, (to - y0) * S.h); c.fillStyle = `rgba(${ink},.38)`; c.fillText(n, 8, ((y0 + to) / 2) * S.h); y0 = to; });
  } else if (S.ink !== 'texture') {
    const r = INKS[S.ink].range, root = S.settings.root, sc = S.settings.scale;
    for (const m of scaleNotes(root, sc, r.lo, r.hi)) {
      const hz = 440 * Math.pow(2, (m - 69) / 12), y = (1 - Math.log(hz / r.lo) / Math.log(r.hi / r.lo)) * S.h, tonic = ((m - root) % 12 + 12) % 12 === 0;
      c.strokeStyle = `rgba(${ink},${tonic ? 0.15 : 0.05})`; c.beginPath(); c.moveTo(0, Math.round(y) + 0.5); c.lineTo(S.w, Math.round(y) + 0.5); c.stroke();
      if (tonic) { c.fillStyle = `rgba(${ink},.4)`; c.fillText(NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1), 8, y - 8); }
    }
  }
}
function render(showUI = true) {
  const c = g, light = S.settings.paper === 'light', p = curPos();
  c.fillStyle = paperCol(); c.fillRect(0, 0, S.w, S.h);
  if (showUI && S.guides) drawGuides(c);
  for (const id of INK_ORDER) { const m = S.settings.mix[id], quiet = m.mute || (S.solo && S.solo !== id); c.globalAlpha = quiet ? 0.2 : (S.playing || id === S.ink ? 1 : 0.92); c.drawImage(layers[id].cv, 0, 0); }
  c.globalAlpha = 1;
  if (previewMark && showUI) { c.save(); c.globalAlpha = 0.65; withCopies(c, k => { k.fillStyle = k.strokeStyle = colour(previewMark.ink); k.lineCap = 'round'; shapePath(k, previewMark.kind, previewMark.a, previewMark.b, S.size, S.filled); }); c.restore(); }
  if (S.playing && showUI) drawPlayhead(c, p, light);
  if (S.playing || ripples.length) drawRipples(c);
}
function drawPlayhead(c, p, light) {
  const x = p * S.w, tone = light ? '20,20,30' : '255,255,255', gr = c.createLinearGradient(x - 120, 0, x, 0);
  gr.addColorStop(0, `rgba(${tone},0)`); gr.addColorStop(1, `rgba(${tone},${light ? 0.1 : 0.12})`); c.fillStyle = gr; c.fillRect(x - 120, 0, 120, S.h);
  c.fillStyle = `rgba(${tone},.85)`; c.fillRect(x - 1, 0, 2, S.h);
  for (const id of INK_ORDER) {
    if (id === 'rhythm') continue; const rs = runsAt(an[id], x); if (!rs.length) continue;
    c.fillStyle = colour(id); c.strokeStyle = light ? '#222' : '#fff'; c.lineWidth = 2;
    for (const r of id === 'texture' ? [rs[0]] : id === 'harmony' ? rs : [rs.reduce((a, b) => (b.size > a.size ? b : a))]) { c.beginPath(); c.arc(x, r.c * S.h, 7 + Math.min(8, r.size * 80), 0, 7); c.fill(); c.stroke(); }
  }
  // drum hits since the last frame become ripples
  const from = Math.floor(lastShown * S.w), to = Math.floor(x); let prev = runsAt(an.rhythm, from);
  if (to >= from && to - from < S.w / 2) for (let i = from + 1; i <= to; i++) { const rs = runsAt(an.rhythm, i); for (const h of onsetsAt(prev, rs)) ripples.push({ x: i, y: h.c * S.h, t: performance.now(), v: h.vel }); prev = rs; }
  lastShown = p;
}
function drawRipples(c) {
  const now = performance.now(); for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i], k = (now - r.t) / 520; if (k >= 1) { ripples.splice(i, 1); continue; } c.strokeStyle = colour('rhythm'); c.globalAlpha = (1 - k) * 0.9; c.lineWidth = 3 * (1 - k) + 1; c.beginPath(); c.arc(r.x, r.y, 10 + 46 * k * r.v, 0, 7); c.stroke(); }
  c.globalAlpha = 1;
}
function loop() { if (!S.playing) return; render(); updateTime(); raf = requestAnimationFrame(loop); }
function updateTime() { $('durOut').textContent = S.playing ? `${(curPos() * S.settings.seconds).toFixed(0)} / ${S.settings.seconds} s` : `${S.settings.seconds} s`; }

/* ── playing ── */
const LOOK = 0.2;
function play() {
  if (!ensureAudio()) return; flushAll(); applyAll(); engine.resetMemory();
  S.playing = true; t0 = ctx.currentTime + 0.08; nextCol = 0; nextTime = t0; lastShown = 0;
  timer = setInterval(tick, 25); tick(); setPlayUI(true); raf = requestAnimationFrame(loop);
}
function tick() {
  const per = S.settings.seconds / S.w, st = { snap: S.settings.snap, root: S.settings.root, scale: S.settings.scale };
  while (nextTime < ctx.currentTime + LOOK) {
    if (nextCol >= S.w) { if (S.settings.loop) { nextCol = 0; engine.wrap(); } else { if (nextTime > ctx.currentTime + 0.3) break; stop(); return; } }
    flush('melody'); engine.column(nextCol, nextTime, per, an, st); nextCol++; nextTime += per;
  }
}
function stop() {
  clearInterval(timer); timer = 0; if (engine) engine.silence(ctx.currentTime); S.playing = false; cancelAnimationFrame(raf); raf = 0; ripples.length = 0; setPlayUI(false); updateTime(); render();
}
function setPlayUI(on) {
  $('playLbl').textContent = on ? 'Stop' : 'Play'; $('btnPlay').setAttribute('aria-label', on ? 'Stop' : 'Play');
  $('icPlay').innerHTML = on ? '<rect width="10" height="10" y="1"/>' : '<path d="M0 0l10 6L0 12z"/>';
}
const toggle = () => (S.playing ? stop() : play());

/* ── ink and tool UI ── */
function buildInks() {
  $('inks').innerHTML = INK_ORDER.map((id, i) => `<div class="ink" data-ink="${id}" style="--ink-c:${colour(id)}"><button type="button" class="ink-main" role="radio" aria-checked="false" aria-label="${INKS[id].name} ink (${i + 1})"><span class="dot"></span><span class="ink-t"><b>${INKS[id].name}</b><span>${INKS[id].role}</span></span></button><button type="button" class="ink-btn" data-act="mute" aria-pressed="false" aria-label="Mute ${INKS[id].name}">M</button><button type="button" class="ink-btn" data-act="solo" aria-pressed="false" aria-label="Solo ${INKS[id].name}">S</button></div>`).join('');
}
function syncInks() {
  for (const row of $('inks').children) {
    const id = row.dataset.ink, on = id === S.ink, m = S.settings.mix[id];
    row.dataset.on = on; row.style.setProperty('--ink-c', colour(id)); row.querySelector('.ink-main').setAttribute('aria-checked', on);
    row.querySelector('[data-act=mute]').setAttribute('aria-pressed', m.mute); row.querySelector('[data-act=solo]').setAttribute('aria-pressed', S.solo === id);
  }
  const k = INKS[S.ink]; $('inkHow').textContent = k.role + ' ' + k.how;
  $('shades').innerHTML = k.shades.map((s, i) => `<button type="button" class="shade" aria-pressed="${S.settings.shade[S.ink] === i}" data-shade="${i}" style="--sh:${s.color}"><i></i>${s.name}</button>`).join('');
  const v = S.settings.mix[S.ink].vol; $('inkVol').value = v; $('inkVolOut').textContent = Math.round(v * 100);
  $('inkVol').setAttribute('aria-label', k.name + ' volume');
}
function setInk(id) { S.ink = id; syncInks(); invalidate(); }
function setTool(t) { S.tool = t; cv.dataset.tool = t; for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', b.dataset.tool === t); }
function say(t) { $('msg').textContent = t; }
const INTRO_KEY = 'sil.oramics.intro.v1';
function hideEmpty() { $('empty').hidden = true; }
/** The "paint here" card with starters is for the very first visit only. After that the canvas opens blank, even after Clear. */
function introOnce() {
  let seen = false;
  try { seen = !!localStorage.getItem(INTRO_KEY); localStorage.setItem(INTRO_KEY, '1'); } catch { /* storage blocked: show it, nothing to remember */ }
  if (seen) hideEmpty();
}

function setShade(id, i) {
  S.settings.shade[id] = i; recolour(id); if (engine) engine.setShade(id, i); syncInks(); invalidate(); scheduleSave();
}
function setMix(id, m) { Object.assign(S.settings.mix[id], m); if (engine) engine.setMix(id, m); syncInks(); invalidate(); scheduleSave(); }
function setSolo(id) { S.solo = S.solo === id ? null : id; if (engine) engine.setSolo(S.solo); syncInks(); invalidate(); }

/* ── pictures ── */
function drawMarks(marks, clear = true) {
  if (clear) for (const id of INK_ORDER) { layers[id].g.clearRect(0, 0, S.w, S.h); touch(id, 0, S.w - 1); }
  const keep = { echo: S.echo, mirror: S.mirror }; S.echo = 1; S.mirror = false;
  for (const m of marks) {
    const l = layers[m.ink].g, old = S.ink; S.ink = m.ink; const pts = m.pts.map(([x, y]) => ({ x: x * S.w, y: y * S.h })), w = m.size * S.h;
    paintStyle(l, false); if (m.kind === 'dots') for (const p of pts) dotAt(l, p, w / 2); else strokePath(l, pts, w); S.ink = old; touch(m.ink, ...bounds(pts).map((v, i) => v + (i ? w : -w)));
  }
  S.echo = keep.echo; S.mirror = keep.mirror; flushAll(); painted = true; hideEmpty(); invalidate(); scheduleSave();
}
function startFrom(marks, label) { stop(); INK_ORDER.forEach(id => record(id)); drawMarks(marks); say(label); }
function project(name) {
  flushAll(); const out = { v: 2, name: name || $('pname').value.trim() || 'Untitled', w: S.w, h: S.h, layers: {}, settings: S.settings };
  for (const id of INK_ORDER) if (an[id].runs.some(Boolean)) out.layers[id] = layers[id].cv.toDataURL('image/png'); return out;
}
async function loadProject(p) {
  const clean = cleanProject(p); if (!clean) { say('That file is not an Oramics picture.'); return false; }
  stop(); S.w = clean.w; S.h = clean.h; cv.width = S.w; cv.height = S.h; makeLayers(); S.settings = clean.settings; S.solo = null;
  await Promise.all(INK_ORDER.map(id => new Promise(res => { const u = clean.layers[id]; if (!u) return res(); const im = new Image(); im.onload = () => { layers[id].g.drawImage(im, 0, 0, S.w, S.h); recolour(id); touch(id, 0, S.w - 1); flush(id); res(); }; im.onerror = res; im.src = u; })));
  applyAll(); syncSettings(); syncInks(); fit(); painted = true; hideEmpty(); invalidate(); $('pname').value = clean.name; return true;
}
function drawSlots() {
  const list = loadSlots(); $('slots').innerHTML = list.map(s => `<div class="slot"><button type="button" class="name" data-open="${encodeURIComponent(s.name)}">${s.name.replace(/[&<]/g, '')}</button><button type="button" class="del" data-del="${encodeURIComponent(s.name)}" aria-label="Delete ${s.name.replace(/[&<"]/g, '')}">×</button></div>`).join('');
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (painted) saveDraft(project('Draft')); }, 1500); }
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const fname = () => ($('pname').value.trim() || 'oramics').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 40) || 'oramics';

async function renderWav() {
  flushAll(); const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buf = await renderPiece({ Offline: Off, sampleRate: 44100, an, w: S.w, seconds: S.settings.seconds, settings: { snap: S.settings.snap, root: S.settings.root, scale: S.settings.scale }, mix: S.settings.mix, shade: S.settings.shade, space: S.settings.space });
  return new Blob([encodeWav(buf)], { type: 'audio/wav' });
}
async function exportWav() {
  say('Rendering the sound…');
  try { download(fname() + '.wav', await renderWav()); say('Saved as a WAV file.'); } catch { say('The sound could not be rendered in this browser.'); }
}
/** Keeps the piece in My seeds (Experiments in Creativity): a recording stored on this device only. */
async function keepSeed() {
  if (!painted) { say('Paint something first.'); return; }
  say('Keeping it as a seed…'); let id = null, pr = null;
  try {
    pr = createProgress({ storage: localStorage }); const blob = await renderWav();
    id = pr.keep({ exp: 'oramics', kind: 'audio', title: $('pname').value.trim() || 'Oramics picture', secs: Math.round(S.settings.seconds) }); await putAudio(id, blob);
    say('Kept in My seeds, on this device only. You will find it in Experiments in Creativity.');
  } catch { if (id && pr) pr.unkeep(id); say('This browser would not let it be kept. Save it as a WAV file instead.'); }
}
function exportPng() { render(false); cv.toBlob(b => { download(fname() + '.png', b); say('Saved as an image.'); render(); }); }

/* ── settings controls ── */
function syncSettings() {
  const s = S.settings; $('dur').value = s.seconds; updateTime(); $('key').value = s.root; $('scale').value = s.scale; $('space').value = s.space; $('spaceOut').textContent = Math.round(s.space * 100);
  $('snap').setAttribute('aria-pressed', s.snap.on); $('btnLoop').setAttribute('aria-pressed', s.loop); $('paper').setAttribute('aria-pressed', s.paper === 'light'); $('guides').setAttribute('aria-pressed', S.guides);
  cv.style.background = paperCol();
}
function fit() {
  const pad = innerWidth < 861 ? 0 : 24, w = wrap.clientWidth - pad, h = wrap.clientHeight - pad; if (w <= 0) return;
  const k = innerWidth < 861 ? w / S.w : Math.min(w / S.w, (h > 100 ? h : 9999) / S.h);
  cv.style.width = Math.floor(S.w * k) + 'px'; cv.style.height = Math.floor(S.h * k) + 'px';
}

function wire() {
  $('tools').addEventListener('click', e => { const b = e.target.closest('.tool'); if (b) setTool(b.dataset.tool); });
  $('inks').addEventListener('click', e => {
    const row = e.target.closest('.ink'); if (!row) return; const id = row.dataset.ink, a = e.target.closest('.ink-btn');
    if (!a) setInk(id); else if (a.dataset.act === 'mute') setMix(id, { mute: !S.settings.mix[id].mute }); else setSolo(id);
  });
  $('shades').addEventListener('click', e => { const b = e.target.closest('.shade'); if (b) { ensureAudio(); setShade(S.ink, +b.dataset.shade); engine && engine.audition(S.ink, 0.5, { snap: S.settings.snap, root: S.settings.root, scale: S.settings.scale }); } });
  $('inkVol').addEventListener('input', e => { $('inkVolOut').textContent = Math.round(e.target.value * 100); setMix(S.ink, { vol: +e.target.value }); });
  $('brushSize').addEventListener('input', e => { S.size = +e.target.value; $('brushOut').textContent = S.size; });
  $('echoN').addEventListener('change', e => { S.echo = +e.target.value; });
  $('echoGap').addEventListener('input', e => { S.echoGap = e.target.value / 100; $('echoGapOut').textContent = e.target.value + '%'; });
  $('mirror').addEventListener('click', e => { S.mirror = !S.mirror; e.currentTarget.setAttribute('aria-pressed', S.mirror); });
  $('filled').addEventListener('click', e => { S.filled = !S.filled; e.currentTarget.setAttribute('aria-pressed', S.filled); });
  $('btnPlay').addEventListener('click', toggle);
  $('btnLoop').addEventListener('click', () => { S.settings.loop = !S.settings.loop; syncSettings(); });
  $('undo').addEventListener('click', () => doUndo(false)); $('redo').addEventListener('click', () => doUndo(true));
  $('dur').addEventListener('input', e => {
    const old = S.settings.seconds, p = curPos(); S.settings.seconds = +e.target.value; if (S.playing) t0 = ctx.currentTime - p * S.settings.seconds; updateTime(); scheduleSave(); void old;
  });
  $('key').innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join(''); $('scale').innerHTML = Object.keys(SCALES).map(k => `<option>${k}</option>`).join('');
  $('key').addEventListener('change', e => { S.settings.root = +e.target.value; invalidate(); scheduleSave(); }); $('scale').addEventListener('change', e => { S.settings.scale = e.target.value; invalidate(); scheduleSave(); });
  $('snap').addEventListener('click', () => { S.settings.snap.on = !S.settings.snap.on; syncSettings(); scheduleSave(); });
  $('space').addEventListener('input', e => { S.settings.space = +e.target.value; $('spaceOut').textContent = Math.round(S.settings.space * 100); if (engine) engine.setSpace(S.settings.space); scheduleSave(); });
  $('guides').addEventListener('click', () => { S.guides = !S.guides; syncSettings(); invalidate(); });
  $('paper').addEventListener('click', () => { S.settings.paper = S.settings.paper === 'light' ? 'dark' : 'light'; syncSettings(); invalidate(); scheduleSave(); });
  const surpriseMe = () => { ensureAudio(); S.seed = (S.seed * 48271 + Date.now()) % 99991; startFrom(surprise(S.seed), 'A new picture. Paint over it, or press Play.'); };
  $('btnSurprise').addEventListener('click', surpriseMe); $('btnSurprise2').addEventListener('click', surpriseMe);
  document.querySelectorAll('[data-starter]').forEach(b => b.addEventListener('click', () => { ensureAudio(); startFrom(starterMarks(b.dataset.starter), STARTERS.find(s => s.id === b.dataset.starter).blurb); }));
  $('starter').addEventListener('change', e => { if (e.target.value) { startFrom(starterMarks(e.target.value), STARTERS.find(s => s.id === e.target.value).blurb); e.target.value = ''; } });
  $('clearInk').addEventListener('click', () => { record(S.ink); layers[S.ink].g.clearRect(0, 0, S.w, S.h); touch(S.ink, 0, S.w - 1); flush(S.ink); invalidate(); say(INKS[S.ink].name + ' cleared. Undo brings it back.'); });
  const clearAll = () => { record('all'); for (const id of INK_ORDER) { layers[id].g.clearRect(0, 0, S.w, S.h); touch(id, 0, S.w - 1); flush(id); } painted = false; clearDraft(); invalidate(); say('Cleared. Undo brings it back.'); };
  $('clearAll').addEventListener('click', clearAll); $('clearBar').addEventListener('click', clearAll);
  $('btnSave').addEventListener('click', () => { const r = saveSlot(project()); say(r.ok ? 'Kept on this device.' : r.error); drawSlots(); });
  $('slots').addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
    if (o) { const p = loadSlots().find(s => s.name === decodeURIComponent(o.dataset.open)); if (p && await loadProject(p)) say('Opened.'); }
    if (d) { deleteSlot(decodeURIComponent(d.dataset.del)); drawSlots(); }
  });
  $('btnWav').addEventListener('click', exportWav); $('btnPng').addEventListener('click', exportPng); $('btnSeed').addEventListener('click', keepSeed);
  $('btnFile').addEventListener('click', () => download(fname() + '.oramics.json', new Blob([JSON.stringify(project())], { type: 'application/json' })));
  $('btnOpen').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 8e6) { say('That file is too big to be a picture.'); return; }
    try { if (await loadProject(JSON.parse(await f.text()))) say('Opened ' + f.name + '.'); } catch { say('That file could not be read.'); }
  });
  addEventListener('resize', fit); if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(e.shiftKey); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(true); } return; }
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (e.altKey) return; const k = e.key;
    if (k === ' ' && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); toggle(); return; }
    if (/^[1-5]$/.test(k)) { setInk(INK_ORDER[+k - 1]); return; }
    const tools = { b: 'brush', d: 'dots', l: 'line', r: 'rect', o: 'ellipse', s: 'spray', f: 'fill', e: 'erase', m: 'move' };
    if (tools[k.toLowerCase()]) setTool(tools[k.toLowerCase()]);
    else if (k === '[' || k === ']') { S.size = Math.max(3, Math.min(90, S.size + (k === ']' ? 4 : -4))); $('brushSize').value = S.size; $('brushOut').textContent = S.size; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing) stop(); });
  addEventListener('pagehide', () => { if (painted) { flushAll(); saveDraft(project('Draft')); } });
}

/* ── start ── */
makeLayers(); buildInks(); wire(); syncInks(); syncSettings(); drawSlots(); fit(); render();
const draft = loadDraft();
if (draft) loadProject(draft).then(ok => { if (ok) { $('pname').value = ''; say('Picked up where you left off.'); } });
syncHistory(); introOnce();
requestAnimationFrame(fit);

window.ORM = { S, layers, an, project, loadProject, play, stop, setInk, setTool, setShade, flushAll, startFrom, get engine() { return engine; }, get ctx() { return ctx; }, hzAt, melodyAt };
