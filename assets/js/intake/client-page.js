/**
 * /assets/js/intake/client-page.js
 * The client's intake form: shown once the connected therapist has asked for it.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { therapistTarget } from '../sharing/store.js';
import { INTAKE_FIELDS, INTAKE_CATEGORY, submitIntake, openIntake } from './intake.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export async function mountIntake(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const { data: links, error } = await sb.from('my_therapists').select('*').eq('status', 'active').limit(1);
  if (error) { root.innerHTML = `<div class="ws-callout"><strong>Could not load</strong>${esc(error.message)}</div>`; return; }
  const link = links && links[0];
  if (!link) { root.innerHTML = '<div class="ws-callout"><strong>No therapist connected</strong>The intake form is available when a therapist you are connected with asks for it.</div>'; return; }
  const name = link.display_name || 'your therapist';
  if (!link.intake_requested_at) { root.innerHTML = `<div class="ws-callout"><strong>Nothing to fill in</strong>${esc(name)} has not asked for an intake form. Nothing is sent unless you choose to send it.</div>`; return; }

  root.innerHTML = `<p class="th-lede">${esc(name)} asked you to fill this in. Skip anything you prefer not to answer.</p>
    <div class="ws-callout"><strong>Who can read this</strong>Only you and ${esc(name)}. It is encrypted on your device before it is sent, so we cannot read it either. If you end the connection, you each choose whether to keep or delete your own copy.</div>
    <div id="intakeBox"><p class="th-muted">Opening…</p></div>`;
  const box = root.querySelector('#intakeBox');
  try {
    const session = await ensureVaultReady();
    const target = await therapistTarget(sb);
    if (!target) { box.innerHTML = `<p class="th-muted">${esc(name)} has not finished setting up their secure vault yet, so the form cannot be sent. Nothing has been sent.</p>`; return; }
    const { data: copies } = await sb.from('shared_copies').select('link_id, sealed').eq('category', INTAKE_CATEGORY).eq('link_id', link.link_id).limit(1);
    let current = null;
    if (copies && copies[0]) { try { current = await openIntake(session, copies[0]); } catch { current = null; } }
    const vals = current ? current.fields : {};
    box.innerHTML = `${current ? `<p class="th-hint">Sent ${esc(day(current.submitted_at))}. You can change it and send it again.</p>` : ''}
      <form id="intakeForm" novalidate>${INTAKE_FIELDS.map(f => `
        <div class="field"><label for="f_${f.key}">${esc(f.label)}</label>
        ${f.hint ? `<p class="th-muted" style="margin:.1rem 0 .3rem">${esc(f.hint)}</p>` : ''}
        ${f.type === 'textarea' ? `<textarea id="f_${f.key}" maxlength="${f.max}" rows="${f.key === 'history' || f.key === 'reason' ? 6 : 3}"></textarea>` : `<input id="f_${f.key}" type="${f.type}" ${f.max ? `maxlength="${f.max}"` : ''}>`}
        </div>`).join('')}
      <button type="submit" class="action-btn" id="sendIntake">${current ? 'Send again' : 'Send to ' + esc(name)}</button>
      <p class="msg" id="intakeMsg" role="status"></p></form>`;
    for (const f of INTAKE_FIELDS) box.querySelector('#f_' + f.key).value = vals[f.key] || '';
    box.querySelector('#intakeForm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = box.querySelector('#sendIntake'), msg = box.querySelector('#intakeMsg');
      btn.disabled = true; msg.className = 'msg'; msg.textContent = '';
      try {
        const fields = {}; for (const f of INTAKE_FIELDS) fields[f.key] = box.querySelector('#f_' + f.key).value;
        await submitIntake({ sb, session, target, fields });
        msg.textContent = `Sent to ${name}.`; msg.className = 'msg show success'; btn.textContent = 'Send again';
      } catch (err) { msg.textContent = err.message; msg.className = 'msg show error'; }
      btn.disabled = false;
    });
  } catch (e) { box.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; }
}
