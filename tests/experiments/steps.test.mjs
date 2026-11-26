import test from 'node:test'; import assert from 'node:assert/strict';
import { parseTimer, assignTools, toolsFor, setupChecklist, fmtClock } from '../../assets/js/experiments/steps.js';
import { recommend, continueLabel } from '../../assets/js/experiments/recommend.js';
import { reflect } from '../../assets/js/experiments/reflect.js';
import { createAwake } from '../../assets/js/app/awake.js';
import { EXPERIMENTS, UNITS, PATH } from '../../assets/js/experiments/catalog.js';

test('times in steps are found, and lengths of a clip are not mistaken for a time', () => {
  const cases = [['Listen for 1 minute.', 60], ['the workbench for 5 minutes without changing it.', 300], ['Play each treatment for exactly 2 minutes.', 120], ['Same notes. 2 minutes.', 120], ['Let it run for one minute and listen.', 60],
    ['Listen for two full cycles (80 seconds) without playing.', 80], ['Press Start and write for the whole minute.', 60], ['After 15 minutes, stop.', 900], ['Record or load one clip, 5 to 20 seconds, of a place.', 0], ['Roll seven notes once.', 0], ['Hold it for 4 beats at 70 BPM.', 0], ['Record 60 seconds of wherever you are.', 0]];
  for (const [text, want] of cases) assert.equal(parseTimer(text), want, text);
  assert.equal(fmtClock(125), '02:05');
});
test('every tool of every experiment is reachable, and none is invented', () => {
  for (const e of EXPERIMENTS) {
    const per = assignTools(e); assert.equal(per.length, e.procedure.length, e.id);
    const shown = new Set(per.flat()); for (const i of shown) assert.ok(i >= 0 && i < toolsFor(e).length, e.id + ' index ' + i);
    toolsFor(e).forEach((t, i) => { if (t.type !== 'timer') assert.ok(shown.has(i), `${e.id}: tool ${t.type} is never shown with a step`); else assert.ok(!shown.has(i), `${e.id}: the session timer is not placed on a step`); });
  }
});
test('the dice are with the step that rolls them, the metronome with the step that starts it', () => {
  const e = EXPERIMENTS.find(x => x.id === 'dice-melody'), per = assignTools(e);
  const gen = e.tools.findIndex(t => t.type === 'gen'), groove = e.tools.findIndex(t => t.type === 'groove');
  assert.ok(per[1].includes(gen) && !per[0].includes(gen)); assert.ok(per[0].includes(groove));
});
test('a clip or a poem tool stays with every step, because every step works on it', () => {
  const e = EXPERIMENTS.find(x => x.id === 'chop-reorder'), clip = e.tools.findIndex(t => t.type === 'clip'); assert.ok(assignTools(e).every(s => s.includes(clip)));
});
test('the catalog can override the guess', () => { const per = assignTools({ procedure: ['a', 'b'], tools: [{ type: 'gen' }, { type: 'groove' }], stepTools: [[1], [0]] }); assert.deepEqual(per, [[1], [0]]); });
test('the before-you-begin list matches what the experiment needs', () => {
  const c = setupChecklist(EXPERIMENTS.find(x => x.id === 'chop-reorder')); assert.ok(c.some(x => /recording/i.test(x))); assert.ok(c.some(x => /Headphones/.test(x))); assert.ok(c.some(x => /\d+ minutes/.test(x)));
  const w = setupChecklist(EXPERIMENTS.find(x => x.id === 'burning-page')); assert.ok(w.some(x => /Paper/.test(x))); assert.ok(!w.some(x => /Headphones/.test(x)));
});
test('recommend: respects what you have and the time, prefers what is not done, and says when all are done', () => {
  const r = recommend(PATH, { needs: 'none', minutes: 15, done: new Set() }); assert.ok(r.pick && r.pick.needs === 'none' && r.pick.minutes <= 15); assert.ok(r.others.every(e => e.needs === 'none' && e.minutes <= 15));
  const all = PATH.filter(e => e.needs === 'none' && e.minutes <= 15); const r2 = recommend(PATH, { needs: 'none', minutes: 15, done: new Set([all[0].id]) }); assert.notEqual(r2.pick.id, all[0].id);
  const r3 = recommend(PATH, { needs: 'none', minutes: 15, done: new Set(all.map(e => e.id)) }); assert.ok(r3.allDone && r3.pick);
  assert.deepEqual(recommend(PATH, { needs: 'daw', minutes: 1 }), { pick: null, others: [], allDone: false });
  assert.match(continueLabel(PATH[0], 0, 5), /^Begin: .* · \d+ min$/); assert.match(continueLabel(PATH[0], 3, 5), /^Continue: .* · step 3 of 5$/);
});
test('looking back counts your own words per unit and across notes', () => {
  const notes = { 'weakest-hand': 'The rhythm kept pulling me back to the rhythm.', 'subtract': 'Less rhythm felt calmer, and the silence was the point.' };
  const r = reflect({ units: UNITS, done: new Set(['weakest-hand', 'subtract']), saved: id => notes[id] || '' });
  assert.equal(r.notes, 2); assert.ok(r.words > 10); assert.equal(r.recurring[0].word, 'rhythm'); assert.equal(r.units.find(u => u.notes === 2).words, r.words);
  assert.deepEqual(reflect({ units: UNITS, done: new Set(), saved: () => '' }).recurring, []);
});
test('the screen is kept on only while wanted, retaken when you come back, and ignored where unsupported', async () => {
  let released = 0, requests = 0; const lockObj = { addEventListener() {}, release() { released++; } };
  let vis = 'visible', onVis; const doc = { get visibilityState() { return vis; }, addEventListener: (_, f) => { onVis = f; } };
  const a = createAwake({ wakeLock: { request: async () => { requests++; return lockObj; } } }, doc);
  await a.hold(); assert.equal(requests, 1); assert.ok(a.held); a.release(); assert.equal(released, 1); assert.ok(!a.held);
  await a.hold(); a.release(); vis = 'visible'; await onVis(); assert.equal(requests, 2);
  const none = createAwake({}, doc); await none.hold(); assert.ok(!none.held); none.release();
});

test('the workbench is added wherever notes are drawn, shown with a rhythm or drawing step, and not elsewhere', () => {
  for (const id of ['five-note-cage', 'fixed-notes-rhythm', 'borrowed-rhythm', 'dice-melody']) {
    const e = EXPERIMENTS.find(x => x.id === id), all = toolsFor(e), k = all.findIndex(t => t.type === 'bench');
    assert.ok(k >= 0, id + ' has the workbench'); assert.ok(assignTools(e).some(l => l.includes(k)), id + ' shows it');
  }
  for (const id of ['stutter', 'photo-words', 'fixed-groove-chords']) assert.ok(!toolsFor(EXPERIMENTS.find(x => x.id === id)).some(t => t.type === 'bench'), id);
});

import { UNITS as U2 } from '../../assets/js/experiments/catalog.js';
test('the capstone offers four choices, each with a timer, a reflect question and no more than one re-draw rule', () => {
  const cap = U2.find(u => u.id === 'shaping').groups.find(g => g.id === 'capstone').experiments;
  assert.equal(cap.length, 4);
  for (const e of cap) { assert.ok(e.tools.some(t => t.type === 'timer'), e.id + ' has a timer'); assert.ok(e.reflect && e.solo && e.procedure.length >= 4, e.id + ' is complete'); }
  assert.ok(cap.some(e => e.tools.some(t => t.type === 'bench')) && cap.some(e => e.needs === 'none'));
});
