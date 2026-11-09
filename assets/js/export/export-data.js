/**
 * /assets/js/export/export-data.js
 * "Download my data": everything stored for the signed-in person, opened in the browser with the
 * vault key and written to one JSON file on their own device. Nothing about the download is sent
 * anywhere. Audio files are listed but not included (they can be downloaded one by one).
 */
import { ensureVaultReady, isEncrypted } from '/assets/js/vault/gate.js';
import * as checkins from '/assets/js/checkins/store.js';
import * as recordings from '/assets/js/recordings/store.js';
import { loadConversation } from '/assets/js/messages/store.js';

/** Runs one part of the export; a failing part is reported inside the file instead of stopping it. */
async function part(notes, name, fn) {
  try { return await fn(); }
  catch (e) { notes.push(`${name}: could not be read (${e.message})`); return null; }
}

async function plain(sb, table, uid, col = 'user_id') {
  const { data, error } = await sb.from(table).select('*').eq(col, uid);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function buildExport({ sb, uid, now = new Date() }) {
  const session = await ensureVaultReady();
  const notes = [];
  const out = {
    about: 'Your data from the Sensory Intelligence Lab, opened on your device and saved here. Nothing in this file was sent anywhere.',
    exported_at: now.toISOString(),
    user_id: uid,
    notes,
  };

  out.account = await part(notes, 'account', async () => {
    const { data: p, error } = await sb.from('profiles').select('*').eq('id', uid).single();
    if (error || !p) throw new Error(error?.message || 'no profile');
    // Only the person's own details. Billing identifiers and key material stay out of the file.
    const keep = ['id', 'full_name', 'display_name', 'email', 'subscription_tier', 'subscription_status', 'intake_status', 'created_at'];
    return Object.fromEntries(keep.filter(k => k in p).map(k => [k, p[k]]));
  });

  out.journal = await part(notes, 'journal', async () => {
    const { data, error } = await sb.from('journal_entries')
      .select('id, title, created_at, word_count, content, prompt, music, duration_min').eq('user_id', uid).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    const rows = [];
    for (const r of data || []) {
      let text = r.content;
      if (isEncrypted(r.content)) { try { text = await session.decrypt(r.content); } catch { text = null; } }
      let title = r.title;
      if (title && isEncrypted(title)) { try { title = await session.decrypt(title); } catch { title = null; } }
      rows.push({ id: r.id, created_at: r.created_at, title, text, word_count: r.word_count, prompt: r.prompt, music: r.music, duration_min: r.duration_min, readable: text !== null });
    }
    return rows;
  });

  out.checkins = await part(notes, 'check-ins', () => checkins.load({ sinceDays: null }));
  out.saved_places = await part(notes, 'saved places', () => checkins.listPlaces());

  out.worksheets = await part(notes, 'worksheets', async () => {
    const { data, error } = await sb.from('worksheets').select('*').eq('user_id', uid).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    const rows = [];
    for (const r of data || []) {
      let content = null;
      try { content = JSON.parse(isEncrypted(r.content) ? await session.decrypt(r.content) : r.content); } catch { content = null; }
      rows.push({ id: r.id, type: r.type, title: r.title, created_at: r.created_at, updated_at: r.updated_at || null, content, readable: content !== null });
    }
    return rows;
  });

  out.recordings = await part(notes, 'recordings', async () =>
    (await recordings.list()).map(r => ({ id: r.id, title: r.title, created_at: r.created_at, duration_s: r.duration_s, mime_type: r.mime_type, file_size: r.file_size })));

  out.messages = await part(notes, 'messages', async () => {
    const { data: links } = await sb.from('my_therapists').select('link_id, display_name, status');
    const threads = [];
    for (const l of links || []) {
      const msgs = await loadConversation({ sb, session, linkId: l.link_id, otherSignKey: null });
      threads.push({ with: l.display_name, connection: l.status, messages: msgs.map(m => ({ sent_at: m.created_at, from: m.mine ? 'me' : l.display_name, text: m.text })) });
    }
    return threads;
  });

  out.bookings = await part(notes, 'bookings', () => plain(sb, 'bookings', uid));
  out.game_scores = await part(notes, 'game scores', () => plain(sb, 'game_best_scores', uid));
  out.game_sessions = await part(notes, 'game sessions', () => plain(sb, 'game_sessions', uid));
  out.mixer_sessions = await part(notes, 'mixer sessions', () => plain(sb, 'mixer_sessions', uid));
  return out;
}

export function exportFileName(now = new Date()) {
  return `sil-my-data-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
