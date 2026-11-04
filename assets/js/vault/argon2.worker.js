/* Runs Argon2id off the main thread so the page does not freeze. Same-origin only. */
self.importScripts('/assets/js/vendor/hash-wasm-argon2.umd.min.js');
self.onmessage = async (e) => {
  const { id, params } = e.data;
  try {
    const out = await self.hashwasm.argon2id({ ...params, outputType: 'binary' });
    self.postMessage({ id, out: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
