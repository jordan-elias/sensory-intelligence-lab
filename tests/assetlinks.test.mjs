import test from 'node:test'; import assert from 'node:assert/strict';
import { build, normalise, valid } from '../android-app/scripts/make-assetlinks.mjs';
const FP = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0')).join(':').toUpperCase();
test('fingerprints are tidied and checked, never guessed', () => {
  assert.equal(normalise(FP.toLowerCase().replace(/:/g, ' ')), FP); assert.ok(valid(FP)); assert.ok(!valid('AB:CD')); assert.ok(!valid(''));
  assert.throws(() => build([]), /Need one or more/); assert.throws(() => build(['AB:CD']), /Not valid/); assert.throws(() => build(['SHA256: PLACEHOLDER']), /Not valid/);
});
test('the file names the app and every fingerprint once', () => {
  const [r] = build([FP, FP.toLowerCase(), 'ab'.repeat(32)]);
  assert.deepEqual(r.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(r.target.package_name, 'de.jordanelias.sil'); assert.equal(r.target.sha256_cert_fingerprints.length, 2);
});
