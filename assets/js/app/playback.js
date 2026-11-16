/**
 * /assets/js/app/playback.js
 * Keeps sound going with the screen off in the installed Android app, and shows the notification "SIL is playing".
 * It does not need any page to know about it: it notices when anything is really making sound (any Web Audio output, or an
 * audio/video element) and asks the native side to run a foreground service while that lasts. Silence for a while ends it.
 * Pause in the notification stops all sound. Nothing here records or sends any audio.
 */
export function createTracker({ onStart, onStop, holdMs = 20000, now = () => Date.now() }) {
  let on = false, lastSound = 0;
  return {
    report(sounding) {
      const t = now();
      if (sounding) { lastSound = t; if (!on) { on = true; onStart(); } }
      else if (on && t - lastSound >= holdMs) { on = false; onStop(); }
    },
    reset() { if (on) { on = false; onStop(); } },
    isOn: () => on,
  };
}

export const rms = buf => { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / (buf.length || 1)); };
export const AUDIBLE = 0.0005;

/** Wires the page to the native plugin `SilPlayback` (P.SilPlayback). Safe to call once per page. Returns a handle for tests. */
export function installPlayback(P, win = window) {
  const plugin = P && P.SilPlayback; if (!plugin || win.__silPlayback) return null;
  const ctxs = new Map(), media = new Set(), AN = win.AudioNode && win.AudioNode.prototype;
  // Android 13 and later only shows the notification once the person has allowed notifications; ask once, the first time sound plays.
  const ask = async () => { try { const c = await P.LocalNotifications?.checkPermissions?.(); if (c && c.display === 'prompt') await P.LocalNotifications.requestPermissions(); } catch { /* the service still runs without it */ } };
  const tracker = createTracker({ onStart: () => { ask().finally(() => plugin.start?.({ title: 'SIL is playing' })); }, onStop: () => plugin.stop?.() });

  // Listen beside every connection to the speakers, without changing the sound.
  if (AN && win.AudioDestinationNode) {
    const orig = AN.connect;
    AN.connect = function (dest, ...rest) {
      const out = orig.call(this, dest, ...rest);
      try {
        if (dest instanceof win.AudioDestinationNode) {
          const ctx = dest.context; let e = ctxs.get(ctx);
          if (!e) { const an = ctx.createAnalyser(); an.fftSize = 256; e = { an, buf: new Float32Array(an.fftSize) }; ctxs.set(ctx, e); }
          orig.call(this, e.an);
        }
      } catch { /* listening is optional */ }
      return out;
    };
  }
  const watch = el => { if (el instanceof win.HTMLMediaElement) media.add(el); };
  win.document.addEventListener('play', e => watch(e.target), true);
  for (const ev of ['pause', 'ended', 'emptied']) win.document.addEventListener(ev, e => { if (media.has(e.target) && e.target.paused) media.delete(e.target); }, true);

  const sounding = () => {
    for (const m of media) if (!m.paused && !m.muted && m.volume > 0 && !m.ended) return true;
    for (const [ctx, e] of ctxs) { if (ctx.state !== 'running') continue; e.an.getFloatTimeDomainData(e.buf); if (rms(e.buf) > AUDIBLE) return true; }
    return false;
  };
  const tick = () => tracker.report(sounding());
  const timer = win.setInterval(tick, 1000);

  // Pause in the notification: stop everything that is playing.
  plugin.addListener?.('pause', () => { for (const m of media) { try { m.pause(); } catch { /* ignore */ } } for (const ctx of ctxs.keys()) { try { ctx.suspend(); } catch { /* ignore */ } } tracker.reset(); });
  win.__silPlayback = { tracker, tick, stop: () => win.clearInterval(timer) };
  return win.__silPlayback;
}
