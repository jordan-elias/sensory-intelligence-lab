/**
 * /assets/js/worksheets/frame.js
 * Small builders for framework worksheets (DEAR MAN, GROW, FAST). Plain strings, no state.
 * Everything here ends up as [data-field] inputs, so saving, restoring, expand/collapse and
 * sharing with a therapist work exactly as on the other worksheets.
 */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const callout = html => `<div class="ws-callout" style="font-size:.8rem; margin-bottom:1rem;">${html}</div>`;

export function section(title, body, first = false) {
  return `<div class="ws-section"${first ? '' : ' style="border-top:none; margin-top:0;"'}>
    <div class="ws-section-title">${esc(title)}</div>${body}</div>`;
}

/** A labelled text area. `label` may contain simple markup (it is ours, not user text). */
export function field(key, label, { size = 'sm', ph = '' } = {}) {
  return `<div class="ws-field"><label class="ws-label">${label}</label>
    <textarea class="ws-input ${size}" data-field="${esc(key)}" placeholder="${esc(ph)}"></textarea></div>`;
}

/** A 0 to 10 number box. */
export function scale(key, label) {
  return `<div class="ws-field ws-scale"><label class="ws-label">${label}</label>
    <input type="number" class="ws-input" data-field="${esc(key)}" min="0" max="10" step="1" inputmode="numeric" placeholder="0–10"></div>`;
}

/** Two or three columns that sit side by side on wide screens and stack on narrow ones. */
export function columns(cols) {
  return `<div class="ws-compare ws-compare--${cols.length}">${cols.map(c =>
    `<div class="ws-compare__col"><div class="ws-compare__head">${esc(c.title)}</div>${c.body}</div>`).join('')}</div>`;
}
