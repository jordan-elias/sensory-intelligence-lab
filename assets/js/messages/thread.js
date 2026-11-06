/**
 * /assets/js/messages/thread.js
 * One conversation: the messages, a box to write in, and "delete my copy" for an ended connection.
 * Used on the client's /messages/ page and inside the therapist dashboard.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { pairSafetyCode } from '../vault/vault-crypto.js';
import { sendMessage, loadConversation, markRead, hideConversation, MAX_CHARS } from './store.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const stamp = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const POLL_MS = 30000;

/**
 * @param opts.sb, opts.linkId
 * @param opts.other  { id, name, public_enc, public_sign, fingerprint } (keys are null once the connection has ended)
 * @param opts.active whether the connection is still active (can write)
 * @param opts.onChange called after messages were read or the conversation was deleted
 */
export async function mountThread(root, { sb, linkId, other, active, onChange }) {
  root.innerHTML = '<p class="th-muted">Opening messages…</p>';
  let session;
  try { session = await ensureVaultReady(); }
  catch (e) { root.innerHTML = `<p class="msg show error">${esc(e.message || 'Unlock your vault to read messages.')}</p>`; return () => {}; }

  let timer = null, stopped = false;
  const code = other.fingerprint ? pairSafetyCode(session.fingerprint, other.fingerprint) : null;

  root.innerHTML = `
    <div class="msg-box" role="log" aria-live="polite" id="mxList"></div>
    <p class="th-hint">Messages are encrypted on your device so only you and ${esc(other.name)} can read them. The server can see that you wrote to each other and when, not what. They are not watched around the clock. If you are in crisis or in danger, call your local emergency number (112 in the EU).${code ? ` Safety code with ${esc(other.name)}: <strong>${esc(code)}</strong>.` : ''}</p>
    ${active ? `
      <form id="mxForm" class="msg-form">
        <textarea id="mxText" rows="3" maxlength="${MAX_CHARS}" placeholder="Write a message…" aria-label="Message to ${esc(other.name)}"></textarea>
        <div class="btn-row" style="margin-top:.5rem"><button type="submit" class="action-btn sm" id="mxSend">Send</button></div>
      </form>` : `<p class="th-hint">This connection has ended, so no new messages can be sent. You can still read this conversation.</p>`}
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
          <div class="msg-bubble">${m.text === null ? '<em>This message could not be opened.</em>' : esc(m.text).replace(/\n/g, '<br>')}</div>
          <div class="msg-meta">${esc(stamp(m.created_at))}${m.verified === false ? ' · <strong>signature does not match</strong>' : ''}</div>
        </div>`).join('') : '<p class="th-muted">No messages yet.</p>';
      if (atBottom) list.scrollTop = list.scrollHeight;
      const unread = msgs.filter(m => !m.mine && !m.read_at).map(m => m.id);
      if (unread.length) { await markRead(sb, unread); onChange?.(); }
    } catch (e) { say(e.message, 'error'); }
  }

  if (active) {
    $('mxForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const box = $('mxText'), text = box.value;
      $('mxSend').disabled = true; say('');
      try { await sendMessage({ sb, session, linkId, other: { id: other.id, public_enc: other.public_enc }, text }); box.value = ''; await refresh(); }
      catch (e) { say(e.message, 'error'); }
      $('mxSend').disabled = false;
    });
  }
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
