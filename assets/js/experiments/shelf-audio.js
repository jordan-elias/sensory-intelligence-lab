/**
 * /assets/js/experiments/shelf-audio.js
 * Recordings kept from the course are stored in this browser (IndexedDB), on this device only. They are never uploaded or synced.
 * If the browser blocks storage, saving reports it instead of pretending.
 */
const DB = 'sil-course', STORE = 'audio';
const open = () => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no storage'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('storage blocked'));
});
const tx = async (mode, fn) => { const db = await open(); try { return await new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); }); } finally { db.close(); } };

export const putAudio = (id, blob) => tx('readwrite', s => s.put(blob, id));
export const getAudio = id => tx('readonly', s => s.get(id));
export const deleteAudio = id => tx('readwrite', s => s.delete(id));
