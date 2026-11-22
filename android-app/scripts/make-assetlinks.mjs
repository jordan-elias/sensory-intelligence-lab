#!/usr/bin/env node
/**
 * Writes .well-known/assetlinks.json (the file that lets Android open links from lab.jordanelias.de in the app).
 * Usage:  node android-app/scripts/make-assetlinks.mjs <SHA-256 fingerprint> [<second fingerprint> ...]
 * Give the Play App Signing fingerprint (Play Console > Setup > App signing) and, while testing, your upload key's.
 * A fingerprint looks like 14:6D:E9:...:7F (32 pairs of hex digits). Nothing is guessed or filled in.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PACKAGE = 'de.jordanelias.sil';
export const normalise = f => String(f || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '').match(/.{2}/g)?.join(':') || '';
export const valid = f => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f);
export function build(fingerprints) {
  const fp = [...new Set(fingerprints.map(normalise))];
  const bad = fp.filter(f => !valid(f));
  if (!fp.length || bad.length) throw new Error(`Need one or more SHA-256 fingerprints of 32 hex pairs each. Not valid: ${bad.join(', ') || '(none given)'}`);
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: fp } }];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.well-known/assetlinks.json');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(build(process.argv.slice(2)), null, 2) + '\n');
    console.log('Wrote ' + out);
  } catch (e) { console.error(e.message); process.exit(1); }
}
