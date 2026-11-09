/**
 * /assets/js/therapist/my-therapist.js
 * The "Your therapist" card on the Account page, plus the small prompt on the dashboard.
 *
 *  - session-tier client with no therapist: shows exactly what will be visible and asks to agree
 *  - connected client: shows their therapist, what the therapist can see, and a way to end it
 *  - everyone else: renders nothing
 */
import { post } from '../api.js';
import { unreadCount } from '../messages/store.js';
import { mountSharing } from '../sharing/sharing-card.js';
import { LINK_CONSENT_VERSION, LINK_CONSENT_TEXT } from './consent.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const SESSION_TIERS = ['call1', 'call2'];
const ACTIVE = ['active', 'trialing'];

export const hasSessionPlan = profile =>
  !!profile && SESSION_TIERS.includes(profile.subscription_tier) && ACTIVE.includes(profile.subscription_status);

export async function photoUrl(sb, path) {
  if (!path) return null;
  const { data } = await sb.storage.from('therapist-photos').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

/** Everything the card needs in one go. */
export async function loadState(sb, profile) {
  const { data: links } = await sb.from('my_therapists').select('*').order('started_at', { ascending: false });
  const active = (links || []).find(l => l.status === 'active') || null;
  let offered = null, choices = [];
  if (!active && hasSessionPlan(profile)) {
    const { data } = await sb.from('therapist_directory').select('*');
    choices = (data || []).slice().sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || String(a.display_name).localeCompare(b.display_name));
    offered = choices[0] || null;     // the practice's default therapist comes first
  }
  return { active, offered, choices, ended: (links || []).filter(l => l.status === 'ended'), needsLink: !active && hasSessionPlan(profile) };
}

export function avatar(url, name) {
  return url
    ? `<img src="${esc(url)}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:50%;border:1px solid var(--border);flex-shrink:0">`
    : `<div aria-hidden="true" style="width:64px;height:64px;border-radius:50%;background:var(--accent-light);color:var(--accent);display:flex;align-items:center;justify-content:center;font:600 1.3rem var(--font-heading);flex-shrink:0">${esc((name || '?').trim()[0]?.toUpperCase() || '?')}</div>`;
}

export async function mountMyTherapist(root, { supabase, profile }) {
  let state;
  try { state = await loadState(supabase, profile); }
  catch (e) { console.warn('[therapist] could not load:', e.message); return; }
  if (!state.active && !state.needsLink) { root.hidden = true; root.innerHTML = ''; return; }
  root.hidden = false;

  let chosenId = state.offered?.user_id;
  const t = state.active || state.offered;
  const url = t ? await photoUrl(supabase, t.photo_path).catch(() => null) : null;
  const who = t ? `
    <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem">
      ${avatar(url, t.display_name)}
      <div><div style="font:600 1rem var(--font-heading)">${esc(t.display_name)}</div>
        ${t.bio ? `<p style="font-size:.8rem;color:var(--muted);line-height:1.55;margin-top:.2rem">${esc(t.bio)}</p>` : ''}</div>
    </div>` : '';
  const visible = `<ul style="font-size:.8rem;line-height:1.7;margin:0 0 1rem 1.1rem">${LINK_CONSENT_TEXT.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;

  if (state.active) {
    root.innerHTML = `
      <p class="sl" id="therapist">Your therapist</p>
      <div class="card"><div class="card-head"><h3>Connected</h3></div><div class="card-body">
        ${who}
        <p style="font-size:.8rem;font-weight:500;margin-bottom:.4rem">What your therapist can see</p>${visible}
        <div id="thSharing"></div>
        <div class="msg" id="thMsg" role="status"></div>
        <div class="btn-row" style="margin-top:0">
          ${state.active.booking_link ? `<a class="btn" href="${esc(state.active.booking_link)}" target="_blank" rel="noopener" style="text-decoration:none">Book a session</a>` : ''}
          <a class="btn btn-outline" id="thMessages" href="/messages/" style="text-decoration:none">Messages</a>
          <button type="button" class="btn btn-outline" id="thEnd">End this connection</button>
        </div>
        <div id="thEndConfirm" hidden style="margin-top:1rem;padding:1rem;border:1px solid var(--border);background:var(--surface)">
          <p style="font-size:.8rem;line-height:1.6;margin-bottom:.8rem">End the connection with ${esc(state.active.display_name)}? They lose access to new data straight away. Copies of check-ins you already shared stay with them, for them to keep or delete, and it cannot undo anything they have already seen.</p>
          <div class="btn-row" style="margin-top:0"><button type="button" class="btn btn-danger" id="thEndYes">Yes, end it</button><button type="button" class="btn btn-outline" id="thEndNo">Keep it</button></div>
        </div>
      </div></div>`;
    const $ = id => root.querySelector('#' + id), msg = (t, k) => { const m = $('thMsg'); m.textContent = t; m.className = 'msg show ' + (k || ''); };
    supabase.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id;
      if (uid) unreadCount(supabase, uid).then(n => { if (n) $('thMessages').textContent = `Messages (${n} new)`; }).catch(() => {});
      if (uid) mountSharing($('thSharing'), { sb: supabase, uid, link: state.active, therapistName: state.active.display_name });
    });
    $('thEnd').onclick = () => { $('thEndConfirm').hidden = false; };
    $('thEndNo').onclick = () => { $('thEndConfirm').hidden = true; };
    $('thEndYes').onclick = async () => {
      $('thEndYes').disabled = true;
      try { await post('end-therapist-link', { link_id: state.active.link_id }); await mountMyTherapist(root, { supabase, profile }); }
      catch (e) { msg(e.message, 'error'); $('thEndYes').disabled = false; }
    };
    return;
  }

  // Session plan but not connected yet
  root.innerHTML = `
    <p class="sl" id="therapist">Your therapist</p>
    <div class="card"><div class="card-head"><h3>Connect with your therapist</h3></div><div class="card-body">
      ${state.choices.length > 1 ? `
        <p style="font-size:.85rem;margin-bottom:.5rem">Choose your therapist:</p>
        <div id="thPick" role="radiogroup" aria-label="Choose your therapist" style="margin-bottom:1rem">
          ${state.choices.map((c, i) => `
            <label style="display:block;border:1px solid var(--border);padding:.7rem .9rem;margin-bottom:.4rem;cursor:pointer">
              <input type="radio" name="thChoice" value="${esc(c.user_id)}" ${i === 0 ? 'checked' : ''}>
              <strong style="margin-left:.4rem">${esc(c.display_name)}</strong>
              ${c.bio ? `<span style="display:block;font-size:.8rem;color:var(--muted);line-height:1.5;margin:.2rem 0 0 1.4rem">${esc(c.bio)}</span>` : ''}
            </label>`).join('')}
        </div>` : (t ? who : '')}
      <p style="font-size:.85rem;line-height:1.6;margin-bottom:.6rem">Your plan includes sessions. Before you are connected, please read what this means:</p>
      ${visible}
      <div class="msg" id="thMsg" role="status"></div>
      ${t ? `<div class="btn-row" style="margin-top:0"><button type="button" class="btn" id="thAgree">I understand, connect me</button></div>`
          : `<p style="font-size:.8rem;color:var(--muted)">No therapist is taking new clients right now. Please check back soon.</p>`}
    </div></div>`;
  root.querySelectorAll('input[name="thChoice"]').forEach(r => r.addEventListener('change', () => { chosenId = r.value; }));
  root.querySelector('#thAgree')?.addEventListener('click', async e => {
    e.target.disabled = true;
    try { await post('link-therapist', { consent_version: LINK_CONSENT_VERSION, ...(state.choices.length > 1 ? { therapist_id: chosenId } : {}) }); await mountMyTherapist(root, { supabase, profile }); }
    catch (err) { const m = root.querySelector('#thMsg'); m.textContent = err.message; m.className = 'msg show error'; e.target.disabled = false; }
  });
}

/** Dashboard: a one-line nudge for session-plan clients who have not been connected yet. */
export async function showDashboardNudge(sb, profile, anchor) {
  try {
    if (!hasSessionPlan(profile) || !anchor) return;
    const { data } = await sb.from('my_therapists').select('link_id').eq('status', 'active').limit(1);
    if (data && data.length) return;
    const el = document.createElement('p');
    el.style.cssText = 'margin:0 0 1.25rem;padding:.8rem 1rem;background:var(--accent-light);border-left:3px solid var(--accent);font-size:.85rem';
    el.innerHTML = 'Your plan includes sessions. <a href="/account/#therapist">Connect with your therapist</a> to get started.';
    anchor.after(el);
  } catch (e) { console.warn('[therapist] nudge skipped:', e.message); }
}
