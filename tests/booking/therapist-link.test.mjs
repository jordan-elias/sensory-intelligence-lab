import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookingLink, planFor } from '../../assets/js/booking/therapist-link.js';

test('Cal.com links become an embedded calendar path', () => {
  assert.deepEqual(parseBookingLink('https://cal.com/jordan-elias/subscriber-session'), { kind: 'cal', calLink: 'jordan-elias/subscriber-session' });
  assert.deepEqual(parseBookingLink('https://app.cal.com/dr.smith/30min/'), { kind: 'cal', calLink: 'dr.smith/30min' });
  assert.deepEqual(parseBookingLink(' https://cal.com/jordan '), { kind: 'cal', calLink: 'jordan' });
});

test('other https booking pages open as a link', () => {
  assert.deepEqual(parseBookingLink('https://calendly.com/x/y'), { kind: 'external', url: 'https://calendly.com/x/y' });
});

test('unsafe or unusable links are rejected', () => {
  for (const bad of ['http://cal.com/a', 'javascript:alert(1)', 'https://cal.com/', 'https://cal.com/a b', '', null, 'not a url'])
    assert.equal(parseBookingLink(bad), null, String(bad));
});

test('a lookalike host is not treated as Cal.com', () => {
  assert.equal(parseBookingLink('https://cal.com.evil.example/a').kind, 'external');
  assert.equal(parseBookingLink('https://evilcal.com/a').kind, 'external');
});

test('planFor handles missing therapist and missing links', () => {
  assert.deepEqual(planFor(null), { kind: 'none' });
  assert.deepEqual(planFor({ booking_link: null }), { kind: 'paused', reason: 'no-link' });
  assert.equal(planFor({ booking_link: 'https://cal.com/a/b' }).kind, 'cal');
  // not taking new clients does not stop an existing client from booking
  assert.equal(planFor({ accepting_clients: false, booking_link: 'https://cal.com/a/b' }).kind, 'cal');
});
