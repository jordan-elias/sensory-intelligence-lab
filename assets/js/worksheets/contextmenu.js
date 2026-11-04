/**
 * /assets/js/worksheets/contextmenu.js
 * Right-click (desktop) or press-and-hold (touch) menu for list rows.
 *
 *   attachContextMenu(container, '.song-row', el => [
 *     { label: 'Move up', disabled: false, onSelect: () => {...} }, ...
 *   ]);
 *
 * Also exposes openMenuAt(x, y, items) so a visible "more" button can open
 * the same menu (so the gesture is never the only way in).
 */
let current = null;

export function closeMenu() {
  if (!current) return;
  current.el.remove();
  document.removeEventListener('pointerdown', current.onOutside, true);
  document.removeEventListener('keydown', current.onKey, true);
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('resize', closeMenu);
  const { returnFocus } = current;
  current = null;
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
}

export function openMenuAt(x, y, items, { returnFocus = null } = {}) {
  closeMenu();
  const visible = items.filter(Boolean);
  if (!visible.length) return;

  const el = document.createElement('div');
  el.className = 'ctx-menu';
  el.setAttribute('role', 'menu');
  visible.forEach(item => {
    if (item.separator) { const hr = document.createElement('div'); hr.className = 'ctx-sep'; hr.setAttribute('role', 'separator'); el.appendChild(hr); return; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.className = 'ctx-item' + (item.danger ? ' danger' : '');
    b.textContent = item.label;
    b.disabled = !!item.disabled;
    b.addEventListener('click', () => {
      if (Date.now() - born < 350) return; // ignore the tail of the long-press
      closeMenu();
      item.onSelect && item.onSelect();
    });
    el.appendChild(b);
  });
  document.body.appendChild(el);
  const born = Date.now();

  // Keep inside the viewport
  const r = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';

  const onOutside = e => { if (!el.contains(e.target)) closeMenu(); };
  const onKey = e => {
    const buttons = [...el.querySelectorAll('button:not(:disabled)')];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
  };
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
  current = { el, onOutside, onKey, returnFocus };
  el.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

export function attachContextMenu(container, rowSelector, getItems, { holdMs = 500 } = {}) {
  const isInteractive = t => t.closest('textarea, input, select, [contenteditable]');

  container.addEventListener('contextmenu', e => {
    const row = e.target.closest(rowSelector);
    if (!row || !container.contains(row) || isInteractive(e.target)) return;
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY, getItems(row), { returnFocus: row });
  });

  // Touch / pen press-and-hold (iOS Safari never fires contextmenu)
  let timer = null, startX = 0, startY = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };

  container.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const row = e.target.closest(rowSelector);
    if (!row || isInteractive(e.target) || e.target.closest('button, a')) return;
    startX = e.clientX; startY = e.clientY; fired = false;
    cancel();
    timer = setTimeout(() => {
      fired = true;
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
      openMenuAt(startX, startY, getItems(row), { returnFocus: row });
    }, holdMs);
  });
  container.addEventListener('pointermove', e => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) cancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => container.addEventListener(t, cancel));
  // Swallow the click that follows a long-press so it doesn't trigger row actions
  container.addEventListener('click', e => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
}
