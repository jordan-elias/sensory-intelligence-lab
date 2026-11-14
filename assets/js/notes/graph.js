/**
 * /assets/js/notes/graph.js
 * Turns a client's notes into the connected picture a therapist works from: backlinks, a themes-by-sessions table,
 * a graph of people, events and themes that appear together, a timeline, and "not revisited lately" prompts.
 * Pure functions over plain note objects { id, date, text }. Runs on the device.
 */
import { parseNote, sentences, rawSentences, keyOf, normName } from './parse.js';
import { suggestThemes, sentiment } from './analysis.js';

const byDate = (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id));
export const ordered = notes => [...notes].sort(byDate);

/** Everything the notes mention, once each: people/events/places from [[links]], themes from #tags. */
export function items(notes) {
  const m = new Map();
  for (const n of ordered(notes)) {
    const p = parseNote(n.text);
    for (const [kind, list] of [['entity', p.links], ['theme', p.tags]]) for (const x of list) {
      const k = kind + ':' + x.key, it = m.get(k) || { id: k, kind, name: x.name, key: x.key, notes: [], first: n.date, last: n.date };
      it.notes.push(n.id); it.last = n.date; m.set(k, it);
    }
  }
  return [...m.values()].sort((a, b) => b.notes.length - a.notes.length || a.name.localeCompare(b.name));
}

/** Every note that mentions an item, newest first, with the sentence it appears in. */
export function backlinks(notes, name) {
  const k = keyOf(name), out = [];
  for (const n of [...ordered(notes)].reverse()) {
    const p = parseNote(n.text); if (!p.links.some(l => l.key === k) && !p.tags.some(t => t.key === k)) continue;
    const ctx = sentences(n.text).find(s => s.toLocaleLowerCase().includes(k)) || '';
    out.push({ id: n.id, date: n.date, context: ctx });
  }
  return out;
}

/** Rows are items, columns are sessions in date order; each cell is how often the item is mentioned in that session. */
export function matrix(notes, kind = 'theme') {
  const cols = ordered(notes), list = items(notes).filter(i => i.kind === kind);
  const rows = list.map(it => ({ name: it.name, cells: cols.map(n => { const t = String(n.text).toLocaleLowerCase(); const re = new RegExp((kind === 'theme' ? '#' : '\\[\\[') + it.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_-])', 'gu'); return (t.match(re) || []).length; }) }));
  return { columns: cols.map(n => ({ id: n.id, date: n.date })), rows };
}

/** People, events and themes as nodes; an edge when two appear in the same session (weight = sessions) or the same sentence (`close`). */
export function graph(notes) {
  const nodes = new Map(), edges = new Map();
  const node = (kind, name, key) => { const id = kind + ':' + key; if (!nodes.has(id)) nodes.set(id, { id, kind, name, count: 0 }); return nodes.get(id); };
  const edge = (a, b, close) => { if (a === b) return; const [x, y] = a < b ? [a, b] : [b, a], id = x + '|' + y, e = edges.get(id) || { source: x, target: y, sessions: 0, close: 0 }; e.sessions++; if (close) e.close++; edges.set(id, e); };
  for (const n of ordered(notes)) {
    const p = parseNote(n.text), here = [...p.links.map(l => node('entity', l.name, l.key)), ...p.tags.map(t => node('theme', t.name, t.key))];
    here.forEach(x => x.count++);
    const ids = here.map(x => x.id), seen = new Set(), near = new Set();
    for (const s of rawSentences(n.text)) { const sp = parseNote(s), sIds = [...sp.links.map(l => 'entity:' + l.key), ...sp.tags.map(t => 'theme:' + t.key)]; for (let i = 0; i < sIds.length; i++) for (let j = i + 1; j < sIds.length; j++) near.add([sIds[i], sIds[j]].sort().join('|')); }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = [ids[i], ids[j]].sort().join('|'); if (seen.has(k)) continue; seen.add(k); edge(ids[i], ids[j], near.has(k)); }
  }
  return { nodes: [...nodes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), edges: [...edges.values()].sort((a, b) => b.sessions - a.sessions) };
}

/** The items someone used to bring up and has not for a while: a prompt for the therapist, not a judgement. */
export function notRevisited(notes, { minMentions = 2, quietFor = 3 } = {}) {
  const cols = ordered(notes), pos = new Map(cols.map((n, i) => [n.id, i])), out = [];
  for (const it of items(notes)) {
    if (it.notes.length < minMentions) continue;
    const lastAt = Math.max(...it.notes.map(id => pos.get(id))), gap = cols.length - 1 - lastAt;
    if (gap >= quietFor) out.push({ name: it.name, kind: it.kind, mentions: it.notes.length, sessionsSince: gap, last: it.last });
  }
  return out.sort((a, b) => b.sessionsSince - a.sessionsSince);
}

/** A session-by-session line for the timeline: date, a short opening, the tags and links, a tone reading and any suggested themes. */
export function timeline(notes) {
  return ordered(notes).map(n => { const p = parseNote(n.text), s = sentiment(n.text); return { id: n.id, date: n.date, opening: sentences(n.text)[0] || '', people: p.links.map(l => l.name), themes: p.tags.map(t => t.name), tone: s.scored >= 3 ? Math.round(s.score * 100) / 100 : null, suggested: suggestThemes(n.text).map(x => x.theme).filter(t => !p.tags.some(x => keyOf(x.name) === t)) }; });
}

/** Everything as Markdown with [[links]] kept, so the notes open in any notes app (Obsidian included) and are never locked in. */
export function toMarkdown(client, notes) {
  const out = [`# ${normName(client)}`, ''];
  for (const n of ordered(notes)) out.push(`## ${n.date}`, '', String(n.text).trim(), '');
  return out.join('\n').trimEnd() + '\n';
}
