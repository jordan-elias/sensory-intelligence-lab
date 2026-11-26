import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, CHAPTER_SITTINGS, chapterOf } from '../../assets/js/experiments/chapters.js';
import { byId, EXPERIMENTS } from '../../assets/js/experiments/catalog.js';

test('chapters 1 to 8 exist with sittings', () => {
  assert.deepEqual(CHAPTERS.map(c => c.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(CHAPTERS.every(c => c.sittings.length >= 2));
});
test('every sitting has the fields the player needs and keeps a seed', () => {
  const ids = new Set();
  for (const s of CHAPTER_SITTINGS) {
    assert.ok(!ids.has(s.id) && !EXPERIMENTS.some(e => e.id === s.id), 'unique id ' + s.id); ids.add(s.id);
    for (const k of ['title', 'summary', 'question', 'stop', 'reflect']) assert.ok(s[k], `${s.id} ${k}`);
    assert.ok(s.procedure.length >= 3 && s.minutes > 0 && s.tools.length);
    assert.match(s.procedure.join(' '), /seed/i, s.id + ' keeps a seed');
  }
});
test('byId finds sittings, and chapterOf finds their chapter', () => {
  assert.equal(byId('ch2-paint-it').title, 'Paint what you heard');
  assert.equal(chapterOf('ch3-shift').id, 'state-body');
  assert.equal(chapterOf('nope'), null);
});

test('every step that asks you to make something has a tool, and the tool indexes are real', () => {
  for (const s of CHAPTER_SITTINGS) {
    assert.equal(s.stepTools.length, s.procedure.length, s.id);
    s.stepTools.flat().forEach(i => assert.ok(s.tools[i], s.id + ' tool ' + i));
    s.procedure.forEach((step, i) => { if (/\b(make|record)\b/i.test(step) && !/^(Decide|Write|Keep|Open)/.test(step)) assert.ok(s.stepTools[i].length, `${s.id} step ${i + 1} has a tool: ${step.slice(0, 40)}`); });
  }
});
test('reflection questions are open, not yes/no or graded', () => {
  for (const s of CHAPTER_SITTINGS) assert.ok(!/^(did|was|were|is|are|do|does|would|could|which one did you like)\b/i.test(s.reflect), s.id + ': ' + s.reflect);
});

test('every sitting has parameters and a solo version, as the player requires', () => {
  for (const s of CHAPTER_SITTINGS) { assert.ok(s.parameters.every(p => p.length === 2 && p[0] && p[1]), s.id); assert.ok(s.solo.length > 10); }
});
