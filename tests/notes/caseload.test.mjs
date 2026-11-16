import test from 'node:test'; import assert from 'node:assert/strict';
import { themeTable, unwrittenSessions, quietClients, summary } from '../../assets/js/notes/caseload.js';
const N = (id, date, text) => ({ id, date, text, kind: 'note' });
const A = { id: 'a', name: 'A', notes: [N('1', '2026-01-05', 'Talked about #grief and [[Anna]].'), N('2', '2026-01-12', '#grief again, and #work.')] };
const B = { id: 'b', name: 'B', notes: [N('3', '2026-02-01', '#grief. [[Anna]] is her sister.')] };
test('themes are counted per client and ordered by how many clients have them', () => {
  const t = themeTable([A, B]);
  assert.equal(t.themes[0].key, 'grief'); assert.equal(t.themes[0].clients, 2); assert.equal(t.themes[0].sessions, 3);
  assert.deepEqual(t.rows.map(r => r.cells[0]), [2, 1]);
});
test('people are never matched across clients', () => {
  const t = themeTable([A, B]); assert.ok(!t.themes.some(x => /anna/i.test(x.name)));
  assert.equal(JSON.stringify(t).includes('Anna'), false);
});
test('sessions without a note are found, with a few days of grace', () => {
  const s = [{ scheduled_at: '2026-01-05T10:00:00Z' }, { scheduled_at: '2026-01-19T10:00:00Z' }, { scheduled_at: '2026-01-26T10:00:00Z', status: 'cancelled' }, { scheduled_at: '2099-01-01T10:00:00Z' }, { scheduled_at: '2026-01-08T10:00:00Z' }];
  assert.deepEqual(unwrittenSessions(s, A.notes, new Date('2026-03-01T00:00:00Z')), ['2026-01-19', '2026-01-08']);
});
test('a note written the day before a session does not count for it', () => {
  assert.deepEqual(unwrittenSessions([{ scheduled_at: '2026-01-06T10:00:00Z' }], [N('x', '2026-01-05', 'hi')], new Date('2026-03-01')), ['2026-01-06']);
});
test('quiet clients: old or none, never-written last', () => {
  const C = { id: 'c', name: 'C', notes: [] };
  const q = quietClients([A, B, C], new Date('2026-03-01T00:00:00Z'), 45);
  assert.deepEqual(q.map(x => x.id), ['a', 'c']); assert.equal(q[0].since, 48); assert.equal(q[1].last, null);
});
test('the summary has counts only', () => { assert.deepEqual(summary([A, B]), { clients: 2, notes: 3, people: 2 }); });
