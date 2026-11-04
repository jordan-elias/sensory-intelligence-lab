/**
 * /assets/js/worksheets/ui.js
 * Shared form behaviours + generic collect/restore for [data-field] inputs.
 * Everything is delegated from the worksheet root, so no inline onclick
 * handlers or window globals are needed.
 */
import { esc } from './core.js';

/** Build 1-10 scale buttons into every `.scale-row[data-for]` (data-for = hidden input id). */
export function initScales(root, onChange) {
  root.querySelectorAll('.scale-row[data-for]').forEach(row => {
    if (row.children.length) return;
    row.setAttribute('role', 'group');
    for (let i = 1; i <= 10; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scale-btn';
      b.textContent = i;
      b.dataset.value = i;
      b.setAttribute('aria-pressed', 'false');
      row.appendChild(b);
    }
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('.scale-btn');
    if (!btn) return;
    const row = btn.closest('.scale-row');
    const input = root.querySelector('#' + row.dataset.for);
    const same = input.value === btn.dataset.value;
    input.value = same ? '' : btn.dataset.value; // click again to clear
    syncScales(root);
    onChange && onChange(input);
  });
}

export function syncScales(root) {
  root.querySelectorAll('.scale-row[data-for]').forEach(row => {
    const val = root.querySelector('#' + row.dataset.for)?.value || '';
    row.querySelectorAll('.scale-btn').forEach(b => {
      const on = b.dataset.value === val;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
}

/** Tag pills + skill checklists. */
export function initChoices(root, onChange) {
  root.addEventListener('click', e => {
    const pill = e.target.closest('.tag-pill');
    if (!pill) return;
    const on = pill.classList.toggle('active');
    pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    onChange && onChange(pill);
  });
  root.addEventListener('change', e => {
    const cb = e.target.closest('.skill-item input[type="checkbox"]');
    if (!cb) return;
    cb.closest('.skill-item').classList.toggle('checked', cb.checked);
    onChange && onChange(cb);
  });
  root.querySelectorAll('.tag-pill').forEach(p => { p.type = 'button'; p.setAttribute('aria-pressed', 'false'); });
}

/** Read every [data-field] under root (skip ones inside `skip` selector). */
export function collectFields(root, skip = null) {
  const data = {};
  root.querySelectorAll('[data-field]').forEach(el => {
    if (skip && el.closest(skip)) return;
    const key = el.dataset.field;
    if (key && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) data[key] = el.value;
  });
  const tags = [...root.querySelectorAll('.tag-pill.active')].map(t => t.textContent.trim());
  if (tags.length) data._emotion_tags = tags;
  const skills = [...root.querySelectorAll('.skill-item.checked .skill-item-name')].map(n => n.textContent.trim());
  if (skills.length) data._checked_skills = skills;
  return data;
}

export function restoreFields(root, data, skip = null) {
  root.querySelectorAll('[data-field]').forEach(el => {
    if (skip && el.closest(skip)) return;
    const key = el.dataset.field;
    if (key in data && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) el.value = data[key] ?? '';
  });
  const tags = new Set(data._emotion_tags || []);
  root.querySelectorAll('.tag-pill').forEach(p => {
    const on = tags.has(p.textContent.trim());
    p.classList.toggle('active', on);
    p.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const skills = new Set(data._checked_skills || []);
  root.querySelectorAll('.skill-item').forEach(item => {
    const on = skills.has(item.querySelector('.skill-item-name')?.textContent.trim());
    item.classList.toggle('checked', on);
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = on;
  });
  syncScales(root);
}

/** Readable plain-text export built from the on-screen headings and labels (not raw field keys). */
export function exportTextFromDom(root, title) {
  const lines = [title, '─'.repeat(40), ''];
  root.querySelectorAll('.ws-section-title, .cat-name, .lyric-block-num, .dyn-section-num, [data-field]').forEach(el => {
    if (el.matches('.ws-section-title, .cat-name')) {
      lines.push('', el.textContent.trim().toUpperCase(), '');
    } else if (el.matches('.lyric-block-num, .dyn-section-num')) {
      lines.push('', el.textContent.trim().replace(/^[▾▸]\s*/, ''), '');
    } else if (el.type !== 'hidden' && el.value && el.value.trim()) {
      const label = el.closest('.ws-field')?.querySelector('.ws-label')?.textContent.replace(/\s+/g, ' ').trim()
        || el.getAttribute('placeholder') || '';
      lines.push(label, el.value.trim(), '');
    }
  });
  const tags = [...root.querySelectorAll('.tag-pill.active')].map(t => t.textContent.trim());
  if (tags.length) lines.push('Emotions present', tags.join(', '), '');
  const skills = [...root.querySelectorAll('.skill-item.checked .skill-item-name')].map(n => n.textContent.trim());
  if (skills.length) lines.push('Skills used', ...skills.map(s => '- ' + s), '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '-') + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { esc };
