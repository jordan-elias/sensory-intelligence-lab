/**
 * /assets/js/notes/parse.js
 * Reads the light markup a therapist types in a note: [[Name]] links a person, event or place, #theme tags a theme.
 * Pure text in, plain objects out. Everything here runs on the device; nothing is sent anywhere.
 */
const LINK = /\[\[([^\[\]\n|]{1,60})(?:\|([^\[\]\n]{1,60}))?\]\]/g;
const TAG = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,40})/gu;

export const normName = s => String(s).trim().replace(/\s+/g, ' ');
export const keyOf = s => normName(s).toLocaleLowerCase();

/** Links and tags in a note. Names keep the writer's spelling; `key` is the lower-case form used to match them. */
export function parseNote(text) {
  const t = String(text || ''), links = new Map(), tags = new Map();
  for (const m of t.matchAll(LINK)) { const name = normName(m[1]); if (name && !links.has(keyOf(name))) links.set(keyOf(name), name); }
  for (const m of t.matchAll(TAG)) { const name = m[2].replace(/[-_]+$/, ''); if (!tags.has(keyOf(name))) tags.set(keyOf(name), name); }
  return { links: [...links].map(([key, name]) => ({ key, name })), tags: [...tags].map(([key, name]) => ({ key, name })) };
}

/** The note as plain words: link brackets and tag hashes removed so they count as the words they are. */
export const plain = text => String(text || '').replace(LINK, (_, a, b) => b || a).replace(TAG, (_, p, w) => p + w.replace(/[-_]/g, ' '));

/** Sentences (split on . ! ? and line breaks), for finding what is mentioned together. */
export const sentences = text => plain(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);

/** Sentences of the raw note, markup intact, so links and tags can be found within each one. */
export const rawSentences = text => String(text || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
