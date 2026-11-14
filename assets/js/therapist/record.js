/**
 * /assets/js/therapist/record.js
 * The therapist's record of one client: session notes with [[links]] and #themes, joined with the intake form and the
 * family history, and shown as backlinks, a map, a themes-by-sessions table, a timeline, a pre-session brief and an
 * export. Notes are encrypted with the therapist's vault before they are saved. All the reading and counting happens in
 * this browser; nothing is sent to a server or to any model.
 */
import { parseNote, keyOf } from '../notes/parse.js';
import { recurring, suggestThemes, THEME_SEEDS } from '../notes/analysis.js';
import { items, backlinks, matrix, graph, notRevisited, timeline, toMarkdown, ordered } from '../notes/graph.js';

const VIEWS = [['notes', 'Notes'], ['map', 'Map'], ['themes', 'Themes'], ['timeline', 'Timeline'], ['brief', 'Before a session'], ['records', 'Export and delete']];
const today = () => new Date().toISOString().slice(0, 10);
const longDate = d => { const t = new Date(d + 'T12:00:00'); return isNaN(t) ? String(d) : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const SOURCE = { intake: 'From the intake form', family: 'From the family history' };
const NOTE_FOR_ANALYSIS = 'Counted from your own words, on this device only. These are prompts to look back at your notes, not an assessment of the client.';

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const btn = (label, fn, cls = 'action-btn sm', extra) => h('button', { type: 'button', class: cls, onclick: fn, ...extra }, label);

/** The note text as DOM: [[links]] and #themes become buttons that open everything about them. */
function renderText(text, open) {
  const frag = document.createDocumentFragment(), re = /\[\[([^\[\]\n|]{1,60})(?:\|([^\[\]\n]{1,60}))?\]\]|(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,40})/gu;
  let last = 0, m;
  while ((m = re.exec(text))) {
    const start = m.index + (m[3] ? m[3].length : 0);
    frag.append(text.slice(last, start));
    const link = m[1] && m[1].trim(), alias = m[2], tag = m[4];                 // copied out: `m` changes on the next match
    if (link) frag.append(h('button', { type: 'button', class: 'th-link th-link--entity', onclick: () => open(link) }, alias || link));
    else frag.append(h('button', { type: 'button', class: 'th-link th-link--theme', onclick: () => open(tag) }, '#' + tag));
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last)); return frag;
}
function download(name, text, type = 'text/markdown') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function mountRecord(box, { store, clientId, clientName, extras = [], people = [], sharedDates = [], active = true, onDeleted = () => {} }) {
  let notes = [], view = 'notes', panel = null, filter = '';
  const load = async () => { notes = (await store.list(clientId)).map(n => ({ ...n, source: 'note' })); };
  const entries = () => [...notes.filter(n => n.text != null), ...extras.filter(Boolean)].map(n => ({ ...n, date: n.date || today() }));
  const say = (t, kind) => { const m = box.querySelector('#recMsg'); if (m) { m.textContent = t; m.className = 'msg show ' + (kind || ''); } };
  const noData = txt => h('p', { class: 'th-muted' }, txt);
  const caveat = () => h('p', { class: 'th-hint' }, NOTE_FOR_ANALYSIS);

  function openAbout(name) {
    const back = backlinks(entries(), name); panel.querySelector('#recAbout')?.remove();
    const wrap = h('aside', { class: 'th-about', id: 'recAbout', tabindex: '-1', 'aria-label': 'Everything about ' + name }, h('h3', { class: 'th-h3' }, name),
      back.length ? h('ul', { class: 'th-list' }, back.map(b => h('li', {}, h('span', { class: 'th-muted' }, longDate(b.date) + ' · '), b.context))) : noData('Not mentioned yet.'),
      btn('Close', () => wrap.remove(), 'action-btn sm outline'));
    panel.prepend(wrap); wrap.focus();
  }

  // ── Notes ──
  function viewNotes() {
    const known = new Map(); for (const p of people) known.set('e:' + keyOf(p.name), { text: `[[${p.name}]]`, label: p.relationship ? `${p.name} (${p.relationship})` : p.name });
    for (const it of items(entries())) known.set((it.kind === 'theme' ? 't:' : 'e:') + it.key, { text: it.kind === 'theme' ? '#' + it.name : `[[${it.name}]]`, label: (it.kind === 'theme' ? '#' : '') + it.name });
    const date = h('input', { type: 'date', class: 'ws-input', id: 'recDate', value: today(), 'aria-label': 'Session date' });
    const area = h('textarea', { class: 'ws-input', id: 'recText', rows: '7', maxlength: '20000', placeholder: 'What happened, what you noticed, what you plan. Write [[Mother]] to link a person, event or place, and #perfectionism to tag a theme.' });
    const insert = t => { const s = area.selectionStart ?? area.value.length, e = area.selectionEnd ?? s; area.setRangeText((s && !/\s$/.test(area.value.slice(0, s)) ? ' ' : '') + t + ' ', s, e, 'end'); area.focus(); };
    const chips = h('div', { class: 'th-chips', 'aria-label': 'Insert a link or theme' }, [...known.values()].slice(0, 24).map(k => btn(k.label, () => insert(k.text), 'th-chip')));
    const save = btn('Save note', async e => { e.target.disabled = true; try { await store.add(clientId, area.value, date.value || today()); await load(); draw(); } catch (err) { say(err.message, 'error'); e.target.disabled = false; } }, 'action-btn');
    const search = h('input', { type: 'search', class: 'ws-input', id: 'recFind', placeholder: 'Search this record', value: filter, 'aria-label': 'Search this record' });
    const list = h('ul', { class: 'th-list', id: 'recList' });
    const paint = () => {
      const q = filter.toLocaleLowerCase(); list.replaceChildren();
      const shown = [...entries()].sort((a, b) => String(b.date).localeCompare(String(a.date))).filter(n => !q || n.text.toLocaleLowerCase().includes(q));
      if (!shown.length) list.append(h('li', { class: 'th-muted' }, q ? 'Nothing matches.' : 'No notes yet.'));
      for (const n of shown) {
        const body = h('div', { class: 'note-text' }, renderText(n.text, openAbout)), li = h('li', { 'data-id': n.source === 'note' ? n.id : null }, h('div', { class: 'th-muted' }, longDate(n.date), n.source !== 'note' ? ' · ' + SOURCE[n.source] : ''), body);
        if (n.source === 'note') {
          const edit = btn('Edit', () => {
            const box2 = h('textarea', { class: 'ws-input', rows: '6', maxlength: '20000' }); box2.value = n.text; const d2 = h('input', { type: 'date', class: 'ws-input', value: n.date });
            body.replaceWith(h('div', {}, d2, box2)); edit.textContent = 'Save changes';
            edit.onclick = async () => { edit.disabled = true; try { await store.update(n.id, box2.value, d2.value || n.date); await load(); draw(); } catch (err) { say(err.message, 'error'); edit.disabled = false; } };
          });
          const del = btn('Delete', () => { del.replaceWith(h('span', {}, ' Delete this note for good? ', btn('Yes, delete', async () => { try { await store.remove(n.id); await load(); draw(); } catch (err) { say(err.message, 'error'); } }), ' ', btn('Keep', draw))); });
          li.append(edit, ' ', del);
        }
        list.append(li);
      }
    };
    search.oninput = () => { filter = search.value; paint(); };
    panel.append(h('p', { class: 'th-hint', style: 'margin-top:0' }, `Private to you. Notes are encrypted with your vault before they leave this device, so the client, the practice owner and the platform cannot read them. ${NOTE_FOR_ANALYSIS}`),
      h('label', { class: 'ws-label', for: 'recDate' }, 'Session date'), date, h('label', { class: 'ws-label', for: 'recText', style: 'margin-top:.8rem' }, 'New note'), area, chips,
      h('div', { style: 'margin:.5rem 0 1rem' }, save), h('div', { class: 'msg', id: 'recMsg', role: 'status' }),
      h('h2', { class: 'th-h2' }, 'The record'), search, list); paint();
  }

  // ── Map ──
  function viewMap() {
    const g = graph(entries()); panel.append(caveat());
    if (!g.nodes.length) { panel.append(noData('Nothing to map yet. Write [[a person, event or place]] or #a-theme in your notes, and they appear here, joined when they come up together.')); return; }
    const W = 640, H = 460, cx = W / 2, cy = H / 2, ring = (list, r) => list.map((n, i) => ({ ...n, x: cx + r * Math.cos((i / list.length) * 6.2832 - 1.5708), y: cy + r * Math.sin((i / list.length) * 6.2832 - 1.5708) }));
    const themes = ring(g.nodes.filter(n => n.kind === 'theme'), 95), ents = ring(g.nodes.filter(n => n.kind === 'entity'), 190), at = new Map([...themes, ...ents].map(n => [n.id, n]));
    const NS = 'http://www.w3.org/2000/svg', s = (tag, a, ...k) => { const e = document.createElementNS(NS, tag); for (const [x, v] of Object.entries(a || {})) e.setAttribute(x, v); k.forEach(c => e.append(c)); return e; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'th-map', role: 'img', 'aria-label': 'Map of the people, events and themes in this record, joined when they appear together. A list of the same connections follows.' });
    for (const e of g.edges) { const a = at.get(e.source), b = at.get(e.target); if (a && b) svg.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: e.close ? '#2a5c45' : '#b9b9b2', 'stroke-width': 1 + Math.min(5, e.sessions), 'stroke-opacity': e.close ? '.75' : '.55' })); }
    for (const n of at.values()) {
      const r = 8 + Math.min(14, n.count * 2), grp = s('g', { tabindex: '0', role: 'button', 'aria-label': `${n.name}, ${n.kind === 'theme' ? 'theme' : 'person or event'}, in ${n.count} notes` });
      grp.append(s('circle', { cx: n.x, cy: n.y, r, fill: n.kind === 'theme' ? '#2a5c45' : '#fff', stroke: '#2a5c45', 'stroke-width': 2 }));
      const label = s('text', { x: n.x, y: n.y + r + 12, 'text-anchor': 'middle', 'font-size': 11, fill: '#333' }); label.textContent = n.name; grp.append(label);
      grp.addEventListener('click', () => openAbout(n.name)); grp.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openAbout(n.name); } });
      svg.append(grp);
    }
    panel.append(h('p', { class: 'th-hint' }, 'Filled circles are themes (inner ring). Outlined circles are people, events and places (outer ring). A line means two things came up in the same note; a dark line means in the same sentence. Select any circle to read every mention.'), svg);
    const name = id => g.nodes.find(n => n.id === id)?.name;
    panel.append(h('h2', { class: 'th-h2' }, 'Connections'), g.edges.length ? h('ul', { class: 'th-list' }, g.edges.slice(0, 40).map(e => h('li', {}, `${name(e.source)} and ${name(e.target)}: together in ${e.sessions} note${e.sessions === 1 ? '' : 's'}${e.close ? `, in the same sentence in ${e.close}` : ''}.`))) : noData('No connections yet: nothing has come up together so far.'));
  }

  // ── Themes ──
  function viewThemes() {
    const all = entries(), m = matrix(all, 'theme'), me = matrix(all, 'entity'); panel.append(caveat());
    const table = (mx, title) => !mx.rows.length ? null : h('div', {}, h('h2', { class: 'th-h2' }, title), h('div', { class: 'th-scroll' }, h('table', { class: 'th-matrix' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), mx.columns.map(c => h('th', { scope: 'col', title: longDate(c.date) }, longDate(c.date).replace(/ \d{4}$/, ''))))),
      h('tbody', {}, mx.rows.map(r => h('tr', {}, h('th', { scope: 'row', class: 'th-rowname' }, h('button', { type: 'button', class: 'th-link', onclick: () => openAbout(r.name) }, r.name)), r.cells.map(c => h('td', { class: c ? 'on' : '', style: c ? `opacity:${Math.min(1, .35 + c * .2)}` : null, 'aria-label': c ? `${c} mention${c === 1 ? '' : 's'}` : 'none' }, c || ''))))))));
    panel.append(table(m, 'Themes by session') || noData('No themes tagged yet. Add #tags in your notes and they appear here.'), table(me, 'People, events and places by session'));
    const quiet = notRevisited(all);
    panel.append(h('h2', { class: 'th-h2' }, 'Not brought up lately'), quiet.length ? h('ul', { class: 'th-list' }, quiet.map(q => h('li', {}, h('button', { type: 'button', class: 'th-link', onclick: () => openAbout(q.name) }, q.name), ` came up ${q.mentions} times, last on ${longDate(q.last)}, ${q.sessionsSince} entr${q.sessionsSince === 1 ? 'y' : 'ies'} ago.`))) : noData('Nothing that used to come up has gone quiet.'));
    const tagged = new Set(items(all).filter(i => i.kind === 'theme').map(i => i.key)), text = all.map(n => n.text).join('\n'), sug = suggestThemes(text, 3).filter(t => !tagged.has(keyOf(t.theme)));
    panel.append(h('h2', { class: 'th-h2' }, 'Possible themes'), h('p', { class: 'th-hint' }, 'Words in your notes that match common themes. Only a suggestion: add a #tag to any note if it fits, and ignore the rest.'),
      sug.length ? h('ul', { class: 'th-list' }, sug.map(t => h('li', {}, h('strong', {}, t.theme), ` · ${t.hits} matching words: ${t.words.join(', ')}`))) : noData('No suggestions.'),
      h('h2', { class: 'th-h2' }, 'Words that recur'), h('p', {}, recurring(all.map(n => n.text), 18).map(w => `${w.word} (${w.count})`).join(' · ') || 'Not enough text yet.'));
  }

  // ── Timeline ──
  function viewTimeline() {
    const all = entries(), tl = timeline(all); panel.append(caveat());
    if (!tl.length) { panel.append(noData('No entries yet.')); return; }
    panel.append(h('ol', { class: 'th-timeline' }, tl.map(t => {
      const src = all.find(n => n.id === t.id), mine = src && src.source === 'note';
      return h('li', {}, h('div', { class: 'th-muted' }, longDate(t.date), src && src.source !== 'note' ? ' · ' + SOURCE[src.source] : ''), h('div', {}, t.opening.length > 160 ? t.opening.slice(0, 157) + '…' : t.opening),
        h('div', { class: 'th-chips' }, t.people.map(p => h('button', { type: 'button', class: 'th-link th-link--entity', onclick: () => openAbout(p) }, p)), t.themes.map(p => h('button', { type: 'button', class: 'th-link th-link--theme', onclick: () => openAbout(p) }, '#' + p))),
        t.tone != null ? h('div', { class: 'th-tone', role: 'img', 'aria-label': `Tone of the words used: ${t.tone > 0.2 ? 'mostly positive' : t.tone < -0.2 ? 'mostly negative' : 'mixed'} (${t.tone})`, title: 'Positive and negative words used, from a small word list. A rough reading of the wording, not of the person.' }, h('span', { class: 'th-tone-bar', style: `left:${50 + t.tone * 50}%` })) : null,
        mine && t.suggested.length ? h('div', { class: 'th-hint' }, 'Possible themes: ', t.suggested.map(x => btn('#' + x, async () => { try { await store.update(src.id, src.text.trimEnd() + ' #' + x, src.date); await load(); draw(); } catch (err) { say(err.message, 'error'); } }, 'th-chip', { title: 'Add this tag to the note' }))) : null);
    })));
  }

  // ── Before a session ──
  function viewBrief() {
    const all = ordered(entries().filter(n => n.source === 'note')), last = all.slice(-2).reverse(), every = entries(); panel.append(caveat());
    if (!all.length) { panel.append(noData('Your first session note will appear here, with what to pick up next time.')); return; }
    const recent = new Set(all.slice(-3).flatMap(n => { const p = parseNote(n.text); return [...p.tags.map(t => t.name), ...p.links.map(l => l.name)]; }));
    const lastDate = all[all.length - 1].date, since = sharedDates.filter(d => String(d).slice(0, 10) > lastDate).length, quiet = notRevisited(every).slice(0, 5);
    panel.append(h('h2', { class: 'th-h2', style: 'margin-top:0' }, 'Last time'), h('ul', { class: 'th-list' }, last.map(n => h('li', {}, h('div', { class: 'th-muted' }, longDate(n.date)), h('div', { style: 'white-space:pre-wrap' }, renderText(n.text.length > 600 ? n.text.slice(0, 597) + '…' : n.text, openAbout))))),
      h('h2', { class: 'th-h2' }, 'Active in recent sessions'), recent.size ? h('div', { class: 'th-chips' }, [...recent].map(n => h('button', { type: 'button', class: 'th-link', onclick: () => openAbout(n) }, n))) : noData('Nothing tagged or linked in the last three notes.'),
      h('h2', { class: 'th-h2' }, 'Not brought up lately'), quiet.length ? h('ul', { class: 'th-list' }, quiet.map(q => h('li', {}, `${q.name}: last on ${longDate(q.last)}.`))) : noData('Nothing has gone quiet.'),
      h('h2', { class: 'th-h2' }, 'Since your last note'), h('p', {}, since ? `${clientName} has shared ${since} check-in${since === 1 ? '' : 's'}. See the Shared tab.` : 'Nothing new shared.'));
  }

  // ── Export and delete ──
  function viewRecords() {
    const all = entries(), nNotes = notes.filter(n => n.text != null).length, safe = clientName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'client';
    panel.append(h('h2', { class: 'th-h2', style: 'margin-top:0' }, 'Export'),
      h('p', {}, `${nNotes} session note${nNotes === 1 ? '' : 's'}${extras.filter(Boolean).length ? ' plus the intake form and family history' : ''}.`),
      h('p', { class: 'th-hint' }, `A Markdown file keeps your [[links]] and #themes and opens in any notes app, Obsidian included. It is made on this device. If ${clientName} asks for their records, send them this file yourself; the platform never holds a readable copy.`),
      btn('Download as Markdown', () => download(`${safe}-record.md`, toMarkdown(clientName, all)), 'action-btn'), ' ', btn('Download as plain text', () => download(`${safe}-record.txt`, toMarkdown(clientName, all), 'text/plain'), 'action-btn outline'),
      h('h2', { class: 'th-h2' }, 'Keep or delete'),
      h('p', {}, active ? 'Your notes stay until you delete them.' : `This connection has ended. Your notes about ${clientName} are yours: nothing is deleted automatically, so keep them or delete them when you choose.`),
      h('p', { class: 'th-hint' }, `Ending a connection does not remove your notes. They are removed only if you delete them here, or if ${clientName} deletes their own account.`));
    const zone = h('div', { class: 'th-danger' });
    const ask = () => zone.replaceChildren(btn('Delete all my notes about this client…', () => {
      const input = h('input', { class: 'ws-input', id: 'recConfirm', 'aria-label': 'Type DELETE to confirm', placeholder: 'Type DELETE', autocomplete: 'off' });
      zone.replaceChildren(h('p', { style: 'font-size:.85rem' }, `This permanently deletes all ${nNotes} of your notes about ${clientName}. It cannot be undone. Download an export first if you want a copy.`), input, h('div', { style: 'margin-top:.6rem' },
        btn('Delete the notes', async e => { if (input.value.trim() !== 'DELETE') { say('Type DELETE to confirm.', 'error'); return; } e.target.disabled = true; try { await store.removeAll(clientId); notes = []; onDeleted(); draw(); } catch (err) { say(err.message, 'error'); e.target.disabled = false; } }), ' ', btn('Cancel', ask, 'action-btn sm outline')));
    }, 'action-btn outline sm'));
    ask(); panel.append(zone, h('div', { class: 'msg', id: 'recMsg', role: 'status' }));
  }

  function draw() {
    box.replaceChildren(h('div', { class: 'th-tabs th-tabs--sub', role: 'tablist', 'aria-label': 'Record views' }, VIEWS.map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === view), class: k === view ? 'on' : '', onclick: () => { view = k; draw(); } }, label))),
      panel = h('div', { class: 'th-recpanel', role: 'tabpanel' }));
    ({ notes: viewNotes, map: viewMap, themes: viewThemes, timeline: viewTimeline, brief: viewBrief, records: viewRecords })[view]();
  }
  await load(); draw();
}
