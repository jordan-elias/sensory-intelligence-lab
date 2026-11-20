import test from 'node:test'; import assert from 'node:assert/strict';
import { parseMarkdownRecord, headingDate } from '../assets/js/notes/import.js';
import { toMarkdown } from '../assets/js/notes/graph.js';
test('dates in headings: ISO, German style, with a title after, and impossible ones refused', () => {
  assert.deepEqual(headingDate('2026-03-04'), { date: '2026-03-04', rest: '' });
  assert.deepEqual(headingDate('04.03.2026 – second session'), { date: '2026-03-04', rest: 'second session' });
  assert.equal(headingDate('2026-02-30'), null); assert.equal(headingDate('About the people'), null);
});
test('our own export reads back as the same notes, and re-importing flags them as copies', () => {
  const notes = [{ date: '2026-01-10', text: 'Talked about [[Anna]] and #sleep.' }, { date: '2026-02-01', text: 'Second note.\n\nWith a paragraph.' }];
  const md = toMarkdown('Client A', notes), r = parseMarkdownRecord(md);
  assert.equal(r.title, 'Client A'); assert.equal(r.notes.length, 2);
  assert.deepEqual(r.notes.map(n => [n.date, n.text]), [['2026-01-10', 'Talked about [[Anna]] and #sleep.'], ['2026-02-01', 'Second note.\n\nWith a paragraph.']]);
  assert.ok(r.notes.every(n => !n.dup));
  assert.ok(parseMarkdownRecord(md, { existing: notes }).notes.every(n => n.dup));
});
test('sections without a date are listed as skipped, not guessed', () => {
  const r = parseMarkdownRecord('# X\n\n## Intake form\n\nstuff\n\n## 2026-05-05\n\nreal note\n');
  assert.equal(r.notes.length, 1); assert.deepEqual(r.skipped, ['Intake form']);
});
test('headings inside code fences are not sections; front matter is dropped; a file with no headings is one note', () => {
  const r = parseMarkdownRecord('---\ntags: a\n---\n# X\n\n## 2026-05-05\n\n```\n## 2026-06-06\n```\n');
  assert.equal(r.notes.length, 1);
  const u = parseMarkdownRecord('Just some text.\nMore.', { today: '2026-11-20' });
  assert.equal(u.undated, true); assert.deepEqual(u.notes.map(n => [n.date, n.text]), [['2026-11-20', 'Just some text.\nMore.']]);
  assert.equal(parseMarkdownRecord('').notes.length, 0);
});
test('a note over the limit is marked, not cut', () => {
  const r = parseMarkdownRecord('## 2026-01-01\n\n' + 'a'.repeat(20001)); assert.equal(r.notes[0].tooLong, true); assert.equal(r.notes[0].text.length, 20001);
});
