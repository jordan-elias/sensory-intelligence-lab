/**
 * /assets/js/notes/import.js
 * Reads a Markdown file of session notes (the same shape the Record tab exports: "# Name", then "## 2026-03-04" and the note)
 * into notes the therapist can check before anything is saved. Pure: it reads text and returns text. Nothing is stored or sent.
 */
export const MAX_NOTE = 20000;   // same limit as a note typed in the app

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?![\d])/;
const DOT = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?![\d])/;           // 04.03.2026
const pad = n => String(n).padStart(2, '0');
const valid = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/** A date at the start of a heading ("2026-03-04", "2026-03-04 – second session", "04.03.2026") → { date, rest }, or null. */
export function headingDate(h) {
  const s = String(h || '').trim().replace(/^[\[(]\s*/, '');
  let m = s.match(ISO), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(DOT))) { y = +m[3]; mo = +m[2]; d = +m[1]; }
  else return null;
  if (!valid(y, mo, d)) return null;
  return { date: `${y}-${pad(mo)}-${pad(d)}`, rest: s.slice(m[0].length).replace(/^[\])\s:–—-]+/, '').trim() };
}

/**
 * @param {string} md       the file's text
 * @param {{existing?: {date:string,text:string}[], today?: string}} opts   existing notes (to spot copies), today's date for undated files
 * @returns {{title:string, notes:{date:string,text:string,dup:boolean,tooLong:boolean}[], skipped:string[], undated:boolean}}
 */
export function parseMarkdownRecord(md, { existing = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  let text = String(md ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '');                              // front matter from a notes app
  const lines = text.split('\n'), sections = []; let title = '', cur = null, fence = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const h2 = !fence && line.match(/^##\s+(.*)$/), h1 = !fence && line.match(/^#\s+(.*)$/);
    if (h1 && !cur && !title) { title = h1[1].trim(); continue; }
    if (h2) { cur = { heading: h2[1].trim(), body: [] }; sections.push(cur); continue; }
    if (cur) cur.body.push(line); else if (!h1) (sections.pre ||= []).push(line);
  }
  const have = new Set(existing.map(n => `${n.date}\n${String(n.text || '').trim()}`));
  const notes = [], skipped = []; let undated = false;
  for (const s of sections) {
    const hd = headingDate(s.heading), body = s.body.join('\n').trim();
    if (!hd) { if (s.heading || body) skipped.push(s.heading || '(no heading)'); continue; }
    const t = [hd.rest, body].filter(Boolean).join('\n\n').trim();
    if (!t) continue;
    notes.push({ date: hd.date, text: t, dup: have.has(`${hd.date}\n${t}`), tooLong: t.length > MAX_NOTE });
  }
  if (!notes.length && !sections.length) {                                       // no headings at all: one note, dated today
    const t = (sections.pre || []).join('\n').trim() || '';
    if (t) { undated = true; notes.push({ date: today, text: t, dup: have.has(`${today}\n${t}`), tooLong: t.length > MAX_NOTE }); }
  }
  return { title, notes, skipped, undated };
}
