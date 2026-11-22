import test from 'node:test'; import assert from 'node:assert/strict';
import { cleanHandover, currentConsents, handoverHeader } from '../assets/js/messages/handover.js';
import { parseMarkdownRecord } from '../assets/js/notes/import.js';
import { toMarkdown } from '../assets/js/notes/graph.js';
test('a handover needs a name; names are tidied and limited', () => {
  assert.equal(cleanHandover(null), null); assert.equal(cleanHandover({ to: '   ' }), null); assert.equal(cleanHandover('x'), null);
  assert.deepEqual(cleanHandover({ to: '  Dr   B \n Smith ' }), { to: 'Dr B Smith', withdrawn: false });
  assert.equal(cleanHandover({ to: 'x'.repeat(200) }).to.length, 80); assert.equal(cleanHandover({ to: 'A', withdrawn: 'yes' }).withdrawn, false);
});
const msg = (to, at, o = {}) => ({ id: at + to, created_at: at, mine: false, verified: true, handover: { to, withdrawn: false }, ...o });
test('only the client\'s own, unfailed messages count, and the latest word wins', () => {
  const c = currentConsents([msg('Dr B', '2026-11-01'), msg('Dr C', '2026-11-02'), msg('Dr C', '2026-11-03', { handover: { to: 'dr c', withdrawn: true } }), msg('Dr D', '2026-11-04', { mine: true }), msg('Dr E', '2026-11-05', { verified: false }), { id: 'x', created_at: '2026-11-06', mine: false }]);
  assert.deepEqual(c.map(x => x.to), ['Dr B']); assert.equal(c[0].verified, true);
  assert.deepEqual(currentConsents([msg('A', '2026-11-01', { mine: true })], { fromClient: m => m.mine }).map(x => x.to), ['A']);
});
test('the header names who, when, and the notes still read back unchanged', () => {
  const notes = [{ date: '2026-01-10', text: 'First [[Anna]] #sleep.' }];
  const md = handoverHeader({ client: 'Sam Lee', to: 'Dr B', at: '2026-11-01T10:00:00Z', verified: true, today: '2026-11-21' }) + toMarkdown('Sam Lee', notes);
  assert.match(md, /agreed to this on 2026-11-01 \(their signed message was checked\)/);
  const r = parseMarkdownRecord(md); assert.deepEqual(r.notes.map(n => [n.date, n.text]), [['2026-01-10', 'First [[Anna]] #sleep.']]); assert.equal(r.title, 'Sam Lee');
});
