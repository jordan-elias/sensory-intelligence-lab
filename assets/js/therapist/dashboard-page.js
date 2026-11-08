/**
 * /assets/js/therapist/dashboard-page.js
 * The therapist's list of clients. Each card shows what needs attention (next session, new messages,
 * shared items) and opens the client's own page, where everything about them lives.
 * A therapist sees only what the database lets them see: name, email, plan, intake status and
 * session times, plus what the client chose to share.
 */
import { tierLabel, intakeLabel } from './clients.js';
import { nextSession, describe } from './sessions.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export async function mountDashboard(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const { data: me, error } = await sb.from('therapist_profiles').select('user_id, display_name').eq('user_id', window._currentUser.id).maybeSingle();
  if (error) { root.innerHTML = `<div class="ws-callout"><strong>Could not load</strong>${esc(error.message)}</div>`; return; }
  if (!me) { root.innerHTML = `<div class="ws-callout"><strong>This page is for therapists</strong>If you should have access, please contact the practice owner.</div>`; return; }

  const state = { clients: [], shared: {}, unread: {}, sessions: {} };

  async function load() {
    const [c, n, u, s] = await Promise.all([
      sb.from('my_clients').select('*').order('started_at', { ascending: false }),
      sb.from('shared_copies').select('link_id'),
      sb.from('messages').select('link_id').eq('recipient_id', me.user_id).is('read_at', null),
      sb.from('my_client_sessions').select('*'),
    ]);
    if (c.error) throw new Error(c.error.message);
    state.clients = c.data || [];
    const tally = rows => { const m = {}; for (const r of rows || []) m[r.link_id] = (m[r.link_id] || 0) + 1; return m; };
    state.shared = tally(n.data); state.unread = tally(u.data);
    state.sessions = {};
    for (const r of (s.data || [])) (state.sessions[r.link_id] = state.sessions[r.link_id] || []).push(r);
  }

  const chips = (c, archived) => {
    const out = [];
    const next = archived ? null : nextSession(state.sessions[c.link_id]);
    if (next) out.push(`<span class="th-chip">Next: ${esc(describe(next).when)}</span>`);
    else if (!archived) out.push('<span class="th-chip quiet">No session booked</span>');
    if (state.unread[c.link_id]) out.push(`<span class="th-chip alert">${esc(plural(state.unread[c.link_id], 'new message'))}</span>`);
    out.push(`<span class="th-chip quiet">${state.shared[c.link_id] ? esc(plural(state.shared[c.link_id], 'shared item')) : 'Nothing shared'}</span>`);
    return out.join('');
  };

  const card = (c, archived) => `
    <a class="th-client th-client-link" href="/therapist/client/?link=${encodeURIComponent(c.link_id)}" data-link="${esc(c.link_id)}">
      <div class="th-client-main">
        <strong>${esc(c.full_name || 'Client')}</strong>
        <span class="th-muted">${esc(c.email || '')}</span>
        <span class="th-muted">${archived ? `Ended ${esc(day(c.ended_at))}` : `${esc(tierLabel(c.subscription_tier))} · ${esc(intakeLabel(c.intake_status))}`}</span>
        <span class="th-chips">${chips(c, archived)}</span>
      </div>
      <span class="th-open" aria-hidden="true">Open &rarr;</span>
    </a>`;

  function draw() {
    const active = state.clients.filter(c => c.status === 'active');
    const ended = state.clients.filter(c => c.status === 'ended');
    root.innerHTML = `
      <h2 class="th-h2" style="margin-top:0">Active clients</h2>
      ${active.length ? active.map(c => card(c, false)).join('') : '<p class="th-muted">No active clients yet. Clients on a session plan appear here after they choose to connect with you. Free and Lab members are never shown to you.</p>'}
      <h2 class="th-h2">Archive</h2>
      <p class="th-hint">Clients who ended the connection. What they shared before then is yours to keep or delete; open a client to delete it.</p>
      ${ended.length ? ended.map(c => card(c, true)).join('') : '<p class="th-muted">Nothing in the archive.</p>'}`;
  }

  try { await load(); draw(); } catch (e) { root.innerHTML = `<div class="ws-callout"><strong>Could not load your clients</strong>${esc(e.message)}</div>`; }
}
