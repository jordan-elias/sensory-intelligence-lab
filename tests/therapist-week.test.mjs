import test from 'node:test'; import assert from 'node:assert/strict';
import { weekSummary, weekText } from '../assets/js/therapist/week.js';
const NOW = Date.parse('2026-11-20T12:00:00Z'), d = n => new Date(NOW - n * 86400000).toISOString();
const items = [
  { category: 'checkins', created_at: d(1), arousal: 6, valence: 4, sensory_load: 8, emotion_words: ['tense'] },
  { category: 'checkins', created_at: d(3), arousal: 4, valence: 6, sensory_load: 6, emotion_words: ['tense', 'calm'] },
  { category: 'checkins', created_at: d(9), arousal: 8, valence: 2, sensory_load: 8 },
  { category: 'worksheets', type: 'dear-man', updated_at: d(2) }, { category: 'worksheets', type: 'grow', updated_at: d(20) },
  { category: 'journal', title: 'A hard day', created_at: d(30), shared_at: d(2) },
];
test('only the last seven days count, and check-ins are compared with the week before', () => {
  const w = weekSummary(items, NOW);
  assert.equal(w.checkins.count, 2); assert.equal(w.checkins.arousal, 5); assert.equal(w.checkins.vsLastWeek.arousal, -3); assert.equal(w.checkins.vsLastWeek.hadLastWeek, true);
  assert.equal(w.worksheets.length, 1); assert.equal(w.journal.length, 1); assert.equal(w.journal[0].title, 'A hard day'); assert.equal(w.empty, false);
});
test('a quiet week says so', () => {
  const w = weekSummary([items[2]], NOW); assert.equal(w.empty, true);
  assert.match(weekText('Sam', w), /Nothing shared/);
});
test('the text version names the numbers and what was shared', () => {
  const t = weekText('Sam', weekSummary(items, NOW));
  assert.match(t, /Check-ins: 2\./); assert.match(t, /Worksheets: DEAR MAN/i); assert.match(t, /A hard day/); assert.match(t, /\(-3\)/);
});
