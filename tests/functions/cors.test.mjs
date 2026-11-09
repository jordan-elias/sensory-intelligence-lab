import test from 'node:test';
import assert from 'node:assert/strict';
import { withCors } from '../../netlify/functions/lib/cors.js';

const inner = async () => ({ statusCode: 200, headers: { 'content-type': 'application/json' }, body: '{}' });

test('the app origin gets CORS headers on the response', async () => {
  const r = await withCors(inner)({ httpMethod: 'POST', headers: { origin: 'https://localhost' } });
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://localhost');
  assert.equal(r.headers['content-type'], 'application/json');
});
test('preflight is answered for the app and refused for others', async () => {
  const ok = await withCors(inner)({ httpMethod: 'OPTIONS', headers: { origin: 'capacitor://localhost' } });
  assert.equal(ok.statusCode, 204);
  const bad = await withCors(inner)({ httpMethod: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(bad.statusCode, 403); assert.deepEqual(bad.headers, {});
});
test('other origins and same-origin calls get no CORS headers', async () => {
  for (const h of [{ origin: 'https://evil.example' }, {}]) {
    const r = await withCors(inner)({ httpMethod: 'POST', headers: h });
    assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
  }
});
