/**
 * /assets/js/ambience/page.js
 * The Ambience page: a grid of icon tiles. Tap to switch a sound on or off, hold for its settings. Nothing starts by itself,
 * and everything is remembered only on this device.
 */
import { MUSIC, NATURE, NOISE, SPOKEN, FEELS, allTiles, strip } from './catalog.js';
import { toggle as toggleSel } from './selection.js';
import { createEngine } from './engine.js';
import { load, save, DEFAULT_SETTINGS } from './store.js';
import { icon } from './icons.js';
import { DENSITY, PACE } from './drift.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const probe = async src => { try { const r = await fetch(src, { headers: { Range: 'bytes=0-0' } }); return r.ok && !/text\/html/.test(r.headers.get('content-type') || ''); } catch { return true; } };   // only a definite "not there" hides a sound
async function available(list) { const out = []; for (const n of list) { let ok = false; for (const s of n.src) if (await probe(s)) { ok = true; break; } if (ok) out.push(n); } return out; }

const nature = await available(NATURE), spoken = await available(SPOKEN);
const tiles = allTiles({ nature, spoken }), known = tiles.map(t => t.id), label = Object.fromEntries(tiles.map(t => [t.id, t.label]));
let prefs = load(known);

const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC({ latencyHint: 'playback' });
const engine = createEngine({ ctx });
engine.loadSettings(prefs.settings); engine.setSelected(prefs.selected); engine.setMode(prefs.mode); engine.setFeel(prefs.feel);
engine.setDensity(prefs.density); engine.setPace(prefs.pace); engine.setMaster(prefs.master);
for (const id of prefs.pinned) engine.setPinned(id, true);
window.AMBIENCE = engine;   // for tests and for anyone curious

/* ── build ── */
const rowsEl = $('#rows');
function tileButton(t) { const b = el('button', { type: 'button', class: 'tile', 'data-id': t.id, 'aria-pressed': 'false' }, icon(t.id) + `<span>${esc(t.label)}</span>`); return b; }
for (const r of MUSIC) { const row = el('div', { class: 'amb-row' }, `<span class="rl">${esc(r.label)}</span>`), box = el('div', { class: 'amb-tiles' }); for (const o of r.options) box.append(tileButton(tiles.find(t => t.id === `music:${r.id}:${o.id}`))); row.append(box); rowsEl.append(row); }
const fill = (sel, fam) => { const box = $(sel), list = tiles.filter(t => t.family === fam); list.forEach(t => box.append(tileButton(t))); box.closest('section').hidden = !list.length; };
fill('#nature', 'nature'); fill('#noise', 'noise'); fill('#spoken', 'spoken');
const feelBox = $('#feels'); for (const f of FEELS) feelBox.append(el('button', { type: 'button', class: 'chip', 'data-feel': f.id, 'aria-pressed': 'false' }, esc(f.label)));

/* ── remember and draw ── */
const persist = () => { prefs = { ...prefs, selected: engine.selected, mode: engine.mode, feel: engine.feel, density: engine.density, pace: engine.pace, master: engine.master, pinned: engine.pinnedIds, settings: Object.fromEntries(Object.keys(prefs.settings).concat(known.map(strip)).filter((k, i, a) => a.indexOf(k) === i).map(k => [k, engine.getSettings(k)])) }; save(prefs); };
const stateText = { off: 'off', idle: 'on, paused', pending: 'starting on the next bar', loading: 'loading', on: 'playing', rest: 'resting' };
function draw() {
  for (const b of document.querySelectorAll('.tile')) { const id = b.dataset.id, s = engine.status(id); b.dataset.state = s; b.dataset.pinned = String(engine.isPinned(id) && engine.mode === 'drift'); b.setAttribute('aria-pressed', String(s !== 'off')); b.setAttribute('aria-label', `${label[id]}, ${stateText[s]}`); }
  const play = $('#play'); play.setAttribute('aria-pressed', String(engine.running)); play.setAttribute('aria-label', engine.running ? 'Stop' : 'Play');
  play.innerHTML = engine.running ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
  for (const c of document.querySelectorAll('[data-mode]')) if (c.classList.contains('chip')) c.setAttribute('aria-pressed', String(c.dataset.mode === engine.mode));
  for (const c of document.querySelectorAll('[data-feel]')) c.setAttribute('aria-pressed', String(c.dataset.feel === engine.feel));
  for (const c of document.querySelectorAll('[data-pace]')) c.setAttribute('aria-pressed', String(c.dataset.pace === engine.pace));
  for (const c of document.querySelectorAll('[data-density]')) c.setAttribute('aria-pressed', String(c.dataset.density === engine.density));
  $('#bar').dataset.mode = engine.mode; $('#master').value = engine.master;
  if (media) media.state(engine.running ? 'playing' : 'paused');
}
engine.onchange = () => { draw(); persist(); };
engine.onmissing = id => { engine.setSelected(engine.selected.filter(x => x !== id)); const b = document.querySelector(`.tile[data-id="${id}"]`); if (b) b.hidden = true; say('That sound is not available yet.'); };

/* ── lock screen controls ── */
const media = window.silAudio && window.silAudio.mediaSession ? window.silAudio.mediaSession({ title: 'Ambience', play: () => engine.start(), pause: () => engine.stop(), stop: () => engine.stop() }) : null;

/* ── hint ── */
const hint = $('#hint'); let hintTimer;
function say(t) { hint.textContent = t; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.textContent = prefs.hintSeen ? '' : 'Tap a sound to switch it on. Hold for more.'; }, 4000); }
hint.textContent = prefs.hintSeen ? '' : 'Tap a sound to switch it on. Hold for more.';

/* ── tiles: tap and hold ── */
const HOLD_MS = 450; let held = false, holdTimer = null;
const grid = $('#grid');
grid.addEventListener('pointerdown', e => { const b = e.target.closest('.tile'); if (!b) return; held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; openSheet(b.dataset.id); }, HOLD_MS); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) grid.addEventListener(ev, e => { if (ev === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 6) return; clearTimeout(holdTimer); });
grid.addEventListener('contextmenu', e => { const b = e.target.closest('.tile'); if (b) { e.preventDefault(); openSheet(b.dataset.id); } });
grid.addEventListener('keydown', e => { const b = e.target.closest('.tile'); if (b && e.key === 'Enter' && e.shiftKey) { e.preventDefault(); e.stopPropagation(); openSheet(b.dataset.id); } }, true);
grid.addEventListener('click', async e => {
  const b = e.target.closest('.tile'); if (!b) return;
  if (held) { held = false; e.preventDefault(); return; }
  engine.toggle(b.dataset.id);
  if (!engine.running && engine.selected.length) engine.start();   // switched on first, so the first sound is in the very first bar
});

/* ── controls ── */
$('#play').addEventListener('click', async () => { if (engine.running) engine.stop(); else await engine.start(); });
$('#bar').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  if (c.dataset.mode) engine.setMode(c.dataset.mode); else if (c.dataset.feel) engine.setFeel(c.dataset.feel); else if (c.dataset.pace) engine.setPace(c.dataset.pace); else if (c.dataset.density) engine.setDensity(c.dataset.density);
  draw(); persist();
});
$('#master').addEventListener('input', e => { engine.setMaster(e.target.value); persist(); });
$('#surprise').addEventListener('click', async () => {
  let sel = []; const pickOne = a => a[Math.floor(Math.random() * a.length)];
  const rows = MUSIC.slice().sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
  for (const r of rows) sel = toggleSel(sel, `music:${r.id}:${pickOne(r.options).id}`);
  if (nature.length) sel = toggleSel(sel, `nature:${pickOne(nature).id}`);
  if (Math.random() < 0.6) sel = toggleSel(sel, `noise:${pickOne(NOISE).id}`);
  engine.setSelected(sel); if (!engine.running) await engine.start();
});

/* ── sleep timer ── */
let timerMin = 0, timerEnd = 0, timerId = null;
const timerBtn = $('#timer');
function drawTimer() { timerBtn.textContent = timerMin ? (timerEnd ? `Timer ${Math.max(0, Math.ceil((timerEnd - Date.now()) / 60000))} min left` : `Timer ${timerMin} min`) : 'Timer off'; timerBtn.setAttribute('aria-pressed', String(!!timerMin)); }
function armTimer() { clearInterval(timerId); timerEnd = timerMin && engine.running ? Date.now() + timerMin * 60000 : 0; drawTimer(); if (timerMin) timerId = setInterval(() => { if (timerEnd && Date.now() >= timerEnd) { clearInterval(timerId); timerMin = 0; timerEnd = 0; engine.stop(20); drawTimer(); } else drawTimer(); }, 5000); }
timerBtn.addEventListener('click', () => { timerMin = ({ 0: 15, 15: 30, 30: 60, 60: 0 })[timerMin]; armTimer(); });
const oldChange = engine.onchange; engine.onchange = () => { oldChange(); if (timerMin && engine.running && !timerEnd) armTimer(); };
drawTimer();

/* ── settings sheet ── */
const sheet = $('#sheet'); let openedAt = 0;
function openSheet(id) {
  const key = strip(id), set = engine.getSettings(key), isMusic = id.startsWith('music:'), name = isMusic ? MUSIC.find(r => r.id === id.split(':')[1]).label : label[id];
  $('#sheet-title-text').textContent = name; sheet.dataset.key = key; sheet.dataset.id = id;
  $('#s-vol').value = set.vol; $('#s-pan').value = set.pan; $('#s-pan').disabled = set.alt; $('#s-alt').checked = set.alt; $('#s-rate').value = set.rate; $('#s-rate-row').hidden = !set.alt; $('#s-rev').value = set.reverb;
  $('#s-var-row').hidden = !isMusic; for (const c of sheet.querySelectorAll('[data-var]')) c.setAttribute('aria-pressed', String(Number(c.dataset.var) === set.variation));
  $('#s-pin').checked = engine.isPinned(id); $('#s-pin-row').hidden = engine.mode !== 'drift';
  prefs.hintSeen = true; hint.textContent = ''; persist();
  openedAt = Date.now(); if (!sheet.open) sheet.showModal();
}
const patch = p => { if (!sheet.dataset.key) return; engine.setSetting(sheet.dataset.key, p); persist(); };
$('#s-vol').addEventListener('input', e => patch({ vol: +e.target.value }));
$('#s-pan').addEventListener('input', e => patch({ pan: +e.target.value }));
$('#s-rev').addEventListener('input', e => patch({ reverb: +e.target.value }));
$('#s-rate').addEventListener('input', e => patch({ rate: +e.target.value }));
$('#s-alt').addEventListener('change', e => { patch({ alt: e.target.checked }); $('#s-pan').disabled = e.target.checked; $('#s-rate-row').hidden = !e.target.checked; });
sheet.addEventListener('click', e => { const c = e.target.closest('[data-var]'); if (c) { patch({ variation: Number(c.dataset.var) }); for (const x of sheet.querySelectorAll('[data-var]')) x.setAttribute('aria-pressed', String(x === c)); } if (e.target === sheet && Date.now() - openedAt > 600) sheet.close(); });   // lifting the finger after a hold must not close it again
$('#s-pin').addEventListener('change', e => { engine.setPinned(sheet.dataset.id, e.target.checked); persist(); });
$('#s-close').addEventListener('click', () => sheet.close());

draw();
