/**
 * /assets/js/therapist/dashboard-page.js
 * The therapist's home: active clients, shared check-ins, and an archive of ended clients.
 * A therapist sees only what the database lets them see: name, email, plan and intake status,
 * plus the check-ins a client chose to share, which are opened here with the therapist's own vault.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { pairSafetyCode } from '../vault/vault-crypto.js';
import { mountThread } from '../messages/thread.js';
import { tierLabel, intakeLabel, summarize, openCopies } from './clients.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const when = iso => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export async function mountDashboard(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const { data: me, error } = await sb.from('therapist_profiles').select('user_id, display_name').eq('user_id', window._currentUser.id).maybeSingle();
  if (error) { root.innerHTML = `<div class="ws-callout"><strong>Could not load</strong>${esc(error.message)}</div>`; return; }
  if (!me) { root.innerHTML = `<div class="ws-callout"><strong>This page is for therapists</strong>If you should have access, please contact the practice owner.</div>`; return; }

  const state = { clients: [], counts: {}, keys: {}, unread: {}, stops: {} };

  async function load() {
    const [c, k, n, u] = await Promise.all([
      sb.from('my_clients').select('*').order('started_at', { ascending: false }),
      sb.from('my_client_keys').select('*'),
      sb.from('shared_copies').select('link_id').eq('category', 'checkins'),
      sb.from('messages').select('link_id').eq('recipient_id', me.user_id).is('read_at', null),
    ]);
    state.unread = {};
    for (const r of (u.data || [])) state.unread[r.link_id] = (state.unread[r.link_id] || 0) + 1;
    if (c.error) throw new Error(c.error.message);
    state.clients = c.data || [];
    state.keys = Object.fromEntries((k.data || []).map(r => [r.link_id, r]));
    state.counts = {};
    for (const r of (n.data || [])) state.counts[r.link_id] = (state.counts[r.link_id] || 0) + 1;
  }

  const card = (c, archived) => `
    <div class="th-client" data-link="${esc(c.link_id)}">
      <div class="th-client-main">
        <strong>${esc(c.full_name || 'Client')}</strong>
        <span class="th-muted">${esc(c.email || '')}</span>
        <span class="th-muted">${archived ? `Ended ${esc(day(c.ended_at))}` : `${esc(tierLabel(c.subscription_tier))} · ${esc(intakeLabel(c.intake_status))}`}</span>
        <span class="th-muted">${state.counts[c.link_id] ? `${state.counts[c.link_id]} shared check-in${state.counts[c.link_id] === 1 ? '' : 's'}` : 'Nothing shared'}</span>
      </div>
      <div class="th-client-actions">
        ${state.counts[c.link_id] ? `<button type="button" class="action-btn outline sm" data-act="open">${archived ? 'View kept check-ins' : 'View check-ins'}</button>` : ''}
        <button type="button" class="action-btn outline sm" data-act="messages">Messages${state.unread[c.link_id] ? ` (${state.unread[c.link_id]} new)` : ''}</button>
        ${archived ? '<button type="button" class="action-btn outline sm" data-act="delete">Delete my records</button>' : ''}
      </div>
      <div class="th-client-detail" hidden></div>
      <div class="th-client-thread" hidden></div>
    </div>`;

  function draw() {
    const active = state.clients.filter(c => c.status === 'active');
    const ended = state.clients.filter(c => c.status === 'ended');
    root.innerHTML = `
      <div class="msg" id="dbMsg" role="status" aria-live="polite"></div>
      <h2 class="th-h2">Active clients</h2>
      ${active.length ? active.map(c => card(c, false)).join('') : '<p class="th-muted">No active clients yet. Clients on a session plan appear here after they choose to connect with you. Free and Lab members are never shown to you.</p>'}
      <h2 class="th-h2">Archive</h2>
      <p class="th-hint">Clients who ended the connection. Check-ins they shared before then are yours to keep or delete. Deleting removes them from here for good.</p>
      ${ended.length ? ended.map(c => card(c, true)).join('') : '<p class="th-muted">Nothing in the archive.</p>'}`;
    wire();
  }

  const msg = (t, kind) => { const m = root.querySelector('#dbMsg'); if (m) { m.textContent = t; m.className = 'msg show ' + (kind || ''); } };

  function wire() {
    root.querySelectorAll('.th-client').forEach(el => {
      const link = el.dataset.link, c = state.clients.find(x => x.link_id === link);
      el.querySelector('[data-act="open"]')?.addEventListener('click', () => toggle(el, c));
      el.querySelector('[data-act="messages"]').addEventListener('click', () => toggleThread(el, c));
      el.querySelector('[data-act="delete"]')?.addEventListener('click', () => confirmDelete(el, c));
    });
  }

  async function toggle(el, c) {
    const box = el.querySelector('.th-client-detail');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '<p class="th-muted">Opening…</p>';
    try {
      const session = await ensureVaultReady();      // asks for the therapist's passphrase if locked
      const { data, error } = await sb.from('shared_copies').select('link_id, category, source_id, source_created_at, sealed')
        .eq('link_id', c.link_id).eq('category', 'checkins');
      if (error) throw new Error(error.message);
      const { items, unreadable } = await openCopies(session, data || []);
      const sum = summarize(items), key = state.keys[c.link_id];
      const code = key ? pairSafetyCode(session.fingerprint, key.fingerprint) : null;
      box.innerHTML = `
        ${code ? `<p class="th-hint">Safety code with ${esc(c.full_name || 'this client')}: <strong>${esc(code)}</strong>. Compare it with them to be sure the keys are genuine.</p>` : ''}
        <p class="th-summary"><strong>${sum.count}</strong> check-in${sum.count === 1 ? '' : 's'}${sum.first ? `, ${esc(day(sum.first))} to ${esc(day(sum.last))}` : ''}.
          Average energy ${sum.arousal ?? '–'}/10, mood ${sum.valence ?? '–'}/10, sensory load ${sum.sensory_load ?? '–'}/10.
          ${sum.top_emotions.length ? 'Most used: ' + sum.top_emotions.map(t => `${esc(t.word)} (${t.n})`).join(', ') + '.' : ''}</p>
        ${unreadable ? `<p class="th-hint">${unreadable} shared item${unreadable === 1 ? '' : 's'} could not be opened with your current keys.</p>` : ''}
        <ul class="th-list">${items.map(i => `
          <li><span class="th-muted">${esc(when(i.created_at))}</span>
            Energy ${i.arousal ?? '–'}, mood ${i.valence ?? '–'}, load ${i.sensory_load ?? '–'}
            ${i.emotion_words?.length ? '· ' + i.emotion_words.map(esc).join(', ') : ''}
            ${i.location_tag ? '· ' + esc(i.location_tag) : ''}
            ${i.env ? '· ' + envText(i.env) : ''}
            ${i.notes ? `<div class="th-note">“${esc(i.notes)}”</div>` : ''}</li>`).join('')}</ul>`;
    } catch (e) { box.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; }
  }

  async function toggleThread(el, c) {
    const box = el.querySelector('.th-client-thread');
    if (!box.hidden) { box.hidden = true; state.stops[c.link_id]?.(); return; }
    box.hidden = false;
    const key = state.keys[c.link_id], active = c.status === 'active';
    if (active && !key?.public_enc) { box.innerHTML = `<p class="th-muted">${esc(c.full_name || 'This client')} has not finished setting up their secure vault yet, so messaging is not available.</p>`; return; }
    state.stops[c.link_id] = await mountThread(box, {
      sb, linkId: c.link_id, active,
      other: { id: c.client_id, name: c.full_name || 'your client', public_enc: key?.public_enc || null, public_sign: key?.public_sign || null, fingerprint: key?.fingerprint || null },
      onChange: () => load().catch(() => {}),
    });
  }

  const envText = e => [e.noise ? `noise ${e.noise}/5` : null, e.crowd ? `crowd ${e.crowd}/5` : null, e.light ? `light ${esc(e.light)}` : null].filter(Boolean).join(', ');

  function confirmDelete(el, c) {
    const box = el.querySelector('.th-client-detail'); box.hidden = false;
    box.innerHTML = `<p style="font-size:.85rem;margin-bottom:.6rem">Delete everything you hold for ${esc(c.full_name || 'this client')}? This removes their shared check-ins and takes them out of your archive. It cannot be undone.</p>
      <button type="button" class="action-btn sm" data-act="yes">Yes, delete my records</button>
      <button type="button" class="action-btn outline sm" data-act="no">Keep them</button>`;
    box.querySelector('[data-act="no"]').onclick = () => { box.hidden = true; };
    box.querySelector('[data-act="yes"]').onclick = async () => {
      const { error: e } = await sb.rpc('delete_ended_client_records', { p_link: c.link_id });
      if (e) { msg(e.message, 'error'); return; }
      await refresh(); msg('Records deleted.', 'success');
    };
  }

  async function refresh() { await load(); draw(); }
  try { await refresh(); } catch (e) { root.innerHTML = `<div class="ws-callout"><strong>Could not load your clients</strong>${esc(e.message)}</div>`; }
}
