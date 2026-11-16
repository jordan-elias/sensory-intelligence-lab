/**
 * /assets/js/therapist/caseload-page.js
 * The therapist's view across their own clients: sessions with no note yet, clients not written up lately, and the themes
 * that run through the caseload. Their notes are opened with their own vault on this device and analysed here; nothing
 * leaves the device, and people are never matched between clients.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { makeNotesStore } from './notes.js';
import { themeTable, unwrittenSessions, quietClients, summary } from '../notes/caseload.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const day = d => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export async function mountCaseloadPage(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const fail = (t, m) => { root.innerHTML = `<div class="ws-callout"><strong>${esc(t)}</strong>${esc(m)}</div>`; };
  const { data: tp } = await sb.from('therapist_profiles').select('user_id').eq('user_id', window._currentUser.id).maybeSingle();
  if (!tp) return fail('This page is for therapists', 'If you should have access, please contact the practice owner.');
  root.innerHTML = '<p class="th-muted">Opening your notes on this device…</p>';
  let session; try { session = await ensureVaultReady(); } catch (e) { return fail('Your vault is locked', e.message); }
  const store = makeNotesStore(sb, session);
  let clients, sessions;
  try {
    const [c, s] = await Promise.all([sb.from('my_clients').select('*').eq('status', 'active'), sb.from('my_client_sessions').select('*')]);
    if (c.error) throw new Error(c.error.message);
    clients = c.data || []; sessions = s.data || [];
  } catch (e) { return fail('Could not load your clients', e.message); }
  const people = [];
  for (const c of clients) {
    let notes = []; try { notes = (await store.list(c.client_id)).filter(n => n.kind === 'note' && n.text); } catch { /* shown with no notes */ }
    people.push({ id: c.client_id, link: c.link_id, name: c.full_name || 'Client', notes, sessions: sessions.filter(x => x.link_id === c.link_id) });
  }
  const now = new Date(), sum = summary(people), table = themeTable(people), quiet = quietClients(people, now);
  const gaps = people.map(p => ({ p, days: unwrittenSessions(p.sessions, p.notes, now) })).filter(x => x.days.length);
  const href = p => `/therapist/client/?link=${encodeURIComponent(p.link)}`;
  root.innerHTML = `<p class="th-back"><a href="/therapist/">&larr; All clients</a></p><h1 class="th-title">Caseload</h1>
    <p class="th-lede">Across your active clients: ${sum.clients} client${sum.clients === 1 ? '' : 's'}, ${sum.notes} note${sum.notes === 1 ? '' : 's'}. Worked out on this device from your own encrypted notes. Nothing is sent anywhere, and people with the same name in different clients are never treated as the same person.</p>
    <h2 class="th-h2">Sessions with no note yet</h2>
    ${gaps.length ? `<ul class="th-list">${gaps.map(({ p, days }) => `<li><a href="${href(p)}"><strong>${esc(p.name)}</strong></a> <span class="th-muted">${days.slice(0, 6).map(d => esc(day(d))).join(', ')}${days.length > 6 ? ` and ${days.length - 6} more` : ''}</span></li>`).join('')}</ul><p class="th-hint">A session counts as written up if you have a note dated that day or in the three days after.</p>` : '<p class="th-muted">Every past session has a note.</p>'}
    <h2 class="th-h2">Not written up for a while</h2>
    ${quiet.length ? `<ul class="th-list">${quiet.map(q => { const p = people.find(x => x.id === q.id); return `<li><a href="${href(p)}"><strong>${esc(q.name)}</strong></a> <span class="th-muted">${q.last ? `last note ${esc(day(q.last))} (${q.since} days ago)` : 'no notes yet'}</span></li>`; }).join('')}</ul>` : '<p class="th-muted">Everyone has a recent note.</p>'}
    <h2 class="th-h2">Themes across your caseload</h2>
    ${table.themes.length ? `<div class="th-scroll" style="overflow-x:auto"><table class="th-table"><thead><tr><th scope="col">Client</th>${table.themes.map(t => `<th scope="col">${esc(t.name)}<br><span class="th-muted">${t.clients} client${t.clients === 1 ? '' : 's'}</span></th>`).join('')}</tr></thead><tbody>${table.rows.map(r => `<tr><th scope="row">${esc(r.name)}</th>${r.cells.map(n => `<td>${n || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="th-hint">Cells are the number of sessions that touch a theme, from your #tags and from words that suggest one.</p>` : '<p class="th-muted">Themes appear once your notes use #tags or touch common topics.</p>'}`;
}
