/**
 * /assets/js/experiments/keep.js
 * The "Keep this" button on a tool. It reads what the tool is showing (the notes you rolled, the rhythm, the poem, the clip you
 * made) and hands it to the Keep shelf. Nothing is kept unless the person taps the button.
 */
const text = (root, sel) => [...root.querySelectorAll(sel)].map(n => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** What this tool could keep right now: { label, kind, text } or { label, kind: 'audio', clip }; null when there is nothing yet. */
export function readKeepable(type, root) {
  switch (type) {
    case 'gen': { const items = text(root, '.xp-chips li'); const seed = root.querySelector('.xp-seed')?.textContent; return items.length ? { label: 'What I rolled', kind: 'text', text: items.join(' · ') + (seed ? `\n${seed}` : '') } : null; }
    case 'groove': { const cells = [...root.querySelectorAll('.xp-step')]; if (!cells.length) return null; const pat = cells.map(c => (c.getAttribute('aria-pressed') === 'true' ? 'x' : '.')).join(''); const info = root.querySelector('p[aria-live]')?.textContent.trim() || ''; return { label: 'My rhythm', kind: 'text', text: `${pat}\n${info}`.trim() }; }
    case 'clip': { const c = root.__clip?.(); return c ? { label: 'My result', kind: 'audio', clip: c } : null; }
    case 'assign': { const t = text(root, '.xp-out li'); return t.length ? { label: 'The swaps', kind: 'text', text: t.join('\n') } : null; }
    case 'wordpoem': { const t = text(root, '.xp-frame li'); return t.length ? { label: 'The frame', kind: 'text', text: t.join('\n') } : null; }
    case 'blackout': { const t = root.querySelector('#xpPoem')?.textContent.trim(); return t ? { label: 'My poem', kind: 'text', text: t } : null; }
    case 'burn': { const t = text(root, '#xpHaiku p'); return t.length ? { label: 'What was left', kind: 'text', text: t.join('\n') } : null; }
    case 'cards': { const t = text(root, '.xp-card-face'); return t.length ? { label: 'My cards', kind: 'text', text: t.join('\n') } : null; }
    case 'treat': { const t = text(root, '.xp-treat li'); return t.length ? { label: 'The treatments', kind: 'text', text: t.join('\n') } : null; }
    default: return null;
  }
}

export const KEEPABLE = new Set(['gen', 'groove', 'clip', 'assign', 'wordpoem', 'blackout', 'burn', 'cards', 'treat']);

/** Adds the button. `keep(item)` is given { label, kind, text | clip } and may return a promise; it is the page's job to store it. */
export function attachKeep(type, root, keep, el) {
  if (!keep || !KEEPABLE.has(type)) return root;
  root.keepable = () => readKeepable(type, root);
  const msg = el('span', { class: 'xp-keep-msg', role: 'status', 'aria-live': 'polite' });
  const btn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt xp-keepbtn' }, 'Keep this');
  btn.onclick = async () => {
    const item = readKeepable(type, root);
    if (!item) { msg.textContent = 'Nothing to keep yet.'; return; }
    try { await keep(item); msg.textContent = 'Kept on your Keep shelf.'; } catch { msg.textContent = 'Could not keep that.'; }
  };
  root.append(el('div', { class: 'xp-row xp-keep' }, btn, msg));
  return root;
}
