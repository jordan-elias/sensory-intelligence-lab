/**
 * /assets/js/semantic/compose.js
 * Semantic Synth, "Composed" mode: turns a piece of text and its analysis into a plan of notes, with no audio in it.
 * What the text decides: the key (from its dominant semantic cluster), the mode (from how rare, negated or questioning it is),
 * the pitch of each word (rarer is higher), the length of each word, the chord of each bar (from the words in it), and how tense a
 * predicted-next-word chord sounds (certain is consonant). What the composer decides: that notes sit in the key, that sentences
 * become phrases ending in cadences, that commas are breaths and full stops are rests to the next bar, and the swell of each phrase.
 * Everything is a plain function of the text, so the same text always gives the same piece.
 */
import { MODES, degreeMidi } from '../ambience/music.js';

export const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SUBORDINATORS = new Set(['which', 'that', 'because', 'although', 'though', 'while', 'if', 'when', 'who', 'whom', 'whose', 'whereas', 'unless', 'since', 'until', 'as']);
const FUNCTION_CLUSTER = 19, NEGATION_CLUSTER = 18;
/** The chord (as a scale degree) each semantic cluster leans toward: warm and close to home for body and feeling, forward for time and change, unsettled for negation and abstraction. */
export const CLUSTER_DEGREE = [4, 5, 5, 1, 4, 2, 5, 5, 3, 3, 3, 0, 0, 4, 1, 3, 0, 0, 1, 0];

/** The words and punctuation of `text` in order. Words match the analysis (same pattern), so word k here is token k there. */
export function scan(text) {
  const items = []; let w = 0;
  for (const m of String(text).matchAll(/\b\w+\b|\.{2,}|…|\n[ \t]*\n+|[.,!?;:]/g)) {
    const t = m[0];
    if (/^\w/.test(t)) items.push({ type: 'word', text: t, idx: w++ });
    else if (t.startsWith('..') || t === '…') items.push({ type: 'punct', mark: '…' });
    else if (t.includes('\n')) items.push({ type: 'para' });
    else items.push({ type: 'punct', mark: t });
  }
  return items;
}

/** The key, from the text. The dominant (non-function) semantic cluster sets the root, so clusters that sit next to each other in the table sit a fifth apart. */
export function deriveKey(tokens, items) {
  const counts = new Array(20).fill(0); let neg = 0;
  for (const t of tokens) { if (t.cluster >= 0 && t.cluster !== FUNCTION_CLUSTER) counts[t.cluster]++; if (t.cluster === NEGATION_CLUSTER) neg++; }
  const top = Math.max(...counts), dominant = top > 0 ? counts.indexOf(top) : -1;
  const root = dominant >= 0 ? (dominant * 7) % 12 : 9;
  const n = Math.max(1, tokens.length), rarity = tokens.reduce((s, t) => s + (1 - (t.freqScore ?? 0.5)), 0) / n;
  const questions = items.filter(i => i.mark === '?').length, sentences = Math.max(1, items.filter(i => ['.', '!', '?', '…'].includes(i.mark)).length);
  const counted = {}; for (const t of tokens) counted[t.lower] = (counted[t.lower] || 0) + 1;
  const uniq = Object.keys(counted).length, entropy = uniq > 1 ? Object.values(counted).reduce((h, c) => h - (c / n) * Math.log2(c / n), 0) / Math.log2(uniq) : 0;
  const mode = rarity >= 0.5 ? 'lydian' : (neg / n + questions / sentences * 0.5 >= 0.12 || entropy < 0.65 ? 'minor' : 'dorian');
  return { root, mode, name: `${PC_NAMES[root]} ${mode}`, dominant, rarity, entropy, pcs: MODES[mode].map(x => (root + x) % 12) };
}

const wordBeats = t => (t.cluster === FUNCTION_CLUSTER ? 0.5 : t.len <= 3 ? 0.5 : t.len <= 6 ? 1 : t.len <= 9 ? 1.5 : 2);
const TERMINAL = new Set(['.', '!', '?', '…']);

/** Time in seconds of a position in beats: steady, then slowing over the last bars. */
export function beatToSec(b, bpm, ritStart, endBeat) {
  const spb = 60 / bpm; if (b <= ritStart || endBeat <= ritStart) return b * spb;
  const d = Math.min(b, endBeat) - ritStart, span = endBeat - ritStart;
  return ritStart * spb + spb * (d + 0.3 * d * d / (2 * span)) + Math.max(0, b - endBeat) * spb * 1.3;
}

/** Nearest scale degree to `deg` that is a tone (root, third or fifth) of the chord built on `chordDeg`. */
export function snapToChord(deg, chordDeg) {
  let best = deg, bd = 99;
  for (let c = deg - 7; c <= deg + 7; c++) { const r = (((c - chordDeg) % 7) + 7) % 7; if ((r === 0 || r === 2 || r === 4) && Math.abs(c - deg) < bd) { bd = Math.abs(c - deg); best = c; } }
  return best;
}

/**
 * The plan: { key, bpm, events, words, endBeat, ritStart, chords, sentences }. Each event: { beat, dur, kind, midi, vel, pan, voice, word? }
 * with kind pluck, bell, rhodes, pad or bass, and `voice` 1 to 5 matching the five voices. `plan.theme` is the opening tune as scale degrees, kept for
 * the next piece; `opts.memory` ({ theme, similarity }) lets an earlier piece come back: a similar text recalls the old tune in the introduction (and at the
 * end when it is very similar), and a very different one ends on a deceptive cadence. `tokens` come from the page's analysis
 * (word, lower, freqScore, cluster, pos, len, and optionally `pred`: [[word, weight, freqScore], ...]). `opts.bpm` overrides the tempo.
 */
export function composePlan(text, tokens, opts = {}) {
  const items = scan(text), key = deriveKey(tokens, items), feel = { root: key.root, mode: key.mode };
  const bpm = Number.isFinite(opts.bpm) ? Math.max(40, Math.min(160, opts.bpm)) : Math.round(84 - 24 * key.entropy);
  const plan = { key, bpm, events: [], words: [], endBeat: 0, ritStart: 0, chords: [], sentences: [] };
  if (!tokens.length) return plan;

  /* 1. Lay the words and rests out in time (beats). A bar is four beats; bar 0 is a bar of introduction. */
  const INTRO = 4; let pos = INTRO, depth = 0, sent = { start: pos, words: [], kind: '.' };
  const closeSentence = (kind, endPos) => { if (sent.words.length) { sent.kind = kind; sent.end = endPos; plan.sentences.push(sent); } sent = { start: endPos, words: [], kind: '.' }; };
  const toBar = b => Math.ceil(b / 4) * 4;
  for (const it of items) {
    if (it.type === 'word') {
      const t = tokens[it.idx]; if (!t) continue;
      if (SUBORDINATORS.has(t.lower)) depth = 1;
      const dur = wordBeats(t), w = { idx: it.idx, beat: pos, dur, depth, sentence: plan.sentences.length };
      plan.words.push(w); sent.words.push(w); pos += dur;
    } else if (it.type === 'punct') {
      if (it.mark === ',') { pos += 0.5; depth = 0; } else if (it.mark === ';' || it.mark === ':') { pos += 1; depth = 0; }
      else if (TERMINAL.has(it.mark)) { depth = 0; const end = pos; pos = toBar(pos + (it.mark === '…' ? 2 : 1)); closeSentence(it.mark, end); sent.start = pos; }
    } else { depth = 0; const end = pos; pos = toBar(pos) + 4; closeSentence('.', end); sent.start = pos; }
  }
  if (sent.words.length) closeSentence('.', pos);
  const lastEnd = plan.sentences.length ? plan.sentences[plan.sentences.length - 1].end : INTRO;
  plan.endBeat = toBar(lastEnd) + 4; plan.ritStart = Math.max(INTRO, plan.endBeat - 8);
  if (!plan.words.length) return plan;

  /* 2. A chord for each bar: leaning toward the dominant cluster of its words, then the cadences. */
  const nBars = plan.endBeat / 4, barOf = b => Math.floor(b / 4), chords = [];
  for (let bar = 0; bar < nBars; bar++) {
    const c = new Array(20).fill(0);
    for (const w of plan.words) if (barOf(w.beat) === bar) { const k = tokens[w.idx].cluster; if (k >= 0 && k !== FUNCTION_CLUSTER) c[k]++; }
    const top = Math.max(...c), prev = chords[bar - 1];
    chords.push({ bar, deg: top > 0 ? CLUSTER_DEGREE[c.indexOf(top)] : (prev ? prev.deg : 0), sus: false, cluster: top > 0 ? c.indexOf(top) : (prev ? prev.cluster : -1) });
  }
  chords[0].deg = 0; chords[0].sus = false;
  for (const s of plan.sentences) {
    const last = barOf(s.words[s.words.length - 1].beat), first = barOf(s.words[0].beat), multi = last > first;
    if (s.kind === '?') { chords[last].deg = 4; if (multi) chords[last - 1].deg = 1; }
    else if (s.kind === '…') { chords[last].deg = 5; chords[last].sus = true; }
    else { chords[last].deg = 0; if (multi) chords[last - 1].deg = 4; }
  }
  const mem = opts.memory && Array.isArray(opts.memory.theme) && opts.memory.theme.length ? opts.memory : null, sim = mem ? opts.memory.similarity : null;
  plan.memory = { mode: !mem ? 'none' : sim >= 0.55 ? 'recall' : sim < 0.4 ? 'deceptive' : 'none', similarity: sim };
  if (plan.memory.mode === 'deceptive') { const s = plan.sentences[plan.sentences.length - 1]; if (s.kind !== '?' && s.kind !== '…') { const last = barOf(s.words[s.words.length - 1].beat); chords[last].deg = 5; } }
  plan.chords = chords;

  /* 3. Dynamics: each phrase swells and falls; words in a subordinate clause are quieter; the last bars fade. */
  const arc = (b, s) => (s && s.end > s.start ? 0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, Math.max(0, (b - s.start) / (s.end - s.start)))) : 0.85);
  const sentAt = b => plan.sentences.find(s => b >= s.start && b <= s.end + 1) || null;
  const fade = b => (b > plan.endBeat - 4 ? Math.max(0.45, 1 - (b - (plan.endBeat - 4)) / 8) : 1);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ev = e => { e.vel = clamp(e.vel, 0.02, 0.95); e.pan = clamp(e.pan ?? 0, -0.8, 0.8); plan.events.push(e); };

  /* 4. Voice 3 (pad, from the clusters) and voice 5 (the drone's own pitches), one chord a bar. */
  let prevCluster = -1;
  for (const c of chords) {
    const third = c.sus ? 3 : 2, notes = [c.deg, c.deg + third, c.deg + 4];
    const dist = prevCluster >= 0 && c.cluster >= 0 ? Math.abs(c.cluster - prevCluster) / 19 : 0;
    if (dist > 0.35 || sentAt(c.bar * 4)?.kind === '?') notes.push(c.deg + 6);
    if (dist > 0.6) notes.push(c.deg + 8);
    const last = c.bar === chords.length - 1;
    ev({ beat: c.bar * 4, dur: last ? 8 : 4, kind: 'pad', midi: notes.map(d => degreeMidi(feel, d)), vel: 0.34 * arc(c.bar * 4, sentAt(c.bar * 4)) * fade(c.bar * 4) * (last ? 0.75 : 1), pan: 0, voice: 3 });
    if (c.cluster >= 0) prevCluster = c.cluster;
  }
  plan.drone = { midi: [degreeMidi(feel, 0) - 24, degreeMidi(feel, 4) - 24], entropy: key.entropy };

  /* 5. The words: melody (voice 1), predicted-next chords (voice 2), bass and colour (voice 4). */
  const repeats = {}, seen = {}; for (const w of plan.words) { const l = tokens[w.idx].lower; repeats[l] = (repeats[l] || 0) + 1; seen[l] = 0; }
  let prevDeg = null, lastProb = -9; const perBar = {}; const count = (bar, k) => (perBar[bar + k] = (perBar[bar + k] || 0) + 1);
  for (const w of plan.words) {
    const t = tokens[w.idx], bar = barOf(w.beat), chord = chords[bar], s = sentAt(w.beat), shape = arc(w.beat, s) * (w.depth ? 0.78 : 1) * fade(w.beat);
    const content = t.cluster !== FUNCTION_CLUSTER, rank = 1 - (t.freqScore ?? 0.5);
    let deg = 7 + Math.round(rank * 8);
    if (w.beat % 2 === 0) deg = snapToChord(deg, chord.deg);                      // strong beats lean on the chord
    if (prevDeg !== null && Math.abs(deg - prevDeg) > 6) deg += deg > prevDeg ? -7 : 7;   // no wild leaps
    prevDeg = deg;
    const pan = (t.cluster >= 0 ? (t.cluster / 19 * 2 - 1) * 0.5 : 0) + (s ? ((w.beat - s.start) / Math.max(1, s.end - s.start) - 0.5) * 0.3 : 0);
    ev({ beat: w.beat, dur: Math.min(w.dur, 1.5) * 0.95, kind: rank > 0.8 ? 'bell' : 'pluck', midi: [degreeMidi(feel, deg)], vel: (content ? 0.5 : 0.32) * shape, pan, voice: 1, word: w.idx, deg });
    if (repeats[t.lower] >= 3 && seen[t.lower]++ > 0) ev({ beat: w.beat + 1, dur: 1, kind: 'pluck', midi: [degreeMidi(feel, deg)], vel: 0.2 * shape, pan: -pan, voice: 1, word: w.idx, echo: true });   // a word that keeps coming back is answered by its own echo

    const pred = t.pred;
    if (pred && pred.length && w.beat - lastProb >= 2) {
      lastProb = w.beat;
      const certain = pred[0][1] >= 28, degs = [];
      for (const [, wt, sc] of pred.slice(0, 4)) { let d = 7 + Math.floor((1 - (sc ?? 0.5)) * 7); if (certain) d = snapToChord(d, chord.deg); if (!degs.some(x => x.d === d)) degs.push({ d, wt }); }
      for (const x of degs) ev({ beat: w.beat + 0.25, dur: 1.5, kind: 'rhodes', midi: [degreeMidi(feel, x.d)], vel: (0.12 + x.wt / 100 * 0.3) * shape, pan: -pan * 0.5, voice: 2, word: w.idx });
    }
    if (t.pos === 'noun' && t.len >= 4 && w.beat % 4 !== 0 && count(bar, 'n') <= 2) ev({ beat: w.beat, dur: 1, kind: 'bass', midi: [degreeMidi(feel, chord.deg + (perBar[bar + 'n'] % 2 ? 4 : 0)) - 12], vel: 0.4 * shape, pan: 0, voice: 4, word: w.idx });
    else if (t.pos === 'verb' && count(bar, 'v') <= 2) ev({ beat: w.beat + 0.5, dur: 1, kind: 'pluck', midi: [degreeMidi(feel, snapToChord(7 + 2, chord.deg) + 0)], vel: 0.3 * shape, pan: pan * 0.6, voice: 4, word: w.idx });
    else if ((t.pos === 'adjective' || t.pos === 'adverb') && count(bar, 'a') <= 2) ev({ beat: w.beat + 0.5, dur: 1, kind: 'bell', midi: [degreeMidi(feel, snapToChord(14 + 1, chord.deg))], vel: 0.2 * shape, pan: -pan, voice: 4, word: w.idx });
  }
  /* The bass holds each bar's root (from the first bar of words). */
  for (const c of chords) if (c.bar >= 1) ev({ beat: c.bar * 4, dur: 3, kind: 'bass', midi: [degreeMidi(feel, c.deg) - 12], vel: 0.5 * arc(c.bar * 4, sentAt(c.bar * 4)) * fade(c.bar * 4), pan: 0, voice: 4 });
  /* A bell on the tonic as the piece ends. */
  ev({ beat: plan.endBeat - 4, dur: 4, kind: 'bell', midi: [degreeMidi(feel, 0) + 12], vel: 0.35, pan: 0, voice: 1 });

  /* The opening tune, kept for the next piece; and the last piece's tune, brought back when this one is alike. */
  const mel = plan.events.filter(e => e.voice === 1 && e.deg !== undefined && !e.echo);
  if (mel.length) { const t0 = mel[0].beat; plan.theme = mel.filter(e => e.beat - t0 < 4).slice(0, 6).map(e => ({ deg: e.deg, at: e.beat - t0, dur: Math.max(0.5, Math.min(1.5, e.dur)) })); }
  else plan.theme = [];
  if (plan.memory.mode === 'recall') {
    for (const n of mem.theme) ev({ beat: Math.min(3.5, n.at), dur: n.dur, kind: 'rhodes', midi: [degreeMidi(feel, n.deg)], vel: 0.3, pan: 0.2, voice: 2, recall: true });
    if (sim >= 0.8) for (const n of mem.theme) ev({ beat: plan.endBeat - 4 + Math.min(3.5, n.at), dur: n.dur, kind: 'bell', midi: [degreeMidi(feel, n.deg) + 12], vel: 0.22, pan: -0.2, voice: 2, recall: true });
  }
  plan.events.sort((a, b) => a.beat - b.beat || a.voice - b.voice);
  return plan;
}

/**
 * What typing a word plays, for the live "play while typing" mode. `tokens` are the analysis of the text so far; the last one is the
 * word just finished. Returns { midi, kind, vel, key } for that word, in the key the text so far suggests, or null.
 */
export function liveNote(text, tokens, index = tokens.length - 1) {
  if (!tokens.length || !tokens[index]) return null;
  const key = deriveKey(tokens, scan(text)), t = tokens[index], rank = 1 - (t.freqScore ?? 0.5);
  return { midi: degreeMidi({ root: key.root, mode: key.mode }, 7 + Math.round(rank * 8)), kind: rank > 0.8 ? 'bell' : 'pluck', vel: t.cluster === FUNCTION_CLUSTER ? 0.25 : 0.45, key };
}
/** The soft chord a mark of punctuation plays while typing: a full stop settles home, a question reaches for the dominant, an ellipsis hangs. Null for other marks. */
export function liveMark(mark, key) {
  const feel = { root: key.root, mode: key.mode }, chord = (d, third = 2) => [d, d + third, d + 4].map(x => degreeMidi(feel, x));
  if (mark === '.' || mark === '!') return { midi: chord(0), kind: 'rhodes', vel: 0.28 };
  if (mark === '?') return { midi: chord(4), kind: 'rhodes', vel: 0.28 };
  if (mark === '…') return { midi: chord(5, 3), kind: 'rhodes', vel: 0.24 };
  return null;
}
