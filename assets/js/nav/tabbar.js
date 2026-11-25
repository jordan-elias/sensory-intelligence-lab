/**
 * /assets/js/nav/tabbar.js
 * The bottom tab bar for phones: Home, Calm, Listen, Create, You. Used by the installed app (app/shell.js) and by the
 * website on phone-sized screens (site-header.js). On a wider screen the website keeps its top navigation and no bar is shown.
 * It also publishes the bar's height as --tabbar-h so fixed controls at the bottom of a page can sit above it.
 */
import { TABS, tabFor } from './modules.js';

const CSS = `
:root{--tabbar-h:0px}
html.has-tabbar{--tabbar-h:calc(58px + env(safe-area-inset-bottom))}
html.has-tabbar body{padding-bottom:var(--tabbar-h)}
.sil-tabs{position:fixed;left:0;right:0;bottom:0;z-index:150;display:flex;background:var(--bg,#fff);border-top:1px solid var(--border,#e5e5e0);padding-bottom:env(safe-area-inset-bottom);-webkit-tap-highlight-color:transparent}
.sil-tabs a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:58px;text-decoration:none;color:var(--muted,#6b6b6b);font:500 .68rem var(--font-body,system-ui)}
.sil-tabs a svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sil-tabs a[aria-current=page]{color:var(--accent,#2a5c45)} .sil-tabs a[aria-current=page] svg{stroke-width:2.1}
.sil-tabs a:active{background:var(--accent-light,rgba(0,0,0,.05))}
.sil-tabs a:focus-visible{outline:2px solid var(--accent,#2a5c45);outline-offset:-3px}
html.app-typing .sil-tabs{display:none}
html.app-typing{--tabbar-h:0px!important} html.app-typing body{padding-bottom:0}
`;

export function renderTabs(here) {
  return TABS.map(t => `<a href="${t.href}" data-tab="${t.id}"${t.id === here ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${t.label}</span></a>`).join('');
}

export function removeTabBar(doc = document) {
  doc.querySelectorAll('nav.sil-tabs').forEach(n => n.remove());
  doc.documentElement.classList.remove('has-tabbar', 'app-typing');
}

/** Adds the bar and returns it. Safe to call twice. */
export function mountTabBar(doc = document, loc = location, onTap = () => {}) {
  if (doc.querySelector('nav.sil-tabs')) return doc.querySelector('nav.sil-tabs');
  if (!doc.getElementById('silTabStyles')) { const s = doc.createElement('style'); s.id = 'silTabStyles'; s.textContent = CSS; doc.head.appendChild(s); }
  const nav = doc.createElement('nav'); nav.className = 'sil-tabs'; nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = renderTabs(tabFor(loc.pathname, loc.search));
  nav.addEventListener('click', e => { if (e.target.closest('a')) onTap(); });
  doc.body.appendChild(nav);
  doc.documentElement.classList.add('has-tabbar');
  // The keyboard covers the bar rather than pushing it up the screen.
  doc.addEventListener('focusin', e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) doc.documentElement.classList.add('app-typing'); });
  doc.addEventListener('focusout', () => doc.documentElement.classList.remove('app-typing'));
  return nav;
}

/** The website: show the bar on phone-sized screens only, and follow the screen if it is resized or turned. */
export function mountResponsive(doc = document, loc = location, win = window) {
  if (doc.documentElement.classList.contains('app-shell') || win.SIL_APP) return;
  const mq = win.matchMedia('(max-width: 640px)');
  const apply = () => {
    if (doc.documentElement.classList.contains('app-shell')) { removeTabBar(doc); return; }
    if (mq.matches) mountTabBar(doc, loc); else removeTabBar(doc);
  };
  apply();
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(apply);
}
