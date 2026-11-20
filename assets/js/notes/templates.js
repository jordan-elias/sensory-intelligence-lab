/**
 * /assets/js/notes/templates.js
 * Starting structures for a session note. A template is only text that is put into the note box; the note is still written,
 * encrypted and saved like any other. The therapist's own templates are kept on this device only (localStorage), never sent anywhere.
 */
export const BUILTIN = [
  { id: 'brief', name: 'Short session note', text: 'Focus today:\n\nWhat came up:\n\nWhat I noticed:\n\nNext time:\n' },
  { id: 'first', name: 'First session', text: 'Reason for coming, in their words:\n\nWhat they hope will change:\n\nBackground and what matters now:\n\nSafety and risk:\n\nAgreements made:\n\nPlan for next session:\n' },
  { id: 'soap', name: 'SOAP', text: 'S (what they told me):\n\nO (what I observed):\n\nA (my assessment):\n\nP (plan):\n' },
  { id: 'dap', name: 'DAP', text: 'Data (what happened in the session):\n\nAssessment:\n\nPlan:\n' },
  { id: 'between', name: 'After the shared check-ins', text: 'What they shared since last time:\n\nPatterns I see:\n\nWhat to bring into the session:\n' },
];

const KEY = 'sil.therapist.noteTemplates.v1', MAXN = 20, MAXLEN = 4000;

/** Reads the therapist's own templates from a Storage-like object. Never throws. */
export function loadMine(store) {
  try {
    const a = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter(t => t && typeof t.name === 'string' && typeof t.text === 'string').slice(0, MAXN).map((t, i) => ({ id: 'mine:' + i, name: t.name.slice(0, 60), text: t.text.slice(0, MAXLEN), mine: true })) : [];
  } catch { return []; }
}
/** Adds or replaces (by name) one of the therapist's templates. Returns false if there is nothing to save. */
export function saveMine(store, name, text) {
  name = String(name || '').trim().slice(0, 60); text = String(text || '').slice(0, MAXLEN);
  if (!name || !text.trim()) return false;
  const rest = loadMine(store).filter(t => t.name.toLowerCase() !== name.toLowerCase()).map(({ name, text }) => ({ name, text }));
  try { store.setItem(KEY, JSON.stringify([...rest, { name, text }].slice(-MAXN))); return true; } catch { return false; }
}
export function removeMine(store, name) {
  try { store.setItem(KEY, JSON.stringify(loadMine(store).filter(t => t.name !== name).map(({ name, text }) => ({ name, text })))); return true; } catch { return false; }
}
/** Puts the template into the note: replaces an empty box, otherwise adds it below what is already written. */
export const applyTemplate = (current, tpl) => (String(current || '').trim() ? String(current).replace(/\s+$/, '') + '\n\n' + tpl.text : tpl.text);
