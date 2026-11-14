import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNote, plain, sentences } from '../../assets/js/notes/parse.js';
import { tokenize, wordCount, distinctive, recurring, sentiment, emotions, style, suggestThemes } from '../../assets/js/notes/analysis.js';
import { items, backlinks, matrix, graph, notRevisited, timeline, toMarkdown } from '../../assets/js/notes/graph.js';

const NOTES = [
  { id: 'a', date: '2026-01-10', text: 'First session. [[Mother]] was critical growing up. #perfectionism shows up at work. He cannot sleep, is exhausted and worries every night.' },
  { id: 'b', date: '2026-01-24', text: 'Talked about [[Mother]] again. #perfectionism and #avoidance around the [[Move 2019]]. Felt sad and lonely, not happy.' },
  { id: 'c', date: '2026-02-07', text: 'Work was better. #perfectionism eased. Proud of the presentation.' },
  { id: 'd', date: '2026-02-21', text: 'Slept well. Good week, feels hopeful and calm.' },
  { id: 'e', date: '2026-03-07', text: 'Steady week. Walking daily, in good spirits.' },
  { id: 'f', date: '2026-03-21', text: 'Brief check in. Things are fine.' },
];

test('links and tags are read, de-duplicated and case-insensitive', () => {
  const p = parseNote('See [[Mother]] and [[mother]] and [[Dr Lee|Lee]]. #Grief, #grief and #self-worth.');
  assert.deepEqual(p.links.map(l => l.key), ['mother', 'dr lee']); assert.deepEqual(p.tags.map(t => t.key), ['grief', 'self-worth']);
  assert.equal(parseNote('issue #12 and C# are not tags? ').tags.length, 1);
});
test('plain text drops the markup and sentences split', () => {
  assert.equal(plain('Met [[Dr Lee|Lee]] about #sleep-problems.'), 'Met Lee about sleep problems.');
  assert.deepEqual(sentences('One. Two!\nThree'), ['One.', 'Two!', 'Three']);
});
test('counting and distinctive words', () => {
  assert.equal(wordCount('Hello there, world.'), 3);
  const d = distinctive(['river river stones sea', 'river bridge bridge city', 'sea city sea'], 3, { minCount: 2 });
  assert.equal(d[0][0].word, 'river'); assert.equal(d[1][0].word, 'bridge'); assert.equal(d[2][0].word, 'sea');
  assert.equal(recurring(['alpha alpha beta', 'alpha beta gamma'])[0].word, 'alpha');
});
test('sentiment handles negation and intensifiers, and says how many words counted', () => {
  assert.ok(sentiment('I am happy and calm').score > 0.9); assert.ok(sentiment('not happy at all').score < 0);
  assert.ok(sentiment('really sad').negative > sentiment('sad').negative); assert.equal(sentiment('The table is brown').scored, 0);
});
test('emotion families and style markers', () => {
  const e = emotions('sad and scared and lonely'); assert.ok(e.sadness > 0 && e.fear > 0 && e.joy === 0);
  const s = style('I always think I never get it right. Why me?'); assert.ok(s.firstPerson > 20 && s.absolutes === 2 && s.questions === 1);
});
test('theme suggestions need at least two matching words', () => {
  assert.equal(suggestThemes('He cannot sleep and is always tired')[0].theme, 'sleep'); assert.deepEqual(suggestThemes('He slept'), []);
});
test('items, backlinks and the themes by sessions table', () => {
  const it = items(NOTES); assert.equal(it[0].name.toLowerCase() === 'perfectionism' || it[0].name === 'Mother', true);
  const b = backlinks(NOTES, 'mother'); assert.deepEqual(b.map(x => x.id), ['b', 'a']); assert.match(b[1].context, /critical/);
  const m = matrix(NOTES, 'theme'), r = m.rows.find(x => x.name === 'perfectionism'); assert.deepEqual(r.cells, [1, 1, 1, 0, 0, 0]);
});
test('the graph joins what shows up together, and marks what shares a sentence', () => {
  const g = graph(NOTES), e = g.edges.find(x => x.source.includes('mother') || x.target.includes('mother'));
  assert.ok(g.nodes.find(n => n.name === 'Move 2019')); const pm = g.edges.find(x => /perfectionism/.test(x.source + x.target) && /avoidance/.test(x.source + x.target));
  assert.equal(pm.sessions, 1); assert.equal(pm.close, 1); assert.ok(e.sessions >= 1);
});
test('a theme not mentioned for several sessions is flagged', () => {
  const n = notRevisited(NOTES), p = n.find(x => x.name === 'perfectionism'); assert.equal(p.sessionsSince, 3); assert.ok(!n.find(x => x.name === 'Move 2019'));
});
test('the timeline carries tone and suggested themes', () => {
  const t = timeline(NOTES); assert.equal(t.length, 6); assert.ok(t[1].tone < 0 && t[3].tone > 0); assert.ok(t[0].suggested.includes('sleep'));
});
test('markdown export keeps the links and the order', () => {
  const md = toMarkdown('Client A', [NOTES[1], NOTES[0]]); assert.match(md, /^# Client A/); assert.ok(md.indexOf('2026-01-10') < md.indexOf('2026-01-24')); assert.match(md, /\[\[Mother\]\]/);
});

import { intakeEntry, familyEntry, familyPeople } from '../../assets/js/notes/entries.js';
test('intake and family history become entries; contact details stay out; people become links', () => {
  const defs = [{ key: 'name', label: 'Name' }, { key: 'contact', label: 'Contact' }, { key: 'reason', label: 'Why', short: 'Reason for therapy' }];
  const e = intakeEntry({ fields: { name: 'Sam', contact: '0151 555', reason: 'Cannot sleep, worried about work' }, submitted_at: '2026-01-02T10:00:00Z' }, defs);
  assert.equal(e.date, '2026-01-02'); assert.match(e.text, /Reason for therapy: Cannot sleep/); assert.ok(!/0151|Sam/.test(e.text));
  assert.equal(intakeEntry({ fields: { name: 'Sam' } }, defs), null);
  const fam = { doc: { overview: 'Close but busy.', members: [{ name: 'Anna', relationship: 'Mother', status: 'Living', description: 'Critical.', history: '', impact: 'Shapes work.' }] }, sent_at: '2026-01-05T00:00:00Z' };
  const f = familyEntry(fam); assert.match(f.text, /\[\[Anna\]\], \(Mother\), living\./); assert.deepEqual(parseNote(f.text).links.map(l => l.name), ['Anna']);
  assert.deepEqual(familyPeople(fam), [{ name: 'Anna', relationship: 'Mother' }]); assert.equal(familyEntry({ doc: { overview: '', members: [] } }), null);
});

import { bigrams, termSeries, shifts, emotionSeries, wordsAround } from '../../assets/js/notes/analysis.js';
import { related } from '../../assets/js/notes/graph.js';
import { lifeEvents, lifeLanes, birthYearOf } from '../../assets/js/notes/life.js';
test('phrases: adjacent content words, not across stop words', () => {
  const b = bigrams(['panic attacks before work', 'more panic attacks at night', 'the work of panic'], 5);
  assert.equal(b[0].phrase, 'panic attacks'); assert.equal(b[0].count, 2); assert.ok(!b.find(x => x.phrase === 'panic work'));
});
test('a word or phrase can be followed through the record', () => {
  const t = ['panic attacks started', 'no panic this week', 'panic attacks again, panic attacks worse'];
  assert.deepEqual(termSeries(t, 'panic'), [1, 1, 2]); assert.deepEqual(termSeries(t, 'panic attacks'), [1, 0, 2]); assert.deepEqual(termSeries(t, 'xyz'), [0, 0, 0]);
});
test('rising and fading words compare the recent entries with the earlier ones', () => {
  const t = ['sleep sleep worry', 'sleep worry', 'worry sleep', 'walking garden friends', 'walking friends calm', 'garden walking'];
  const s = shifts(t, { minTotal: 3 }); assert.ok(s.rising.some(r => r.term === 'walking')); assert.ok(s.fading.some(r => r.term === 'sleep')); assert.deepEqual(shifts(['a b', 'c d'], {}), { rising: [], fading: [] });
});
test('emotion wording by entry, as a series', () => {
  const e = emotionSeries(['sad and lonely', 'calm and happy']); assert.ok(e.sadness[0] > 0 && e.sadness[1] === 0 && e.joy[1] > 0 && e.calm[1] > 0);
});
test('words around a topic are the ones that go with it', () => {
  const texts = ['mother critical perfect homework', 'mother critical dinner', 'garden walking sunshine', 'garden sunshine friends'];
  const w = wordsAround(texts, [true, true, false, false], 3).map(x => x.word); assert.ok(w.includes('critical') && !w.includes('garden'));
});
test('what an item travels with: other items and the words around it', () => {
  const r = related(NOTES, 'Mother'); assert.equal(r.mentions, 2); assert.ok(r.together.some(x => x.name === 'perfectionism')); assert.ok(r.together[0].sessions >= 1);
});
test('the life timeline fills itself in from years, ages and stages', () => {
  const en = [{ id: 'n1', date: '2026-02-01', source: 'note', text: 'Her parents divorced in 2005 when she was 9. Moved to Berlin in 2019 with [[Dad]]. As a teenager she stopped playing music. Cried at age 14, in the move too.' }];
  const ev = lifeEvents(en, { birthYear: 1996, family: [{ name: 'Anna', relationship: 'Mother', born: '1966' }] });
  const find = t => ev.find(e => e.text.includes(t));
  assert.equal(find('divorced').age, 9); assert.equal(ev.filter(e => e.text.includes('divorced')).map(e => e.year).sort().join(), '2005,2005');
  assert.equal(find('Moved to Berlin').year, 2019); assert.equal(find('Moved to Berlin').age, 23);
  assert.equal(ev.find(e => e.kind === 'stage' && e.text.includes('teenager')).stage, 'Teenage years');
  assert.deepEqual(find('Moved to Berlin').people, ['Dad']); assert.ok(ev.find(e => e.text === 'Born' && e.year === 1996)); assert.ok(ev.find(e => /Anna.*born/.test(e.text) && e.year === 1966));
  assert.ok(ev.map(e => e.year).every((y, i, a) => i === 0 || y >= a[i - 1]), 'in time order');
});
test('without a birth year, ages stay in their own lane and nothing is invented', () => {
  const ev = lifeEvents([{ id: 'n', date: '2026-01-01', text: 'At age 7 the family moved. In 2019 things changed. Weather was nice.' }]);
  const l = lifeLanes(ev); assert.equal(l.dated.length, 1); assert.equal(l.byAge.length, 1); assert.equal(l.byAge[0].age, 7); assert.equal(ev.length, 2);
  assert.equal(birthYearOf('1994-05-02'), 1994); assert.equal(birthYearOf('soon'), null);
});

test('German notes are read too: sentiment, negation, themes and ages', () => {
  assert.ok(sentiment('Sie ist sehr glücklich und ruhig').score > 0.9); assert.ok(sentiment('nicht glücklich, traurig und einsam').score < 0);
  assert.ok(emotions('traurig und einsam, voller Angst').sadness > 0 && emotions('traurig und einsam, voller Angst').fear > 0);
  assert.equal(suggestThemes('Sie kann nicht schlafen, Schlaflosigkeit und Albträume')[0].theme, 'sleep');
  const ev = lifeEvents([{ id: 'n', date: '2026-01-01', text: 'Im Alter von 9 Jahren zog die Familie um. Als Kind war sie oft allein.' }]);
  assert.ok(ev.some(e => e.age === 9) && ev.some(e => e.stage === 'Childhood'));
});
