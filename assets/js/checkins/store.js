/**
 * /assets/js/checkins/store.js
 * Check-ins and saved places. Everything private is packed into one payload that is
 * encrypted in the browser with the vault key; the server keeps only the owner and
 * the timestamp. Old rows (plain columns) are read as before and moved into a payload
 * the first time the vault is open.
 *
 * Check-in record (as pages see it):
 *   { id, created_at, arousal, valence, sensory_load, emotion_words, location_tag,
 *     selected_notes, chord_name, notes, place_id, env: { noise, crowd, light, sun_elevation } }
 */
import { ensureVaultReady, isEncrypted } from '/assets/js/vault/gate.js';

const PAYLOAD_VERSION = 1;
const PLAIN_COLS = 'arousal, valence, sensory_load, emotion_words, location_tag, selected_notes, chord_name, notes';
const COLS = `id, created_at, payload, ${PLAIN_COLS}`;
const EMPTY_PLAIN = {
  arousal: null, valence: null, sensory_load: null, emotion_words: [], location_tag: null,
  selected_notes: null, chord_name: null, notes: null, notes_encrypted_at: null,
};

async function ctx() {
  const session = await ensureVaultReady();
  const sb = window._supabase;
  const { data: { session: auth } } = await sb.auth.getSession();
  return { session, sb, uid: auth?.user?.id || window._currentUser?.id };
}

function toPayload(r) {
  return {
    v: PAYLOAD_VERSION,
    arousal: r.arousal ?? null, valence: r.valence ?? null, sensory_load: r.sensory_load ?? null,
    emotion_words: r.emotion_words || [], location_tag: r.location_tag ?? null,
    selected_notes: r.selected_notes ?? null, chord_name: r.chord_name ?? null, notes: r.notes ?? null,
    place_id: r.place_id ?? null, env: normaliseEnv(r.env),
  };
}

export function normaliseEnv(env) {
  const scale = v => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
  return {
    noise: scale(env?.noise), crowd: scale(env?.crowd),
    light: ['direct', 'bright', 'dim', 'dark'].includes(env?.light) ? env.light : null,
    sun_elevation: Number.isFinite(env?.sun_elevation) ? Math.round(env.sun_elevation * 10) / 10 : null,
  };
}

function fromRow(row, payload) {
  const p = payload;
  return {
    id: row.id, created_at: row.created_at, arousal: p.arousal, valence: p.valence, sensory_load: p.sensory_load,
    emotion_words: p.emotion_words || [], location_tag: p.location_tag, selected_notes: p.selected_notes,
    chord_name: p.chord_name, notes: p.notes, notes_encrypted_at: p.notes != null ? row.created_at : null,
    place_id: p.place_id || null, env: normaliseEnv(p.env),
  };
}

/** Saves one check-in. `record` uses the field names above (no id / created_at). */
export async function save(record) {
  const { session, sb, uid } = await ctx();
  const payload = await session.encrypt(JSON.stringify(toPayload(record)));
  const { data, error } = await sb.from('checkins')
    .insert({ user_id: uid, payload, key_version: 2, ...EMPTY_PLAIN }).select('id, created_at');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

/** Loads and decrypts check-ins, oldest first. `sinceDays: null` loads everything. */
export async function load({ sinceDays = 90 } = {}) {
  const { session, sb, uid } = await ctx();
  let q = sb.from('checkins').select(COLS).eq('user_id', uid);
  if (sinceDays) { const since = new Date(); since.setDate(since.getDate() - sinceDays); q = q.gte('created_at', since.toISOString()); }
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const out = [], legacy = [];
  for (const row of data || []) {
    if (row.payload) {
      try { out.push(fromRow(row, JSON.parse(await session.decrypt(row.payload)))); }
      catch { out.push({ id: row.id, created_at: row.created_at, unreadable: true, emotion_words: [], env: normaliseEnv(null) }); }
    } else {
      let notes = row.notes;
      if (notes && isEncrypted(notes)) { try { notes = await session.decrypt(notes); } catch { notes = null; } }
      const rec = fromRow(row, { ...row, notes, place_id: null, env: null });
      out.push(rec); legacy.push(rec);
    }
  }
  if (legacy.length) packLegacy(legacy).catch(e => console.warn('[checkins] could not move old rows:', e.message));
  return out.filter(r => !r.unreadable);
}

/** Moves plain-column rows into an encrypted payload and blanks the plain columns. */
async function packLegacy(rows) {
  const { session, sb, uid } = await ctx();
  for (const r of rows) {
    const payload = await session.encrypt(JSON.stringify(toPayload(r)));
    await sb.from('checkins').update({ payload, key_version: 2, ...EMPTY_PLAIN })
      .eq('id', r.id).eq('user_id', uid).is('payload', null);
  }
}

export async function remove(id) {
  const { sb, uid } = await ctx();
  const { error } = await sb.from('checkins').delete().eq('id', id).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

// ── saved places ────────────────────────────────────────

/**
 * Place (as pages see it):
 *   { id, name, kind, lat, lng, exact, notes, comfort }
 * lat/lng are optional; they are rounded to about 1 km unless `exact` is set.
 */
function placeToPayload(p) {
  return {
    v: 1, name: String(p.name || '').slice(0, 80), kind: p.kind || 'other',
    lat: Number.isFinite(p.lat) ? p.lat : null, lng: Number.isFinite(p.lng) ? p.lng : null,
    exact: !!p.exact, notes: String(p.notes || '').slice(0, 500),
    comfort: Number.isInteger(p.comfort) && p.comfort >= 1 && p.comfort <= 5 ? p.comfort : null,
  };
}

export async function listPlaces() {
  const { session, sb, uid } = await ctx();
  const { data, error } = await sb.from('locations').select('id, created_at, payload').eq('user_id', uid)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out = [];
  for (const row of data || []) {
    if (!row.payload) continue;                       // an old plain row from before places existed
    try { out.push({ id: row.id, created_at: row.created_at, ...JSON.parse(await session.decrypt(row.payload)) }); } catch { /* skip */ }
  }
  return out;
}

export async function savePlace(place) {
  const { session, sb, uid } = await ctx();
  const payload = await session.encrypt(JSON.stringify(placeToPayload(place)));
  if (place.id) {
    const { error } = await sb.from('locations').update({ payload }).eq('id', place.id).eq('user_id', uid);
    if (error) throw new Error(error.message);
    return place.id;
  }
  const { data, error } = await sb.from('locations').insert({ user_id: uid, payload }).select('id');
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data).id;
}

export async function removePlace(id) {
  const { sb, uid } = await ctx();
  const { error } = await sb.from('locations').delete().eq('id', id).eq('user_id', uid);
  if (error) throw new Error(error.message);
}
