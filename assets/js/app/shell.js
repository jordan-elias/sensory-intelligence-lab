/**
 * /assets/js/app/shell.js
 * Makes the installed app feel like an app rather than a website: a bottom tab bar, a slim top bar with a back
 * button, the page title and the notification bell, room for the phone's gesture bar and notch, and a light tap.
 * It changes only how the pages are framed. It is loaded by native.js and never runs on the website.
 */
import { TABS, tabFor, isTabRoot, titleOf, normalise } from '../nav/modules.js';
import { mountTabBar, removeTabBar } from '../nav/tabbar.js';
export { TABS, tabFor, isTabRoot, titleOf, normalise };

const CSS = `
html.app-shell body{-webkit-tap-highlight-color:transparent;overscroll-behavior-y:contain;user-select:none;-webkit-user-select:none}
html.app-shell input,html.app-shell textarea,html.app-shell [contenteditable]{user-select:text;-webkit-user-select:text}
html.app-shell .sil-header{height:calc(48px + env(safe-area-inset-top));padding-top:env(safe-area-inset-top);padding-left:.5rem;padding-right:.75rem;justify-content:flex-start;gap:.25rem}
html.app-shell .sil-header__wordmark,html.app-shell .sil-header__nav,html.app-shell .sil-header__toggle,html.app-shell .bc,html.app-shell footer,html.app-shell .skip-link{display:none!important}
html.app-shell .app-back{width:40px;height:40px;border:0;background:none;color:var(--text);display:inline-flex;align-items:center;justify-content:center;border-radius:0;cursor:pointer;padding:0;flex-shrink:0}
html.app-shell .app-back:active{background:var(--accent-light,rgba(0,0,0,.06))} html.app-shell .app-back[hidden]{display:none}
html.app-shell .app-title{font:600 1.05rem var(--font-heading);margin:0 0 0 .4rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
html.app-shell .app-back:not([hidden])+.app-title{margin-left:.1rem}
html.app-shell .sil-bell{margin-left:0}
@keyframes app-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
html.app-shell main{animation:app-in .18s ease-out}
@media (prefers-reduced-motion:reduce){html.app-shell main{animation:none}}
.app-signout{margin:2rem 1.25rem 1rem;padding:.8rem 1rem;width:calc(100% - 2.5rem);border:1px solid var(--border,#e5e5e0);background:none;border-radius:0;font:500 .9rem var(--font-body);color:var(--muted,#6b6b6b);cursor:pointer}
`;
const BACK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

export function tap() { try { navigator.vibrate && navigator.vibrate(8); } catch { /* not available */ } }

export function mountShell(doc = document, loc = location) {
  if (doc.documentElement.classList.contains('app-shell')) return;
  doc.documentElement.classList.add('app-shell');
  const style = doc.createElement('style'); style.id = 'appShellStyles'; style.textContent = CSS; doc.head.appendChild(style);

  removeTabBar(doc); const here = tabFor(loc.pathname, loc.search);
  mountTabBar(doc, loc, tap);

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

  // Sign out lives at the bottom of the account page, since the website's header is not shown here.
  if (normalise(loc.pathname) === '/account') {
    const out = doc.createElement('button'); out.type = 'button'; out.className = 'app-signout'; out.textContent = 'Sign out';
    out.onclick = () => doc.getElementById('silSignOut')?.click();
    (doc.querySelector('main') || doc.body).appendChild(out);
  }
}
