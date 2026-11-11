import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItems } from '../../assets/js/notifications.js';

test('nothing waiting means no items', () => assert.deepEqual(buildItems({}), []));
test('client: messages and form requests, each linking to its page', () => {
  const it = buildItems({ unread: 2, name: 'Dr Rivera', intakePending: true, familyPending: true });
  assert.deepEqual(it.map(i => [i.id, i.href]), [['messages', '/messages/'], ['intake', '/intake/'], ['family', '/family/']]);
  assert.match(it[0].text, /2 new messages/); assert.match(it[1].text, /Dr Rivera/);
});
test('one message is singular', () => assert.equal(buildItems({ unread: 1 })[0].text, '1 new message'));
test('therapist: messages only, to the clients page', () => {
  const it = buildItems({ unread: 3, therapist: true, intakePending: true });
  assert.equal(it[0].href, '/therapist/');
});
