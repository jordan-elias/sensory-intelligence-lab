/**
 * /assets/js/therapist/doc-render.js
 * Shows a shared worksheet read-only. Field names are tidied into readable labels, values are
 * always set as text (never as markup), and nested content (lists, chapters) is shown in order.
 */
export const WORKSHEET_LABEL = {
  coping: 'Coping', 'goals-values': 'Goals and values', goals: 'Goals and values', interpersonal: 'Interpersonal',
  'lyric-analysis': 'Lyric analysis', 'music-autobiography': 'Music autobiography', 'session-reflection': 'Session reflection',
};
export const worksheetLabel = t => WORKSHEET_LABEL[t] || String(t || 'Worksheet').replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());

/** "q1_feelings" -> "Q1 feelings" */
export function prettyKey(k) {
  const t = String(k).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

/** Turns a value into a list of { label, text, children } rows, skipping empty answers. */
export function toRows(value, depth = 0) {
  if (isEmpty(value)) return [];
  if (typeof value !== 'object') return [{ label: null, text: String(value), children: [] }];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => {
      if (isEmpty(v)) return [];
      if (typeof v !== 'object') return [{ label: null, text: String(v), children: [] }];
      return [{ label: `${i + 1}`, text: null, children: depth < 6 ? toRows(v, depth + 1) : [] }];
    });
  }
  return Object.entries(value).flatMap(([k, v]) => {
    if (isEmpty(v)) return [];
    if (typeof v !== 'object') return [{ label: prettyKey(k), text: String(v), children: [] }];
    return [{ label: prettyKey(k), text: null, children: depth < 6 ? toRows(v, depth + 1) : [] }];
  });
}

/** Builds DOM for the rows. Text only, so nothing a client typed can run as code. */
export function renderRows(doc, rows) {
  const dl = doc.createElement('dl'); dl.className = 'th-doc';
  for (const r of rows) {
    if (r.label) { const dt = doc.createElement('dt'); dt.textContent = r.label; dl.appendChild(dt); }
    const dd = doc.createElement('dd');
    if (r.text !== null) dd.textContent = r.text;
    if (r.children.length) dd.appendChild(renderRows(doc, r.children));
    dl.appendChild(dd);
  }
  return dl;
}
