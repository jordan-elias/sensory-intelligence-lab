import test from 'node:test';
import assert from 'node:assert/strict';
import { hzAt, heightOf, snapHz, midiOf, scaleNotes, SCALES } from '../../assets/js/oramics/music.js';
import { INKS, INK_ORDER, inkColor, shadeCount } from '../../assets/js/oramics/inks.js';
import { emptyScan, scanLayer, runsAt, loudness, melodyAt, harmonyAt, textureAt, onsetsAt, zoneOf, ZONES } from '../../assets/js/oramics/scan.js';
import { createEngine, renderPiece, encodeWav, VOICES, KITS } from '../../assets/js/oramics/engine.js';
import { starterMarks, surprise, STARTERS, rng } from '../../assets/js/oramics/starters.js';
import { cleanProject, cleanSettings, saveSlot, loadSlots, deleteSlot, saveDraft, loadDraft, MAX_SLOTS } from '../../assets/js/oramics/store.js';

const layer = (w, h, marks) => { const im = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; for (const [x, y0, y1, a = 255] of marks) for (let y = y0; y <= y1; y++) im.data[(y * w + x) * 4 + 3] = a; return im; };
const scanOf = (w, h, marks) => scanLayer(layer(w, h, marks), emptyScan(w, h));
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('height maps to frequency exponentially and back', () => {
  const r = INKS.melody.range;
  assert.ok(Math.abs(hzAt(0, r) - r.hi) < 1e-6 && Math.abs(hzAt(1, r) - r.lo) < 1e-6);
  for (const n of [0, 0.3, 0.5, 0.9, 1]) assert.ok(Math.abs(heightOf(hzAt(n, r), r) - n) < 1e-9);
  assert.ok(Math.abs(hzAt(0.5, r) - Math.sqrt(r.lo * r.hi)) < 1e-6);
});
test('snapping lands on the key and leaves other notes alone', () => {
  const s = snapHz(261.6 * 2 ** (0.3 / 12), 0, 'major'); assert.ok(Math.abs(midiOf(s) - 60) < 1e-6);
  const pent = scaleNotes(0, 'major pentatonic', 100, 800).map(m => ((m % 12) + 12) % 12); assert.ok(pent.every(n => SCALES['major pentatonic'].includes(n)));
  for (const hz of [150, 333, 777]) assert.ok(SCALES.minor.includes((((Math.round(midiOf(snapHz(hz, 9, 'minor'))) - 9) % 12) + 12) % 12));
});
test('every ink has a role, a range, and shades with colours', () => {
  assert.equal(INK_ORDER.length, 5);
  for (const id of INK_ORDER) { const k = INKS[id]; assert.ok(k.name && k.role && k.how && k.range.hi > k.range.lo); assert.ok(shadeCount(id) >= 3 && k.shades.every(s => /^#[0-9a-f]{6}$/i.test(s.color))); }
  assert.equal(inkColor('melody', 99), INKS.melody.shades.at(-1).color);
  assert.equal(shadeCount('melody'), VOICES.melody.length); assert.equal(shadeCount('bass'), VOICES.bass.length); assert.equal(shadeCount('harmony'), VOICES.harmony.length);
  assert.equal(shadeCount('texture'), VOICES.texture.length); assert.equal(shadeCount('rhythm'), KITS.length);
});
test('scanning finds each band of paint in a column, and ignores faint edges', () => {
  const sc = scanOf(6, 100, [[1, 10, 14], [1, 60, 62], [3, 40, 41, 10]]);
  assert.equal(runsAt(sc, 1).length, 2); assert.ok(Math.abs(runsAt(sc, 1)[0].c - 0.125) < 1e-9 && Math.abs(runsAt(sc, 1)[0].size - 0.05) < 1e-9);
  assert.deepEqual(runsAt(sc, 3), []); assert.deepEqual(runsAt(sc, 0), []);
  scanLayer(layer(6, 100, [[0, 5, 9]]), sc, 0, 0); assert.equal(runsAt(sc, 0).length, 1); assert.equal(runsAt(sc, 1).length, 2);   // only the asked columns are re-read
});
test('melody: thickest band wins, higher is higher, thicker is louder, silence is null', () => {
  const m = melodyAt(runsAt(scanOf(4, 1000, [[0, 100, 110], [0, 500, 540]]), 0)); assert.ok(m && Math.abs(m.c - 0.52) < 0.01);
  const hi = melodyAt(runsAt(scanOf(2, 1000, [[0, 100, 120]]), 0)), lo = melodyAt(runsAt(scanOf(2, 1000, [[0, 800, 820]]), 0)); assert.ok(hi.hz > lo.hz);
  assert.ok(loudness(0.06) > loudness(0.01) && loudness(0.001) >= 0.25 && loudness(1) === 1); assert.equal(melodyAt([]), null);
  const sn = melodyAt(runsAt(scanOf(2, 1000, [[0, 480, 500]]), 0), 'melody', { snap: { on: true, root: 0, scale: 'major' } }); assert.ok(SCALES.major.includes(((Math.round(midiOf(sn.hz)) % 12) + 12) % 12));
});
test('harmony: stacked bands are a chord, always on the key, at most four', () => {
  const sc = scanOf(2, 1000, [0, 1, 2, 3, 4, 5].flatMap(i => Array.from({ length: 12 }, (_, k) => [0, 100 + i * 150 + k, 100 + i * 150 + k])));
  const notes = harmonyAt(runsAt(sc, 0), { root: 0, scale: 'minor pentatonic' }); assert.ok(notes.length <= 4 && notes.length >= 2);
  assert.ok(notes.every(n => SCALES['minor pentatonic'].includes(((Math.round(midiOf(n.hz)) % 12) + 12) % 12))); assert.ok(notes[0].hz >= notes.at(-1).hz);
});
test('texture: the middle of the paint sets brightness, the amount sets level', () => {
  const high = textureAt(runsAt(scanOf(2, 1000, [[0, 100, 140]]), 0)), low = textureAt(runsAt(scanOf(2, 1000, [[0, 800, 840]]), 0)); assert.ok(high.hz > low.hz); assert.equal(textureAt([]), null);
});
test('rhythm: a new mark is a hit, a held mark is not, tall marks hit more than one drum', () => {
  const sc = scanOf(6, 1000, [[2, 880, 900], [3, 880, 900], [4, 880, 900]]), a = onsetsAt([], runsAt(sc, 2)), b = onsetsAt(runsAt(sc, 2), runsAt(sc, 3));
  assert.equal(a.length, 1); assert.equal(a[0].zone, 'kick'); assert.equal(b.length, 0);
  assert.equal(zoneOf(0.05).id, 'open'); assert.equal(zoneOf(0.99).id, 'kick'); assert.equal(ZONES.at(-1).id, 'kick');
  const tall = onsetsAt([], runsAt(scanOf(2, 1000, [...Array.from({ length: 700 }, (_, i) => [0, 150 + i, 150 + i])]), 0)); assert.ok(tall.length >= 4);
  assert.equal(onsetsAt(runsAt(scanOf(2, 1000, [[0, 10, 20]]), 0), runsAt(scanOf(2, 1000, [[0, 500, 520]]), 0)).length, 1);
});

// a recording stand-in for the audio nodes, so scheduling can be checked without sound
function fakeCtx(sr = 8000) {
  const log = { created: [], params: [] };
  const param = (owner, name, v = 0) => ({ value: v, setValueAtTime(x, t) { log.params.push([owner, name, 'set', x, t]); }, setTargetAtTime(x, t, tc) { log.params.push([owner, name, 'target', x, t, tc]); }, exponentialRampToValueAtTime() {} });
  const node = type => { const n = { type, connect() { return n; }, disconnect() {}, start() { log.created.push(type); }, stop() {} };
    for (const k of ['gain', 'frequency', 'detune', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = param(type, k, 1); return n; };
  return { log, sampleRate: sr, currentTime: 0, destination: node('dest'), createGain: () => node('gain'), createOscillator: () => node('osc'), createBiquadFilter: () => node('biquad'),
    createDynamicsCompressor: () => node('comp'), createConvolver: () => node('conv'), createStereoPanner: () => node('pan'), createBufferSource: () => node('src'),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n), length: n }) };
}
test('the engine plays a dab as one drum hit and a line as a sounding note, and goes quiet when the paint ends', () => {
  const ctx = fakeCtx(), e = createEngine(ctx), before = ctx.log.created.length;
  const an = { rhythm: scanOf(10, 1000, [[2, 880, 900], [3, 880, 900]]), melody: scanOf(10, 1000, [[1, 400, 420], [2, 400, 420]]) };
  for (let x = 0; x < 6; x++) e.column(x, x * 0.05, 0.05, an, {});
  const hits = ctx.log.created.length - before; assert.ok(hits >= 1 && hits <= 4, 'one kick (a tone and a click): ' + hits);
  const amps = ctx.log.params.filter(p => p[0] === 'gain' && p[1] === 'gain' && p[2] === 'target');
  assert.ok(amps.some(p => p[3] > 0.05) && amps.some(p => p[3] === 0), 'a note starts and then falls to silence');
});
test('muting and soloing silence the other inks', () => {
  const ctx = fakeCtx(), e = createEngine(ctx); e.setMix('bass', { mute: true }); e.setSolo('melody');
  const last = id => ctx.log.params.filter(p => p[2] === 'target').at(-1);
  assert.ok(last()); assert.equal(e.mix.bass.mute, true);
});
test('a whole picture renders offline with the same engine', async () => {
  const buf = { sampleRate: 8000, numberOfChannels: 2, length: 16000, getChannelData: () => new Float32Array(16000) };
  class Off { constructor(c, len, sr) { this.ctx = fakeCtx(sr); Object.assign(this, this.ctx); this.length = len; } startRendering() { return Promise.resolve(buf); } }
  const out = await renderPiece({ Offline: Off, sampleRate: 8000, an: { melody: scanOf(20, 100, [[3, 40, 44]]) }, w: 20, seconds: 1, settings: {}, space: 0.3 });
  assert.equal(out, buf);
});
test('WAV files have a proper header and clip safely', () => {
  const ch = new Float32Array([0, 0.5, -0.5, 2, -2]); const w = new DataView(encodeWav({ sampleRate: 22050, numberOfChannels: 1, length: 5, getChannelData: () => ch }));
  assert.equal(String.fromCharCode(w.getUint8(0), w.getUint8(1), w.getUint8(2), w.getUint8(3)), 'RIFF'); assert.equal(w.getUint32(24, true), 22050); assert.equal(w.getUint16(34, true), 16);
  assert.equal(w.getInt16(44 + 6, true), 32767); assert.equal(w.getInt16(44 + 8, true), -32768);
});
test('starters and "surprise me" are inside the picture, use real inks, and repeat for the same seed', () => {
  for (const s of STARTERS) { const m = starterMarks(s.id); assert.ok(m.length > 4); for (const k of m) { assert.ok(INKS[k.ink]); assert.ok(k.size > 0 && k.size < 0.2); assert.ok(k.pts.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)); } }
  assert.deepEqual(surprise(4), surprise(4)); assert.notDeepEqual(surprise(4), surprise(5));
  for (let i = 1; i < 30; i++) { const m = surprise(i); assert.ok(new Set(m.map(k => k.ink)).size === 5, 'all five inks'); assert.ok(m.every(k => k.pts.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1))); }
  const a = rng(1); assert.ok(a() !== a());
});
test('projects are validated; settings fall back to safe values', () => {
  const png = 'data:image/png;base64,AAAA';
  assert.equal(cleanProject(null), null); assert.equal(cleanProject({ layers: {} }), null); assert.equal(cleanProject({ layers: { melody: 'javascript:alert(1)' } }), null);
  const p = cleanProject({ name: '<b>Hi</b>', w: 9999999, layers: { melody: png, nonsense: png }, settings: { seconds: 5000, scale: 'x', shade: { melody: 99 }, mix: { bass: { vol: 7, mute: 'yes' } } } });
  assert.equal(p.name, 'bHi/b'); assert.equal(p.w, 4000); assert.deepEqual(Object.keys(p.layers), ['melody']);
  assert.equal(p.settings.seconds, 90); assert.equal(p.settings.scale, 'major pentatonic'); assert.equal(p.settings.shade.melody, 3); assert.equal(p.settings.mix.bass.vol, 1); assert.equal(p.settings.mix.bass.mute, false);
  assert.equal(cleanSettings(null).snap.on, false, 'free glide unless asked'); assert.equal(cleanSettings({ paper: 'light' }).paper, 'light');
});
test('slots save, replace by name, cap, delete, and drafts survive bad storage', () => {
  const st = mem(), png = 'data:image/png;base64,AAAA', P = n => ({ name: n, layers: { melody: png } });
  assert.equal(saveSlot({ layers: {} }, st).ok, false);
  saveSlot(P('a'), st); saveSlot(P('b'), st); saveSlot(P('a'), st); assert.deepEqual(loadSlots(st).map(s => s.name), ['a', 'b']);
  for (let i = 0; i < 12; i++) saveSlot(P('n' + i), st); assert.equal(loadSlots(st).length, MAX_SLOTS);
  deleteSlot('n11', st); assert.ok(!loadSlots(st).some(s => s.name === 'n11'));
  st.setItem('sil.oramics.v2', '{{bad'); assert.deepEqual(loadSlots(st), []);
  const thrower = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  assert.equal(saveSlot(P('x'), thrower).ok, false); assert.deepEqual(loadSlots(thrower), []); assert.equal(loadDraft(thrower), null);
  assert.equal(saveDraft(P('d'), st), true); assert.equal(loadDraft(st).name, 'd'); saveDraft({ layers: {} }, st); assert.equal(loadDraft(st), null);
});
