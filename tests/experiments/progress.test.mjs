import test from 'node:test'; import assert from 'node:assert/strict';
import { createProgress, merge, clean, forSync, migrateLegacy, emptyState, KEY } from '../../assets/js/experiments/progress.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m }; };
let t = 1000; const clock = () => ++t;

test('progress is saved and read back after a reload', () => {
  const s = mem(); const a = createProgress({ storage: s, now: clock });
  a.setNote('dice-melody', 'It kept pulling me back.'); a.setPos('dice-melody', 3); a.markDone('wrong-tuning');
  const b = createProgress({ storage: s, now: clock });
  assert.equal(b.note('dice-melody'), 'It kept pulling me back.'); assert.equal(b.pos('dice-melody'), 3); assert.ok(b.isDone('wrong-tuning')); assert.ok(b.persistent);
});
test('the older storage keys are brought in once, and nothing is lost', () => {
  const s = mem({ 'sil.exp.done': JSON.stringify(['a', 'b']), 'sil.exp.note.a': JSON.stringify('first note'), 'sil.exp.note.c': JSON.stringify('  ') });
  const p = createProgress({ storage: s, now: clock });
  assert.deepEqual([...p.doneSet()].sort(), ['a', 'b']); assert.equal(p.note('a'), 'first note'); assert.equal(p.note('c'), '');
  p.setNote('a', 'changed'); const again = createProgress({ storage: s, now: clock }); assert.equal(again.note('a'), 'changed');
});
test('finishing clears the saved step; resumable lists unfinished experiments, newest first', () => {
  const p = createProgress({ storage: mem(), now: clock });
  p.setPos('x', 2); p.setPos('y', 4); p.setPos('z', 0); assert.deepEqual(p.resumable().map(r => r.id), ['y', 'x']);
  p.markDone('y'); assert.equal(p.pos('y'), 0); assert.deepEqual(p.resumable().map(r => r.id), ['x']);
});
test('blocked storage falls back to memory and says so', () => {
  const p = createProgress({ storage: { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() {}, key() { return null; }, length: 0 }, now: clock });
  p.setNote('a', 'hi'); assert.equal(p.note('a'), 'hi'); assert.equal(p.persistent, false);
});
test('damaged records are cleaned, never trusted', () => {
  const s = clean({ done: { a: 5, b: 'x', '': 3 }, notes: { a: { t: 7, at: 'z' }, b: 'str' }, pos: { a: { s: -4, at: 2 }, b: { s: 1e9, at: 1 } }, shelf: { k1: { kind: 'video' }, k2: { kind: 'text', exp: 'a', title: 'T', text: 'x', at: 3 } }, junk: 1 });
  assert.deepEqual(Object.keys(s.done), ['a']); assert.equal(s.notes.a.t, ''); assert.equal(s.pos.a.s, 0); assert.equal(s.pos.b.s, 99); assert.deepEqual(Object.keys(s.shelf), ['k2']); assert.ok(!('junk' in s));
  assert.deepEqual(clean(null), emptyState()); assert.deepEqual(clean('x'), emptyState());
  const p = createProgress({ storage: mem({ [KEY]: '{not json' }), now: clock }); assert.equal(p.doneSet().size, 0);
});
const A = () => ({ done: { a: 10 }, notes: { a: { t: 'old', at: 5 }, b: { t: 'bee', at: 9 } }, pos: { a: { s: 2, at: 5 } }, shelf: { k1: { exp: 'a', kind: 'text', title: 'one', text: 'x', at: 4 } }, gone: {}, updated: 9 });
const B = () => ({ done: { a: 7, c: 3 }, notes: { a: { t: 'new', at: 8 } }, pos: { a: { s: 0, at: 8 } }, shelf: { k2: { exp: 'c', kind: 'text', title: 'two', text: 'y', at: 6 } }, gone: { k1: 12 }, updated: 12 });
test('merging two devices: newer note wins, done is never undone, deleted stays deleted', () => {
  const m = merge(A(), B());
  assert.equal(m.notes.a.t, 'new'); assert.equal(m.notes.b.t, 'bee'); assert.deepEqual(m.done, { a: 7, c: 3 }); assert.equal(m.pos.a.s, 0);
  assert.deepEqual(Object.keys(m.shelf), ['k2']); assert.equal(m.gone.k1, 12);
});
test('merge is symmetric and repeatable', () => {
  assert.deepEqual(merge(A(), B()), merge(B(), A())); const m = merge(A(), B()); assert.deepEqual(merge(m, B()), m); assert.deepEqual(merge(m, m), m);
  const tie = merge({ notes: { a: { t: 'x', at: 5 } } }, { notes: { a: { t: 'y', at: 5 } } }); assert.deepEqual(tie, merge({ notes: { a: { t: 'y', at: 5 } } }, { notes: { a: { t: 'x', at: 5 } } }));
});
test('an item made again after a delete on another device is kept', () => { const m = merge({ shelf: { k: { exp: 'a', kind: 'text', title: 't', text: '', at: 20 } } }, { gone: { k: 12 } }); assert.ok(m.shelf.k); });
test('recordings never leave the device, and a merge from elsewhere does not drop them', () => {
  const p = createProgress({ storage: mem(), now: clock }); const id = p.keep({ exp: 'a', kind: 'audio', title: 'Clip', secs: 4 }); p.keep({ exp: 'a', kind: 'text', title: 'Notes', text: 'x' });
  assert.deepEqual(Object.values(forSync(p.snapshot()).shelf).map(i => i.kind), ['text']);
  p.applyRemote({ done: { z: 1 } }); assert.ok(p.shelf().some(i => i.id === id)); assert.ok(p.isDone('z'));
  p.unkeep(id); assert.ok(!p.shelf().some(i => i.id === id));
});
test('applyRemote reports whether anything changed', () => { const p = createProgress({ storage: mem(), now: clock }); assert.equal(p.applyRemote({ done: { q: 1 } }), true); assert.equal(p.applyRemote({ done: { q: 1 } }), false); });
test('change listeners run on every save', () => { const p = createProgress({ storage: mem(), now: clock }); let n = 0; const off = p.onChange(() => n++); p.setNote('a', 'x'); p.setPos('a', 1); off(); p.setNote('a', 'y'); assert.equal(n, 2); });
