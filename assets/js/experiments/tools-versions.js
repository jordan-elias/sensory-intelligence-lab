/**
 * /assets/js/experiments/tools-versions.js
 * Keeps several rolled takes (for example five pitch patterns over one rhythm), plays each on a loop, lets you give each one
 * word, and puts them in order twice so you can see whether your taste moved after living with one. The roll is still yours:
 * you press the roll button, then save that roll as the next version. Nothing leaves the page unless you tick it at the end.
 */
import { el, playTones } from './tools.js';
import * as V from './versions-core.js';

export function versionsTool(cfg = {}) {
  const max = cfg.max || V.MAX_VERSIONS, bpm = cfg.bpm || 110, stepSec = 60 / bpm / 2;
  let versions = [], first = [], second = null, sources = null, stopFn = null, loopT = 0, playing = -1;
  const msg = el('p', { class: 'xp-hint', role: 'status', 'aria-live': 'polite' }), say = t => { msg.textContent = t; };
  const list = el('ol', { class: 'xp-ver', id: 'xpVerList' });
  const rank = el('ol', { class: 'xp-rank', id: 'xpRank' });
  const phase = el('p', { class: 'xp-hint', id: 'xpVerPhase' });
  const saveBtn = el('button', { type: 'button', class: 'xp-btn', id: 'xpVerSave', onclick: () => {
    const pcs = sources?.notes?.();
    if (!pcs || !pcs.length) { say('Roll a pattern first, then save it as a version.'); return; }
    if (versions.length >= max) { say(`That is all ${max} versions.`); return; }
    versions.push({ pcs: pcs.slice(), word: '' }); first = V.syncOrder(first, versions.length); if (second) second = V.syncOrder(second, versions.length);
    say(`Saved as version ${versions.length}.${versions.length < max ? ' Roll again for the next one.' : ' That is all of them. Listen to each, then put them in order.'}`); draw();
  } }, 'Save this roll as a version');
  const reRank = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpVerRerank', hidden: true, onclick: () => {
    second = first.slice(); say('Now put them in order again, after living with one of them for a while. Your first order is kept for comparison.'); draw();
  } }, 'Put them in order again, after listening');

  const stopPlay = () => { clearTimeout(loopT); stopFn && stopFn(); stopFn = null; playing = -1; };
  const playLoop = i => {
    if (playing === i) { stopPlay(); draw(); return; }
    stopPlay(); playing = i; const pcs = versions[i].pcs;
    const go = () => { stopFn = playTones(pcs, { step: stepSec }); loopT = setTimeout(go, pcs.length * stepSec * 1000); };
    go(); draw();
  };
  const current = () => second || first;
  const setCurrent = o => { if (second) second = o; else first = o; draw(); };

  function draw() {
    list.replaceChildren(...versions.map((v, i) => el('li', { 'data-v': i },
      el('strong', {}, `Version ${i + 1}`), ' ', el('span', { class: 'xp-ver-notes' }, V.pitchText(v.pcs)), ' ',
      el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-ver-play', 'aria-pressed': String(playing === i), onclick: () => playLoop(i) }, playing === i ? 'Stop' : 'Listen'),
      el('input', { type: 'text', class: 'xp-ver-word', value: v.word, maxlength: 40, placeholder: 'one word for it', 'aria-label': `One word for version ${i + 1}`, oninput: e => { v.word = e.target.value; } }))));
    const o = current();
    rank.replaceChildren(...o.map((vi, pos) => el('li', { 'data-v': vi },
      el('span', {}, `${pos + 1}. Version ${vi + 1}${versions[vi].word ? ' (' + versions[vi].word + ')' : ''} `),
      el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-ms', 'aria-label': `Move version ${vi + 1} up`, disabled: pos === 0, onclick: () => setCurrent(V.moveItem(o, pos, -1)) }, '↑'),
      el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-ms', 'aria-label': `Move version ${vi + 1} down`, disabled: pos === o.length - 1, onclick: () => setCurrent(V.moveItem(o, pos, 1)) }, '↓'))));
    rank.hidden = versions.length < 2;
    reRank.hidden = versions.length < 2 || !!second;
    const moves = second ? V.compareOrders(first, second) : [];
    phase.textContent = versions.length < 2 ? '' : second ? (moves.length ? moves.join(' ') : 'Nothing moved from your first order.') : 'Your order, best first. Use the arrows.';
  }

  const root = el('div', { class: 'xp-tool xp-versions', id: 'xpVersions' },
    el('p', { class: 'xp-k' }, 'Your versions'),
    el('div', { class: 'xp-row' }, saveBtn), msg, list,
    el('p', { class: 'xp-hint' }, `Each version loops its eight notes at ${bpm} BPM, one sound, never changing rhythm.`),
    rank, phase, el('div', { class: 'xp-row' }, reRank));
  root.link = l => { sources = { notes: () => { for (const t of l) { const p = t.pitches?.(); if (p) return p; } return null; } }; };
  root.keepable = () => { const text = V.versionsText(versions, first, second); return text ? { label: 'My versions', kind: 'text', text } : null; };
  root.__versions = () => ({ versions, first, second });
  draw();
  return root;
}
