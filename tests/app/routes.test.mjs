// The app has no Netlify rewrites: every internal link and redirect must point at a real file in the built app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, routeTable, rewriteText } from '../../android-app/scripts/build-web.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sil-www-'));
const { routes } = build(out, 'https://api.example');

function* files(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) yield* files(p); else yield p; } }
const exists = (p) => { const f = path.join(out, p); return fs.existsSync(f) && fs.statSync(f).isFile(); };

test('route table reads the Netlify rewrites', () => {
  assert.equal(routes['/account'], '/account/index.html');
  assert.equal(routes['/waves'], '/compositions/waves.html');
  assert.equal(routes['/'], undefined);
});

test('rewriting only touches whole quoted paths', () => {
  const r = { '/account': '/account/index.html' };
  assert.equal(rewriteText('<a href="/account">x</a> <a href="/account/?a=1">y</a> go(\'/account#t\')', r), '<a href="/account/index.html">x</a> <a href="/account/index.html?a=1">y</a> go(\'/account/index.html#t\')');
  assert.equal(rewriteText('href="https://x.com/account"', r), 'href="https://x.com/account"');
  assert.equal(rewriteText('href="/accounting"', r), 'href="/accounting"');
  assert.equal(rewriteText("fetch('/.netlify/functions/a')", {}, 'https://api.example'), "fetch('https://api.example/.netlify/functions/a')");
});

test('every internal link and redirect in the built app points at a real file', () => {
  const bad = [];
  for (const f of files(out)) {
    if (!/\.(html|js)$/.test(f) || f.includes('/vendor/')) continue;
    const text = fs.readFileSync(f, 'utf8');
    const re = /(?:href\s*=\s*|location(?:\.href)?\s*=\s*|location\.(?:replace|assign)\(\s*)["'](\/[^"'#?\s]*)/g;
    let m;
    while ((m = re.exec(text))) {
      let p = m[1];
      if (p === '/') p = '/index.html';
      if (p.endsWith('/')) p += 'index.html';
      if (!exists(p)) bad.push(`${path.relative(out, f)} -> ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('nothing is left calling the functions on the app\'s own origin, and the service worker is left out', () => {
  for (const f of files(out)) {
    if (!/\.(html|js)$/.test(f)) continue;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /["'`]\/\.netlify\/functions\//, path.relative(out, f));
  }
  assert.equal(exists('/sw.js'), false);
  assert.match(fs.readFileSync(path.join(out, 'account/index.html'), 'utf8'), /window\.SIL_API_BASE="https:\/\/api\.example"/);
});
