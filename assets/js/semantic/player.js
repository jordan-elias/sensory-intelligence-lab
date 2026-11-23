/**
 * /assets/js/semantic/player.js
 * Plays a Composed plan (see compose.js). One lookahead scheduler on the audio clock, so the timing is steady even when the page is
 * busy or in the background; the five voices on their own buses (balanced by the Voice mix slider), a drone, and one reverb whose
 * size and wetness follow the text's entropy. The same synth as Ambience.
 */
import { makeSynth } from '../ambience/synth.js';
import { midiHz } from '../ambience/music.js';
import { beatToSec } from './compose.js';

const LOOKAHEAD = 0.25, HIDDEN_LOOKAHEAD = 2.5, TICK_MS = 25, TAIL = 4;
const SEND = [0.5, 0.7, 0.8, 0.3, 0.4];   // reverb send per voice: melody, predictions, pad, bass and colour, drone

/** The balance between the foreground voices (melody, bass, colour) and the harmony voices (predictions, pad, drone). 0 to 1; 0.5 is even. */
export const mixGains = m => { const x = Math.max(0, Math.min(1, Number.isFinite(m) ? m : 0.5)); return { fg: Math.min(1.6, 2 * (1 - x)), harmony: Math.min(1.6, 2 * x) }; };

export function createPlayer({ ctx, out, rand = Math.random, doc = globalThis.document, timers = true }) {
  const synth = makeSynth(ctx);
  let session = null, mix = 0.5, timer = null;

  const busGain = v => { const g = mixGains(mix); return v === 1 || v === 4 ? g.fg : g.harmony; };
  function impulse(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (rand() * 2 - 1) * (1 - i / n) ** 2.6; }
    return ir;
  }
  function build(plan, t0) {
    const entropy = plan.key.entropy ?? 0.5, master = ctx.createGain(), dry = ctx.createGain(), conv = ctx.createConvolver(), wet = ctx.createGain();
    master.connect(out); dry.gain.value = 0.85; dry.connect(master); conv.buffer = impulse(1.8 + entropy * 2.7); wet.gain.value = 0.28 + 0.25 * entropy; conv.connect(wet); wet.connect(master);
    const buses = [null];
    for (let v = 1; v <= 5; v++) { const b = ctx.createGain(), send = ctx.createGain(); b.gain.value = busGain(v); send.gain.value = SEND[v - 1]; b.connect(dry); b.connect(send); send.connect(conv); buses.push(b); }
    const s = { master, buses, plan, t0, nodes: [], drone: null, idx: 0, done: false, hooks: {} };
    if (plan.drone) {   // a low drone on the tonic and fifth, brighter when the text is richer
      const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 160 + entropy * 500; lp.Q.value = 0.7; lp.connect(g); g.connect(buses[5]);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.09 + 0.05 * entropy, t0 + 2.5);
      const oscs = plan.drone.midi.map((m, i) => { const o = ctx.createOscillator(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.value = midiHz(m); o.detune.value = i ? 4 : -4; o.connect(lp); o.start(t0); return o; });
      s.drone = { g, oscs };
    }
    return s;
  }
  const secOf = (s, beat) => s.t0 + beatToSec(beat, s.plan.bpm, s.plan.ritStart, s.plan.endBeat);

  function playEvent(s, e) {
    const t = secOf(s, e.beat), p = ctx.createStereoPanner(); p.pan.value = e.pan || 0; p.connect(s.buses[e.voice]);
    const durSec = Math.max(0.05, secOf(s, e.beat + e.dur) - t), f = synth[e.kind] || synth.pluck;
    for (const m of e.midi) f(p, t, midiHz(m), durSec, e.vel);
    if (timers && s.hooks) { const ms = Math.max(0, (t - ctx.currentTime) * 1000); setTimeout(() => { if (s === session) { if (e.voice === 1 && e.word !== undefined && s.hooks.onWord) s.hooks.onWord(e.word, e.beat); if (s.hooks.onVoice) s.hooks.onVoice(e.voice, e.vel, e); } }, ms); }
  }
  function endDrone(s, at) { if (s.drone) { s.drone.g.gain.cancelScheduledValues(at); s.drone.g.gain.setTargetAtTime(0.0001, at, 0.8); for (const o of s.drone.oscs) { try { o.stop(at + 4); } catch { /* already stopped */ } } } }

  const api = {
    setMix(m) { mix = m; if (session) for (let v = 1; v <= 5; v++) session.buses[v].gain.setTargetAtTime(busGain(v), ctx.currentTime, 0.05); },
    get playing() { return !!session && !session.done; },
    /** Starts a plan. hooks: onWord(wordIndex, beat), onVoice(voice, level, event), onEnd(). */
    play(plan, hooks = {}) {
      api.stop(0.1);
      const s = session = build(plan, ctx.currentTime + 0.2); s.hooks = hooks;
      const look = () => (doc && doc.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD), end = secOf(s, plan.endBeat);
      const pump = () => {
        if (s !== session) return clearInterval(timer);
        while (s.idx < plan.events.length && secOf(s, plan.events[s.idx].beat) < ctx.currentTime + look()) playEvent(s, plan.events[s.idx++]);
        if (s.idx >= plan.events.length && !s.dronEnded) { s.dronEnded = true; endDrone(s, end); }
        if (s.idx >= plan.events.length && ctx.currentTime > end + TAIL) { clearInterval(timer); s.done = true; if (hooks.onEnd) hooks.onEnd(); }
      };
      if (timers) { timer = setInterval(pump, TICK_MS); pump(); }
      return s;
    },
    stop(fade = 0.4) {
      const s = session; if (!s) return; session = null; clearInterval(timer);
      const now = ctx.currentTime; s.master.gain.cancelScheduledValues(now); s.master.gain.setValueAtTime(s.master.gain.value, now); s.master.gain.linearRampToValueAtTime(0, now + fade);
      if (s.drone) for (const o of s.drone.oscs) { try { o.stop(now + fade + 0.1); } catch { /* already stopped */ } }
      if (timers) setTimeout(() => { try { s.master.disconnect(); } catch { /* gone */ } }, (fade + 0.3) * 1000);
    },
    /** Schedules the whole plan at once (for an OfflineAudioContext or an export). Returns the time it ends. */
    renderAll(plan, t0 = 0.1) {
      const s = session = build(plan, t0); for (const e of plan.events) playEvent(s, e); endDrone(s, secOf(s, plan.endBeat)); return secOf(s, plan.endBeat) + TAIL;
    },
  };
  return api;
}
