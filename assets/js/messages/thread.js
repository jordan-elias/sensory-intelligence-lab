/**
 * /assets/js/messages/thread.js
 * One conversation: the messages, a box to write in, and "delete my copy" for an ended connection.
 * Used on the client's /messages/ page and inside the therapist dashboard.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { pairSafetyCode } from '../vault/vault-crypto.js';
import { WORKSHEETS, bySlug } from '../worksheets/registry.js';
import { currentConsents } from './handover.js';
import { sendMessage, loadConversation, markRead, hideConversation, MAX_CHARS } from './store.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const stamp = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const POLL_MS = 30000, WORKSHEETS_PATH = '/worksheets/';
/** A worksheet sent along with a message. The person it was sent to gets a link to open it; the sender just sees what was sent. */
const assignCard = m => { const w = bySlug(m.assign); return w ? `<div class="msg-assign"><strong>Worksheet: ${esc(w.label)}</strong>${m.mine ? '' : `<br><a href="${WORKSHEETS_PATH}${esc(w.slug)}/">Open it</a>`}</div>` : ''; };

/**
 * @param opts.sb, opts.linkId
 * @param opts.other  { id, name, public_enc, public_sign, fingerprint } (keys are null once the connection has ended)
 * @param opts.active whether the connection is still active (can write)
 * @param opts.canAssign therapist only: shows a way to send a worksheet along with a message
 * @param opts.canConsent client only: shows how to agree to a handover of their record to another therapist
 * @param opts.onChange called after messages were read or the conversation was deleted
 */
export async function mountThread(root, { sb, linkId, other, active, onChange, canAssign = false, canConsent = false }) {
  root.innerHTML = '<p class="th-muted">Opening messages…</p>';
  let session;
  try { session = await ensureVaultReady(); }
  catch (e) { root.innerHTML = `<p class="msg show error">${esc(e.message || 'Unlock your vault to read messages.')}</p>`; return () => {}; }

  let timer = null, stopped = false;
  const code = other.fingerprint ? await pairSafetyCode(session.fingerprint, other.fingerprint) : null;

  root.innerHTML = `
    <div class="msg-box" role="log" aria-live="polite" id="mxList"></div>
    <p class="th-hint">Messages are encrypted on your device so only you and ${esc(other.name)} can read them. The server can see that you wrote to each other and when, not what. They are not watched around the clock. If you are in crisis or in danger, call your local emergency number (112 in the EU).${code ? ` Safety code with ${esc(other.name)}: <strong>${esc(code)}</strong>.` : ''}</p>
    ${active ? `
      <form id="mxForm" class="msg-form">
        <textarea id="mxText" rows="3" maxlength="${MAX_CHARS}" placeholder="Write a message…" aria-label="Message to ${esc(other.name)}"></textarea>
        ${canAssign ? `<label class="ws-label" for="mxAssign" style="margin-top:.5rem">Assign a worksheet (optional)</label>
        <select id="mxAssign" class="ws-input"><option value="">No worksheet</option>${WORKSHEETS.map(w => `<option value="${esc(w.slug)}">${esc(w.label)}</option>`).join('')}</select>
        <p class="th-hint">${esc(other.name)} finds it in their messages and chooses whether to share the result back. Nothing is shared unless they choose to.</p>` : ''}
        <div class="btn-row" style="margin-top:.5rem"><button type="submit" class="action-btn sm" id="mxSend">Send</button></div>
      </form>` : `<p class="th-hint">This connection has ended, so no new messages can be sent. You can still read this conversation.</p>`}
    ${canConsent && active ? `<details class="vault-section" id="mxHandover" style="margin-top:1rem"><summary>Hand my record to another therapist</summary>
      <p class="th-hint">${esc(other.name)} keeps their own notes about you either way. If you agree, they can prepare a copy of those notes for another therapist you name. Nothing is sent from here: they pass it on themselves. You can take your agreement back at any time.</p>
      <div id="mxHandoverNow"></div>
      <label class="ws-label" for="mxHoTo">Name of the other therapist</label><input class="ws-input" id="mxHoTo" maxlength="80" autocomplete="off">
      <div class="btn-row" style="margin-top:.5rem"><button type="button" class="action-btn outline sm" id="mxHoAgree">I agree to this handover</button></div></details>` : ''}
    <div class="msg" id="mxMsg" role="status"></div>
    <button type="button" class="action-btn outline sm" id="mxDelete" ${active ? 'hidden' : ''}>Delete my copy of this conversation</button>`;
  const $ = id => root.querySelector('#' + id);
  const say = (t, k) => { const m = $('mxMsg'); m.textContent = t; m.className = 'msg show ' + (k || ''); };

  async function refresh() {
    if (stopped) return;
    try {
      const msgs = await loadConversation({ sb, session, linkId, otherSignKey: other.public_sign || null });
      const list = $('mxList');
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      list.innerHTML = msgs.length ? msgs.map(m => `
        <div class="msg-row ${m.mine ? 'mine' : 'theirs'}">
          <div class="msg-bubble">${m.text === null ? '<em>This message could not be opened.</em>' : (m.assign ? assignCard(m) : '') + esc(m.text).replace(/\n/g, '<br>')}</div>
          <div class="msg-meta">${esc(stamp(m.created_at))}${m.verified === false ? ' · <strong>signature does not match</strong>' : ''}</div>
        </div>`).join('') : '<p class="th-muted">No messages yet.</p>';
      if (atBottom) list.scrollTop = list.scrollHeight;
      const now = $('mxHandoverNow');
      if (now) { const mine = currentConsents(msgs, { fromClient: m => m.mine }); now.innerHTML = mine.length ? `<p><strong>You have agreed to a handover to:</strong></p><ul class="th-list">${mine.map(c => `<li>${esc(c.to)} <button type="button" class="action-btn outline sm" data-withdraw="${esc(c.to)}">Take back my agreement</button></li>`).join('')}</ul>` : ''; now.querySelectorAll('[data-withdraw]').forEach(b => { b.onclick = async () => { b.disabled = true; try { await sendMessage({ sb, session, linkId, other: { id: other.id, public_enc: other.public_enc }, text: `I take back my agreement to hand my record to ${b.dataset.withdraw}.`, handover: { to: b.dataset.withdraw, withdrawn: true } }); await refresh(); } catch (e) { say(e.message, 'error'); b.disabled = false; } }; }); }
      const unread = msgs.filter(m => !m.mine && !m.read_at).map(m => m.id);
      if (unread.length) { await markRead(sb, unread); onChange?.(); }
    } catch (e) { say(e.message, 'error'); }
  }

  if (active) {
    $('mxForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const box = $('mxText'), text = box.value, assign = $('mxAssign')?.value || null;
      $('mxSend').disabled = true; say('');
      try { await sendMessage({ sb, session, linkId, other: { id: other.id, public_enc: other.public_enc }, text, assign }); box.value = ''; if ($('mxAssign')) $('mxAssign').value = ''; await refresh(); }
      catch (e) { say(e.message, 'error'); }
      $('mxSend').disabled = false;
    });
  }
  $('mxHoAgree')?.addEventListener('click', async e => {
    const to = $('mxHoTo').value.replace(/\s+/g, ' ').trim(); if (!to) { say('Write the name of the therapist first.', 'error'); return; }
    e.target.disabled = true; say('');
    try { await sendMessage({ sb, session, linkId, other: { id: other.id, public_enc: other.public_enc }, text: `I agree to ${other.name} handing a copy of my record to ${to}.`, handover: { to } }); $('mxHoTo').value = ''; await refresh(); say('Your agreement was sent to ' + other.name + '.'); }
    catch (err) { say(err.message, 'error'); }
    e.target.disabled = false;
  });
  $('mxDelete').addEventListener('click', async () => {
    if (!confirm(`Delete your copy of this conversation? ${other.name} keeps theirs. This cannot be undone.`)) return;
    try { await hideConversation(sb, linkId); onChange?.(); root.innerHTML = '<p class="th-muted">Your copy was deleted.</p>'; stop(); }
    catch (e) { say(e.message, 'error'); }
  });

  await refresh();
  $('mxList').scrollTop = $('mxList').scrollHeight;
  if (active) timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  function stop() { stopped = true; if (timer) clearInterval(timer); }
  return stop;
}
