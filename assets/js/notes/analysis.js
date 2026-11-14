/**
 * /assets/js/notes/analysis.js
 * Plain, self-contained text analysis for a therapist's own notes. No network, no model download, no AI:
 * word counts, distinctive terms (TF-IDF), a small sentiment and emotion lexicon, style markers and theme suggestions.
 *
 * These are descriptive tools. They count words; they do not understand people. Lexicon sentiment misses irony and
 * context, and the results are meant to point the therapist back to their own notes, never to diagnose or score a client.
 * The word lists cover English and German.
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
const POS_DE = 'glücklich froh freude freut zufrieden ruhig entspannt erleichtert erleichterung hoffnung hoffnungsvoll stolz sicher geborgen unterstützt besser gut gut gelassen dankbar liebe geliebt stärker stark vertrauen vertraut lachen gelacht verbunden warm fortschritt'.split(' ');
const NEG_DE = 'traurig traurigkeit depressiv angst ängstlich sorge sorgen besorgt furcht wütend wut ärger verärgert schuld schuldig schuldgefühle scham beschämt einsam allein leer taub hoffnungslos wertlos müde erschöpft gefangen überfordert panik weinen geweint verletzt schmerz schmerzen schlecht schlechter schlimm schrecklich gestresst stress angespannt albtraum trauer verlust verloren abgelehnt verlassen versagt'.split(' ');
POS.push(...POS_DE); NEG.push(...NEG_DE); ['nicht', 'kein', 'keine', 'keinen', 'nie', 'niemals', 'ohne', 'kaum'].forEach(w => NEGATORS.add(w)); ['sehr', 'ganz', 'total', 'extrem', 'wirklich'].forEach(w => BOOST.add(w));
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
  sadness: 'sad* cry* grie* lonely empty numb hopeless miss* loss lost tearful traurig* trauer* weinen geweint einsam leer hoffnungslos vermiss*',
  anger: 'angr* furious resent* irritat* rage mad frustrat* annoy* wütend wut ärger* verärgert gereizt',
  fear: 'afraid scared fear* anxious anxiety worr* panic* dread* nervous terrif* angst ängst* sorge* sorgen besorgt panik furcht nervös',
  shame: 'asham* shame guilt* embarrass* worthless humiliat* blame* scham* schuld* beschämt wertlos peinlich',
  joy: 'happy joy* glad delight* excited laugh* enjoy* grateful proud glücklich freude froh lachen stolz dankbar',
  calm: 'calm relax* peace* safe steady settled ease content ruhig gelassen entspannt frieden sicher geborgen',
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
  sleep: 'schlaf* schlaflos* alptraum* albtraum* sleep* insomnia tired exhaust* nightmare* dream* bed rest*',
  anxiety: 'angst* ängst* sorge* panik anxi* worr* panic* nervous dread* afraid fear* tense',
  'low-mood': 'depress* sad* hopeless empty numb flat low',
  grief: 'trauer* verlust gestorben tod beerdigung vermiss* grie* loss lost died death funeral miss* mourn*',
  anger: 'angr* furious resent* rage irritat* frustrat*',
  'self-criticism': 'versager* wertlos dumm nutzlos failure stupid worthless useless hate* blame* should perfect* inadequate',
  avoidance: 'avoid* postpone* procrastinat* cancel* hide hiding escape putting',
  relationships: 'partner* freund* familie streit* scheidung trennung partner husband wife boyfriend girlfriend friend* family argument* divorce break*up lonely',
  work: 'arbeit* beruf chef* kollegen stress* work* job boss colleague* deadline* career burnout manager office',
  body: 'body pain headache stomach chest breath* heart tension appetite',
  'self-worth': 'worth* proud confident confidence esteem deserve*',
  trauma: 'trauma* missbrauch* gewalt übergriff* flashback* abuse* assault flashback* trigger* unsafe violence',
};
const themeRx = Object.fromEntries(Object.entries(THEME_SEEDS).map(([k, v]) => [k, rx(v)]));
/** Which seed themes a note touches, with how many words matched. The therapist decides whether any of it is a real theme. */
export function suggestThemes(text, minHits = 2) {
  const w = tokenize(text), out = [];
  for (const [k, r] of Object.entries(themeRx)) { const hits = w.filter(t => r.test(t)); if (hits.length >= minHits) out.push({ theme: k, hits: hits.length, words: [...new Set(hits)].slice(0, 6) }); }
  return out.sort((a, b) => b.hits - a.hits);
}

// ── phrases, change over time, and what travels together ──
/** Two-word phrases that sit next to each other in the text (not across a stop word), most frequent first. `notes` are strings. */
export function bigrams(notes, n = 15, { minCount = 2 } = {}) {
  const m = new Map();
  for (const t of notes) { const w = tokenize(t), seen = new Set(); for (let i = 0; i + 1 < w.length; i++) { const a = w[i], b = w[i + 1]; if (a.length < 3 || b.length < 3 || STOP.has(a) || STOP.has(b) || /^\d+$/.test(a + b)) continue; const k = a + ' ' + b; m.set(k, (m.get(k) || 0) + 1); seen.add(k); } }
  return [...m].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([phrase, count]) => ({ phrase, count }));
}

/** How often a word or phrase appears in each text, in order: a series to draw as a line. */
export function termSeries(notes, term) {
  const t = term.toLocaleLowerCase();
  return notes.map(x => { const w = tokenize(x); if (!t.includes(' ')) return w.filter(a => a === t || (t.length > 4 && a.startsWith(t))).length; return w.slice(0, -1).filter((a, i) => a + ' ' + w[i + 1] === t).length; });
}

/** Words and phrases that are rising or fading: the last third of the entries against the first two thirds, per entry. Needs at least 4 entries. */
export function shifts(notes, { n = 6, minTotal = 3 } = {}) {
  if (notes.length < 4) return { rising: [], fading: [] };
  const cut = Math.max(1, Math.round(notes.length * 2 / 3)), early = notes.slice(0, cut), late = notes.slice(cut);
  const tally = list => { const m = new Map(); for (const t of list) { for (const [w, c] of counts(t)) m.set(w, (m.get(w) || 0) + c); for (const { phrase, count } of bigrams([t], 99, { minCount: 1 })) m.set(phrase, (m.get(phrase) || 0) + count); } return m; };
  const a = tally(early), b = tally(late), all = new Set([...a.keys(), ...b.keys()]), rows = [];
  for (const k of all) { const ca = a.get(k) || 0, cb = b.get(k) || 0; if (ca + cb < minTotal) continue; const ra = ca / early.length, rb = cb / late.length; rows.push({ term: k, early: ca, late: cb, change: rb - ra }); }
  const up = rows.filter(r => r.change > 0).sort((x, y) => y.change - x.change || x.term.localeCompare(y.term)).slice(0, n), down = rows.filter(r => r.change < 0).sort((x, y) => x.change - y.change || x.term.localeCompare(y.term)).slice(0, n);
  return { rising: up, fading: down };
}

/** Emotion words per 100 words in each text, as a series for each family: how the wording changes across the record. */
export function emotionSeries(notes) { const rows = notes.map(emotions); return Object.fromEntries(Object.keys(EMOTIONS).map(k => [k, rows.map(r => r[k])])); }

/** Words that are more common in the entries that mention something than in those that do not (smoothed ratio), for "the words around this". */
export function wordsAround(texts, mentions, n = 8) {
  const withT = [], without = []; texts.forEach((t, i) => (mentions[i] ? withT : without).push(t));
  if (!withT.length) return [];
  const a = new Map(), b = new Map(); for (const t of withT) for (const [w, c] of counts(t)) a.set(w, (a.get(w) || 0) + c); for (const t of without) for (const [w, c] of counts(t)) b.set(w, (b.get(w) || 0) + c);
  const na = [...a.values()].reduce((x, y) => x + y, 0) || 1, nb = [...b.values()].reduce((x, y) => x + y, 0) || 1;
  return [...a].filter(([, c]) => c >= 2 || !without.length).map(([w, c]) => ({ word: w, count: c, lift: (c / na) / (((b.get(w) || 0) + 0.5) / (nb + 0.5 * a.size)) })).sort((x, y) => y.lift - x.lift || y.count - x.count || x.word.localeCompare(y.word)).slice(0, n);
}
