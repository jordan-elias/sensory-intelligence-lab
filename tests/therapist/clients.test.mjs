import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, openCopies, tierLabel, intakeLabel } from '../../assets/js/therapist/clients.js';

test('labels are plain and never undefined', () => {
  assert.match(tierLabel('call2'), /2 sessions/); assert.match(tierLabel('call1'), /1 session/);
  assert.equal(intakeLabel(null), 'Intake status not available'); assert.equal(intakeLabel('completed'), 'Intake complete');
});

test('summarize averages, counts and ranks feeling words', () => {
  const s = summarize([
    { created_at: '2027-01-03', arousal: 4, valence: 6, sensory_load: 2, emotion_words: ['calm', 'tired'], notes: 'x' },
    { created_at: '2027-01-01', arousal: 6, valence: 8, sensory_load: 4, emotion_words: ['calm'] },
  ]);
  assert.equal(s.count, 2); assert.equal(s.arousal, 5); assert.equal(s.valence, 7); assert.equal(s.sensory_load, 3);
  assert.deepEqual(s.top_emotions[0], { word: 'calm', n: 2 }); assert.equal(s.with_notes, 1);
  assert.equal(s.first, '2027-01-01'); assert.equal(s.last, '2027-01-03');
});

test('summarize copes with nothing shared', () => {
  const s = summarize([]);
  assert.equal(s.count, 0); assert.equal(s.arousal, null); assert.equal(s.first, null);
});

test('openCopies binds each copy to its link and record, newest first, and counts unreadable ones', async () => {
  const seen = [];
  const session = { open: async (sealed, { context }) => { seen.push(context); if (sealed.bad) throw new Error('no'); return JSON.stringify({ created_at: sealed.at, arousal: 5 }); } };
  const copies = [
    { link_id: 'L', category: 'checkins', source_id: 'a', sealed: { at: '2027-01-01' } },
    { link_id: 'L', category: 'checkins', source_id: 'b', sealed: { at: '2027-01-05' } },
    { link_id: 'L', category: 'checkins', source_id: 'c', sealed: { bad: true } },
  ];
  const r = await openCopies(session, copies);
  assert.deepEqual(seen, ['share:L:checkins:a', 'share:L:checkins:b', 'share:L:checkins:c']);
  assert.deepEqual(r.items.map(i => i.id), ['b', 'a']); assert.equal(r.unreadable, 1);
});
