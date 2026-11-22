import test from 'node:test'; import assert from 'node:assert/strict';
import { BUILTIN, loadMine, saveMine, removeMine, applyTemplate } from '../assets/js/notes/templates.js';
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
test('built-in templates have a name and a structure, with unique ids', () => {
  assert.ok(BUILTIN.length >= 4); assert.equal(new Set(BUILTIN.map(t => t.id)).size, BUILTIN.length);
  for (const t of BUILTIN) assert.ok(t.name && t.text.includes(':'));
});
test('own templates: save, replace by name, remove, and ignore rubbish', () => {
  const s = mem(); assert.deepEqual(loadMine(s), []);
  assert.equal(saveMine(s, 'Intake', 'A:\n\nB:\n'), true); assert.equal(saveMine(s, 'intake', 'C:'), true);
  assert.deepEqual(loadMine(s).map(t => [t.name, t.text, t.mine]), [['intake', 'C:', true]]);
  assert.equal(saveMine(s, '', 'x'), false); assert.equal(saveMine(s, 'n', '   '), false);
  removeMine(s, 'intake'); assert.deepEqual(loadMine(s), []);
  s.setItem('sil.therapist.noteTemplates.v1', '{not json'); assert.deepEqual(loadMine(s), []);
});
test('a template replaces an empty note and is added below a written one', () => {
  const t = { text: 'Focus:\n' };
  assert.equal(applyTemplate('', t), 'Focus:\n'); assert.equal(applyTemplate('  \n', t), 'Focus:\n');
  assert.equal(applyTemplate('Already here.\n', t), 'Already here.\n\nFocus:\n');
});
