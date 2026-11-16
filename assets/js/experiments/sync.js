/**
 * /assets/js/experiments/sync.js
 * Optional: keeps a person's course progress the same on all their devices. The record is encrypted in the browser with the
 * person's vault key, and only the ciphertext is stored (table course_progress, one row per person). If the table does not exist
 * yet, or anything fails, the course keeps working from the device and says so; it never blocks the person.
 * Recordings and anything not in `forSync` never leave the device.
 */
import { forSync } from './progress.js';

export const PREF = 'sil.exp.sync';
const TABLE = 'course_progress';
const missing = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(e.message || ''));

/**
 * deps: progress, supabase (client), userId, session() -> the vault session if it is already unlocked, else null,
 *       unlock() -> asks the person to unlock and resolves with the session, prefs (localStorage-like), now
 * status: 'off' | 'idle' | 'syncing' | 'synced' | 'locked' | 'unavailable' | 'error'
 */
export function createSync({ progress, supabase, userId, session, unlock, prefs, now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  let status = prefs?.getItem?.(PREF) === '1' ? 'idle' : 'off', detail = '', last = 0, running = null, timer = null;
  const listeners = new Set();
  const set = (s, d = '') => { status = s; detail = d; listeners.forEach(f => f({ status, detail, last })); };

  async function run(vs) {
    set('syncing');
    const { data, error } = await supabase.from(TABLE).select('content, updated_at').eq('user_id', userId).maybeSingle();
    if (error) { if (missing(error)) { set('unavailable', 'Sync is not set up on the server yet. Your progress is still saved on this device.'); return; } throw error; }
    if (data?.content) {
      let remote;
      try { remote = JSON.parse(await vs.decrypt(data.content)); }
      catch { set('error', 'The saved copy could not be opened with this vault key. Your progress on this device is untouched.'); return; }
      progress.applyRemote(remote);
    }
    const content = await vs.encrypt(JSON.stringify(forSync(progress.snapshot())));
    const { error: e2 } = await supabase.from(TABLE).upsert({ user_id: userId, content, key_version: 1, updated_at: new Date(now()).toISOString() }, { onConflict: 'user_id' });
    if (e2) { if (missing(e2)) { set('unavailable', 'Sync is not set up on the server yet. Your progress is still saved on this device.'); return; } throw e2; }
    last = now(); set('synced');
  }

  const api = {
    get status() { return status; }, get detail() { return detail; }, get last() { return last; },
    onStatus: f => { listeners.add(f); return () => listeners.delete(f); },
    /** Turn sync on: asks to unlock the vault if needed, then syncs once. */
    async enable() {
      try { const vs = session() || await unlock(); if (!vs) { set('locked'); return; } prefs?.setItem?.(PREF, '1'); set('idle'); await api.syncNow(vs); }
      catch (e) { set('error', e?.message || 'Sync failed.'); }
    },
    disable() { prefs?.removeItem?.(PREF); clearTimeout(timer); set('off'); },
    /** Sync now. With no argument it only uses an already unlocked vault, so a page load never pops up a passphrase prompt. */
    async syncNow(vs = session()) {
      if (status === 'off') return;
      if (!vs) { set('locked', 'Unlock your vault to sync.'); return; }
      running ||= run(vs).catch(e => set('error', e?.message || 'Sync failed.')).finally(() => { running = null; });
      return running;
    },
    /** Call after a change; syncs shortly after the person stops, so typing a note does not send a copy per keystroke. */
    schedule(ms = 2500) { if (status === 'off') return; clearTimeout(timer); timer = setTimeout(() => api.syncNow(), ms); },
  };
  return api;
}
