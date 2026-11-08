import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSessions, nextSession, describe } from '../../assets/js/therapist/sessions.js';
import { prettyKey, toRows, worksheetLabel } from '../../assets/js/therapist/doc-render.js';

const NOW = new Date('2027-01-10T12:00:00Z');
const S = (id, at, status = 'scheduled', type = 'subscriber-session') => ({ id, scheduled_at: at, completed_at: null, status, event_type: type });

test('sessions split into upcoming (soonest first) and past (latest first); cancelled is never upcoming', () => {
  const r = splitSessions([S('a', '2027-01-20T10:00:00Z'), S('b', '2027-01-12T10:00:00Z'), S('c', '2027-01-01T10:00:00Z'), S('d', '2027-01-05T10:00:00Z'), S('x', '2027-01-15T10:00:00Z', 'cancelled')], NOW);
  assert.deepEqual(r.upcoming.map(s => s.id), ['b', 'a']);
  assert.deepEqual(r.past.map(s => s.id), ['x', 'd', 'c'].sort((p, q) => ({ x: '2027-01-15', d: '2027-01-05', c: '2027-01-01' }[q]).localeCompare({ x: '2027-01-15', d: '2027-01-05', c: '2027-01-01' }[p])));
});

test('nextSession and describe', () => {
  assert.equal(nextSession([]), null);
  const d = describe({ scheduled_at: '2027-01-20T10:00:00Z', completed_at: '2027-01-20T10:50:00Z', event_type: 'subscriber-session', status: 'scheduled' });
  assert.equal(d.minutes, 50); assert.equal(d.kind, 'Monthly session'); assert.equal(d.cancelled, false);
});

test('labels are tidied', () => {
  assert.equal(prettyKey('q1_feelings'), 'Q1 feelings'); assert.equal(prettyKey('copingSkill'), 'Coping skill');
  assert.equal(worksheetLabel('goals-values'), 'Goals and values'); assert.equal(worksheetLabel('new-thing'), 'New thing');
});

test('toRows skips empty answers and keeps order and nesting', () => {
  const rows = toRows({ a_one: 'x', empty: '', none: null, list: ['p', '', 'q'], chapters: [{ title: 'T', body: 'B' }] });
  assert.deepEqual(rows.map(r => r.label), ['A one', 'List', 'Chapters']);
  assert.deepEqual(rows[1].children.map(c => c.text), ['p', 'q']);
  assert.equal(rows[2].children[0].children[0].text, 'T');
});

test('rendering never turns text into markup', async () => {
  const { renderRows } = await import('../../assets/js/therapist/doc-render.js');
  // a tiny DOM stand-in, enough to prove only textContent is used
  const make = tag => ({ tag, children: [], textContent: '', className: '', appendChild(c) { this.children.push(c); return c; }, set innerHTML(v) { throw new Error('innerHTML used'); } });
  const dl = renderRows({ createElement: make }, toRows({ note: '<img src=x onerror=alert(1)>' }));
  const dd = dl.children.find(c => c.tag === 'dd');
  assert.equal(dd.textContent, '<img src=x onerror=alert(1)>');
});
