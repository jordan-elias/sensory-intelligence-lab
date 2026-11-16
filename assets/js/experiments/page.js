/**
 * /assets/js/experiments/page.js
 * The Experiments in Creativity page: the course list, one experiment at a time, the notebook, the Keep shelf, the printable book.
 * Progress is saved on this device first (progress.js); sync across devices is optional and encrypted (sync.js).
 */
import { NEEDS, byId, COURSE, METHOD, UNITS, PATH } from '/assets/js/experiments/catalog.js';
import { buildTool, el, playTones } from '/assets/js/experiments/tools.js';
import { buildNotebook } from '/assets/js/experiments/notebook.js';
import { createProgress } from '/assets/js/experiments/progress.js';
import { createSync } from '/assets/js/experiments/sync.js';
import { parseTimer, assignTools, setupChecklist, fmtClock } from '/assets/js/experiments/steps.js';
import { recommend, TIMES, continueLabel } from '/assets/js/experiments/recommend.js';
import { reflect } from '/assets/js/experiments/reflect.js';
import { putAudio, getAudio, deleteAudio } from '/assets/js/experiments/shelf-audio.js';
import { encodeWav } from '/assets/js/experiments/audio-ops.js';
import { createAwake } from '/assets/js/app/awake.js';

const root = document.getElementById('xpRoot');
const prefs = { getItem: k => { try { return localStorage.getItem(k); } catch { return null; } }, setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } }, removeItem: k => { try { localStorage.removeItem(k); } catch { /* blocked */ } } };
const progress = createProgress({ storage: (() => { try { return localStorage; } catch { return null; } })() });
const awake = createAwake();
const READY_AT = 12;                                     // experiments done before the capstone is called "ready"
let filter = { needs: 'all', minutes: 999 };
let view = 'list', justFinished = null, suggestion = null, sync = null, timers = [];
/** Like replaceChildren, but skips empty slots (replaceChildren would print them as the word "null"). */
const render = (...kids) => root.replaceChildren(...kids.filter(Boolean));
const stopTimers = () => { timers.forEach(clearInterval); timers = []; };
const when = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const linkBtn = (href, label, id, alt = true) => el('a', { class: 'xp-btn' + (alt ? ' xp-btn--alt' : ''), id, href, style: 'text-decoration:none;display:inline-flex;align-items:center' }, label);
const total = e => e.procedure.length;

/* ───────── sync (optional) ───────── */
async function initSync() {
  try {
    await new Promise(r => { if (window._currentUser && window._supabase) r(); else window.addEventListener('authReady', () => r(), { once: true }); });
    const gate = await import('/assets/js/vault/gate.js');
    sync = createSync({ progress, supabase: window._supabase, userId: window._currentUser.id, session: () => gate.currentSession?.() || null, unlock: () => gate.ensureVaultReady(), prefs });
    let prev = sync.status;
    sync.onStatus(({ status }) => { if (status === 'synced' && ['list', 'keep', 'notebook'].includes(view)) route(); else if (['list', 'keep'].includes(view)) paintSync(); prev = status; });
    progress.onChange(() => sync.schedule());
    if (sync.status !== 'off') sync.syncNow(); else paintSync();
  } catch { /* the course works without sync */ }
}
function syncPanel() {
  const box = el('div', { class: 'xp-sync', id: 'xpSync' });
  if (!sync) return box;
  const s = sync.status;
  if (s === 'off') box.append(el('p', {}, 'Keep your progress and notes on all your devices. They are encrypted with your vault key before they leave this device, so we cannot read them. Recordings stay on this device.'), el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpSyncOn', onclick: () => sync.enable() }, 'Turn on sync'));
  else box.append(el('p', {}, s === 'synced' ? `Synced across your devices${sync.last ? ' at ' + new Date(sync.last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}. Encrypted; we cannot read it.` : s === 'syncing' ? 'Syncing…' : s === 'locked' ? 'Unlock your vault to sync. Your progress is saved on this device.' : sync.detail || 'Sync is on.'),
    el('div', { class: 'xp-row' }, el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpSyncNow', onclick: () => (s === 'locked' ? sync.enable() : sync.syncNow()) }, s === 'locked' ? 'Unlock and sync' : 'Sync now'), el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpSyncOff', onclick: () => sync.disable() }, 'Turn off')));
  return box;
}
function paintSync() { const old = document.getElementById('xpSync'); if (old) old.replaceWith(syncPanel()); }

/* ───────── list ───────── */
function list() {
  view = 'list'; awake.release(); stopTimers();
  const done = progress.doneSet();
  const resume = progress.resumable().map(r => ({ ...r, e: byId(r.id) })).filter(r => r.e)[0];
  const next = PATH.find(e => !done.has(e.id));
  const chip = (cur, set, label, key) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(cur === key), onclick: () => { set(key); list(); } }, label);
  const pick = () => { const pool = PATH.filter(e => (filter.needs === 'all' || e.needs === filter.needs)); const fresh = pool.filter(e => !done.has(e.id)); const from = fresh.length ? fresh : pool; return from[Math.floor(Math.random() * from.length)]; };
  const pct = Math.round(100 * done.size / PATH.length);
  const others = PATH.filter(e => e.category !== 'capstone'), othersDone = others.filter(e => done.has(e.id)).length, ready = othersDone >= READY_AT;
  const lead = resume ? linkBtn('#/' + resume.id, continueLabel(resume.e, resume.step, total(resume.e)), 'xpContinue', false)
    : next ? linkBtn('#/' + next.id, continueLabel(next, 0, total(next), done.size > 0), 'xpContinue', false) : el('span', { class: 'xp-hint' }, 'You have done them all. Do any again.');
  const unitBanner = justFinished && el('div', { class: 'xp-banner', role: 'status' }, el('b', {}, `Unit ${justFinished.number} finished: ${justFinished.title}.`), ' Read what you wrote in ', el('a', { href: '#/notebook' }, 'My notebook'), ', or choose what comes next.');
  justFinished = null;
  const sug = suggestion && recommend(PATH, { ...filter, done });
  render(
    !progress.persistent ? el('div', { class: 'xp-warn', role: 'status' }, 'Your browser is not saving anything for this site (a private window, or storage is blocked). Your progress will be lost when you close this tab. Turn on sync below to keep it.') : null,
    unitBanner,
    el('div', { class: 'ph' }, el('h2', {}, COURSE.name), el('p', {}, COURSE.tagline), el('p', { style: 'margin-top:.5rem' }, COURSE.intro)),
    el('div', { class: 'xp-prog', role: 'img', 'aria-label': `${done.size} of ${PATH.length} experiments done` }, el('div', { class: 'xp-prog-bar' }, el('span', { style: `width:${pct}%` })), el('span', { class: 'xp-count' }, `${done.size} of ${PATH.length} done`)),
    el('div', { class: 'xp-top' }, lead,
      el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpSurprise', onclick: () => { const e = pick(); if (e) location.hash = '#/' + e.id; } }, 'Surprise me'),
      linkBtn('#/book', 'Do it on paper'), linkBtn('#/notebook', 'My notebook', 'xpNotebookLink'), linkBtn('#/keep', `Keep shelf${progress.shelf().length ? ' (' + progress.shelf().length + ')' : ''}`, 'xpKeepLink')),
    el('a', { class: 'xp-card xp-method', href: '#/method' }, el('h3', {}, 'Start here: ' + METHOD.title), el('p', {}, 'Five short ideas. Read once, then use them every time.'), el('small', {}, '1 minute')),
    el('div', { class: 'xp-find', 'aria-label': 'Which one for me?' },
      el('h3', { class: 'xp-h' }, 'Which one for me?'),
      el('p', { class: 'xp-hint' }, 'Say what you have and how long you have. Your answers are not saved.'),
      el('div', { class: 'xp-filters', role: 'group', 'aria-label': 'What you need' }, chip(filter.needs, v => { filter.needs = v; }, 'Anything', 'all'), ...Object.entries(NEEDS).map(([k, v]) => chip(filter.needs, x => { filter.needs = x; }, v, k))),
      el('div', { class: 'xp-filters', role: 'group', 'aria-label': 'Time you have' }, ...TIMES.map(([label, m]) => chip(filter.minutes, x => { filter.minutes = x; }, label, m))),
      el('button', { type: 'button', class: 'xp-btn', id: 'xpSuggest', onclick: () => { suggestion = true; list(); } }, 'Suggest one'),
      sug ? el('div', { class: 'xp-suggest', id: 'xpSuggestion', role: 'status' }, sug.pick
        ? [el('p', {}, sug.allDone ? 'You have done every one that fits. Do one again:' : 'Try this one:'), el('a', { class: 'xp-card', href: '#/' + sug.pick.id }, el('h3', {}, sug.pick.title), el('p', {}, sug.pick.summary), el('small', {}, `${NEEDS[sug.pick.needs]} · ${sug.pick.minutes} min`)),
          sug.others.length ? el('p', { class: 'xp-hint' }, 'Or: ', ...sug.others.flatMap((e, i) => [i ? ' · ' : '', el('a', { href: '#/' + e.id }, e.title)])) : null]
        : el('p', {}, 'Nothing fits both. Try a longer time, or "Anything".')) : null),
    ...UNITS.map(u => {
      const shown = u.experiments.filter(e => filter.needs === 'all' || e.needs === filter.needs);
      if (!shown.length) return null;
      const n = u.experiments.filter(e => done.has(e.id)).length;
      return el('section', { class: 'xp-unit', 'aria-labelledby': 'u-' + u.id },
        el('h3', { class: 'xp-unit-h', id: 'u-' + u.id }, `Unit ${u.number}: ${u.title}`, el('span', { class: 'xp-count' }, ` ${n} of ${u.experiments.length}`), n === u.experiments.length ? el('span', { class: 'xp-fin' }, ' Finished') : null),
        el('p', { class: 'xp-hint' }, u.intro),
        u.id === 'capstone' ? el('p', { class: 'xp-hint' }, ready ? 'You have done enough to be ready for this. Open it whenever you like.' : `Open any time. It is meant for after about ${READY_AT} of the others (${othersDone} so far).`) : null,
        el('div', { class: 'xp-grid' }, shown.map(e => el('a', { class: 'xp-card' + (done.has(e.id) ? ' done' : ''), href: '#/' + e.id },
          el('h3', {}, e.title), el('p', {}, e.summary), el('small', {}, `${NEEDS[e.needs]} · ${e.minutes} min${progress.pos(e.id) && !done.has(e.id) ? ` · in progress (step ${progress.pos(e.id)})` : ''}`)))));
    }),
    el('h3', { class: 'xp-h' }, 'Your devices'), syncPanel());
  window.scrollTo(0, 0);
}

function method() {
  view = 'method'; awake.release(); stopTimers();
  render(
    el('a', { class: 'xp-back', href: '#/' }, '← ' + COURSE.name),
    el('div', { class: 'ph' }, el('h2', {}, METHOD.title), el('p', {}, 'The same five ideas apply to every experiment in this course.')),
    el('ol', { class: 'xp-method-steps' }, METHOD.steps.map(([h, t]) => el('li', {}, el('strong', {}, h), el('p', {}, t)))),
    el('p', { class: 'xp-hint' }, 'Your notes are kept on this device. If you turn on sync, they are encrypted before they leave it.'),
    el('p', {}, el('a', { class: 'xp-btn', href: '#/' + PATH[0].id, style: 'text-decoration:none;display:inline-block' }, 'Begin with ' + PATH[0].title)));
  window.scrollTo(0, 0);
}

/* ───────── notebook and looking back ───────── */
function notebook() {
  view = 'notebook'; awake.release(); stopTimers();
  const done = progress.doneSet();
  const text = buildNotebook({ course: COURSE.name, units: UNITS, done, saved: id => progress.note(id), kept: progress.shelf().map(k => ({ ...k })) });
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' });
  const r = reflect({ units: UNITS, done, saved: id => progress.note(id) });
  render(
    el('a', { class: 'xp-back', href: '#/' }, '← ' + COURSE.name),
    el('div', { class: 'ph' }, el('h2', {}, 'My notebook'), el('p', {}, 'Everything you wrote at the end of an experiment, and the text you chose to keep, in one place. Kept on this device; encrypted first if you turn on sync.')),
    el('pre', { class: 'xp-notebook', id: 'xpNotebookText' }, text),
    el('div', { class: 'xp-row' },
      el('button', { type: 'button', class: 'xp-btn', id: 'xpNbCopy', onclick: async () => { try { await navigator.clipboard.writeText(text); msg.textContent = 'Copied.'; } catch { msg.textContent = 'Select the text and copy it.'; } } }, 'Copy'),
      el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpNbSave', onclick: () => { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const a = el('a', { href: url, download: 'within-limits-notebook.txt' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); msg.textContent = 'Saved as a text file.'; } }, 'Download')),
    msg,
    r.notes ? el('section', { class: 'xp-reflect', id: 'xpReflect' }, el('h3', { class: 'xp-h' }, 'Looking back'),
      el('p', {}, `You have written ${r.notes} note${r.notes === 1 ? '' : 's'}, ${r.words} words in all.`),
      r.recurring.length ? el('p', {}, 'Words that came up more than once: ', ...r.recurring.flatMap((w, i) => [i ? ', ' : '', el('strong', {}, w.word), ` (${w.count})`])) : el('p', {}, 'No word has come up twice yet.'),
      el('ul', { class: 'xp-reflect-units' }, r.units.filter(u => u.notes).map(u => el('li', {}, `Unit ${u.number}, ${u.unit}: ${u.notes} note${u.notes === 1 ? '' : 's'}, ${u.words} words${u.top.length ? '. Most often: ' + u.top.map(w => w.word).join(', ') : ''}.`))),
      el('p', { class: 'xp-hint' }, 'These are counts of your own words, worked out on this device. They describe what you wrote, nothing more.')) : null);
  window.scrollTo(0, 0);
}

/* ───────── the Keep shelf ───────── */
async function keepItem(e, item) {
  const title = `${e.title}: ${item.label}`;
  for (const old of progress.shelf().filter(k => k.exp === e.id && k.title === title)) {   // saving again replaces, it does not pile up
    if (old.kind === 'audio') { try { await deleteAudio(old.id); } catch { /* already gone */ } }
    progress.unkeep(old.id);
  }
  if (item.kind === 'audio') {
    const blob = new Blob([encodeWav(item.clip.data, item.clip.sr)], { type: 'audio/wav' });
    const id = progress.keep({ exp: e.id, kind: 'audio', title, secs: Math.round(item.clip.data.length / item.clip.sr) });
    try { await putAudio(id, blob); } catch (err) { progress.unkeep(id); throw err; }
  } else progress.keep({ exp: e.id, kind: 'text', title, text: item.text });
}
function shelf() {
  view = 'keep'; awake.release(); stopTimers();
  const items = progress.shelf();
  const card = it => {
    const e = byId(it.exp), body = el('div', { class: 'xp-kept-body' });
    const del = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: async () => { if (!confirm('Delete this from your Keep shelf?')) return; if (it.kind === 'audio') { try { await deleteAudio(it.id); } catch { /* already gone */ } } progress.unkeep(it.id); shelf(); } }, 'Delete');
    if (it.kind === 'text') body.append(el('pre', { class: 'xp-kept' }, it.text), el('div', { class: 'xp-row' }, el('button', { type: 'button', class: 'xp-btn xp-btn--alt', onclick: async ev => { try { await navigator.clipboard.writeText(it.text); ev.target.textContent = 'Copied'; } catch { ev.target.textContent = 'Select and copy'; } } }, 'Copy'), del));
    else {
      body.append(el('p', { class: 'xp-hint' }, 'Loading the recording…'));
      getAudio(it.id).then(blob => {
        if (!blob) { body.replaceChildren(el('p', { class: 'xp-hint' }, 'This recording is not on this device any more.'), del); return; }
        const url = URL.createObjectURL(blob);
        body.replaceChildren(el('audio', { controls: true, src: url, 'aria-label': it.title }), el('div', { class: 'xp-row' }, el('a', { class: 'xp-btn xp-btn--alt', href: url, download: 'experiment.wav', style: 'text-decoration:none' }, 'Download'), del));
      }).catch(() => body.replaceChildren(el('p', { class: 'xp-hint' }, 'Recordings could not be opened here.'), del));
    }
    return el('article', { class: 'xp-kept-item' }, el('h3', {}, it.title), el('p', { class: 'xp-hint' }, `${when(it.at)}${e ? ' · ' : ''}`, e ? el('a', { href: '#/' + e.id }, e.title) : null, it.kind === 'audio' ? ' · this device only' : ''), body);
  };
  render(
    el('a', { class: 'xp-back', href: '#/' }, '← ' + COURSE.name),
    el('div', { class: 'ph' }, el('h2', {}, 'Keep shelf'), el('p', {}, 'What you chose to keep from the experiments. Press "Keep this" on a tool to put something here. Text and patterns sync if you turn sync on; recordings stay on this device only.')),
    items.length ? el('div', { class: 'xp-kept-list' }, items.map(card)) : el('p', { class: 'xp-hint', id: 'xpShelfEmpty' }, 'Nothing here yet. Make something in an experiment and press "Keep this".'));
  window.scrollTo(0, 0);
}

/* ───────── the printable book ───────── */
function book() {
  view = 'book'; awake.release(); stopTimers();
  render(
    el('a', { class: 'xp-back xp-noprint', href: '#/' }, '← ' + COURSE.name),
    el('div', { class: 'ph' }, el('h2', {}, COURSE.name), el('p', {}, COURSE.tagline), el('p', { class: 'xp-noprint' }, el('button', { type: 'button', class: 'xp-btn', id: 'xpPrint', onclick: () => window.print() }, 'Print or save as PDF'))),
    el('h3', { class: 'xp-h' }, METHOD.title), el('ol', {}, METHOD.steps.map(([h, t]) => el('li', {}, el('strong', {}, h + '. '), t))),
    ...UNITS.flatMap(u => [el('h3', { class: 'xp-h xp-breakb' }, `Unit ${u.number}: ${u.title}`), ...u.experiments.map(e => el('article', { class: 'xp-bk' },
      el('h4', {}, e.title), el('p', {}, el('em', {}, e.summary)),
      el('p', {}, el('strong', {}, 'Finding out. '), e.question),
      el('p', {}, el('strong', {}, 'Limits: '), e.parameters.map(([k, v]) => `${k}: ${v}`).join(' · ')),
      el('ol', {}, e.procedure.map(x => el('li', {}, x))),
      el('p', {}, el('strong', {}, 'Stop: '), e.stop), el('p', {}, el('strong', {}, 'On paper: '), e.solo),
      el('p', {}, el('strong', {}, 'Your note: '), e.reflect, ' ______________________________________________')))]));
  window.scrollTo(0, 0);
}

/* ───────── one experiment ───────── */
function stepTimer(seconds) {
  let left = seconds, id = null;
  const show = el('span', { class: 'xp-st-time', role: 'timer' }, fmtClock(left));
  const btn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpStepTimer' }, `Start ${fmtClock(seconds)} timer`);
  const reset = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', hidden: true }, 'Reset');
  const end = () => { clearInterval(id); id = null; left = seconds; show.textContent = 'Time. Stop where you are.'; btn.textContent = 'Start again'; reset.hidden = true; try { playTones([9], { step: 1.2, octave: 1 }); } catch { /* sound is a nicety */ } try { navigator.vibrate?.([140, 70, 140]); } catch { /* not supported */ } };
  btn.onclick = () => {
    if (id) { clearInterval(id); id = null; btn.textContent = 'Resume'; return; }
    if (left === seconds) show.textContent = fmtClock(left); btn.textContent = 'Pause'; reset.hidden = false;
    id = setInterval(() => { left--; show.textContent = fmtClock(Math.max(0, left)); if (left <= 0) end(); }, 1000); timers.push(id);
  };
  reset.onclick = () => { clearInterval(id); id = null; left = seconds; show.textContent = fmtClock(left); btn.textContent = `Start ${fmtClock(seconds)} timer`; reset.hidden = true; };
  return el('div', { class: 'xp-st' }, show, el('div', { class: 'xp-row' }, btn, reset));
}

function detail(e) {
  view = 'detail'; stopTimers();
  const n = total(e), last = n + 1;                                 // 0 = start, 1..n = steps, last = finish
  const note = el('textarea', { rows: 8, id: 'xpNote', 'aria-label': 'Your note', placeholder: 'Record your process, or share your thoughts. Anything at all, in any shape. Kept on this device only.' });
  note.value = progress.note(e.id); note.oninput = () => progress.setNote(e.id, note.value);
  const tools = e.tools.map(cfg => buildTool(cfg));        // built once, so rolls and running rhythms survive moving between steps
  const per = assignTools(e), isTimer = i => e.tools[i].type === 'timer';
  const firstAt = i => per.findIndex(l => l.includes(i));
  let at = 0;
  const idx = PATH.indexOf(e), nextExp = PATH[(idx + 1) % PATH.length];
  const dots = () => el('div', { class: 'xp-dots', role: 'img', 'aria-label': at === 0 ? 'Not started' : at > n ? 'All steps done' : `Step ${at} of ${n}` }, Array.from({ length: n + 2 }, (_, k) => el('span', { class: 'xp-dot' + (k <= at ? ' on' : '') })));
  const nav = (...kids) => el('div', { class: 'xp-nav' }, ...kids);
  const btn = (label, fn, alt, id) => el('button', { type: 'button', class: 'xp-btn' + (alt ? ' xp-btn--alt' : ''), id, onclick: fn }, label);
  const go = k => { at = k; if (k >= 1) progress.setPos(e.id, Math.min(k, n)); draw(); window.scrollTo(0, 0); };
  let ticks = [];                                                     // end-screen choices: { box, item }
  const finish = async () => {
    for (const { box, item } of ticks) if (box.checked) { try { await keepItem(e, item); } catch { /* storage full or blocked: the note is still saved */ } }
    const unit = UNITS.find(u => u.experiments.includes(e)), was = unit.experiments.every(x => progress.isDone(x.id));
    progress.markDone(e.id);
    if (!was && unit.experiments.every(x => progress.isDone(x.id))) justFinished = unit;
    location.hash = '#/';
  };

  function savePanel() {
    ticks = tools.map(t => t.keepable && t.keepable()).filter(Boolean).map(item => ({ item, box: el('input', { type: 'checkbox', checked: true }) }));
    if (!ticks.length) return null;
    const what = it => it.kind === 'audio' ? `${it.label} (${Math.round(it.clip.data.length / it.clip.sr)} s of sound)` : `${it.label}: ${it.text.replace(/\s+/g, ' ').slice(0, 70)}${it.text.length > 70 ? '…' : ''}`;
    return el('div', { class: 'xp-save', id: 'xpSave' }, el('h3', { class: 'xp-h' }, 'Save on this device'),
      el('ul', { class: 'xp-check' }, ticks.map(({ item, box }) => el('li', {}, el('label', {}, box, ' ' + what(item))))),
      el('p', { class: 'xp-hint' }, 'Ticked items go on your Keep shelf when you finish. Untick anything you do not want to keep.'));
  }

  function draw() {
    stopTimers();
    const head = el('a', { class: 'xp-back', href: '#/' }, '← ' + COURSE.name);
    if (at === 0) {
      awake.release();
      const saved = progress.pos(e.id);
      render(head,
        el('div', { class: 'ph' }, el('h2', {}, e.title), el('p', { id: 'xpQuestion' }, e.question)),
        el('p', { class: 'xp-hint' }, 'First: ' + e.procedure[0]),
        nav(btn('Begin', () => go(1), false, 'xpBegin'), saved >= 1 && saved <= n ? btn(`Resume at step ${saved}`, () => go(saved), true, 'xpResume') : null),
        el('details', { class: 'xp-solo', id: 'xpAbout' }, el('summary', {}, 'About this experiment'),
          el('ul', { class: 'xp-intro-list' },
            el('li', {}, el('b', {}, 'Time'), `about ${e.minutes} minutes`),
            el('li', {}, el('b', {}, 'You need'), NEEDS[e.needs]),
            el('li', {}, el('b', {}, 'Limits'), e.parameters.map(([k, v]) => `${k}: ${v}`).join(' · '))),
          el('p', {}, e.summary),
          el('p', {}, el('b', {}, 'Without the app: '), e.solo),
          el('p', {}, el('a', { href: '#/method', class: 'xp-hint' }, 'How the course works'))));
    } else if (at <= n) {
      awake.hold();
      const here = per[at - 1].filter(i => !isTimer(i)), shownIdx = new Set(here);
      const carry = tools.map((t, i) => ({ t, i })).filter(({ t, i }) => !shownIdx.has(i) && firstAt(i) >= 0 && firstAt(i) < at - 1 && t.keepable).map(({ t }) => ({ t, k: t.keepable() })).filter(x => x.k);
      const rest = tools.map((t, i) => ({ t, i })).filter(({ i }) => !shownIdx.has(i)).map(({ t }) => t);
      const secs = parseTimer(e.procedure[at - 1]);
      here.forEach(i => tools[i].shown && tools[i].shown());
      render(head, dots(),
        el('div', { class: 'xp-stepcard', 'aria-live': 'polite' }, el('div', { class: 'xp-stepno' }, `Step ${at} of ${n}`), el('p', { class: 'xp-steptext', id: 'xpStep' }, e.procedure[at - 1])),
        secs ? stepTimer(secs) : null,
        el('div', { class: 'xp-nav xp-nav--sticky' }, btn(at === n ? 'Finish' : 'Next', () => go(at + 1), false, 'xpNext'), btn('Back', () => go(at - 1), true, 'xpBack')),
        carry.length ? el('div', { class: 'xp-carry', id: 'xpCarry' }, el('b', {}, 'From earlier'), carry.map(({ k }) => el('p', {}, el('span', { class: 'xp-carry-k' }, k.label + ': '), k.kind === 'text' ? k.text.replace(/\n/g, ' · ') : 'a clip you made'))) : null,
        el('div', { class: 'xp-tools', id: 'xpTools' }, here.length ? el('h3', { class: 'xp-h' }, 'For this step') : null, ...here.map(i => tools[i])),
        rest.length ? el('details', { class: 'xp-others', id: 'xpOthers' }, el('summary', {}, here.length ? 'Your other tools' : 'Your tools'), ...rest) : null);
    } else {
      awake.release();
      const kept = progress.shelf().filter(k => k.exp === e.id), unit = UNITS.find(u => u.experiments.includes(e));
      const unitDone = unit.experiments.filter(x => progress.isDone(x.id) || x === e).length;
      render(head, dots(),
        el('div', { class: 'ph' }, el('h2', {}, 'All done'), el('p', {}, 'Stop here: ' + e.stop)),
        el('h3', { class: 'xp-h' }, 'Your note (optional)'),
        el('p', { class: 'xp-hint' }, 'Record your process or share your thoughts. If it helps to start: ' + e.reflect),
        note,
        el('div', { class: 'xp-recap', id: 'xpRecap' },
          el('p', {}, `${n} steps done. ${unitDone} of ${unit.experiments.length} in Unit ${unit.number} (${unit.title}) once you mark this one.`),
          kept.length ? el('p', {}, `Kept from this experiment: `, ...kept.flatMap((k, i) => [i ? ', ' : '', k.title.replace(e.title + ': ', '')]), '. ', el('a', { href: '#/keep' }, 'Open the Keep shelf')) : el('p', { class: 'xp-note' }, 'You did not keep anything from this one. Go back to the steps and press "Keep this" on a tool if you want to.')),
        savePanel(),
        nav(btn('Finish', finish, false, 'xpFinish'), btn('Back to the steps', () => go(n), true, 'xpBackSteps')),
        el('p', { class: 'xp-hint', style: 'margin-top:1rem' }, el('a', { href: '#/' + nextExp.id }, 'Next in the course: ' + nextExp.title + ' →'), ' · ', el('a', { href: '#/' }, 'Choose another')));
    }
  }
  draw(); window.scrollTo(0, 0);
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const e = id && byId(id);
  document.title = (e ? e.title + ' — ' : '') + COURSE.name + ' — Sensory Intelligence Lab';
  if (id === 'method') method(); else if (id === 'book') book(); else if (id === 'notebook') notebook(); else if (id === 'keep') shelf(); else e ? detail(e) : list();
}
window.addEventListener('hashchange', route);
// Another tab saved: merge its record into this one so two open tabs never overwrite each other.
window.addEventListener('storage', ev => { if (ev.key === 'sil.exp.v1' && ev.newValue) { try { progress.applyRemote(JSON.parse(ev.newValue)); } catch { /* ignore a damaged value */ } } });
window.addEventListener('pagehide', () => awake.release());
route();
initSync();
