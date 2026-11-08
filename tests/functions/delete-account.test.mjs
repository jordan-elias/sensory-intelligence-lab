import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, listAll, TABLES } from '../../netlify/functions/delete-account.js';

function fake({ files = {}, subs = [], failOn = null, missing = [] } = {}) {
  const log = [];
  const store = JSON.parse(JSON.stringify(files)); // bucket -> [paths]
  const supabase = {
    log,
    auth: {
      getUser: async (t) => (t === 'good' ? { data: { user: { id: 'u1' } } } : { data: { user: null }, error: { message: 'bad' } }),
      admin: { deleteUser: async (id) => { log.push(['deleteUser', id]); return { error: failOn === 'auth' ? { message: 'x' } : null }; } },
    },
    from(table) {
      const s = { op: 'select', col: null };
      const b = {
        select() { return b; },
        delete() { s.op = 'delete'; return b; },
        eq(c, v) { s.col = c; s.v = v; return b; },
        then(res, rej) {
          const run = () => {
            if (missing.includes(table)) return { data: null, error: { code: '42P01', message: 'relation does not exist' } };
            if (s.op === 'delete') { log.push(['delete', table, s.col]); return { error: failOn === table ? { message: 'boom' } : null }; }
            if (table === 'subscriptions') return { data: subs, error: null };
            return { data: [], error: null };
          };
          return Promise.resolve(run()).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from(bucket) {
        return {
          async list(dir, { limit, offset }) {
            const names = new Map();
            for (const p of store[bucket] || []) {
              if (!p.startsWith(dir + '/')) continue;
              const rest = p.slice(dir.length + 1).split('/');
              names.set(rest[0], rest.length > 1 ? null : p);
            }
            const all = [...names].map(([name, id]) => ({ name, id }));
            return { data: all.slice(offset, offset + limit), error: null };
          },
          async remove(paths) { log.push(['remove', bucket, paths.length]); store[bucket] = (store[bucket] || []).filter((p) => !paths.includes(p)); return { error: failOn === 'storage' ? { message: 's' } : null }; },
        };
      },
    },
  };
  return { supabase, store, log };
}
const stripeFake = (calls, err) => ({ subscriptions: { cancel: async (id) => { calls.push(id); if (err) throw err; } } });
const req = (token = 'good', method = 'POST') => ({ httpMethod: method, headers: token ? { authorization: 'Bearer ' + token } : {} });

test('rejects wrong method and bad tokens', async () => {
  const { supabase } = fake();
  const h = makeHandler(supabase, null);
  assert.equal((await h(req('good', 'GET'))).statusCode, 405);
  assert.equal((await h(req(null))).statusCode, 401);
  assert.equal((await h(req('nope'))).statusCode, 401);
});

test('deletes files (nested), rows, cancels billing, then the login last', async () => {
  const { supabase, store, log } = fake({
    files: { recordings: ['u1/a.bin', 'u1/sub/b.bin', 'other/c.bin'], 'therapist-photos': ['u1/p.jpg'] },
    subs: [{ stripe_subscription_id: 'sub_1' }, { stripe_subscription_id: 'sub_1' }, { stripe_subscription_id: null }],
  });
  const calls = [];
  const res = await makeHandler(supabase, stripeFake(calls))(req());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['sub_1']);
  assert.deepEqual(store.recordings, ['other/c.bin']);
  assert.deepEqual(store['therapist-photos'], []);
  assert.deepEqual(log.at(-1), ['deleteUser', 'u1']);
  const deleted = log.filter((l) => l[0] === 'delete').map((l) => `${l[1]}.${l[2]}`);
  for (const [t, c] of TABLES) assert.ok(deleted.includes(`${t}.${c}`), `${t}.${c}`);
});

test('a billing failure stops everything before any data is touched', async () => {
  const { supabase, log } = fake({ subs: [{ stripe_subscription_id: 'sub_1' }] });
  const res = await makeHandler(supabase, stripeFake([], Object.assign(new Error('network'), { code: 'api_connection_error' })))(req());
  assert.equal(res.statusCode, 500);
  assert.equal(log.length, 0);
});

test('an already cancelled subscription does not block deletion', async () => {
  const { supabase, log } = fake({ subs: [{ stripe_subscription_id: 'sub_1' }] });
  const res = await makeHandler(supabase, stripeFake([], Object.assign(new Error('gone'), { code: 'resource_missing' })))(req());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(log.at(-1), ['deleteUser', 'u1']);
});

test('subscriptions but no billing client: refuses rather than leaving billing active', async () => {
  const { supabase, log } = fake({ subs: [{ stripe_subscription_id: 'sub_1' }] });
  assert.equal((await makeHandler(supabase, null)(req())).statusCode, 500);
  assert.equal(log.length, 0);
});

test('a storage or row failure keeps the login so the person can retry', async () => {
  for (const failOn of ['storage', 'messages']) {
    const { supabase, log } = fake({ files: { recordings: ['u1/a.bin'] }, failOn });
    const res = await makeHandler(supabase, null)(req());
    assert.equal(res.statusCode, 500, failOn);
    assert.ok(!log.some((l) => l[0] === 'deleteUser'), failOn);
  }
});

test('tables missing from this project are skipped', async () => {
  const { supabase, log } = fake({ missing: ['worksheets', 'locations'] });
  assert.equal((await makeHandler(supabase, null)(req())).statusCode, 200);
  assert.deepEqual(log.at(-1), ['deleteUser', 'u1']);
});

test('login deletion failure reports an error', async () => {
  const { supabase } = fake({ failOn: 'auth' });
  assert.equal((await makeHandler(supabase, null)(req())).statusCode, 500);
});

test('listAll walks folders and pages', async () => {
  const files = { recordings: Array.from({ length: 250 }, (_, i) => `u1/f${i}.bin`).concat(['u1/d/x.bin']) };
  const { supabase } = fake({ files });
  assert.equal((await listAll(supabase.storage, 'recordings', 'u1')).length, 251);
});
