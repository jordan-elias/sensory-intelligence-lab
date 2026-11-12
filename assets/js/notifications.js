/**
 * /assets/js/notifications.js
 * The bell in the header: new messages and requests for forms, in one place.
 * Nothing here is sent anywhere; it reads the signed-in person's own rows and shows counts.
 * A request disappears once the form has been sent (or, for messages, read).
 */
export function buildItems({ unread = 0, therapist = false, name = 'Your therapist', intakePending = false, familyPending = false } = {}) {
  const out = [];
  if (unread > 0) out.push({ id: 'messages', href: therapist ? '/therapist/' : '/messages/', text: unread === 1 ? '1 new message' : `${unread} new messages` });
  if (intakePending) out.push({ id: 'intake', href: '/intake/', text: `${name} asked you to fill in a short intake form` });
  if (familyPending) out.push({ id: 'family', href: '/family/', text: `${name} asked for an optional family history` });
  return out;
}

export function ensureStyles() {
  if (document.getElementById('silBellStyles')) return;
  const s = document.createElement('style'); s.id = 'silBellStyles';
  s.textContent = `.sil-bell{position:relative;flex-shrink:0;margin-left:auto}
.sil-bell__btn{position:relative;background:none;border:1px solid var(--border);border-radius:50%;width:2.2rem;height:2.2rem;cursor:pointer;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;padding:0}
.sil-bell__btn:hover,.sil-bell__btn[aria-expanded=true]{color:var(--text)}
.sil-bell__btn svg{width:1.05rem;height:1.05rem}
.sil-bell__count{position:absolute;top:-.3rem;right:-.3rem;min-width:1.1rem;height:1.1rem;border-radius:.55rem;background:var(--accent);color:#fff;font:600 .65rem/1.1rem var(--font-body);text-align:center;padding:0 .25rem}
.sil-bell__panel{position:absolute;right:0;top:calc(100% + .5rem);width:min(20rem,calc(100vw - 2rem));background:var(--bg);border:1px solid var(--border);border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.12);z-index:200;padding:.35rem}
.sil-bell__panel[hidden]{display:none}
.sil-bell__panel a{display:block;padding:.65rem .75rem;font:500 .85rem/1.4 var(--font-body);color:var(--text);text-decoration:none;border-radius:4px}
.sil-bell__panel a:hover,.sil-bell__panel a:focus{background:var(--accent-light,rgba(0,0,0,.05))}
.sil-bell__empty{margin:0;padding:.75rem;font:.85rem var(--font-body);color:var(--muted)}`;
  document.head.appendChild(s);
}

const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/></svg>';

/** Draws (or redraws) the bell in the header. */
export function renderBell(items, doc = document) {
  const header = doc.querySelector('.sil-header');
  if (!header) return null;
  ensureStyles();
  let wrap = header.querySelector('.sil-bell');
  const wasOpen = wrap && !wrap.querySelector('.sil-bell__panel').hidden;
  if (wrap) wrap.remove();
  wrap = doc.createElement('div'); wrap.className = 'sil-bell';
  const n = items.length;
  wrap.innerHTML = `<button type="button" class="sil-bell__btn" id="silBell" aria-expanded="false" aria-controls="silBellPanel" aria-label="${n ? `Notifications, ${n} new` : 'Notifications, none new'}">${BELL}${n ? `<span class="sil-bell__count" aria-hidden="true">${n}</span>` : ''}</button>
    <div class="sil-bell__panel" id="silBellPanel" role="region" aria-label="Notifications" hidden></div>`;
  const panel = wrap.querySelector('.sil-bell__panel'), btn = wrap.querySelector('button');
  if (n) for (const it of items) { const a = doc.createElement('a'); a.href = it.href; a.textContent = it.text; a.dataset.notice = it.id; panel.appendChild(a); }
  else { const p = doc.createElement('p'); p.className = 'sil-bell__empty'; p.textContent = 'Nothing new.'; panel.appendChild(p); }
  const set = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', e => { e.stopPropagation(); set(panel.hidden); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); btn.focus(); } });
  doc.addEventListener('click', e => { if (!wrap.contains(e.target)) set(false); });
  const toggle = header.querySelector('.sil-header__toggle');
  toggle ? header.insertBefore(wrap, toggle) : header.appendChild(wrap);
  if (wasOpen) set(true);
  return wrap;
}

/** Reads what is waiting for this person and draws the bell. `roles` comes from nav-links (therapist / connected / unread). */
export async function mountBell(sb, user, roles = {}) {
  if (!sb || !user) return;
  try {
    const state = { unread: roles.unread || 0, therapist: !!roles.therapist };
    if (!roles.therapist) {
      const { data } = await sb.from('my_therapists').select('link_id, display_name, intake_requested_at, family_requested_at').eq('status', 'active').limit(1);
      const l = data && data[0];
      if (l) {
        state.name = l.display_name || 'Your therapist';
        const sent = new Set();
        if (l.intake_requested_at || l.family_requested_at) {
          const { data: copies } = await sb.from('shared_copies').select('category').eq('link_id', l.link_id).in('category', ['intake', 'family']);
          for (const c of copies || []) sent.add(c.category);
        }
        state.intakePending = !!l.intake_requested_at && !sent.has('intake');
        state.familyPending = !!l.family_requested_at && !sent.has('family');
      }
    }
    renderBell(buildItems(state));
  } catch (e) { console.warn('[bell] skipped:', e.message); }
}
