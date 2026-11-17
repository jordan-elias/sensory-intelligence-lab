import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtClock, sectionsFrom, textFromSections, halfOf } from '../../assets/js/experiments/marks-core.js';
test('clock formatting', () => { assert.equal(fmtClock(0), '0:00'); assert.equal(fmtClock(75.4), '1:15'); assert.equal(fmtClock(-3), '0:00'); assert.equal(fmtClock(600), '10:00'); });
test('sections run from one mark to the next, and the last to the end', () => {
  const S = sectionsFrom([{ t: 32, label: 'verse' }, { t: 0, label: 'intro' }, { t: 64, label: '' }], 100);
  assert.deepEqual(S.map(s => [s.start, s.end, s.label]), [[0, 32, 'intro'], [32, 64, 'verse'], [64, 100, '']]);
});
test('a last section with no end yet gets a provisional ten seconds', () => { assert.equal(sectionsFrom([{ t: 5 }])[0].end, 15); assert.equal(sectionsFrom([{ t: 5 }], 3)[0].end, 15); });
test('text version lists lengths and a total', () => {
  const t = textFromSections(sectionsFrom([{ t: 0, label: 'intro' }, { t: 30 }], 90));
  assert.match(t, /0:00\s+intro\s+\(30 s\)/); assert.match(t, /0:30\s+Section 2\s+\(60 s\)/); assert.match(t, /Total 1:30/);
});
test('half rounds up', () => { assert.equal(halfOf(8), 4); assert.equal(halfOf(5), 3); assert.equal(halfOf(2), 1); });
