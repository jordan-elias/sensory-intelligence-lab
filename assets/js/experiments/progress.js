/**
 * /assets/js/experiments/progress.js
 * Everything a person does in the course, in one small record: which experiments are done, the notes they wrote, the step
 * they were on, and what they chose to keep. It is saved on this device first. If the person turns on sync, the same record is
 * encrypted with their vault key before it leaves the device (see sync.js).
 *
 * The record is built so two devices can be merged without losing anything: every entry carries the time it last changed, the
 * newer one wins, finished experiments are never un-finished, and a deleted item leaves a small marker so it stays deleted.
 * Pure apart from the storage object passed in; nothing here touches the network.
 */
export const KEY = 'sil.exp.v1';
const LEGACY_DONE = 'sil.exp.done', LEGACY_NOTE = id => `sil.exp.note.${id}`;

export const emptyState = () => ({ v: 1, done: {}, notes: {}, pos: {}, shelf: {}, gone: {}, updated: 0 });

const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const num = x => (Number.isFinite(x) ? x : 0);
const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');

/** Accepts anything (a damaged or old record) and returns a clean state. Unknown fields are dropped. */
export function clean(raw) {
  const s = emptyState();
  if (!isObj(raw)) return s;
  if (isObj(raw.done)) for (const [id, at] of Object.entries(raw.done)) if (id && Number.isFinite(at)) s.done[id] = at;
  if (isObj(raw.notes)) for (const [id, n] of Object.entries(raw.notes)) if (id && isObj(n)) s.notes[id] = { t: str(n.t, 20000), at: num(n.at) };
  if (isObj(raw.pos)) for (const [id, p] of Object.entries(raw.pos)) if (id && isObj(p)) s.pos[id] = { s: Math.max(0, Math.min(99, Math.trunc(num(p.s)))), at: num(p.at) };
  if (isObj(raw.shelf)) for (const [id, it] of Object.entries(raw.shelf)) {
    if (!id || !isObj(it) || !['text', 'audio'].includes(it.kind)) continue;
    s.shelf[id] = { exp: str(it.exp, 80), kind: it.kind, title: str(it.title, 120), text: it.kind === 'text' ? str(it.text, 20000) : '', at: num(it.at), note: str(it.note, 2000), edited: num(it.edited), ...(it.kind === 'audio' ? { local: true, secs: num(it.secs) } : {}) };
  }
  if (isObj(raw.gone)) for (const [id, at] of Object.entries(raw.gone)) if (id && Number.isFinite(at)) s.gone[id] = at;
  s.updated = num(raw.updated);
  return s;
}

/** Merge two states. Symmetric and repeatable: merge(a, b) equals merge(b, a), and merging twice changes nothing. */
export function merge(a, b) {
  a = clean(a); b = clean(b);
  const out = emptyState();
  for (const id of new Set([...Object.keys(a.done), ...Object.keys(b.done)])) out.done[id] = Math.min(...[a.done[id], b.done[id]].filter(x => x !== undefined));
  for (const k of ['notes', 'pos']) for (const id of new Set([...Object.keys(a[k]), ...Object.keys(b[k])])) {
    const x = a[k][id], y = b[k][id];
    out[k][id] = !x ? y : !y ? x : y.at > x.at ? y : x.at > y.at ? x : JSON.stringify(y) > JSON.stringify(x) ? y : x;
  }
  for (const id of new Set([...Object.keys(a.gone), ...Object.keys(b.gone)])) out.gone[id] = Math.max(a.gone[id] ?? 0, b.gone[id] ?? 0);
  for (const id of new Set([...Object.keys(a.shelf), ...Object.keys(b.shelf)])) {
    const x = a.shelf[id], y = b.shelf[id], it = !x ? y : !y ? x : Math.max(y.at, y.edited) > Math.max(x.at, x.edited) ? y : x;
    if (out.gone[id] !== undefined && out.gone[id] >= it.at) continue;      // deleted after it was made
    out.shelf[id] = it;
  }
  out.updated = Math.max(a.updated, b.updated);
  return out;
}

/** What leaves the device when sync is on. Recordings stay on the device; only their names are not sent either. */
export function forSync(state) {
  const s = clean(state);
  for (const [id, it] of Object.entries(s.shelf)) if (it.kind === 'audio') delete s.shelf[id];
  return s;
}

/** Brings the two older storage keys (a list of done ids, one note per experiment) into the new record, once. */
export function migrateLegacy(storage, now = Date.now()) {
  const s = emptyState(); let any = false;
  try {
    const done = JSON.parse(storage.getItem(LEGACY_DONE) || '[]');
    if (Array.isArray(done)) for (const id of done) if (typeof id === 'string') { s.done[id] = now; any = true; }
  } catch { /* unreadable: skip */ }
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i); if (!k || !k.startsWith('sil.exp.note.')) continue;
      const id = k.slice('sil.exp.note.'.length); const t = JSON.parse(storage.getItem(k));
      if (typeof t === 'string' && t.trim()) { s.notes[id] = { t, at: now }; any = true; }
    }
  } catch { /* skip */ }
  if (any) s.updated = now;
  return s;
}

const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; };

/** The live record. `storage` is localStorage in the browser; if it is blocked, an in-memory copy is used and `persistent` is false. */
export function createProgress({ storage, now = Date.now } = {}) {
  let persistent = true, store = storage;
  try { if (!store) throw 0; store.setItem('sil.exp.probe', '1'); store.removeItem('sil.exp.probe'); } catch { store = memory(); persistent = false; }
  const listeners = new Set();
  let state;
  const read = () => { try { const raw = store.getItem(KEY); return raw ? clean(JSON.parse(raw)) : null; } catch { return null; } };
  state = read();
  if (!state) { state = migrateLegacy(store, now()); }
  const save = () => { try { store.setItem(KEY, JSON.stringify(state)); } catch { persistent = false; } };
  const touch = () => { state.updated = now(); save(); listeners.forEach(f => { try { f(); } catch { /* a listener must not break saving */ } }); };
  save();

  const api = {
    get persistent() { return persistent; },
    snapshot: () => clean(JSON.parse(JSON.stringify(state))),
    onChange: f => { listeners.add(f); return () => listeners.delete(f); },
    doneSet: () => new Set(Object.keys(state.done)),
    isDone: id => id in state.done,
    markDone(id) { if (!(id in state.done)) state.done[id] = now(); delete state.pos[id]; state.pos[id] = { s: 0, at: now() }; touch(); },
    note: id => state.notes[id]?.t || '',
    setNote(id, text) { state.notes[id] = { t: str(text, 20000), at: now() }; touch(); },
    pos: id => state.pos[id]?.s || 0,
    setPos(id, step) { state.pos[id] = { s: Math.max(0, Math.trunc(step)), at: now() }; touch(); },
    resumable() { return Object.entries(state.pos).filter(([id, p]) => p.s >= 1 && !(id in state.done)).sort((x, y) => y[1].at - x[1].at).map(([id, p]) => ({ id, step: p.s, at: p.at })); },
    keep({ exp, kind = 'text', title, text = '', secs = 0 }) {
      const id = (globalThis.crypto?.randomUUID?.() || `k${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
      state.shelf[id] = clean({ shelf: { [id]: { exp, kind, title, text, secs, at: now() } } }).shelf[id]; touch(); return id;
    },
    /** A short note about a seed: where it came from, or what to do with it. Empty clears it. */
    setSeedNote(id, text) { const it = state.shelf[id]; if (!it) return false; it.note = str(text, 2000); it.edited = now(); touch(); return true; },
    unkeep(id) { delete state.shelf[id]; state.gone[id] = now(); touch(); },
    shelf: () => Object.entries(state.shelf).map(([id, it]) => ({ id, ...it })).sort((x, y) => y.at - x.at),
    /** Merge a record from another device; returns true when anything changed here. */
    applyRemote(remote) {
      const before = JSON.stringify(state), m = merge(state, remote);
      m.updated = Math.max(m.updated, state.updated);
      // Entries only this device holds (recordings) must survive a merge that did not know about them.
      for (const [id, it] of Object.entries(state.shelf)) if (it.kind === 'audio' && !(id in state.gone)) m.shelf[id] = it;
      state = m; save();
      const changed = JSON.stringify(state) !== before; if (changed) listeners.forEach(f => { try { f(); } catch { /* ignore */ } });
      return changed;
    },
  };
  return api;
}
