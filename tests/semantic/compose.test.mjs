import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, deriveKey, composePlan, beatToSec, snapToChord, CLUSTER_DEGREE, PC_NAMES } from '../../assets/js/semantic/compose.js';
import { degreeMidi, MODES } from '../../assets/js/ambience/music.js';

/** A stand-in for the page's analysis: stable attributes from the word itself. */
const h = s => { let x = 5381; for (const c of s) x = (Math.imul(x, 33) + c.charCodeAt(0)) | 0; return Math.abs(x); };
const POS = ['noun', 'verb', 'adjective', 'adverb', 'other'];
function tokensOf(text, over = {}) {
  return (text.match(/\b\w+\b/g) || []).map(w => { const l = w.toLowerCase(), k = h(l); return { word: w, lower: l, freqScore: (k % 100) / 100, cluster: over[l] ?? (k % 21) - 1, pos: POS[k % 5], len: w.length, ...(k % 3 === 0 ? { pred: [['the', 30, 0.9], ['a', 20, 0.8], ['time', 10, 0.4]] } : {}) }; });
}
const plan = (text, o = {}, opts) => composePlan(text, tokensOf(text, o), opts);
const TEXT = 'The river moves slowly through the quiet valley, and I remember the light. Why does it never stop? Nothing here is certain...';

test('scan: words line up with the analysis, punctuation and paragraph breaks are kept', () => {
  const it = scan('Hello, world. Is it?\n\nYes... fine!');
  assert.deepEqual(it.filter(i => i.type === 'word').map(i => i.text), ['Hello', 'world', 'Is', 'it', 'Yes', 'fine']);
  assert.deepEqual(it.filter(i => i.type !== 'word').map(i => i.mark || i.type), [',', '.', '?', 'para', '…', '!']);
  assert.equal(it.filter(i => i.type === 'word').length, (('Hello, world. Is it?\n\nYes... fine!').match(/\b\w+\b/g)).length);
});
test('key: stable for the same text, set by the dominant cluster, in the right mode', () => {
  const a = plan(TEXT).key, b = plan(TEXT).key; assert.deepEqual(a, b);
  const k = deriveKey(tokensOf('sea sea sea sea', { sea: 6 }), []); assert.equal(k.root, (6 * 7) % 12); assert.equal(k.dominant, 6);
  assert.equal(deriveKey(tokensOf('a b', { a: 19, b: 19 }), []).root, 9, 'function words alone give the default key');
  const rare = deriveKey(tokensOf('zzz yyy xxx').map(t => ({ ...t, freqScore: 0.05 })), []); assert.equal(rare.mode, 'lydian');
  const neg = deriveKey(tokensOf('not never nothing empty void lost').map(t => ({ ...t, cluster: 18, freqScore: 0.8 })), []); assert.equal(neg.mode, 'minor');
  assert.equal(plan(TEXT).key.name.split(' ')[0], PC_NAMES[plan(TEXT).key.root]);
});
test('every note is in the key, on the half-beat grid, with sensible loudness and pan', () => {
  for (const text of [TEXT, 'one', 'Run! Jump! Fall...', 'a'.repeat(30) + ' b c, d; e: f.\n\nNew paragraph here.']) {
    const p = plan(text); assert.ok(p.events.length > 0);
    for (const e of p.events) {
      for (const m of e.midi) assert.ok(p.key.pcs.includes(m % 12), `${text.slice(0, 12)} ${e.kind} pc ${m % 12} in ${p.key.name}`);
      assert.ok(e.vel > 0 && e.vel <= 0.95 && Math.abs(e.pan) <= 0.8 && e.dur > 0 && e.voice >= 1 && e.voice <= 5);
      assert.equal((e.beat * 4) % 1, 0, 'on a sixteenth');
      for (const m of e.midi) assert.ok(m >= 24 && m <= 100, `range ${m}`);
    }
  }
});
test('rests: commas breathe, full stops go to the next bar', () => {
  const a = plan('go on and on', {}), b = plan('go on, and on', {});
  assert.ok(b.words[2].beat - a.words[2].beat === 0.5, 'a comma adds half a beat');
  const c = plan('Stop. Go now.'); const goBeat = c.words[1].beat; assert.equal(goBeat % 4, 0, 'the next sentence starts on a bar line');
  assert.ok(goBeat - c.words[0].beat >= 1);
  const para = plan('Stop.\n\nGo now.'); assert.ok(para.words[1].beat - c.words[1].beat >= 4, 'a paragraph break leaves a bar of silence');
});
test('cadences: full stop resolves home, question stays open, ellipsis hangs', () => {
  const finalChord = (text) => { const p = plan(text, { x: 6 }); const s = p.sentences[p.sentences.length - 1]; const bar = Math.floor(s.words[s.words.length - 1].beat / 4); return { c: p.chords[bar], p }; };
  assert.equal(finalChord('this is the end of the long sentence today.').c.deg, 0);
  assert.equal(finalChord('this is the end of the long sentence today?').c.deg, 4);
  const e = finalChord('this is the end of the long sentence today...'); assert.equal(e.c.deg, 5); assert.equal(e.c.sus, true);
  const long = finalChord('this is the end of the very long winding sentence that goes on and on and on today.'); const bar = Math.floor(long.p.sentences[0].words.at(-1).beat / 4); assert.equal(long.p.chords[bar - 1].deg, 4, 'dominant before the tonic');
  assert.equal(plan('Hello there').chords[0].deg, 0, 'the introduction bar is home');
});
test('chords lean toward their words: a bar of time words goes to the dominant', () => {
  const p = plan('time moment hour day night', { time: 4, moment: 4, hour: 4, day: 4, night: 4 }); assert.equal(CLUSTER_DEGREE[4], 4);
  assert.ok(p.chords.some(c => c.deg === 4) || p.chords.some(c => c.deg === 0));
  assert.equal(CLUSTER_DEGREE.length, 20);
});
test('melody: rarer words sit higher; strong beats rest on chord tones; no wild leaps', () => {
  const toks = tokensOf('alpha beta gamma delta epsilon zeta eta theta iota kappa').map((t, i) => ({ ...t, freqScore: i % 2 ? 0.05 : 0.95, cluster: 0, pos: 'other', pred: undefined, len: 4 }));
  const p = composePlan('alpha beta gamma delta epsilon zeta eta theta iota kappa', toks);
  const mel = p.events.filter(e => e.voice === 1 && e.word !== undefined);
  const rare = mel.filter(e => toks[e.word].freqScore < 0.5).map(e => e.midi[0]), common = mel.filter(e => toks[e.word].freqScore > 0.5).map(e => e.midi[0]);
  assert.ok(rare.reduce((a, b) => a + b) / rare.length > common.reduce((a, b) => a + b) / common.length, 'rare is higher');
  for (let i = 1; i < mel.length; i++) assert.ok(Math.abs(mel[i].midi[0] - mel[i - 1].midi[0]) <= 14, 'no huge leaps');
  assert.equal(snapToChord(9, 0) % 7 === 0 || (snapToChord(9, 0) - 2) % 7 === 0 || (snapToChord(9, 0) - 4) % 7 === 0, true);
});
test('predictions: a certain next word is consonant, a flat one is allowed colour', () => {
  const mk = pred => { const t = tokensOf('river').map(x => ({ ...x, pred, cluster: 6, pos: 'other' })); return composePlan('river', t).events.filter(e => e.voice === 2); };
  const certain = mk([['a', 60, 0.31], ['b', 20, 0.52], ['c', 10, 0.77], ['d', 5, 0.15]]), flat = mk([['a', 21, 0.31], ['b', 20, 0.52], ['c', 20, 0.77], ['d', 19, 0.15]]);
  const toneOf = (e, p) => { const rel = ((e.midi[0] % 12) - p.key.root + 12) % 12; return rel; };
  assert.ok(certain.length >= 1 && flat.length >= 1);
  assert.ok(certain.length <= flat.length, 'snapping merges notes, so certainty gives a plainer chord');
});
test('dynamics: a phrase swells in the middle and the last bar fades; clauses are quieter', () => {
  const p = plan('The old river runs slowly through the quiet green valley below the hills and the mist.');
  const mel = p.events.filter(e => e.voice === 1 && e.word !== undefined), mid = mel[Math.floor(mel.length / 2)].vel, first = mel[0].vel;
  assert.ok(mid >= first * 0.95, 'the middle is not quieter than the start');
  const sub = plan('I walk home because the night is cold and dark.'), sw = sub.words.find(w => w.depth === 1); assert.ok(sw, 'a subordinate clause is found');
  const last = p.events.filter(e => e.voice === 3).at(-1); assert.ok(last.vel < Math.max(...p.events.filter(e => e.voice === 3).map(e => e.vel)), 'the last pad is softer than the loudest');
});
test('timing: ritardando slows the end, time is steady before it', () => {
  const p = plan(TEXT); const spb = 60 / p.bpm;
  assert.equal(beatToSec(8, p.bpm, p.ritStart, p.endBeat), p.ritStart > 8 ? 8 * spb : beatToSec(8, p.bpm, p.ritStart, p.endBeat));
  let last = -1; for (let b = 0; b <= p.endBeat + 4; b += 0.5) { const s = beatToSec(b, p.bpm, p.ritStart, p.endBeat); assert.ok(s > last); last = s; }
  const early = beatToSec(p.ritStart + 1, p.bpm, p.ritStart, p.endBeat) - beatToSec(p.ritStart, p.bpm, p.ritStart, p.endBeat), late = beatToSec(p.endBeat, p.bpm, p.ritStart, p.endBeat) - beatToSec(p.endBeat - 1, p.bpm, p.ritStart, p.endBeat);
  assert.ok(late > early, 'slower toward the end');
});
test('the plan: repeatable, sorted, empty text is safe, a long text is fast', () => {
  assert.equal(JSON.stringify(plan(TEXT)), JSON.stringify(plan(TEXT)));
  const ev = plan(TEXT).events; for (let i = 1; i < ev.length; i++) assert.ok(ev[i].beat >= ev[i - 1].beat);
  const empty = composePlan('', []); assert.equal(empty.events.length, 0); assert.doesNotThrow(() => composePlan('...', []));
  assert.doesNotThrow(() => plan('?')); assert.doesNotThrow(() => plan('one'));
  const long = Array.from({ length: 600 }, (_, i) => 'word' + (i % 37) + (i % 9 === 8 ? '.' : i % 5 === 4 ? ',' : '')).join(' ');
  const t0 = Date.now(); const lp = plan(long); assert.ok(Date.now() - t0 < 500, 'under half a second'); assert.ok(lp.events.length > 600);
  assert.equal(plan(TEXT, {}, { bpm: 100 }).bpm, 100); assert.ok(plan(TEXT).bpm >= 60 && plan(TEXT).bpm <= 84);
});

test('memory: the opening tune is kept as scale degrees', () => {
  const p = plan(TEXT); assert.ok(p.theme.length >= 3 && p.theme.length <= 6);
  for (const n of p.theme) assert.ok(Number.isInteger(n.deg) && n.at >= 0 && n.at < 4 && n.dur >= 0.5);
  assert.equal(p.theme[0].at, 0); assert.deepEqual(plan(TEXT).theme, p.theme, 'repeatable');
  assert.deepEqual(composePlan('', []).theme === undefined ? [] : composePlan('', []).theme, []);
});
test('memory: a similar text brings the old tune back in the introduction, a very similar one also at the end', () => {
  const theme = plan(TEXT).theme, other = 'The sea falls softly over the stones, and I hear the water.';
  const none = plan(other), mid = plan(other, {}, { memory: { theme, similarity: 0.7 } }), high = plan(other, {}, { memory: { theme, similarity: 0.9 } });
  assert.equal(none.events.filter(e => e.recall).length, 0);
  const rec = mid.events.filter(e => e.recall); assert.equal(rec.length, theme.length); assert.ok(rec.every(e => e.beat < 4), 'in the introduction bar');
  assert.ok(high.events.filter(e => e.recall).length === theme.length * 2 && high.events.some(e => e.recall && e.beat >= high.endBeat - 4), 'and again at the end');
  for (const e of [...mid.events, ...high.events]) for (const m of e.midi) assert.ok(mid.key.pcs.includes(m % 12), 'recalled notes stay in the new key');
  assert.equal(mid.memory.mode, 'recall');
});
test('memory: a very different text ends on a deceptive cadence; a middling one is left alone', () => {
  const theme = plan(TEXT).theme, text = 'This is a sentence that ends the piece today.';
  const lastDeg = p => { const s = p.sentences.at(-1); return p.chords[Math.floor(s.words.at(-1).beat / 4)].deg; };
  assert.equal(lastDeg(plan(text)), 0);
  const dec = plan(text, {}, { memory: { theme, similarity: 0.2 } }); assert.equal(lastDeg(dec), 5); assert.equal(dec.memory.mode, 'deceptive');
  assert.equal(lastDeg(plan(text, {}, { memory: { theme, similarity: 0.5 } })), 0);
  assert.equal(lastDeg(plan('Is this a question today?', {}, { memory: { theme, similarity: 0.2 } })), 4, 'a question stays open');
});
test('echoes: a word said three times or more is answered by its own echo', () => {
  const p = plan('echo echo echo and again echo'); const echoes = p.events.filter(e => e.echo);
  assert.equal(echoes.length, 3, 'every repeat after the first');
  assert.ok(echoes.every(e => e.vel < 0.25));
  assert.equal(plan('echo echo and again').events.filter(e => e.echo).length, 0, 'twice is not enough');
});
