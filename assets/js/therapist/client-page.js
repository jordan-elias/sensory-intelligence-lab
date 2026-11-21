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
import { weekSummary, weekText } from './week.js';
import { toRows, renderRows, worksheetLabel } from './doc-render.js';
import { makeNotesStore } from './notes.js';
import { mountRecord } from './record.js';
import { openIntake, renderIntake } from '../intake/intake.js';
import { openFamily, renderFamily } from '../family/family.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const when = iso => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const TABS = ['overview', 'messages', 'folder', 'notes', 'sessions'];
const TAB_ALIAS = { shared: 'folder', intake: 'folder' };

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
  const nForms = copies.filter(c => c.category === 'intake' || c.category === 'family').length;
  const nJournal = copies.filter(c => c.category === 'journal').length;
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
      <button role="tab" id="tab-folder" aria-controls="panel-folder" data-tab="folder">Folder<span class="th-count">${nCheckins + nDocs + nForms + nJournal || ''}</span></button>
      <button role="tab" id="tab-notes" aria-controls="panel-notes" data-tab="notes">Record</button>
      <button role="tab" id="tab-sessions" aria-controls="panel-sessions" data-tab="sessions">Sessions<span class="th-count">${sessions.upcoming.length || ''}</span></button>
    </div>
    <section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden></section>
    <section role="tabpanel" id="panel-messages" aria-labelledby="tab-messages" hidden></section>
    <section role="tabpanel" id="panel-folder" aria-labelledby="tab-folder" hidden>
      <section id="folder-week" aria-label="This week"></section>
      <ul class="th-index" id="folderIndex"></ul>
      <h2 class="th-h2">Intake and family history</h2>
      <section id="folder-intake" aria-label="Intake form and family history"></section>
      <section id="folder-docs" aria-label="Worksheets"></section>
      <section id="folder-journal" aria-label="Journal entries"></section>
      <section id="folder-checkins" aria-label="Check-ins"></section>
    </section>
    <section role="tabpanel" id="panel-sessions" aria-labelledby="tab-sessions" hidden></section>
    <section role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden></section>`;
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
      ${card('Shared with you', nCheckins || nDocs ? `${plural(nCheckins, 'check-in')}<br>${plural(nDocs, 'document')}` : '<span class="th-muted">Nothing shared yet. Everything else stays private to the client.</span>', nCheckins || nDocs ? `<button type="button" class="action-btn outline sm" data-go="folder">View shared</button>` : '')}
      ${card('Intake form', client.intake_received ? '<strong>Received.</strong>' : client.intake_requested_at ? `<span class="th-muted">Asked ${esc(day(client.intake_requested_at))}. Not sent yet.</span>` : '<span class="th-muted">Not requested.</span>', `<button type="button" class="action-btn outline sm" data-go="folder">${client.intake_received ? 'View intake' : 'Intake form'}</button>`)}
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
    threadStop = await mountThread(box, { sb, linkId, active, canAssign: true,
      other: { id: client.client_id, name, public_enc: key?.public_enc || null, public_sign: key?.public_sign || null, fingerprint: key?.fingerprint || null },
      onChange: async () => { const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('link_id', linkId).eq('recipient_id', me.id).is('read_at', null); setUnread(count || 0); } });
  }

  // ── Folder: everything this client has sent, in one place ──
  const folderIndex = () => {
    const forms = [
      ['Intake form', client.intake_received ? 'Received' : client.intake_requested_at ? `Asked ${day(client.intake_requested_at)}, not sent yet` : 'Not requested'],
      ['Family history', copies.some(c => c.category === 'family') ? 'Received' : client.family_requested_at ? `Asked ${day(client.family_requested_at)}, not sent yet` : 'Not requested'],
      ['Worksheets', nDocs ? plural(nDocs, 'document') + ' shared' : 'None shared'],
      ['Journal entries', nJournal ? `${nJournal} entr${nJournal === 1 ? 'y' : 'ies'} shared` : 'None shared'],
      ['Check-ins', nCheckins ? plural(nCheckins, 'check-in') + ' shared' : 'None shared'],
    ];
    $('folderIndex').innerHTML = forms.map(([k, v]) => `<li><strong>${esc(k)}</strong> <span class="th-muted">${esc(v)}</span></li>`).join('');
  };
  let folderMounted = false;
  async function showFolder() {
    if (folderMounted) return; folderMounted = true;
    folderIndex();
    await showShared();     // one vault unlock, then the forms
    showIntake();
  }
  async function showShared() {
    const docsBox = $('folder-docs'), checkBox = $('folder-checkins');
    const none = (box, what) => { box.innerHTML = `<h2 class="th-h2">${what === 'docs' ? 'Worksheets' : 'Check-ins'}</h2><p class="th-muted">${what === 'docs' ? 'No worksheets shared.' : 'No check-ins shared.'}${copies.length ? '' : ` ${esc(name)} chooses what to share. Everything else stays private.`}</p>`; };
    const jBox = $('folder-journal');
    $('folder-week').innerHTML = '<h2 class="th-h2">This week</h2><p class="th-muted">Nothing shared this week.</p>';
    if (!copies.some(c => c.category === 'worksheets' || c.category === 'checkins' || c.category === 'journal')) { none(docsBox, 'docs'); none(checkBox, 'check'); jBox.innerHTML = '<h2 class="th-h2">Journal entries</h2><p class="th-muted">No journal entries shared. A client shares them one at a time.</p>'; return; }
    docsBox.innerHTML = '<p class="th-muted">Opening shared items…</p>';
    try {
      const session = await ensureVaultReady();
      const { items, unreadable } = await openCopies(session, copies);
      const checkins = items.filter(i => i.category === 'checkins');
      const docs = items.filter(i => i.category === 'worksheets');
      const journal = items.filter(i => i.category === 'journal');
      jBox.innerHTML = '<h2 class="th-h2">Journal entries</h2>' + (journal.length ? '<div id="journalList"></div>' : '<p class="th-muted">No journal entries shared. A client shares them one at a time.</p>');
      const jl = jBox.querySelector('#journalList');
      journal.forEach(j => {
        const wrap = document.createElement('div'); wrap.className = 'th-docitem';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'th-docbtn'; btn.setAttribute('aria-expanded', 'false');
        const t = document.createElement('strong'); t.textContent = j.title || 'Untitled entry';
        const m = document.createElement('span'); m.className = 'th-muted'; m.textContent = `Written ${day(j.created_at)} · shared ${day(j.shared_at || j.created_at)}`;
        btn.append(t, m);
        const body = document.createElement('div'); body.hidden = true; body.className = 'th-docbody th-journalbody';
        body.style.whiteSpace = 'pre-wrap'; body.textContent = j.text || '';
        btn.onclick = () => { body.hidden = !body.hidden; btn.setAttribute('aria-expanded', String(!body.hidden)); };
        wrap.append(btn, body); jl.appendChild(wrap);
      });
      const wk = weekSummary(items), wbox = $('folder-week'), c = wk.checkins, vs = k => c.vsLastWeek[k] == null ? '' : ` <span class="th-muted">(${c.vsLastWeek[k] > 0 ? '+' : ''}${c.vsLastWeek[k]} on the week before)</span>`;
      wbox.innerHTML = `<h2 class="th-h2">This week</h2><p class="th-muted">What ${esc(name)} chose to share, ${esc(wk.from)} to ${esc(wk.to)}.</p>` + (wk.empty ? '<p class="th-muted">Nothing shared this week.</p>' : `<ul class="th-list">
        <li><strong>Check-ins: ${c.count}.</strong> ${c.count ? `Energy ${c.arousal ?? '–'}${vs('arousal')}, mood ${c.valence ?? '–'}${vs('valence')}, sensory load ${c.sensory_load ?? '–'}${vs('sensory_load')}.${c.top_emotions.length ? ' Most used: ' + c.top_emotions.map(t => `${esc(t.word)} (${t.n})`).join(', ') + '.' : ''}` : ''}</li>
        <li><strong>Worksheets: ${wk.worksheets.length}.</strong> ${wk.worksheets.map(x => esc(x.label)).join(', ')}</li>
        <li><strong>Journal entries: ${wk.journal.length}.</strong> ${wk.journal.map(j => esc(j.title)).join('; ')}</li></ul>
        <button type="button" class="action-btn outline sm" id="weekCopy">Copy as text</button> <span class="msg" id="weekMsg" role="status"></span>`);
      const wc = $('weekCopy'); if (wc) wc.onclick = async () => { const m = $('weekMsg'); try { await navigator.clipboard.writeText(weekText(name, wk)); m.textContent = 'Copied.'; } catch { m.textContent = 'Could not copy. Select the text instead.'; } m.className = 'msg show'; };
      const sum = summarize(checkins);
      checkBox.innerHTML = `
        <h2 class="th-h2">Check-ins</h2>
        ${checkins.length ? `
          <p class="th-summary"><strong>${sum.count}</strong> check-in${sum.count === 1 ? '' : 's'}, ${esc(day(sum.first))} to ${esc(day(sum.last))}.
            Average energy ${sum.arousal ?? '–'}/10, mood ${sum.valence ?? '–'}/10, sensory load ${sum.sensory_load ?? '–'}/10.
            ${sum.top_emotions.length ? 'Most used: ' + sum.top_emotions.map(t => `${esc(t.word)} (${t.n})`).join(', ') + '.' : ''}</p>
          <ul class="th-list">${checkins.map(i => `<li><span class="th-muted">${esc(when(i.created_at))}</span>
            Energy ${i.arousal ?? '–'}, mood ${i.valence ?? '–'}, load ${i.sensory_load ?? '–'}
            ${i.emotion_words?.length ? '· ' + i.emotion_words.map(esc).join(', ') : ''}${i.location_tag ? ' · ' + esc(i.location_tag) : ''}
            ${i.notes ? `<div class="th-note">“${esc(i.notes)}”</div>` : ''}</li>`).join('')}</ul>` : '<p class="th-muted">No check-ins shared.</p>'}`;
      docsBox.innerHTML = `
        ${unreadable ? `<p class="th-hint">${plural(unreadable, 'shared item')} could not be opened with your current keys.</p>` : ''}
        <h2 class="th-h2">Worksheets</h2>
        ${docs.length ? '<div id="docList"></div>' : '<p class="th-muted">No worksheets shared.</p>'}`;
      const list = docsBox.querySelector('#docList');
      // Grouped by worksheet type, newest first inside each group.
      const groups = new Map();
      docs.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .forEach(d => { const k = worksheetLabel(d.type); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
      groups.forEach((group, label) => {
        const h = document.createElement('h3'); h.className = 'th-h3'; h.textContent = `${label} (${group.length})`; list.appendChild(h);
        group.forEach(d => {
          const wrap = document.createElement('div'); wrap.className = 'th-docitem';
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'th-docbtn'; btn.setAttribute('aria-expanded', 'false');
          const t = document.createElement('strong'); t.textContent = d.title || 'Untitled';
          const m = document.createElement('span'); m.className = 'th-muted'; m.textContent = `${label} · updated ${day(d.updated_at)}`;
          btn.append(t, m);
          const body = document.createElement('div'); body.hidden = true; body.className = 'th-docbody';
          const rowsOut = toRows(d.data);
          if (rowsOut.length) body.appendChild(renderRows(document, rowsOut)); else body.textContent = 'This worksheet is empty.';
          btn.onclick = () => { body.hidden = !body.hidden; btn.setAttribute('aria-expanded', String(!body.hidden)); };
          wrap.append(btn, body); list.appendChild(wrap);
        });
      });
    } catch (e) { docsBox.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; folderMounted = false; }
  }

  // Whatever the therapist opens from the client is also copied into their own encrypted record, so it survives if the client leaves or deletes their account.
  const keepCopy = (session, kind, data) => makeNotesStore(sb, session).keep(client.client_id, kind, data).catch(() => {});

  // ── Intake ──
  let intakeMounted = false;
  async function showIntake() {
    if (intakeMounted) return; intakeMounted = true;
    const box = $('folder-intake');
    const ask = async () => {
      const { error: e } = await sb.rpc('request_intake', { p_link: linkId });
      if (e) throw new Error(e.message);
      client.intake_requested_at = new Date().toISOString();
    };
    const appendFamily = async () => {
      const fcopy = copies.find(c => c.category === 'family');
      if (!fcopy) {
        if (!active) return;
        const sec = document.createElement('section'); sec.style.marginTop = '2rem'; sec.id = 'familyAsk';
        sec.innerHTML = `<h2 class="th-h2">Family history</h2><p class="th-muted">${client.family_requested_at ? `You asked ${esc(name)} on ${esc(day(client.family_requested_at))}. Nothing has arrived yet.` : `Optionally ask ${esc(name)} for a family history: the significant people in their life, how they relate and what matters. It is separate from the intake form. They choose what to write and whether to send it, and only you and they can read it.`}</p>
          <button type="button" class="action-btn" id="askFamily">${client.family_requested_at ? 'Send a reminder' : 'Request family history form'}</button> <p class="msg" id="askFamMsg" role="status"></p>`;
        box.appendChild(sec);
        sec.querySelector('#askFamily').onclick = async () => {
          const b = sec.querySelector('#askFamily'), m = sec.querySelector('#askFamMsg'); b.disabled = true;
          const { error: e } = await sb.rpc('request_family', { p_link: linkId });
          if (e) { m.textContent = e.message; m.className = 'msg show error'; b.disabled = false; return; }
          client.family_requested_at = new Date().toISOString(); intakeMounted = false; showIntake();
        };
        return;
      }
      try {
        const session = await ensureVaultReady(), fam = await openFamily(session, { ...fcopy, link_id: linkId }); keepCopy(session, 'family', fam);
        const sec = document.createElement('section'); sec.style.marginTop = '2rem'; sec.id = 'familySection';
        sec.innerHTML = `<h2 class="th-h2">Family history</h2><p class="th-hint">Sent by ${esc(name)}${fam.sent_at ? ' on ' + esc(day(fam.sent_at)) : ''}. Optional, and only you and the client can read it.</p>`;
        sec.appendChild(renderFamily(document, fam)); box.appendChild(sec);
      } catch (e) { const p = document.createElement('p'); p.className = 'msg show error'; p.textContent = e.message; box.appendChild(p); }
    };
    const draw = async () => {
      const copy = copies.find(c => c.category === 'intake');
      box.innerHTML = '';
      if (copy) {
        box.innerHTML = '<p class="th-muted">Opening…</p>';
        try {
          const session = await ensureVaultReady();
          const intake = await openIntake(session, { ...copy, link_id: linkId }); keepCopy(session, 'intake', intake); keepCopy(session, 'profile', { name });
          box.innerHTML = `<p class="th-hint">Sent by ${esc(name)}${intake.submitted_at ? ' on ' + esc(day(intake.submitted_at)) : ''}. Only you and the client can read this.</p>`;
          box.appendChild(renderIntake(document, intake));
          await appendFamily();
        } catch (e) { intakeMounted = false; box.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; }
        return;
      }
      if (!active) { box.innerHTML = '<p class="th-muted">No intake form was received.</p>'; await appendFamily(); return; }
      box.innerHTML = `<p class="th-muted">${client.intake_requested_at ? `You asked ${esc(name)} on ${esc(day(client.intake_requested_at))}. Nothing has arrived yet.` : `Ask ${esc(name)} to fill in a short intake form: name, date of birth, pronouns, contact information, medications and mental health history. They choose what to answer, and only you and they can read it.`}</p>
        <button type="button" class="action-btn" id="askIntake">${client.intake_requested_at ? 'Send a reminder' : 'Request intake form'}</button> <p class="msg" id="askMsg" role="status"></p>`;
      $('askIntake').onclick = async () => {
        const m = $('askMsg'); $('askIntake').disabled = true;
        try { await ask(); intakeMounted = false; renderOverview(); showIntake(); }
        catch (e) { m.textContent = e.message; m.className = 'msg show error'; $('askIntake').disabled = false; }
      };
      await appendFamily();
    };
    draw();
  }

  // ── Notes (opened on first view, because it asks for the vault) ──
  let notesMounted = false;
  async function showNotes() {
    if (notesMounted) return; notesMounted = true;
    const box = $('panel-notes');
    box.innerHTML = '<p class="th-muted">Opening your notes…</p>';
    try {
      const session = await ensureVaultReady();
      // The intake form and family history join the record, so everything about this client is in one place. Opened here, read here.
      const open = async (cat, fn) => { const c = copies.find(x => x.category === cat); if (!c) return null; try { return await fn(session, { ...c, link_id: linkId }); } catch { return null; } };
      const [intake, fam] = await Promise.all([open('intake', openIntake), open('family', openFamily)]);
      await mountRecord(box, { store: makeNotesStore(sb, session), clientId: client.client_id, clientName: name, active, intake, fam, profile: { name },
        sharedDates: copies.filter(c => c.category === 'checkins').map(c => c.source_created_at).filter(Boolean) });
    } catch (e) { notesMounted = false; box.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; }
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
    tab = TAB_ALIAS[tab] || tab;
    if (!TABS.includes(tab)) tab = 'overview';
    for (const t of TABS) {
      const on = t === tab;
      $('tab-' + t).setAttribute('aria-selected', String(on)); $('tab-' + t).tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
    }
    if (push) history.replaceState(null, '', `?link=${encodeURIComponent(linkId)}#${tab}`);
    if (tab === 'messages') showMessages(); else if (tab === 'folder') showFolder(); else if (tab === 'notes') showNotes();
  }
  root.querySelectorAll('[role=tab]').forEach(b => {
    b.addEventListener('click', () => show(b.dataset.tab));
    b.addEventListener('keydown', e => {
      const i = TABS.indexOf(b.dataset.tab);
      const n = TABS.length;
      const to = e.key === 'ArrowRight' ? TABS[(i + 1) % n] : e.key === 'ArrowLeft' ? TABS[(i + n - 1) % n] : null;
      if (to) { e.preventDefault(); show(to); $('tab-' + to).focus(); }
    });
  });
  renderOverview(); renderSessions();
  show(location.hash.slice(1) || 'overview', false);
  window.addEventListener('pagehide', () => threadStop && threadStop());
}
