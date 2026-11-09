/**
 * assets/js/audio/safe-output.js
 *
 * Loaded as a plain script (before the page's own scripts) on every page that makes sound.
 * Anything a page connects to the speakers is quietly routed through one shared safety stage:
 *
 *   sound -> input -> master level -> limiter -> trim -> soft ceiling -> speakers
 *
 * - The master level leaves headroom, so adding up many voices does not jump in volume.
 * - The limiter (a fast compressor) squashes sudden peaks.
 * - The soft ceiling guarantees the output can never reach full scale, whatever the page does.
 * - Every new audio context fades in over a quarter of a second, so starting never clicks or startles.
 * - The first time on a device, a short note asks people to start with the volume low.
 *
 * Offline renders (for exporting files) are never touched.
 *
 * It also looks after audio when the phone sleeps or the tab is hidden:
 * - A context that the system suspended or interrupted (screen lock, a call) is resumed when the
 *   person comes back, unless the page itself paused it on purpose.
 * - Pages that do not need instant response run with the 'playback' latency hint (set
 *   window.SIL_AUDIO_LATENCY = 'playback' before this script), which is kinder to the battery and
 *   avoids glitches during long sessions.
 * - silAudio.mediaSession() gives lock-screen and headset controls where the browser supports them.
 *
 * Pages need no changes. For stopping gracefully they can call window.silAudio.fadeOut(ctx).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.silAudio || typeof AudioNode === 'undefined') return;

  var MASTER_LEVEL = 0.7;   // about -3 dB of headroom
  var CEILING = 0.9;        // output never exceeds this (about -0.9 dB below full scale)
  // The browser's limiter adds automatic make-up gain (about 1.76x with these settings). This trim
  // takes it back out, so sounds below the limiter threshold keep their intended relative level.
  var LIMITER_TRIM = 0.57;
  var FADE_IN = 0.25;       // seconds
  var NOTICE_KEY = 'sil-headphone-notice-v1';

  var origConnect = AudioNode.prototype.connect;
  var origDisconnect = AudioNode.prototype.disconnect;
  var buses = new WeakMap();

  function softClipCurve() {
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = CEILING * Math.tanh(x / CEILING); }
    return c;
  }

  function busFor(ctx) {
    var bus = buses.get(ctx);
    if (bus) return bus;
    var input = ctx.createGain();
    var master = ctx.createGain();
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    var trim = ctx.createGain();
    trim.gain.value = LIMITER_TRIM;
    var clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    origConnect.call(input, master);
    origConnect.call(master, limiter);
    origConnect.call(limiter, trim);
    origConnect.call(trim, clip);
    origConnect.call(clip, ctx.destination);
    var t = ctx.currentTime;
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(MASTER_LEVEL, t + FADE_IN);
    bus = { input: input, master: master, limiter: limiter, trim: trim, clip: clip };
    buses.set(ctx, bus);
    if (!isOffline(ctx)) showNoticeOnce();
    return bus;
  }

  function isOffline(ctx) { return typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext; }

  // Only live playback is routed through the safety stage. Offline renders (used to make exported
  // files) are left exactly as the page built them, so exports are never altered.
  function isDestination(node) {
    return typeof AudioDestinationNode !== 'undefined' && node instanceof AudioDestinationNode && !isOffline(node.context);
  }

  AudioNode.prototype.connect = function (dest) {
    if (isDestination(dest)) {
      var bus = busFor(dest.context);
      var rest = Array.prototype.slice.call(arguments, 1);
      origConnect.apply(this, [bus.input].concat(rest));
      return bus.input;
    }
    return origConnect.apply(this, arguments);
  };

  AudioNode.prototype.disconnect = function (dest) {
    if (isDestination(dest)) {
      var bus = buses.get(dest.context);
      if (bus) { var rest = Array.prototype.slice.call(arguments, 1); return origDisconnect.apply(this, [bus.input].concat(rest)); }
    }
    return origDisconnect.apply(this, arguments);
  };

  function ramp(ctx, to, seconds) {
    var bus = busFor(ctx), g = bus.master.gain, t = ctx.currentTime;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + Math.max(0.01, seconds));
  }

  function showNoticeOnce() {
    try { if (localStorage.getItem(NOTICE_KEY)) return; localStorage.setItem(NOTICE_KEY, '1'); } catch (e) { /* show it every time if storage is blocked */ }
    function build() {
      if (!document.body || document.getElementById('silHeadphoneNotice')) return;
      var box = document.createElement('div');
      box.id = 'silHeadphoneNotice';
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100000;max-width:min(92vw,460px);' +
        'background:#1c1f26;color:#f3f1ec;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:12px 14px;' +
        'font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.4);display:flex;gap:12px;align-items:flex-start;';
      var msg = document.createElement('span');
      msg.textContent = 'Sound is on. Headphones are recommended. Start with your device volume low and raise it slowly.';
      var btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = 'Got it';
      btn.style.cssText = 'flex:none;background:#f3f1ec;color:#1c1f26;border:0;border-radius:8px;padding:6px 12px;font:inherit;font-weight:600;cursor:pointer;';
      btn.addEventListener('click', function () { box.remove(); });
      box.appendChild(msg); box.appendChild(btn);
      document.body.appendChild(box);
    }
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────────── */
  var live = [];
  var NativeAC = window.AudioContext || window.webkitAudioContext;

  function track(ctx) {
    live.push(ctx);
    var nativeSuspend = ctx.suspend.bind(ctx), nativeResume = ctx.resume.bind(ctx);
    ctx.suspend = function () { ctx.__silPausedByPage = true; return nativeSuspend(); };
    ctx.resume = function () { ctx.__silPausedByPage = false; return nativeResume(); };
    ctx.__silNativeResume = nativeResume;
    ctx.addEventListener('statechange', function () { if (ctx.state === 'running') ctx.__silWasRunning = true; });
  }

  function recover() {
    live.forEach(function (ctx) {
      if (ctx.state === 'closed' || ctx.__silPausedByPage || !ctx.__silWasRunning) return;
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        var p = ctx.__silNativeResume(); if (p && p.catch) p.catch(function () { /* needs a tap first; the tap listener below retries */ });
      }
    });
  }

  if (NativeAC) {
    var SilAudioContext = function (options) {
      options = options || {};
      if (options.latencyHint === undefined) options.latencyHint = window.SIL_AUDIO_LATENCY || 'interactive';
      var ctx = new NativeAC(options);
      track(ctx);
      return ctx;
    };
    SilAudioContext.prototype = NativeAC.prototype;
    window.AudioContext = SilAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = SilAudioContext;
  }

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') recover(); });
  window.addEventListener('pageshow', recover);
  // Some phones only allow resuming after a touch, so the first touch back also tries.
  document.addEventListener('pointerdown', recover, { passive: true });

  window.silAudio = {
    MASTER_LEVEL: MASTER_LEVEL,
    CEILING: CEILING,
    busFor: busFor,
    /** Fade everything to silence, then resolve (use before stopping or closing a context). */
    fadeOut: function (ctx, seconds) {
      seconds = seconds == null ? 0.3 : seconds;
      ramp(ctx, 0, seconds);
      return new Promise(function (res) { setTimeout(res, seconds * 1000 + 30); });
    },
    /**
     * Lock-screen and headset controls, where the browser supports them.
     * opts: { title, artist, play(), pause(), stop() }. Returns { state('playing'|'paused'|'none') }.
     */
    mediaSession: function (opts) {
      opts = opts || {};
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return { state: function () {} };
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: opts.title || document.title, artist: opts.artist || 'Sensory Intelligence Lab' });
        ['play', 'pause', 'stop'].forEach(function (a) { if (typeof opts[a] === 'function') navigator.mediaSession.setActionHandler(a, opts[a]); });
      } catch (e) { /* unsupported action; ignore */ }
      return { state: function (s) { try { navigator.mediaSession.playbackState = s; } catch (e) { /* ignore */ } } };
    },
    /** Bring the level back after a fadeOut. */
    fadeIn: function (ctx, seconds) { ramp(ctx, MASTER_LEVEL, seconds == null ? FADE_IN : seconds); }
  };
})();
