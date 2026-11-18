/**
 * /assets/js/dashboard/today-ui.js
 * Draws the "Today" path on the dashboard (see today.js). The answers and the list of recently opened tools stay in this browser.
 */
import { todayPath, INTENTS, MINUTES, recordRecent, readAnswers } from '/assets/js/dashboard/today.js';
import { PATH } from '/assets/js/experiments/catalog.js';
import { clean, KEY as EXP_KEY } from '/assets/js/experiments/progress.js';
import { continueLabel } from '/assets/js/experiments/recommend.js';

const ASK = 'sil.today.v1', RECENT = 'sil.recent.v1';
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
const box = document.getElementById('todayPath');
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n[k] = v; else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } n.append(...kids.flat().filter(x => x != null && x !== false)); return n; };

/** replaceChildren that skips empty slots (it would print them as the word "null"). */
const put = (...kids) => box.replaceChildren(...kids.flat().filter(Boolean));
const recent = () => { try { const r = JSON.parse(ls.get(RECENT) || '[]'); return Array.isArray(r) ? r : []; } catch { return []; } };
const path = u => { try { return new URL(u, location.origin).pathname; } catch { return ''; } };
document.addEventListener('click', ev => {
  const a = ev.target.closest?.('a.module-card, #todayPath a[href]'); if (!a) return;
  const p = path(a.getAttribute('href')); if (p && p !== '/') ls.set(RECENT, JSON.stringify(recordRecent(recent(), p)));
}, true);

/** The experiment the course would offer next, from the saved record (read only). */
function nextExperiment() {
  let s; try { s = clean(JSON.parse(ls.get(EXP_KEY) || 'null')); } catch { s = clean(null); }
  const resume = Object.entries(s.pos).filter(([id, p]) => p.s >= 1 && !(id in s.done)).sort((a, b) => b[1].at - a[1].at)[0];
  const e = resume ? PATH.find(x => x.id === resume[0]) : PATH.find(x => !(x.id in s.done));
  return e ? { title: e.title, href: '/experiments/#/' + e.id, label: continueLabel(e, resume ? resume[1].s : 0, e.procedure.length, Object.keys(s.done).length > 0) } : null;
}

let checkedIn = false, answers = readAnswers(ls.get(ASK)), editing = false;

function ask() {
  let intent = answers?.intent || null, minutes = answers?.minutes || null;
  const go = h('button', { type: 'button', class: 'today-go', id: 'todayGo', disabled: true }, 'Show my path');
  const sync = () => { go.disabled = !(intent && minutes); box.querySelectorAll('[data-i]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.i === intent))); box.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.m === minutes))); };
  go.onclick = () => { answers = { intent, minutes }; ls.set(ASK, JSON.stringify(answers)); editing = false; draw(); };
  put(
    h('h3', {}, 'Today'),
    h('p', { class: 'today-sub' }, 'Two questions, and you get a short path for today. Your answers stay on this device.'),
    h('p', { class: 'today-q', id: 'todayQ1' }, 'What would you like from today?'),
    h('div', { class: 'today-opts', role: 'group', 'aria-labelledby': 'todayQ1' }, INTENTS.map(i => h('button', { type: 'button', class: 'today-opt', 'data-i': i.id, 'aria-pressed': 'false', onclick: () => { intent = i.id; sync(); } }, i.label))),
    h('p', { class: 'today-q', id: 'todayQ2' }, 'How long do you have?'),
    h('div', { class: 'today-opts', role: 'group', 'aria-labelledby': 'todayQ2' }, MINUTES.map(m => h('button', { type: 'button', class: 'today-opt', 'data-m': m, 'aria-pressed': 'false', onclick: () => { minutes = m; sync(); } }, `${m} minutes`))),
    h('div', { class: 'today-row' }, go, h('button', { type: 'button', class: 'today-link', id: 'todaySkip', onclick: () => { answers = { skipped: true }; ls.set(ASK, JSON.stringify(answers)); editing = false; draw(); } }, answers ? 'Cancel' : 'Skip for now')));
  sync();
}

function view() {
  const p = todayPath({ answers: answers?.skipped ? null : answers, checkedIn, includeCheckin: false, recent: recent(), experiment: nextExperiment() });
  const free = window._accessTier === 'free';
  const gated = href => free && document.querySelector(`.module-card[href="${href}"]`)?.dataset.gated === 'true';
  put(
    h('h3', {}, 'Today'),
    h('p', { class: 'today-sub' }, `A short path, about ${p.minutesTotal} minutes. Tick marks show what you opened today.`),
    h('ol', { class: 'today-steps' }, p.steps.map(s => h('li', { class: s.done ? 'is-done' : '' },
      h('div', {}, h('a', { href: s.href }, s.title), h('span', { class: 'today-min' }, `${s.min} min${s.done ? ' · done' : ''}${gated(s.href) ? ' · limited preview' : ''}`)),
      h('p', {}, s.why)))),
    p.allDone ? h('p', { class: 'today-end', role: 'status' }, 'That is today. Come back tomorrow, or open anything below.') : null,
    h('div', { class: 'today-row' }, h('button', { type: 'button', class: 'today-link', id: 'todayChange', onclick: () => { editing = true; draw(); } }, 'Change my answers')));
}
function draw() { box.hidden = false; if (!answers || editing) ask(); else view(); }

async function init() {
  // The Today path is an app feature. On the website the dashboard shows the module list only.
  if (!window.SIL_APP) return;
  await new Promise(r => { if (window._currentUser && window._supabase) r(); else window.addEventListener('authReady', () => r(), { once: true }); });
  draw();
}
init();
window.addEventListener('pageshow', e => { if (e.persisted && !box.hidden && !editing && answers) view(); });   // back button: show what was opened
