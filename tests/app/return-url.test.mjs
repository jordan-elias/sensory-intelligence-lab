import test from 'node:test';
import assert from 'node:assert/strict';
import { returnUrl } from '../../netlify/functions/lib/return-url.js';

test('the website returns to the page itself', () => {
  assert.equal(returnUrl('https://s.example', '/subscribe/?success=true', false), 'https://s.example/subscribe/?success=true');
});
test('the app returns through the bridge page, with the path encoded', () => {
  assert.equal(returnUrl('https://s.example', '/subscribe/?success=true', true), 'https://s.example/app-return/?to=%2Fsubscribe%2F%3Fsuccess%3Dtrue');
});
