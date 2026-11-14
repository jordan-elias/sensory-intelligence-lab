/**
 * /assets/js/notes/caseload.js
 * The view across a therapist's own clients: which themes run through the caseload, which sessions have no note yet,
 * and which clients have not been written up for a while. Pure functions over notes already opened on the therapist's device.
 * People are never matched across clients: two clients who both mention "Anna" are two different Annas, so only themes
 * (which are topics, not people) are compared, and only as counts per client.
 */
import { items } from './graph.js';
import { suggestThemes } from './analysis.js';
import { parseNote } from './parse.js';

const DAY = 86400000, dayOf = v => String(v).slice(0, 10), ms = v => new Date(dayOf(v) + 'T00:00:00Z').getTime();

/** Sessions (tagged or suggested) per theme per client. Returns the themes seen in most clients first. */
export function themeTable(clients, { top = 12 } = {}) {
  const per = clients.map(c => {
    const m = new Map();
    const add = (key, name) => { const x = m.get(key) || { name, n: 0 }; x.n++; m.set(key, x); };
    for (const n of c.notes) { const tagged = new Set(parseNote(n.text).tags.map(t => t.key)); for (const t of parseNote(n.text).tags) add(t.key, t.name); for (const s of suggestThemes(n.text)) { const k = String(s.theme).toLocaleLowerCase(); if (!tagged.has(k)) add(k, s.theme); } }
    return m;
  });
  const all = new Map();
  per.forEach(m => { for (const [k, v] of m) { const x = all.get(k) || { key: k, name: v.name, clients: 0, sessions: 0 }; x.clients++; x.sessions += v.n; all.set(k, x); } });
  const themes = [...all.values()].sort((a, b) => b.clients - a.clients || b.sessions - a.sessions || a.name.localeCompare(b.name)).slice(0, top);
  return { themes, rows: clients.map((c, i) => ({ id: c.id, name: c.name, cells: themes.map(t => (per[i].get(t.key) || { n: 0 }).n) })) };
}

/** Past, not cancelled session days with no note dated from that day to `within` days after. Newest first. */
export function unwrittenSessions(sessions, notes, now = new Date(), { within = 3 } = {}) {
  const have = notes.filter(n => (n.kind || 'note') === 'note').map(n => ms(n.date));
  const seen = new Set(), out = [];
  for (const s of sessions || []) {
    if (!s.scheduled_at || s.status === 'cancelled' || new Date(s.scheduled_at).getTime() > now.getTime()) continue;
    const d = dayOf(s.scheduled_at); if (seen.has(d)) continue; seen.add(d);
    const t = ms(d); if (!have.some(h => h >= t && h <= t + within * DAY)) out.push(d);
  }
  return out.sort().reverse();
}

/** Clients whose newest note is older than `days` (or who have none). Newest-written first, never-written last. */
export function quietClients(clients, now = new Date(), days = 45) {
  return clients.map(c => { const ds = c.notes.filter(n => (n.kind || 'note') === 'note').map(n => dayOf(n.date)).sort(); const last = ds[ds.length - 1] || null; return { id: c.id, name: c.name, last, since: last ? Math.floor((now.getTime() - ms(last)) / DAY) : null }; })
    .filter(x => x.since === null || x.since >= days).sort((a, b) => (a.since ?? 1e9) - (b.since ?? 1e9));
}

/** The caseload at a glance: counts only, no text. */
export function summary(clients) { return { clients: clients.length, notes: clients.reduce((a, c) => a + c.notes.filter(n => (n.kind || 'note') === 'note').length, 0), people: clients.reduce((a, c) => a + items(c.notes).filter(i => i.kind === 'entity').length, 0) }; }
