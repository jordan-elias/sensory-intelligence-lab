/**
 * /assets/js/experiments/steps.js
 * Decides which tools belong with which step, finds the time a step asks for, and builds the "before you begin" list.
 * Pure. The catalog can override the guesses for any experiment with `stepTools: [[toolIndex, ...], ...]` (one list per step).
 * Whatever is not shown with the current step stays one tap away under "Your other tools", so no tool is ever out of reach.
 */
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };
const num = s => (s in WORDS ? WORDS[s] : parseFloat(s));
const NUM = '(\\d+(?:\\.\\d+)?|' + Object.keys(WORDS).join('|') + ')';

/** Seconds a step asks you to spend, or 0. "Record a clip of 5 to 20 seconds" is a length, not a time to wait, so it is ignored. */
export function parseTimer(step) {
  const t = String(step || '').toLowerCase();
  if (/\b\d+\s*to\s*\d+\s*(seconds?|minutes?)/.test(t)) return 0;
  const lead = new RegExp(`\\b(?:for|exactly|over|during|within|after|next)\\s+(?:the\\s+)?(?:whole\\s+)?${NUM}\\s*(seconds?|secs?|minutes?|mins?)\\b`);
  const paren = /\((\d+)\s*seconds?\)/, tail = new RegExp(`${NUM}\\s*(seconds?|minutes?)\\.?\\s*$`);
  let m = t.match(lead);
  if (m) return Math.round(num(m[1]) * (/^m/.test(m[2]) ? 60 : 1));
  m = t.match(paren); if (m) return +m[1];
  m = t.match(tail); if (m) return Math.round(num(m[1]) * (/^m/.test(m[2]) ? 60 : 1));
  if (/\bfor the whole minute\b/.test(t)) return 60;
  return 0;
}
export const fmtClock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** Tools that every step works on (the clip you loaded, the loops, the poem). They stay with the step the whole time. */
const WORKBENCH = new Set(['clip', 'loops', 'assign', 'wordpoem', 'burn', 'blackout', 'cards', 'roll', 'sampler', 'treat', 'pad', 'bench', 'marks', 'subtract']);
const ROLL = /\b(roll|rolled|draw|drawn)\b/i, PICK = /\b(pick|choose|generate)\b/i, RHYTHM = /\b(metronome|bpm|rhythm|groove|beats?|loops?|pulse)\b/i;

/**
 * For each step, the indexes (into e.tools) shown with it. Timer tools are never placed: the step's own time is shown inline and
 * the long session timer sits under "Your other tools".
 */
/** The experiment's tools, plus the workbench where notes are drawn: it lets the person put them on a rhythm and hear the result. */
export function toolsFor(e) {
  const tools = e.tools || [];
  const notes = tools.some(t => t.type === 'gen' && (t.kind === 'notes' || t.kind === 'degrees'));
  return notes && !tools.some(t => t.type === 'bench') ? [...tools, { type: 'bench', auto: true }] : tools;
}

export function assignTools(e) {
  const n = e.procedure.length, tools = toolsFor(e), out = Array.from({ length: n }, () => []);
  if (Array.isArray(e.stepTools)) { e.stepTools.forEach((list, i) => { if (out[i]) out[i] = [...list]; }); return out; }
  const gens = [], grooves = [], benches = [];
  tools.forEach((t, i) => { if (t.type === 'gen') gens.push(i); else if (t.type === 'groove') grooves.push(i); else if (t.type === 'bench' && t.auto) benches.push(i); else if (WORKBENCH.has(t.type)) out.forEach(s => s.push(i)); });
  // Generators go with the steps that say roll / draw (or pick / choose when none do), one generator per such step, the last taking any left.
  let steps = e.procedure.map((s, i) => (ROLL.test(s) ? i : -1)).filter(i => i >= 0);
  if (!steps.length) steps = e.procedure.map((s, i) => (PICK.test(s) ? i : -1)).filter(i => i >= 0);
  if (!steps.length) steps = [0];
  gens.forEach((g, k) => { out[steps[Math.min(k, steps.length - 1)]].push(g); });
  // Rhythm tools go with the steps that talk about rhythm or tempo; the first one if none does.
  const rsteps = e.procedure.map((s, i) => (RHYTHM.test(s) ? i : -1)).filter(i => i >= 0);
  for (const g of grooves) for (const i of (rsteps.length ? rsteps : [0])) out[i].push(g);
  // The workbench goes with the rhythm steps too (after the rhythm), or with the last step that draws notes.
  for (const g of benches) for (const i of (rsteps.length ? rsteps : [steps[steps.length - 1]])) out[i].push(g);
  return out.map(l => [...new Set(l)]);
}

/** The "before you begin" list: what to have ready, from what the experiment says it needs and the tools it uses. */
export function setupChecklist(e) {
  const items = [];
  const need = { any: 'Your instrument, your voice, or any sound source', daw: 'Your DAW or sequencer, open and ready', audio: 'A short recording, or a microphone to make one', none: 'Paper and a pen, or a notes app', file: 'A photo, PDF or text file ready to add' }[e.needs];
  if (need) items.push(need);
  const types = new Set((e.tools || []).map(t => t.type));
  if (['gen', 'groove', 'loops', 'clip', 'roll', 'sampler'].some(t => types.has(t))) items.push('Sound on. Headphones help');
  if (types.has('clip') || types.has('sampler')) items.push('Permission for the microphone, if you want to record here');
  items.push(`About ${e.minutes} minutes where you will not be interrupted`);
  return items;
}
