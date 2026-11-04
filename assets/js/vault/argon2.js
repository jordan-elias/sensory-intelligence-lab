/**
 * /assets/js/vault/argon2.js
 * Loads the vendored hash-wasm Argon2 build from our own origin (never a CDN)
 * and exposes argon2id(). In Node (tests) set globalThis.hashwasm first.
 */
let loading = null;

function load() {
  if (globalThis.hashwasm && globalThis.hashwasm.argon2id) return Promise.resolve(globalThis.hashwasm);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Argon2 is not loaded. In Node, assign globalThis.hashwasm before use.'));
      return;
    }
    const s = document.createElement('script');
    s.src = '/assets/js/vendor/hash-wasm-argon2.umd.min.js';
    s.onload = () => (globalThis.hashwasm && globalThis.hashwasm.argon2id)
      ? resolve(globalThis.hashwasm)
      : reject(new Error('Argon2 loaded but not available'));
    s.onerror = () => { loading = null; reject(new Error('Could not load Argon2')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** @returns {Promise<Uint8Array>} raw hash bytes */
export async function argon2id({ password, salt, memoryKiB, iterations, parallelism, hashLength = 32 }) {
  const hw = await load();
  return hw.argon2id({
    password, salt,
    memorySize: memoryKiB, iterations, parallelism,
    hashLength, outputType: 'binary',
  });
}
