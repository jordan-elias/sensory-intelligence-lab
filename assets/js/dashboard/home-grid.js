/**
 * /assets/js/dashboard/home-grid.js
 * The phone version of the dashboard's tool list: a search box, the tools you opened lately, and a grid of icon tiles.
 * Opened from a tab (?g=calm) it shows just that group. The website keeps its card list; this block is hidden on wide screens.
 * The recent list is in this browser only (sil.recent.v1).
 */
import { GROUPS, GROUP_ORDER, MODULES, MESSAGES, inGroup, moduleFor, search } from '/assets/js/nav/modules.js';
import { recordRecent } from '/assets/js/dashboard/today.js';

const RECENT = 'sil.recent.v1';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
const recent = () => { try { const r = JSON.parse(store.get(RECENT) || '[]'); return Array.isArray(r) ? r : []; } catch { return []; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const icon = m => `<svg viewBox="0 0 24 24" aria-hidden="true">${m.icon}</svg>`;

export function tile(m, { blurb = false } = {}) {
  return `<a class="m-tile" href="${m.href}"${m.gated ? ' data-gated="true"' : ''}>${icon(m)}<span class="m-tile__t">${esc(m.title)}</span>${blurb ? `<span class="m-tile__b">${esc(m.blurb)}</span>` : ''}<span class="m-tile__tag">Preview</span></a>`;
}

/** Tools used lately, newest first, without duplicates. */
export function recentModules(list, extra = [], max = 4) {
  const seen = new Set(), out = [];
  for (const r of [...list].sort((a, b) => (b.at || 0) - (a.at || 0))) {
    const m = moduleFor(r.href); if (!m || seen.has(m.id) || !(MODULES.concat(extra).some(x => x.id === m.id))) continue;
    seen.add(m.id); out.push(m); if (out.length >= max) break;
  }
  return out;
}

export function mount(root, { search: qs = location.search, connected = false } = {}) {
  let extra = connected ? [MESSAGES] : [];
  const g = new URLSearchParams(qs).get('g'), group = GROUP_ORDER.includes(g) ? g : null;
  document.documentElement.classList.toggle('m-group', !!group);
  const draw = () => {
    if (group) {
      root.innerHTML = `<h2 class="m-h">${GROUPS[group].label}</h2><p class="m-sub">${GROUPS[group].blurb}</p><div class="m-grid m-grid--wide">${inGroup(group, extra).map(m => tile(m, { blurb: true })).join('')}</div>`;
      return;
    }
    const rec = recentModules(recent(), extra);
    root.innerHTML =
      `<div class="m-find"><label class="sr-only" for="mFind">Find a tool</label><input id="mFind" type="search" placeholder="Find a tool: breathing, sleep, journal…" autocomplete="off" enterkeyhint="search"></div>` +
      `<div id="mResults" class="m-grid m-grid--wide" hidden></div><p id="mNone" class="m-sub" hidden>Nothing matches that. Try a feeling or a word like “rain”, “beat” or “writing”.</p>` +
      `<div id="mBrowse">` +
      (rec.length ? `<h2 class="m-h">Jump back in</h2><div class="m-chips">${rec.map(m => `<a class="m-chip" href="${m.href}">${icon(m)}<span>${esc(m.title)}</span></a>`).join('')}</div>` : '') +
      GROUP_ORDER.map(k => `<h2 class="m-h">${GROUPS[k].label}</h2><div class="m-grid">${inGroup(k, extra).map(m => tile(m)).join('')}</div>`).join('') +
      `</div>`;
    const input = root.querySelector('#mFind'), res = root.querySelector('#mResults'), none = root.querySelector('#mNone'), browse = root.querySelector('#mBrowse');
    input.addEventListener('input', () => {
      const q = input.value.trim(), hits = q ? search(q, MODULES.concat(extra)) : [];
      res.hidden = !q || !hits.length; none.hidden = !q || hits.length > 0; browse.hidden = !!q;
      res.innerHTML = hits.map(m => tile(m, { blurb: true })).join('');
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { const a = res.querySelector('a'); if (a) a.click(); } });
  };
  draw();
  root.addEventListener('click', ev => {
    const a = ev.target.closest('a[href]'); if (!a) return;
    const p = new URL(a.getAttribute('href'), location.origin).pathname; store.set(RECENT, JSON.stringify(recordRecent(recent(), p)));
  }, true);
  document.addEventListener('sil:roles', e => { const c = !!e.detail?.connected; if (c !== (extra.length > 0)) { extra = c ? [MESSAGES] : []; draw(); } });
  return { redraw: draw };
}
