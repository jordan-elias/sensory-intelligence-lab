// Runs every browser test file in this folder, one after another, and fails if any fails.
// Usage: npm run test:browser   (needs Chrome; set CHROME_PATH if it is not in a standard place)
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => /^t\d+\.mjs$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
// These tests exercise the real vault, so they run against the real gate instead of the stand-in.
const REAL_GATE = new Set(['t5.mjs', 't9.mjs', 't10.mjs', 't29.mjs', 't30.mjs']);
let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 180000, env: { ...process.env, ...(REAL_GATE.has(f) ? { REAL_GATE: '1' } : {}) } });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = out.split('\n').filter((l) => l.startsWith('FAIL'));
  const ok = r.status === 0 && bad.length === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f}`);
  if (!ok) { failed.push(f); console.log(out.split('\n').filter((l) => !l.startsWith('PASS')).slice(0, 25).join('\n')); }
}
console.log(failed.length ? `\n${failed.length} of ${files.length} failed: ${failed.join(', ')}` : `\nAll ${files.length} browser tests passed.`);
process.exit(failed.length ? 1 : 0);
