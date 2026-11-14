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
