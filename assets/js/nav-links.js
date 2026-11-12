/**
 * /assets/js/nav-links.js
 * Role-based links in the shared header. Everyone sees the same base links; on top of that:
 *  - a therapist sees "Clients" (the therapist dashboard)
 *  - a client connected to a therapist sees "Messages"
 * The number of unread messages is shown beside the link. Nothing is shown to anyone else.
 * The role is remembered for the tab so later pages do not flicker; it is refreshed every time.
 */
import { mountBell } from './notifications.js';
const CACHE_KEY = 'sil-nav-roles';

const read = () => { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
const write = v => { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* storage may be unavailable */ } };

export function linkSpecs(roles) {
  const out = [];
  if (roles?.therapist) out.push({ id: 'navClients', href: '/therapist/', label: 'Clients', unread: roles.unread || 0 });
  else if (roles?.connected) out.push({ id: 'navMessages', href: '/messages/', label: 'Messages', unread: roles.unread || 0 });
  return out;
}

/** Waits briefly for the header, which some pages build after the script runs. */
function whenNav(cb, tries = 30) {
  const nav = document.querySelector('.sil-header__nav, .lab-nav');
  if (nav) return cb(nav);
  if (tries > 0) setTimeout(() => whenNav(cb, tries - 1), 100);
}

export function render(roles) {
  whenNav(nav => {
    nav.querySelectorAll('[data-role-link]').forEach(a => a.remove());
    const anchor = nav.querySelector('.sil-header__signout, .lab-signout');
    const here = location.pathname.replace(/\/$/, '') || '/';
    for (const s of linkSpecs(roles)) {
      const a = document.createElement('a');
      a.id = s.id; a.href = s.href; a.dataset.roleLink = '1';
      a.textContent = s.unread ? `${s.label} (${s.unread})` : s.label;
      if (s.unread) a.setAttribute('aria-label', `${s.label}, ${s.unread} unread`);
      if (here === s.href.replace(/\/$/, '') || here.startsWith(s.href.replace(/\/$/, '') + '/')) a.classList.add('sil-active', 'lab-active');
      anchor ? nav.insertBefore(a, anchor) : nav.appendChild(a);
    }
  });
}

export async function mountRoleLinks(sb, user) {
  if (!sb || !user) return;
  const cached = read();
  if (cached && cached.uid === user.id) render(cached);          // instant, from this tab's last check
  try {
    const [t, c] = await Promise.all([
      sb.from('therapist_profiles').select('user_id').eq('user_id', user.id).maybeSingle(),
      sb.from('my_therapists').select('link_id').eq('status', 'active').limit(1),
    ]);
    const roles = { uid: user.id, therapist: !!t.data, connected: !!(c.data && c.data.length) };
    if (roles.therapist || roles.connected) {
      const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', user.id).is('read_at', null);
      roles.unread = count || 0;
    }
    write(roles);
    render(roles);
    await mountBell(sb, user, roles);
  } catch (e) { console.warn('[nav] role links skipped:', e.message); }
}
