/**
 * /assets/js/messages/client-page.js
 * The client's conversation with their therapist (the active one, or the latest ended one).
 */
import { mountThread } from './thread.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function mountClientMessages(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const { data: links, error } = await sb.from('my_therapists').select('*').order('started_at', { ascending: false });
  if (error) { root.innerHTML = `<div class="ws-callout"><strong>Could not load</strong>${esc(error.message)}</div>`; return; }
  const link = (links || []).find(l => l.status === 'active') || (links || [])[0];
  if (!link) { root.innerHTML = '<div class="ws-callout"><strong>No therapist connected</strong>Messages are available once you are connected with a therapist from your Account page.</div>'; return; }
  const active = link.status === 'active';
  let keys = {};
  if (active) {
    const { data } = await sb.from('my_therapist_keys').select('*').eq('link_id', link.link_id).limit(1);
    keys = (data && data[0]) || {};
  }
  const name = link.display_name || 'your therapist';
  root.innerHTML = `<h2 class="th-h2" style="margin-top:0">${esc(name)}</h2><div id="thread"></div>`;
  if (active && !keys.public_enc) {
    root.querySelector('#thread').innerHTML = `<p class="th-muted">${esc(name)} has not finished setting up their secure vault yet, so messaging is not available. Nothing has been sent.</p>`;
    return;
  }
  await mountThread(root.querySelector('#thread'), {
    sb, linkId: link.link_id, active,
    other: { id: link.user_id, name, public_enc: keys.public_enc || null, public_sign: keys.public_sign || null, fingerprint: keys.fingerprint || null },
  });
}
