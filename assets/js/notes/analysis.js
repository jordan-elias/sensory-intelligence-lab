/**
 * /assets/js/notes/analysis.js
 * Plain, self-contained text analysis for a therapist's own notes. No network, no model download, no AI:
 * word counts, distinctive terms (TF-IDF), a small sentiment and emotion lexicon, style markers and theme suggestions.
 *
 * These are descriptive tools. They count words; they do not understand people. Lexicon sentiment misses irony and
 * context, and the results are meant to point the therapist back to their own notes, never to diagnose or score a client.
 * The word lists are English; the stop words also cover German.
 */
import { plain } from './parse.js';

const STOP = new Set(`a about after again all am an and any are as at be because been before being but by can could did do does doing down for from had has have having he her here hers him his how i if in into is it its just me more most my no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who why will with would you your yours
aber als also am an auch auf aus bei bin bis da das dass dem den der des die doch du ein eine einen einem einer er es für hat hatte ich ihr im in ist ja kann man mein mit nach nicht noch nur oder sehr sich sie sind so über um und uns von war was wenn wie wir wird zu zum zur`.split(/\s+/));

export const tokenize = text => (plain(text).toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || []).map(w => w.replace('’', "'"));
export const contentWords = text => tokenize(text).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

export function wordCount(text) { return tokenize(text).length; }
export function counts(text) { const m = new Map(); for (const w of contentWords(text)) m.set(w, (m.get(w) || 0) + 1); return m; }

/** The words that set each note apart from the others (term frequency × inverse document frequency). `notes` are strings. */
export function distinctive(notes, n = 8, { minCount = 2 } = {}) {
  const docs = notes.map(counts), N = docs.length, df = new Map();
  for (const d of docs) for (const w of d.keys()) df.set(w, (df.get(w) || 0) + 1);
  return docs.map(d => {
    const total = [...d.values()].reduce((a, b) => a + b, 0) || 1;
    return [...d].filter(([, c]) => c >= (N > 1 ? minCount : 1)).map(([w, c]) => ({ word: w, count: c, score: (c / total) * Math.log(1 + N / df.get(w)) })).sort((a, b) => b.score - a.score || a.word.localeCompare(b.word)).slice(0, n);
  });
}

/** Words that recur across the whole record, most frequent first. */
export function recurring(notes, n = 15) {
  const all = new Map(); for (const t of notes) for (const [w, c] of counts(t)) all.set(w, (all.get(w) || 0) + c);
  return [...all].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([word, count]) => ({ word, count }));
}

// ── sentiment and emotion: small word lists; `*` matches any ending ──
const POS = 'happy glad joy joyful love loved loving calm relaxed relief relieved hope hopeful hoping proud pride confident safe supported better good great well fine peaceful grateful thankful enjoy enjoyed enjoying laugh laughed excited content comfortable connected warm kind progress improved improving strong stronger free light trust trusted'.split(' ');
const NEG = 'sad sadness depressed depression anxious anxiety worry worried worrying afraid scared fear fearful angry anger furious resent resentment hate hated guilty guilt ashamed shame lonely alone empty numb hopeless worthless tired exhausted stuck trapped overwhelmed panic panicked cry cried crying hurt hurting pain painful bad worse worst terrible awful upset irritable ignored rejected abandoned failure failed stress stressed tense dread dreading nightmare lost grief grieving'.split(' ');
const NEGATORS = new Set(['not', "n't", 'no', 'never', 'without', "don't", "doesn't", "didn't", "isn't", "wasn't", "can't", "won't", "couldn't", "wouldn't", "haven't", "hasn't", "hadn't", "aren't", "weren't", 'neither', 'nor', 'hardly']);
const BOOST = new Set(['very', 'really', 'so', 'extremely', 'completely', 'totally', 'deeply', 'incredibly']);
const POSS = new Set(POS), NEGS = new Set(NEG);

/** Valence of a text from -1 to 1, with simple negation ("not happy") and intensifiers. `scored` is how many words counted; low means low confidence. */
export function sentiment(text) {
  const w = tokenize(text); let pos = 0, neg = 0, scored = 0;
  w.forEach((t, i) => {
    const isP = POSS.has(t), isN = NEGS.has(t); if (!isP && !isN) return;
    const back = w.slice(Math.max(0, i - 3), i), flip = back.some(x => NEGATORS.has(x)), boost = back.some(x => BOOST.has(x)) ? 1.5 : 1;
    const positive = isP !== flip; scored++; if (positive) pos += boost; else neg += boost;
  });
  const sum = pos + neg; return { score: sum ? (pos - neg) / sum : 0, positive: pos, negative: neg, scored, words: w.length };
}

export const EMOTIONS = {
  sadness: 'sad* cry* grie* lonely empty numb hopeless miss* loss lost tearful',
  anger: 'angr* furious resent* irritat* rage mad frustrat* annoy*',
  fear: 'afraid scared fear* anxious anxiety worr* panic* dread* nervous terrif*',
  shame: 'asham* shame guilt* embarrass* worthless humiliat* blame*',
  joy: 'happy joy* glad delight* excited laugh* enjoy* grateful proud',
  calm: 'calm relax* peace* safe steady settled ease content',
};
const rx = list => new RegExp('^(?:' + list.split(' ').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*$/, '[\\p{L}]*')).join('|') + ')$', 'u');
const EMO = Object.fromEntries(Object.entries(EMOTIONS).map(([k, v]) => [k, rx(v)]));
/** Emotion words per 100 words, for each family. */
export function emotions(text) {
  const w = tokenize(text), out = {}; for (const k of Object.keys(EMO)) out[k] = 0;
  for (const t of w) for (const k of Object.keys(EMO)) if (EMO[k].test(t)) out[k]++;
  for (const k of Object.keys(out)) out[k] = w.length ? Math.round((out[k] / w.length) * 1000) / 10 : 0;
  return out;
}

/** Style markers that researchers use to describe how someone writes or talks: descriptive, never a diagnosis. */
export function style(text) {
  const w = tokenize(text), n = w.length || 1, c = list => w.filter(t => list.has(t)).length;
  const FIRST = new Set(['i', "i'm", "i've", "i'll", "i'd", 'me', 'my', 'mine', 'myself']), ABS = new Set(['always', 'never', 'everyone', 'nobody', 'nothing', 'everything', 'completely', 'totally', 'entirely']), PAST = new Set(['was', 'were', 'had', 'did', 'used', 'remember', 'remembered', 'ago']), FUT = new Set(['will', "i'll", 'going', 'tomorrow', 'plan', 'planning', 'hope', 'next']);
  return { firstPerson: Math.round((c(FIRST) / n) * 1000) / 10, absolutes: c(ABS), questions: (String(text).match(/\?/g) || []).length, pastFocus: c(PAST), futureFocus: c(FUT) };
}

// ── themes: seed word lists the therapist can accept, rename or ignore ──
export const THEME_SEEDS = {
  sleep: 'sleep* insomnia tired exhaust* nightmare* dream* bed rest*',
  anxiety: 'anxi* worr* panic* nervous dread* afraid fear* tense',
  'low-mood': 'depress* sad* hopeless empty numb flat low',
  grief: 'grie* loss lost died death funeral miss* mourn*',
  anger: 'angr* furious resent* rage irritat* frustrat*',
  'self-criticism': 'failure stupid worthless useless hate* blame* should perfect* inadequate',
  avoidance: 'avoid* postpone* procrastinat* cancel* hide hiding escape putting',
  relationships: 'partner husband wife boyfriend girlfriend friend* family argument* divorce break*up lonely',
  work: 'work* job boss colleague* deadline* career burnout manager office',
  body: 'body pain headache stomach chest breath* heart tension appetite',
  'self-worth': 'worth* proud confident confidence esteem deserve*',
  trauma: 'trauma* abuse* assault flashback* trigger* unsafe violence',
};
const themeRx = Object.fromEntries(Object.entries(THEME_SEEDS).map(([k, v]) => [k, rx(v)]));
/** Which seed themes a note touches, with how many words matched. The therapist decides whether any of it is a real theme. */
export function suggestThemes(text, minHits = 2) {
  const w = tokenize(text), out = [];
  for (const [k, r] of Object.entries(themeRx)) { const hits = w.filter(t => r.test(t)); if (hits.length >= minHits) out.push({ theme: k, hits: hits.length, words: [...new Set(hits)].slice(0, 6) }); }
  return out.sort((a, b) => b.hits - a.hits);
}
