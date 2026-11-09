/**
 * /assets/js/booking/therapist-picker.js
 * The therapist part of the booking page.
 *
 *  - connected client: a small card with their therapist's photo, name and bio above the calendar
 *  - session-plan client with no therapist: every therapist who is taking new clients, each with
 *    photo, name, bio and next available time; choosing one shows what the therapist will be able
 *    to see and connects only after the client agrees
 */
import { post } from '../api.js';
import { avatar, photoUrl } from '../therapist/my-therapist.js';
import { LINK_CONSENT_VERSION, LINK_CONSENT_TEXT } from '../therapist/consent.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "Today, 14:30", "Tomorrow, 09:00", "Thu 12 Nov, 09:00", or a prompt when the time is not known. */
export function formatNext(iso, now = new Date(), locale) {
  if (!iso) return 'See availability';
  const d = new Date(iso);
  if (isNaN(d)) return 'See availability';
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  if (diff <= 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

/** The connected therapist, shown above the calendar. */
export async function mountConnectedCard(root, sb, t) {
  const url = await photoUrl(sb, t.photo_path).catch(() => null);
  root.innerHTML = `
    <div class="card" style="margin-bottom:1.25rem"><div class="card-body" style="display:flex;gap:1rem;align-items:center">
      ${avatar(url, t.display_name)}
      <div><p style="font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 .2rem">Your therapist</p>
        <div style="font:600 1rem var(--font-heading)">${esc(t.display_name)}</div>
        ${t.bio ? `<p style="font-size:.8rem;color:var(--muted);line-height:1.55;margin:.2rem 0 0">${esc(t.bio)}</p>` : ''}</div>
      ${t.intake_requested_at ? `<a class="action-btn sm" style="margin-left:auto" href="/intake/">Fill in intake form</a>` : ''}
    </div></div>`;
}

/** Choose a therapist. `onConnected` runs after the connection is made. */
export async function mountChooser(root, sb, { onConnected } = {}) {
  const { data } = await sb.from('therapist_directory').select('*');
  const list = (data || []).slice().sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || String(a.display_name).localeCompare(b.display_name));
  if (!list.length) {
    root.innerHTML = `<div class="upgrade-nudge"><p class="upgrade-nudge-head">Choose your therapist</p>
      <p>No therapist is taking new clients right now. Please check back soon.</p></div>`;
    return;
  }
  const urls = await Promise.all(list.map(t => photoUrl(sb, t.photo_path).catch(() => null)));
  root.innerHTML = `
    <p style="font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 .5rem">Choose your therapist</p>
    <p style="font-size:.85rem;line-height:1.6;margin:0 0 1rem">Your plan includes sessions. Pick the therapist you would like to work with. You will see exactly what they can see before you are connected.</p>
    <div id="tpList">${list.map((t, i) => `
      <div class="card" style="margin-bottom:.8rem"><div class="card-body" style="display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap">
        ${avatar(urls[i], t.display_name)}
        <div style="flex:1;min-width:200px">
          <div style="font:600 1rem var(--font-heading)">${esc(t.display_name)}</div>
          ${t.bio ? `<p style="font-size:.8rem;color:var(--muted);line-height:1.55;margin:.2rem 0 .5rem">${esc(t.bio)}</p>` : ''}
          <p style="font-size:.8rem;margin:0"><span style="color:var(--muted)">Next available:</span> <strong data-next="${esc(t.user_id)}">Checking…</strong></p>
        </div>
        <button type="button" class="nudge-btn" data-choose="${esc(t.user_id)}" style="align-self:center">Choose ${esc(t.display_name)}</button>
      </div></div>`).join('')}</div>
    <div id="tpConsent" hidden></div>`;

  // Next available times arrive later and never block choosing.
  post('next-available').then(({ results }) => {
    root.querySelectorAll('[data-next]').forEach(el => { el.textContent = formatNext(results?.[el.dataset.next]?.next); });
  }).catch(() => { root.querySelectorAll('[data-next]').forEach(el => { el.textContent = 'See availability'; }); });

  const box = root.querySelector('#tpConsent');
  root.querySelectorAll('[data-choose]').forEach(btn => btn.addEventListener('click', () => {
    const t = list.find(x => x.user_id === btn.dataset.choose);
    box.hidden = false;
    box.innerHTML = `
      <div class="card" style="margin-top:1rem"><div class="card-head"><h3>Connect with ${esc(t.display_name)}</h3></div><div class="card-body">
        <p style="font-size:.85rem;line-height:1.6;margin-bottom:.6rem">Before you are connected, please read what this means:</p>
        <ul style="font-size:.8rem;line-height:1.7;margin:0 0 1rem 1.1rem">${LINK_CONSENT_TEXT.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
        <p id="tpMsg" role="status" style="font-size:.8rem;color:var(--error,#c0392b);min-height:1.2em"></p>
        <button type="button" class="nudge-btn" id="tpAgree">I understand, connect me</button>
        <button type="button" class="nudge-btn" id="tpCancel" style="margin-left:.5rem;background:transparent;color:var(--text);border:1px solid var(--border)">Not now</button>
      </div></div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    box.querySelector('#tpCancel').onclick = () => { box.hidden = true; box.innerHTML = ''; };
    box.querySelector('#tpAgree').onclick = async e => {
      e.target.disabled = true;
      try { await post('link-therapist', { consent_version: LINK_CONSENT_VERSION, therapist_id: t.user_id }); onConnected && onConnected(); }
      catch (err) { box.querySelector('#tpMsg').textContent = err.message; e.target.disabled = false; }
    };
  }));
}
