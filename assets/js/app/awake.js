/**
 * /assets/js/app/awake.js
 * Keeps the screen on while a guided session is open (Screen Wake Lock). Where the browser or phone does not support it, nothing
 * happens and the screen behaves as usual. The lock is released when you leave, and taken again if you come back to the tab.
 */
export function createAwake(nav = globalThis.navigator, doc = globalThis.document) {
  let want = false, lock = null;
  const take = async () => {
    if (!want || lock || !nav?.wakeLock?.request || doc?.visibilityState === 'hidden') return;
    try { lock = await nav.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } catch { lock = null; }
  };
  doc?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'visible') take(); });
  return {
    hold() { want = true; return take(); },
    release() { want = false; const l = lock; lock = null; try { l?.release?.(); } catch { /* already released */ } },
    get held() { return !!lock; },
  };
}
