import test from 'node:test'; import assert from 'node:assert/strict';
import { isSubscribePath, HIDE_CSS } from '../../assets/js/app/consumption.js';
test('the subscribe page is recognised in its URL forms', () => { for (const p of ['/subscribe', '/subscribe/', '/subscribe/index.html']) assert.ok(isSubscribePath(p), p); for (const p of ['/', '/account/', '/subscribers/x']) assert.ok(!isSubscribePath(p), p); });
test('purchase links, markers and billing buttons are all hidden', () => { for (const s of ['/subscribe', '[data-purchase]', '.billing-actions']) assert.ok(HIDE_CSS.includes(s), s); });
