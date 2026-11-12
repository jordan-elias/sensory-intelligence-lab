/**
 * /assets/js/app/shell.js
 * Makes the installed app feel like an app rather than a website: a bottom tab bar, a slim top bar with a back
 * button, the page title and the notification bell, room for the phone's gesture bar and notch, and a light tap.
 * It changes only how the pages are framed. It is loaded by native.js and never runs on the website.
 */
export const TABS = [
  { id: 'home', href: '/dashboard/', label: 'Home', icon: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { id: 'calm', href: '/regulation/', label: 'Calm', icon: 'M3 12c3-6 6-6 9 0s6 6 9 0' },
  { id: 'course', href: '/experiments/', label: 'Course', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11' },
  { id: 'sessions', href: '/booking/', label: 'Sessions', icon: 'M4 6h16v13H4zM4 10h16M8 3v5M16 3v5' },
  { id: 'you', href: '/account/', label: 'You', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-5 4-7 8-7s7 2 8 7' },
];

/** Which tab a page belongs to. Pages without a tab of their own (journal, tools, the sequencer) sit under Home. */
const GROUPS = {
  calm: ['/regulation', '/breathing'],
  course: ['/experiments'],
  sessions: ['/booking', '/messages', '/therapy', '/intake', '/family'],
  you: ['/account', '/subscribe', '/privacy', '/vault'],
};
export function normalise(path) {
  return String(path || '/').replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
}
export function tabFor(path) {
  const p = normalise(path);
  for (const [id, roots] of Object.entries(GROUPS)) if (roots.some(r => p === r || p.startsWith(r + '/'))) return id;
  return 'home';
}
/** A page that is one of the five tab roots has no back button. */
export const isTabRoot = path => TABS.some(t => normalise(t.href) === normalise(path));
export const titleOf = t => String(t || '').replace(/\s+[—–-]\s+Sensory Intelligence Lab\s*$/i, '').trim() || 'Sensory Intelligence Lab';

const CSS = `
html.app-shell body{padding-bottom:calc(60px + env(safe-area-inset-bottom));-webkit-tap-highlight-color:transparent;overscroll-behavior-y:contain;user-select:none;-webkit-user-select:none}
html.app-shell input,html.app-shell textarea,html.app-shell [contenteditable]{user-select:text;-webkit-user-select:text}
html.app-shell .sil-header{height:calc(48px + env(safe-area-inset-top));padding-top:env(safe-area-inset-top);padding-left:.5rem;padding-right:.75rem;justify-content:flex-start;gap:.25rem}
html.app-shell .sil-header__wordmark,html.app-shell .sil-header__nav,html.app-shell .sil-header__toggle,html.app-shell .bc,html.app-shell footer,html.app-shell .skip-link{display:none!important}
html.app-shell .app-back{width:40px;height:40px;border:0;background:none;color:var(--text);display:inline-flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;padding:0;flex-shrink:0}
html.app-shell .app-back:active{background:var(--accent-light,rgba(0,0,0,.06))} html.app-shell .app-back[hidden]{display:none}
html.app-shell .app-title{font:600 1.05rem var(--font-heading);margin:0 0 0 .4rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
html.app-shell .app-back:not([hidden])+.app-title{margin-left:.1rem}
html.app-shell .sil-bell{margin-left:0}
.app-tabs{position:fixed;left:0;right:0;bottom:0;z-index:150;display:flex;background:var(--bg,#fff);border-top:1px solid var(--border,#e5e5e0);padding-bottom:env(safe-area-inset-bottom)}
.app-tabs a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:56px;text-decoration:none;color:var(--muted,#6b6b6b);font:500 .68rem var(--font-body)}
.app-tabs a svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.app-tabs a[aria-current=page]{color:var(--accent,#2a5c45)} .app-tabs a[aria-current=page] svg{stroke-width:2.1}
.app-tabs a:active{background:var(--accent-light,rgba(0,0,0,.05))}
html.app-shell.app-typing .app-tabs{display:none}
html.app-shell.app-typing body{padding-bottom:0}
@keyframes app-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
html.app-shell main{animation:app-in .18s ease-out}
@media (prefers-reduced-motion:reduce){html.app-shell main{animation:none}}
.app-signout{margin:2rem 1.25rem 1rem;padding:.8rem 1rem;width:calc(100% - 2.5rem);border:1px solid var(--border,#e5e5e0);background:none;border-radius:6px;font:500 .9rem var(--font-body);color:var(--muted,#6b6b6b);cursor:pointer}
`;
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const BACK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

export function tap() { try { navigator.vibrate && navigator.vibrate(8); } catch { /* not available */ } }

export function mountShell(doc = document, loc = location) {
  if (doc.documentElement.classList.contains('app-shell')) return;
  doc.documentElement.classList.add('app-shell');
  const style = doc.createElement('style'); style.id = 'appShellStyles'; style.textContent = CSS; doc.head.appendChild(style);

  const nav = doc.createElement('nav'); nav.className = 'app-tabs'; nav.setAttribute('aria-label', 'Main');
  const here = tabFor(loc.pathname);
  nav.innerHTML = TABS.map(t => `<a href="${t.href}" data-tab="${t.id}"${t.id === here ? ' aria-current="page"' : ''}>${svg(t.icon)}<span>${t.label}</span></a>`).join('');
  nav.addEventListener('click', e => { if (e.target.closest('a')) tap(); });
  doc.body.appendChild(nav);

  // Top bar: the existing header, reduced to a back button, the page title and the bell.
  const bar = doc.querySelector('.sil-header');
  if (bar) {
    const back = doc.createElement('button'); back.type = 'button'; back.className = 'app-back'; back.setAttribute('aria-label', 'Back'); back.innerHTML = BACK;
    back.hidden = isTabRoot(loc.pathname) && !loc.hash.startsWith('#/');
    back.onclick = () => { tap(); if (history.length > 1) history.back(); else loc.href = '/dashboard/'; };
    const title = doc.createElement('h1'); title.className = 'app-title';
    const setTitle = () => { title.textContent = titleOf(doc.title); back.hidden = isTabRoot(loc.pathname) && !(loc.hash || '').startsWith('#/'); };
    setTitle();
    bar.prepend(back, title);
    const t = doc.querySelector('title'); if (t && typeof MutationObserver !== 'undefined') new MutationObserver(setTitle).observe(t, { childList: true });
    addEventListener('hashchange', setTitle);
  }

  // The keyboard covers the tab bar rather than pushing it up the screen.
  doc.addEventListener('focusin', e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) doc.documentElement.classList.add('app-typing'); });
  doc.addEventListener('focusout', () => doc.documentElement.classList.remove('app-typing'));

  // Sign out lives at the bottom of the account page, since the website's header is not shown here.
  if (here === 'you' && normalise(loc.pathname) === '/account') {
    const out = doc.createElement('button'); out.type = 'button'; out.className = 'app-signout'; out.textContent = 'Sign out';
    out.onclick = () => doc.getElementById('silSignOut')?.click();
    (doc.querySelector('main') || doc.body).appendChild(out);
  }
}
