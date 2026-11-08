/**
 * /assets/js/worksheets/page.js
 * Generic controller for a single worksheet page.
 *
 * A worksheet module is a plain object:
 *   {
 *     slug, type, label, blurb, savedNoun,
 *     render()            -> HTML string for the form
 *     init(ctx)           -> bind behaviour after render   (ctx = { root, markDirty })
 *     collect()           -> { schema, data }              (default: flat [data-field] map)
 *     restore(payload)    -> fill the form from a loaded entry
 *     exportText?(title)  -> custom plain-text export
 *     mountExtras?(ctx)   -> add page-specific tools to the saved panel (e.g. Compare)
 *   }
 * Opening an entry is `?id=<uuid>`; a blank sheet is the bare URL (or `?new`).
 */
import { mountLayout, ensureVaultReady, whenAuthReady, esc, formatDate, getSupabase } from './core.js';
import * as store from './store.js';
import { createAutosaver } from './autosave.js';
import * as docSharing from '/assets/js/sharing/documents.js';
import { therapistTarget } from '/assets/js/sharing/store.js';
import { collectFields, restoreFields, initScales, initChoices, exportTextFromDom, downloadText, syncScales } from './ui.js';

export async function mount(ws) {
  mountLayout({ crumbs: [{ label: 'Worksheets', href: '/worksheets/' }, { label: ws.label }] });

  const app = document.getElementById('worksheetsApp');
  const params = new URLSearchParams(location.search);
  let entryId = params.get('id');
  let updatedAt = null;
  let entries = [];
  let deleted = false;
  let baseline = null;
  let ready = false;

  const dateNow = formatDate(new Date().toISOString());
  const defaultTitle = `${ws.label} — ${dateNow}`;

  app.innerHTML = `
    <div class="ph">
      <h2>${esc(ws.label)}</h2>
      <p>${esc(ws.blurb)} Changes are saved automatically and encrypted before they leave your device.</p>
    </div>

    <section class="saved-section ws-saved" aria-labelledby="wsSavedHeading">
      <div class="ws-saved__head">
        <p class="section-label" id="wsSavedHeading">${esc(ws.savedNoun || 'Saved worksheets')}</p>
        <a class="action-btn outline sm" href="?new" id="wsNewBtn">Start a new one</a>
      </div>
      <div class="saved-list" id="savedList"><div class="saved-empty">Loading…</div></div>
      <div id="savedExtras"></div>
    </section>

    <div class="ws-docbar" id="wsDocbar">
      <label class="visually-hidden" for="wsTitle">Name of this worksheet</label>
      <input type="text" id="wsTitle" class="ws-title-input" placeholder="Name this worksheet" value="${esc(defaultTitle)}" autocomplete="off">
      <span class="ws-status" id="wsStatus" role="status" aria-live="polite"></span>
      <button type="button" class="action-btn outline sm" id="wsRetry" hidden>Retry now</button>
      <button type="button" class="action-btn outline sm" id="wsShare" hidden></button>
      <button type="button" class="action-btn outline sm" id="wsDownload">Download .txt</button>
      <button type="button" class="action-btn outline sm" id="wsPrint">Print / PDF</button>
    </div>

    <div class="ws-conflict" id="wsConflict" hidden role="alert">
      <strong>This entry was changed on another device.</strong>
      <span>Autosave is paused so nothing gets overwritten by accident.</span>
      <div class="ws-conflict__actions">
        <button type="button" class="action-btn outline sm" id="wsConflictReload">Load the latest version</button>
        <button type="button" class="action-btn sm" id="wsConflictKeep">Keep what's on this screen</button>
      </div>
    </div>

    <div class="msg" id="wsMsg"></div>
    <div id="wsContent" class="ws-content">${entryId ? '<div class="saved-empty">Opening…</div>' : ''}</div>
  `;

  const $ = id => document.getElementById(id);
  const content = $('wsContent');
  const titleInput = $('wsTitle');
  const statusEl = $('wsStatus');
  const msg = $('wsMsg');

  function showError(text) { msg.className = 'msg error'; msg.textContent = text; }

  // ── Autosave wiring ──
  const autosaver = createAutosaver({
    onStatus(state, detail) {
      const retry = $('wsRetry');
      retry.hidden = state !== 'error';
      $('wsConflict').hidden = state !== 'conflict';
      const t = {
        idle: 'Autosave is on',
        pending: 'Unsaved changes…',
        saving: 'Saving…',
        saved: detail ? `Saved ${detail.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Saved',
        error: 'Couldn’t save. Will retry.',
        conflict: 'Paused: changed elsewhere',
      }[state];
      statusEl.textContent = t || '';
      statusEl.dataset.state = state;
    },
    async save() {
      if (!ready || deleted) return 'skipped';
      const { schema = 1, data } = ws.collect();
      if (!entryId && JSON.stringify(data) === baseline) return 'skipped';
      const title = titleInput.value.trim() || defaultTitle;
      if (!entryId) {
        const r = await store.create({ type: ws.type, title, schema, data });
        entryId = r.id; updatedAt = r.updated_at;
        history.replaceState(null, '', `?id=${entryId}`);
        await refreshList();
        renderShare();
      } else {
        const r = await store.update(entryId, { type: ws.type, title, schema, data, expectedUpdatedAt: updatedAt });
        updatedAt = r.updated_at;
        const row = entries.find(e => e.id === entryId);
        if (row && row.title !== title) { row.title = title; renderList(); }
      }
    },
  });
  const markDirty = () => { if (ready) autosaver.markDirty(); };

  $('wsRetry').addEventListener('click', () => autosaver.markDirty());
  titleInput.addEventListener('input', markDirty);
  $('wsConflictReload').addEventListener('click', () => location.reload());
  $('wsConflictKeep').addEventListener('click', async () => {
    try { updatedAt = await store.latestUpdatedAt(entryId); autosaver.resume(); }
    catch (err) { showError('Could not resolve the conflict: ' + err.message); }
  });
  $('wsPrint').addEventListener('click', () => window.print());
  $('wsDownload').addEventListener('click', () => {
    const title = titleInput.value.trim() || ws.label;
    downloadText(title, ws.exportText ? ws.exportText(title) : exportTextFromDom(content, title));
  });

  // ── Form ──
  function buildForm() {
    content.innerHTML = ws.render();
    initScales(content, markDirty);
    initChoices(content, markDirty);
    content.addEventListener('input', e => { if (!e.target.closest('[data-transient]')) markDirty(); });
    content.addEventListener('change', e => { if (!e.target.closest('[data-transient]')) markDirty(); });
    ws.init && ws.init({ root: content, markDirty, flush: () => autosaver.flush() });
    if (!ws.collect) ws.collect = () => ({ schema: 1, data: collectFields(content) });
    if (!ws.restore) ws.restore = payload => restoreFields(content, payload.data || {});
    syncScales(content);
  }

  // ── Saved list (this worksheet type only) ──
  function renderList() {
    const list = $('savedList');
    if (!entries.length) { list.innerHTML = '<div class="saved-empty">Nothing saved yet. Start writing and it will appear here.</div>'; }
    else {
      list.innerHTML = entries.map(e => `
        <div class="saved-item${e.id === entryId ? ' current' : ''}">
          <a class="saved-item__link" href="?id=${esc(e.id)}"${e.id === entryId ? ' aria-current="true"' : ''}>
            <span class="saved-item__name">${esc(e.title || 'Untitled')}</span>
            <span class="saved-item__date">${formatDate(e.created_at)}${docSharing.isShared(e.id) ? ' · Shared with therapist' : ''}</span>
          </a>
          <button type="button" class="saved-item__delete" data-delete="${esc(e.id)}" aria-label="Delete ${esc(e.title || 'Untitled')}">Delete</button>
        </div>`).join('');
    }
    ws.onEntriesChanged && ws.onEntriesChanged(entries);
  }

  async function refreshList() {
    entries = await store.list(ws.type);
    renderList();
  }

  $('savedList').addEventListener('click', async e => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      const id = del.dataset.delete;
      const row = entries.find(x => x.id === id);
      if (!confirm(`Delete "${row?.title || 'this entry'}"? This cannot be undone.`)) return;
      try {
        if (id === entryId) deleted = true;
        await store.remove(id);
        if (id === entryId) { location.href = '?new'; return; }
        await refreshList();
      } catch (err) { deleted = false; showError('Delete failed: ' + err.message); }
      return;
    }
    const link = e.target.closest('a.saved-item__link');
    if (link && autosaver.hasUnsaved) {
      e.preventDefault();
      await autosaver.flush();
      location.href = link.getAttribute('href');
    }
  });
  $('wsNewBtn').addEventListener('click', async e => {
    if (autosaver.hasUnsaved) { e.preventDefault(); await autosaver.flush(); location.href = '?new'; }
  });

  // ── Sharing this worksheet with the therapist (off until the client presses Share) ──
  let shareTarget = null, shareName = 'your therapist';
  function renderShare() {
    const b = $('wsShare');
    if (!shareTarget || !entryId) { b.hidden = true; return; }
    const on = docSharing.isShared(entryId);
    b.hidden = false;
    b.textContent = on ? `Shared with ${shareName} · Stop sharing` : `Share with ${shareName}`;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    renderList();
  }
  $('wsShare').addEventListener('click', async () => {
    const b = $('wsShare'); b.disabled = true; msg.className = 'msg'; msg.textContent = '';
    try {
      const sb = await getSupabase();
      if (docSharing.isShared(entryId)) {
        await docSharing.unshareDocument(sb, entryId); docSharing.markShared(entryId, false);
      } else {
        if (!confirm(`Share this worksheet with ${shareName}? They will be able to read it, including later changes you make, until you stop sharing. They keep anything they have already seen. Nothing else is shared.`)) { b.disabled = false; return; }
        await autosaver.flush();
        const session = await ensureVaultReady();
        const { schema = 1, data } = ws.collect();
        const row = entries.find(e => e.id === entryId);
        await docSharing.shareDocument({ sb, session, target: shareTarget, entry: { id: entryId, type: ws.type, title: titleInput.value.trim() || defaultTitle, schema, data, created_at: row?.created_at } });
        docSharing.markShared(entryId, true);
      }
    } catch (err) { showError('Sharing failed: ' + err.message); }
    b.disabled = false; renderShare();
  });

  // ── Boot ──
  if (!entryId) buildForm();

  try {
    await whenAuthReady();
    await ensureVaultReady();
  } catch (err) {
    showError('Could not unlock your vault: ' + err.message);
    return;
  }

  try {
    const sb = await getSupabase();
    const primed = await docSharing.prime(sb, therapistTarget);
    shareTarget = primed?.target || null;
    if (shareTarget) {
      const { data: t } = await sb.from('my_therapists').select('display_name').eq('status', 'active').limit(1);
      shareName = t?.[0]?.display_name || shareName;
    }
  } catch { /* sharing is optional; the worksheet works without it */ }

  try { await refreshList(); } catch (err) { $('savedList').innerHTML = `<div class="saved-empty">Could not load saved entries (${esc(err.message)}).</div>`; }

  if (entryId) {
    try {
      const entry = await store.get(entryId);
      if (entry.type !== ws.type) throw new Error('That entry belongs to a different worksheet.');
      buildForm();
      ws.restore(entry.payload);
      titleInput.value = entry.title || defaultTitle;
      updatedAt = entry.updated_at;
    } catch (err) {
      content.innerHTML = '';
      showError('Could not open this entry: ' + err.message);
      entryId = null; deleted = true; // never autosave over something we failed to read
      return;
    }
  }

  baseline = JSON.stringify(ws.collect().data);
  ready = true;
  renderShare();
  statusEl.textContent = 'Autosave is on';

  ws.mountExtras && ws.mountExtras({
    el: $('savedExtras'),
    getEntries: () => entries,
    getCurrentId: () => entryId,
  });
}
