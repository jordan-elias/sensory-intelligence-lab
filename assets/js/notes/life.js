/**
 * /assets/js/notes/life.js
 * Fills in a life timeline automatically from what the therapist has written: years ("in 2019"), ages ("at age 7",
 * "when she was 12"), stages ("as a child", "in her twenties") and the family history's birth years. Each event keeps the
 * sentence it came from, the note it came from and the people linked in it. It reads the therapist's own words on their
 * own device; a date it cannot find simply does not appear. Nothing is guessed beyond what is written.
 */
import { rawSentences, parseNote, plain } from './parse.js';

const THIS_YEAR = () => new Date().getFullYear();
const STAGES = [
  [/\bals\s+(?:kleines\s+)?kind\b|\bkindheit\b|\baufgewachsen\b/i, 'Childhood', 6, 11],
  [/\bals\s+(?:teenager|jugendliche[rn]?)\b|\bjugend\b/i, 'Teenage years', 12, 17],
  [/\b(?:as|when)\s+(?:a|an)\s+(?:baby|infant|toddler)\b|\binfancy\b|\bearly childhood\b/i, 'Early childhood', 0, 5],
  [/\b(?:as|when)\s+(?:a|an)\s+(?:small |young )?(?:child|kid)\b|\bchildhood\b|\bgrowing up\b|\bgrew up\b|\bprimary school\b/i, 'Childhood', 6, 11],
  [/\b(?:as|when)\s+(?:a|an)\s+(?:teenager|teen|adolescent)\b|\bteens?\b(?!\w)|\bteenage years\b|\bsecondary school\b|\bhigh school\b/i, 'Teenage years', 12, 17],
  [/\bin\s+(?:his|her|their|my)\s+(?:early |late |mid )?twenties\b|\buniversity\b|\bcollege\b/i, 'Twenties', 20, 29],
  [/\bin\s+(?:his|her|their|my)\s+(?:early |late |mid )?thirties\b/i, 'Thirties', 30, 39],
  [/\bin\s+(?:his|her|their|my)\s+(?:early |late |mid )?forties\b/i, 'Forties', 40, 49],
  [/\bin\s+(?:his|her|their|my)\s+(?:early |late |mid )?(?:fifties|sixties|seventies)\b/i, 'Later life', 50, 79],
];
const AGE = [
  /\b(?:im\s+alter\s+von|mit)\s+(\d{1,2})\s*(?:jahren?)?\b/gi,
  /\b(?:als|wenn)\s+(?:er|sie|ich|wir)\s+(\d{1,2})\s+(?:war|waren|wurde)\b/gi,
  /\b(?:at|by|since|around|from|until|till|before|after)\s+(?:the\s+)?age\s+(?:of\s+)?(\d{1,2})\b/gi,
  /\baged?\s+(\d{1,2})\b/gi,
  /\b(?:when|while|since)\s+(?:he|she|they|i|we|\w+)\s+(?:was|were|am|turned)\s+(\d{1,2})\b/gi,
  /\b(?:at|by)\s+(\d{1,2})\s+years?\s+old\b/gi,
  /\b(\d{1,2})\s*[- ]years?[- ]old\s+when\b/gi,
];
const YEAR = /(?<![\d/.-])((?:19|20)\d{2})(?![\d])/g;

/** Birth year from a date (YYYY-MM-DD or a year) or null. */
export const birthYearOf = s => { const m = /^(\d{4})/.exec(String(s || '')); const y = m ? +m[1] : null; return y && y > 1900 && y <= THIS_YEAR() ? y : null; };

/** `entries` are { id, date, text, source }. Returns events in time order. */
export function lifeEvents(entries, { birthYear = null, family = [] } = {}) {
  const out = [], now = THIS_YEAR(), seen = new Set();
  const add = e => { const k = `${e.kind}|${e.year ?? ''}|${e.age ?? ''}|${e.stage ?? ''}|${e.text}`; if (seen.has(k)) return; seen.add(k); out.push(e); };
  for (const en of entries) {
    for (const raw of rawSentences(en.text)) {
      const text = plain(raw), links = parseNote(raw).links.map(l => l.name), base = { text, entryId: en.id, entryDate: en.date, source: en.source || 'note', people: links };
      const ages = new Set(); for (const re of AGE) { re.lastIndex = 0; for (const m of raw.matchAll(re)) { const a = +m[1]; if (a >= 0 && a <= 100) ages.add(a); } }
      for (const a of ages) add({ ...base, kind: 'age', age: a, year: birthYear ? birthYear + a : null, label: `Age ${a}` });
      YEAR.lastIndex = 0; for (const m of raw.matchAll(YEAR)) { const y = +m[1]; if (y >= 1900 && y <= now + 1) add({ ...base, kind: 'year', year: y, age: birthYear ? y - birthYear : null, label: String(y) }); }
      if (!ages.size) for (const [re, stage, lo, hi] of STAGES) if (re.test(raw)) { add({ ...base, kind: 'stage', stage, age: lo, ageTo: hi, year: birthYear ? birthYear + lo : null, label: stage }); break; }
    }
  }
  for (const f of family) { const y = birthYearOf(f.born); if (y) add({ kind: 'year', year: y, age: birthYear ? y - birthYear : null, label: String(y), text: `${f.name}${f.relationship ? ` (${f.relationship})` : ''} born`, entryId: 'family', entryDate: '', source: 'family', people: [f.name] }); }
  if (birthYear) add({ kind: 'year', year: birthYear, age: 0, label: String(birthYear), text: 'Born', entryId: 'intake', entryDate: '', source: 'intake', people: [] });
  const sortKey = e => (e.year != null ? e.year + (e.kind === 'stage' ? 0.1 : 0) : 1e6 + (e.age ?? 0));
  return out.sort((a, b) => sortKey(a) - sortKey(b) || (a.age ?? 0) - (b.age ?? 0) || a.text.localeCompare(b.text));
}

/** Groups events: those with a year on a single axis; those known only by age or stage in their own lane (when no birth year is known). */
export function lifeLanes(events) {
  const dated = events.filter(e => e.year != null), byAge = events.filter(e => e.year == null);
  return { dated, byAge };
}
