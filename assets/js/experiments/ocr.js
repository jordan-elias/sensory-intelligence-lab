/**
 * /assets/js/experiments/ocr.js
 * Reads the words in a photo on the person's own device with Tesseract (vendored in /assets/js/vendor/tesseract, WebAssembly).
 * The photo is never uploaded: the worker, the recognition code and the language data are all served from this site, and
 * nothing is stored (cacheMethod 'none'). It is loaded only when the person asks for it.
 */
const BASE = '/assets/js/vendor/tesseract';
export const LANGS = { 'eng+deu': 'English and German', eng: 'English', deu: 'German' };

/** Turns recognised words into the list the experiment needs: confident, readable, unique, in reading order. */
export function pickWords(words, { minConfidence = 60, max = 60 } = {}) {
  const seen = new Set(), out = [];
  for (const w of words || []) {
    if (!w || typeof w.text !== 'string' || !(w.confidence >= minConfidence)) continue;
    const t = w.text.normalize('NFC').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!/\p{L}/u.test(t) || /^\p{N}+$/u.test(t) || [...t].length < 2 || [...t].length > 24 || /[^\p{L}\p{N}'’-]/u.test(t)) continue;
    const k = t.toLocaleLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** The words of a Tesseract result in reading order, whichever shape the result has. */
export function flattenWords(data) {
  const out = [];
  for (const b of (data && data.blocks) || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) out.push(w);
  return out.length ? out : ((data && data.words) || []);
}

/** A copy of the photo no larger than `maxSide` pixels on a side, which is faster to read and loses nothing the reader can use. */
export async function prepareImage(file, maxSide = 1800) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That photo could not be opened.')); i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  } finally { URL.revokeObjectURL(url); }
}

/** Reads the words in `file`. onStatus gets short plain-language progress. Throws an Error with a message fit to show. */
export async function readPhotoWords(file, lang = 'eng+deu', onStatus = () => {}) {
  if (!LANGS[lang]) lang = 'eng+deu';
  onStatus('Opening the photo…');
  const canvas = await prepareImage(file);
  let worker;
  try {
    onStatus('Loading the reader (first time only, a few megabytes from this site)…');
    const T = (await import(BASE + '/tesseract.esm.min.js')).default;
    worker = await T.createWorker(lang, 1, {
      workerPath: BASE + '/worker.min.js', corePath: BASE + '/core', langPath: BASE + '/lang', workerBlobURL: false, cacheMethod: 'none', gzip: true,
      logger: m => { if (m && m.status === 'recognizing text') onStatus('Reading the words… ' + Math.round((m.progress || 0) * 100) + '%'); },
    });
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    return pickWords(flattenWords(data));
  } catch (e) {
    throw new Error('The words could not be read automatically. You can type what you see.');
  } finally { try { if (worker) await worker.terminate(); } catch { /* nothing to clean up */ } }
}
