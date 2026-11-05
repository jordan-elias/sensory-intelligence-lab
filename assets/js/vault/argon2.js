/**
 * /assets/js/vault/argon2.js
 * Runs the vendored hash-wasm Argon2id from our own origin (never a CDN).
 * In a browser it uses a Web Worker so the page stays responsive; if a worker
 * cannot start it falls back to the main thread. In Node (tests) assign
 * globalThis.hashwasm first.
 */
let mainLoad = null;
let worker = null;            // null = not tried, false = unavailable
const pending = new Map();
let nextId = 1;

function loadMain() {
  if (globalThis.hashwasm && globalThis.hashwasm.argon2id) return Promise.resolve(globalThis.hashwasm);
  if (mainLoad) return mainLoad;
  mainLoad = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Argon2 is not loaded. In Node, assign globalThis.hashwasm before use.'));
      return;
    }
    const s = document.createElement('script');
    s.src = '/assets/js/vendor/hash-wasm-argon2.umd.min.js';
    s.onload = () => (globalThis.hashwasm && globalThis.hashwasm.argon2id)
      ? resolve(globalThis.hashwasm) : reject(new Error('Argon2 loaded but not available'));
    s.onerror = () => { mainLoad = null; reject(new Error('Could not load Argon2')); };
    document.head.appendChild(s);
  });
  return mainLoad;
}

function getWorker() {
  if (worker !== null) return worker;
  if (typeof Worker === 'undefined' || typeof document === 'undefined') { worker = false; return worker; }
  try {
    worker = new Worker('/assets/js/vault/argon2.worker.js');
    worker.onmessage = (e) => {
      const { id, out, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(new Uint8Array(out));
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error('worker-failed'));
      pending.clear();
      worker = false;
    };
  } catch { worker = false; }
  return worker;
}

function viaWorker(w, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, params });
  });
}

/** @returns {Promise<Uint8Array>} raw hash bytes */
export async function argon2id({ password, salt, memoryKiB, iterations, parallelism, hashLength = 32 }) {
  const w = getWorker();
  if (w) {
    try {
      return await viaWorker(w, { password, salt, memorySize: memoryKiB, iterations, parallelism, hashLength });
    } catch (e) {
      if (e.message !== 'worker-failed') throw e;     // real errors surface; only a dead worker falls back
    }
  }
  const hw = await loadMain();
  return hw.argon2id({ password, salt, memorySize: memoryKiB, iterations, parallelism, hashLength, outputType: 'binary' });
}
