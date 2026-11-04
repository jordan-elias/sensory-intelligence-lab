/**
 * /assets/js/worksheets/autosave.js
 * Debounced, serialized autosave.
 *  - one save in flight at a time; later changes queue a single follow-up save
 *  - flushes when the tab is hidden or closed
 *  - retries after failures / when the browser comes back online
 *  - pauses on a conflict (entry changed on another device) until resolved
 */
export function createAutosaver({ save, onStatus, delay = 1500 }) {
  let timer = null;
  let inFlight = null;
  let queued = false;
  let paused = false;
  let retryTimer = null;
  let dirty = false;

  const status = (state, detail) => onStatus && onStatus(state, detail);

  async function run() {
    if (paused) return;
    if (inFlight) { queued = true; return inFlight; }
    if (!dirty) return;
    dirty = false;
    status('saving');
    inFlight = (async () => {
      try {
        const result = await save();
        if (result === 'skipped') { status('idle'); return; }
        status('saved', new Date());
      } catch (err) {
        dirty = true;
        if (err && err.name === 'ConflictError') {
          paused = true;
          status('conflict', err);
        } else {
          status('error', err);
          scheduleRetry();
        }
      } finally {
        inFlight = null;
        if (queued && !paused) { queued = false; run(); }
      }
    })();
    return inFlight;
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (dirty) run(); }, 15000);
  }

  function markDirty() {
    dirty = true;
    if (paused) return;
    status('pending');
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  async function flush() {
    clearTimeout(timer);
    if (dirty) await run();
    if (inFlight) await inFlight;
  }

  const onVisibility = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); if (dirty) run(); } };
  const onPageHide = () => { clearTimeout(timer); if (dirty) run(); };
  const onOnline = () => { if (dirty) run(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('online', onOnline);

  // Warn only if something is genuinely unsaved.
  window.addEventListener('beforeunload', e => {
    if (dirty || inFlight) { e.preventDefault(); e.returnValue = ''; }
  });

  return {
    markDirty,
    flush,
    resume() { paused = false; if (dirty) run(); },
    get hasUnsaved() { return dirty || !!inFlight; },
  };
}
