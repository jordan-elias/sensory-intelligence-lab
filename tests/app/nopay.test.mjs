import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { isPurchasePath, HIDE } from '../../assets/js/app/nopay.js';
test('the subscribe page is recognised in every form the app uses', () => {
  for (const p of ['/subscribe', '/subscribe/', '/subscribe/index.html', '/x/subscribe/']) assert.equal(isPurchasePath(p), true, p);
  for (const p of ['/', '/account/', '/subscribers/', '/dashboard/index.html', '']) assert.equal(isPurchasePath(p), false, p);
});
test('billing and upgrade controls are all in the hide list', () => { for (const s of ['subscribe', 'portalBtnMain', 'deleteGatePortalBtn', 'billing-link', 'sil-upgrade-banner__cta']) assert.ok(HIDE.includes(s), s); });
test('every place that links to subscribe or the billing portal is covered by the list', () => {
  const files = ['assets/js/gating.js', 'booking/index.html', 'account/index.html', 'therapy/index.html'];
  for (const f of files) { const t = fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'); for (const m of t.matchAll(/<a [^>]*href="\/subscribe\/?"[^>]*>/g)) assert.ok(/subscribe/.test(m[0])); }
  const acct = fs.readFileSync(new URL('../../account/index.html', import.meta.url), 'utf8');
  for (const m of acct.matchAll(/<button[^>]*id="(portal\w+|deleteGatePortalBtn)"/g)) assert.ok(HIDE.includes(m[1]) || HIDE.includes('#' + m[1]), m[1]);
});
test('deleting an account in the app is not blocked by the billing portal, and the server ends the subscription', () => {
  const acct = fs.readFileSync(new URL('../../account/index.html', import.meta.url), 'utf8');
  assert.ok(/_userHasActiveStripeSubscription && !window\.SIL_APP/.test(acct));
  assert.ok(/stripe\.subscriptions\.cancel/.test(fs.readFileSync(new URL('../../netlify/functions/delete-account.js', import.meta.url), 'utf8')));
});
test('the app code never opens the payment provider', () => {
  for (const f of ['native.js', 'shell.js', 'nopay.js', 'playback.js']) { const t = fs.readFileSync(new URL('../../assets/js/app/' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); assert.ok(!/checkout|create-portal|stripe\.com/.test(t.replace(/\/stripe\\\.com\$\/|stripe\\\.com/g, '')), f); }
});
