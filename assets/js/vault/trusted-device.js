/**
 * /assets/js/vault/trusted-device.js
 * Optional "keep me unlocked on this device". Stores the content key as a
 * NON-EXTRACTABLE CryptoKey in IndexedDB: scripts on this site can use it, but
 * the raw key bytes cannot be read out. Expires after 30 days, is bound to one
 * user, and is cleared on lock and on sign-out. Every function fails soft
 * (private windows, blocked storage) and reports "not trusted".
 */
const DB = 'sil-vault';
const STORE = 'trusted';
const DAYS = 30;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });

export async function save(userId, contentKey) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ userId, key: contentKey, expiresAt: Date.now() + DAYS * 864e5 }, 'current');
    await done(tx); db.close();
    return true;
  } catch { return false; }
}

export async function load(userId) {
  try {
    const db = await open();
    const rec = await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get('current');
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    db.close();
    if (!rec) return null;
    if (rec.userId !== userId || rec.expiresAt < Date.now()) { await clear(); return null; }
    return rec.key;
  } catch { return null; }
}

export async function clear() {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx); db.close();
  } catch { /* nothing stored, or storage unavailable */ }
}
