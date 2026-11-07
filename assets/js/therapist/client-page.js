/**
 * /assets/js/therapist/client-page.js
 * Everything a therapist can see about one client, in one place:
 *   Overview (who, plan, next session, what is waiting) · Messages · Shared (check-ins, documents) · Sessions
 * A therapist sees only what the database allows: name, email, plan, intake status and session times,
 * plus whatever the client chose to share. Shared items are opened with the therapist's own vault.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { pairSafetyCode } from '../vault/vault-crypto.js';
import { post } from '../api.js';
import { mountThread } from '../messages/thread.js';
import { tierLabel, intakeLabel, summarize, openCopies } from './clients.js';
import { splitSessions, describe } from './sessions.js';
import { toRows, renderRows, worksheetLabel } from './doc-render.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const when = iso => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const TABS = ['overview', 'messages', 'shared', 'sessions'];

export async function mountClientPage(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const me = window._currentUser;
  const fail = (title, text) => { root.innerHTML = `<div class="ws-callout"><strong>${esc(title)}</strong>${esc(text)}</div>`; };

  const linkId = new URLSearchParams(location.search).get('link');
  const { data: tp } = await sb.from('therapist_profiles').select('user_id').eq('user_id', me.id).maybeSingle();
  if (!tp) return fail('This page is for therapists', 'If you should have access, please contact the practice owner.');
  if (!linkId) return fail('No client selected', 'Choose a client from your list.');

  const { data: rows, error } = await sb.from('my_clients').select('*').eq('link_id', linkId).limit(1);
  if (error) return fail('Could not load this client', error.message);
  const client = rows && rows[0];
  if (!client) return fail('Client not found', 'This client is not in your list. They may have been removed from your archive.');
  const active = client.status === 'active';
  const name = client.full_name || 'Client';

  const [keysQ, copiesQ, sessQ, unreadQ] = await Promise.all([
    active ? sb.from('my_client_keys').select('*').eq('link_id', linkId).limit(1) : Promise.resolve({ data: [] }),
    sb.from('shared_copies').select('link_id, category, source_id, source_created_at, sealed').eq('link_id', linkId),
    sb.from('my_client_sessions').select('*').eq('link_id', linkId),
    sb.from('messages').select('id', { count: 'exact', head: true }).eq('link_id', linkId).eq('recipient_id', me.id).is('read_at', null),
  ]);
  const key = keysQ.data && keysQ.data[0];
  const copies = copiesQ.data || [];
  const nCheckins = copies.filter(c => c.category === 'checkins').length;
  const nDocs = copies.filter(c => c.category === 'worksheets').length;
  const sessions = splitSessions(sessQ.data || []);
  let unread = unreadQ.count || 0;

  root.innerHTML = `
    <p class="th-back"><a href="/therapist/">&larr; All clients</a></p>
    <div class="th-head">
      <div>
        <h1 class="th-title" style="margin-bottom:.2rem">${esc(name)} <span class="th-badge ${active ? '' : 'ended'}">${active ? 'Active' : 'Ended'}</span></h1>
        <p class="th-muted">${esc(client.email || '')}</p>
        <p class="th-muted">${esc(tierLabel(client.subscription_tier))} · ${esc(intakeLabel(client.intake_status))} · ${active ? `Connected since ${esc(day(client.started_at))}` : `Ended ${esc(day(client.ended_at))}`}</p>
      </div>
    </div>
    <div class="th-tabs" role="tablist" aria-label="Client sections">
      <button role="tab" id="tab-overview" aria-controls="panel-overview" data-tab="overview">Overview</button>
      <button role="tab" id="tab-messages" aria-controls="panel-messages" data-tab="messages">Messages<span class="th-count" id="cntMessages"></span></button>
      <button role="tab" id="tab-shared" aria-controls="panel-shared" data-tab="shared">Shared<span class="th-count">${nCheckins + nDocs || ''}</span></button>
      <button role="tab" id="tab-sessions" aria-controls="panel-sessions" data-tab="sessions">Sessions<span class="th-count">${sessions.upcoming.length || ''}</span></button>
    </div>
    <section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden></section>
    <section role="tabpanel" id="panel-messages" aria-labelledby="tab-messages" hidden></section>
    <section role="tabpanel" id="panel-shared" aria-labelledby="tab-shared" hidden></section>
    <section role="tabpanel" id="panel-sessions" aria-labelledby="tab-sessions" hidden></section>`;
  const $ = id => root.querySelector('#' + id);
  const setUnread = n => { unread = n; $('cntMessages').textContent = n ? `${n} new` : ''; };
  setUnread(unread);

  // ── Overview ──
  const next = sessions.upcoming[0];
  const card = (title, body, action) => `<div class="th-card"><p class="th-card-title">${esc(title)}</p><div class="th-card-body">${body}</div>${action || ''}</div>`;
  const renderOverview = () => {
    $('panel-overview').innerHTML = `<div class="th-cards">
      ${card('Next session', next ? `${esc(describe(next).when)}<br><span class="th-muted">${esc(describe(next).kind)}${describe(next).minutes ? ` · ${describe(next).minutes} min` : ''}</span>` : '<span class="th-muted">None booked.</span>', `<button type="button" class="action-btn outline sm" data-go="sessions">All sessions</button>`)}
      ${card('Messages', unread ? `<strong>${plural(unread, 'new message')}</strong>` : '<span class="th-muted">Nothing new.</span>', `<button type="button" class="action-btn outline sm" data-go="messages">${active ? 'Open messages' : 'Read messages'}</button>`)}
      ${card('Shared with you', nCheckins || nDocs ? `${plural(nCheckins, 'check-in')}<br>${plural(nDocs, 'document')}` : '<span class="th-muted">Nothing shared yet. Everything else stays private to the client.</span>', nCheckins || nDocs ? `<button type="button" class="action-btn outline sm" data-go="shared">View shared</button>` : '')}
      ${card('Safety code', key ? '<span class="th-muted">Compare this with the client to confirm your keys are genuine.</span><div id="safetyCode"></div>' : '<span class="th-muted">Available while connected, once the client has set up their vault.</span>', key ? `<button type="button" class="action-btn outline sm" id="showCode">Show safety code</button>` : '')}
    </div>
    <div class="th-card" style="margin-top:1rem"><p class="th-card-title">${active ? 'Connection' : 'Archive'}</p>
      <div class="th-card-body"><p id="dangerMsg" class="th-muted">${active ? 'Ending the connection stops access to anything new. What the client already shared stays in your archive until you delete it.' : 'This client ended the connection. What they shared before then is yours to keep or delete. Deleting removes it and takes them out of your archive for good.'}</p></div>
      ${active ? '<button type="button" class="action-btn outline sm" id="endLink">End connection…</button>' : '<button type="button" class="action-btn outline sm" id="deleteRecords">Delete my records…</button>'}
    </div>`;
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
    $('showCode')?.addEventListener('click', async () => {
      try { const s = await ensureVaultReady(); $('safetyCode').innerHTML = `<p class="th-code">${esc(await pairSafetyCode(s.fingerprint, key.fingerprint))}</p>`; $('showCode').hidden = true; }
      catch (e) { $('safetyCode').innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; }
    });
    $('endLink')?.addEventListener('click', () => confirmAction(`End the connection with ${name}? You lose access to anything new. They are told it has ended.`, 'Yes, end it',
      async () => { await post('end-therapist-link', { link_id: linkId }); location.reload(); }));
    $('deleteRecords')?.addEventListener('click', () => confirmAction(`Delete everything you hold for ${name}? This removes their shared items and messages from your side and cannot be undone.`, 'Yes, delete my records',
      async () => { const { error: e } = await sb.rpc('delete_ended_client_records', { p_link: linkId }); if (e) throw new Error(e.message); location.href = '/therapist/'; }));
  };
  function confirmAction(text, yes, fn) {
    const box = $('dangerMsg'); const old = box.parentElement.innerHTML;
    box.parentElement.innerHTML = `<p style="font-size:.85rem;margin-bottom:.6rem">${esc(text)}</p><button type="button" class="action-btn sm" id="cYes">${esc(yes)}</button> <button type="button" class="action-btn outline sm" id="cNo">Cancel</button><p class="msg" id="cMsg"></p>`;
    $('cNo').onclick = renderOverview;
    $('cYes').onclick = async () => { $('cYes').disabled = true; try { await fn(); } catch (e) { const m = $('cMsg'); m.textContent = e.message; m.className = 'msg show error'; $('cYes').disabled = false; } };
  }

  // ── Messages (opened on first view, because it asks for the vault) ──
  let threadStop = null, threadMounted = false;
  async function showMessages() {
    if (threadMounted) return; threadMounted = true;
    const box = $('panel-messages');
    if (active && !key?.public_enc) { box.innerHTML = `<p class="th-muted">${esc(name)} has not finished setting up their secure vault yet, so messaging is not available.</p>`; return; }
    threadStop = await mountThread(box, { sb, linkId, active,
      other: { id: client.client_id, name, public_enc: key?.public_enc || null, public_sign: key?.public_sign || null, fingerprint: key?.fingerprint || null },
      onChange: async () => { const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('link_id', linkId).eq('recipient_id', me.id).is('read_at', null); setUnread(count || 0); } });
  }

  // ── Shared ──
  let sharedMounted = false;
  async function showShared() {
    if (sharedMounted) return; sharedMounted = true;
    const box = $('panel-shared');
    if (!copies.length) { box.innerHTML = `<p class="th-muted">${esc(name)} has not shared anything yet. Check-ins and worksheets stay private until the client chooses to share them.</p>`; return; }
    box.innerHTML = '<p class="th-muted">Opening shared items…</p>';
    try {
      const session = await ensureVaultReady();
      const { items, unreadable } = await openCopies(session, copies);
      const checkins = items.filter(i => i.category === 'checkins');
      const docs = items.filter(i => i.category === 'worksheets');
      const sum = summarize(checkins);
      box.innerHTML = `
        ${unreadable ? `<p class="th-hint">${plural(unreadable, 'shared item')} could not be opened with your current keys.</p>` : ''}
        <h2 class="th-h2" style="margin-top:0">Check-ins</h2>
        ${checkins.length ? `
          <p class="th-summary"><strong>${sum.count}</strong> check-in${sum.count === 1 ? '' : 's'}, ${esc(day(sum.first))} to ${esc(day(sum.last))}.
            Average energy ${sum.arousal ?? '–'}/10, mood ${sum.valence ?? '–'}/10, sensory load ${sum.sensory_load ?? '–'}/10.
            ${sum.top_emotions.length ? 'Most used: ' + sum.top_emotions.map(t => `${esc(t.word)} (${t.n})`).join(', ') + '.' : ''}</p>
          <ul class="th-list">${checkins.map(i => `<li><span class="th-muted">${esc(when(i.created_at))}</span>
            Energy ${i.arousal ?? '–'}, mood ${i.valence ?? '–'}, load ${i.sensory_load ?? '–'}
            ${i.emotion_words?.length ? '· ' + i.emotion_words.map(esc).join(', ') : ''}${i.location_tag ? ' · ' + esc(i.location_tag) : ''}
            ${i.notes ? `<div class="th-note">“${esc(i.notes)}”</div>` : ''}</li>`).join('')}</ul>` : '<p class="th-muted">No check-ins shared.</p>'}
        <h2 class="th-h2">Documents</h2>
        ${docs.length ? '<div id="docList"></div>' : '<p class="th-muted">No documents shared.</p>'}`;
      const list = box.querySelector('#docList');
      docs.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).forEach(d => {
        const wrap = document.createElement('div'); wrap.className = 'th-docitem';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'th-docbtn'; btn.setAttribute('aria-expanded', 'false');
        const t = document.createElement('strong'); t.textContent = d.title || 'Untitled';
        const m = document.createElement('span'); m.className = 'th-muted'; m.textContent = `${worksheetLabel(d.type)} · updated ${day(d.updated_at)}`;
        btn.append(t, m);
        const body = document.createElement('div'); body.hidden = true; body.className = 'th-docbody';
        const rowsOut = toRows(d.data);
        if (rowsOut.length) body.appendChild(renderRows(document, rowsOut)); else body.textContent = 'This worksheet is empty.';
        btn.onclick = () => { body.hidden = !body.hidden; btn.setAttribute('aria-expanded', String(!body.hidden)); };
        wrap.append(btn, body); list.appendChild(wrap);
      });
    } catch (e) { sharedMounted = false; box.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; }
  }

  // ── Sessions ──
  const renderSessions = () => {
    const li = r => { const d = describe(r); return `<li><strong>${esc(d.when)}</strong> <span class="th-muted">${esc(d.kind)}${d.minutes ? ` · ${d.minutes} min` : ''}${d.cancelled ? ' · cancelled' : ''}</span></li>`; };
    $('panel-sessions').innerHTML = `
      <h2 class="th-h2" style="margin-top:0">Upcoming</h2>
      ${sessions.upcoming.length ? `<ul class="th-list">${sessions.upcoming.map(li).join('')}</ul>` : '<p class="th-muted">No upcoming sessions.</p>'}
      <h2 class="th-h2">Past</h2>
      ${sessions.past.length ? `<ul class="th-list">${sessions.past.map(li).join('')}</ul>` : '<p class="th-muted">No past sessions.</p>'}
      <p class="th-hint">Session times come from the booking calendar. Only sessions booked with you are shown.</p>`;
  };

  // ── Tabs ──
  function show(tab, push = true) {
    if (!TABS.includes(tab)) tab = 'overview';
    for (const t of TABS) {
      const on = t === tab;
      $('tab-' + t).setAttribute('aria-selected', String(on)); $('tab-' + t).tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
    }
    if (push) history.replaceState(null, '', `?link=${encodeURIComponent(linkId)}#${tab}`);
    if (tab === 'messages') showMessages(); else if (tab === 'shared') showShared();
  }
  root.querySelectorAll('[role=tab]').forEach(b => {
    b.addEventListener('click', () => show(b.dataset.tab));
    b.addEventListener('keydown', e => {
      const i = TABS.indexOf(b.dataset.tab);
      const to = e.key === 'ArrowRight' ? TABS[(i + 1) % 4] : e.key === 'ArrowLeft' ? TABS[(i + 3) % 4] : null;
      if (to) { e.preventDefault(); show(to); $('tab-' + to).focus(); }
    });
  });
  renderOverview(); renderSessions();
  show(location.hash.slice(1) || 'overview', false);
  window.addEventListener('pagehide', () => threadStop && threadStop());
}
