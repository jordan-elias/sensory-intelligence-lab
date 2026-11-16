/**
 * /assets/js/app/session.js
 * Two small comforts for guided sessions (breathing, regulation, timed journal, soundscapes, the course):
 *   - the screen stays on while a session is running (Screen Wake Lock), and is released when it stops or you leave;
 *   - a short vibration on a phone: once when a timed session ends (always), and with each breath phase if you turn that on.
 * Pages call window.SILSession.start() / end() / cue(kind). Where the browser or phone does not support something, it does nothing.
 */
import { createAwake } from './awake.js';

const awake = createAwake();
const KEY = 'sil.haptics';
const PATTERNS = { inhale: [30], exhale: [18], hold: [10], done: [140, 70, 140] };
const store = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } }, set: v => { try { localStorage.setItem(KEY, v); } catch { /* blocked */ } } };

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export const hapticsOn = () => store.get() === '1';
export const setHaptics = on => store.set(on ? '1' : '0');
export const start = () => awake.hold();
export const end = () => awake.release();
/** `done` always buzzes once (if the phone can); phase cues only when the person turned them on. */
export function cue(kind) {
  const p = PATTERNS[kind]; if (!p || !canVibrate()) return false;
  if (kind !== 'done' && !hapticsOn()) return false;
  try { return navigator.vibrate(p); } catch { return false; }
}

const api = { start, end, cue, canVibrate, hapticsOn, setHaptics, PATTERNS };
if (typeof window !== 'undefined') { window.SILSession = api; window.addEventListener('pagehide', end); }
export default api;
