/**
 * /assets/js/worksheets/compare.js
 * Side-by-side comparison of two Goals & Values worksheets.
 * Mounted from the Goals & Values page only. Content is fetched and
 * decrypted when two entries are chosen, never for the whole list.
 */
import { esc, formatDate } from './core.js';
import * as store from './store.js';

const CATS = ['work', 'mental', 'social', 'love', 'family', 'physical', 'creative'];
const CAT_NAMES = {
  work: 'Work / School', mental: 'Mental Health', social: 'Social', love: 'Love & Romance',
  family: 'Family', physical: 'Physical Health', creative: 'Creative',
};

export function mountCompare({ el, getEntries }) {
  el.innerHTML = `
    <div id="compareBtnWrap" hidden style="margin-top:1rem;">
      <button type="button" class="action-btn outline" id="compareOpen">Compare two worksheets</button>
    </div>`;
  const btnWrap = el.querySelector('#compareBtnWrap');
  const refreshBtn = () => { btnWrap.hidden = getEntries().length < 2; };
  refreshBtn();
  window.addEventListener('ws:entries', refreshBtn);
  el.querySelector('#compareOpen').addEventListener('click', () => openModal(getEntries()));
}

function openModal(entries) {
  const opts = entries.map(e => `<option value="${esc(e.id)}">${esc(e.title || 'Untitled')} — ${formatDate(e.created_at)}</option>`).join('');
  const modal = document.createElement('div');
  modal.className = 'compare-modal open';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'cmpTitle');
  modal.innerHTML = `
    <div class="compare-inner">
      <h3 id="cmpTitle">Compare Goals &amp; Values worksheets</h3>
      <div class="compare-subtitle">Select two worksheets to place side by side and reflect on how things have changed.</div>
      <div class="compare-selectors">
        <div><label for="cmpA">Earlier worksheet</label><select id="cmpA"><option value="">Choose</option>${opts}</select></div>
        <div><label for="cmpB">Later worksheet</label><select id="cmpB"><option value="">Choose</option>${opts}</select></div>
      </div>
      <div id="cmpContent"><div class="compare-loading">Choose two worksheets above to begin.</div></div>
      <div class="compare-footer">
        <span class="compare-hint">Read across the columns. Notice what has shifted, what has stayed, what surprises you.</span>
        <button type="button" class="action-btn outline" id="cmpClose">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#cmpClose').addEventListener('click', close);

  const selA = modal.querySelector('#cmpA'), selB = modal.querySelector('#cmpB');
  if (entries.length >= 2) { selA.value = entries[entries.length - 1].id; selB.value = entries[0].id; }
  const run = () => runComparison(modal, entries, selA.value, selB.value);
  selA.addEventListener('change', run); selB.addEventListener('change', run);
  if (selA.value && selB.value) run();
  selA.focus();
}

const field = (label, v) =>
  `<div class="compare-field"><div class="compare-field-label">${label}</div><div class="compare-field-value ${v ? '' : 'empty'}">${v ? esc(v) : '—'}</div></div>`;

function column(entry, d) {
  let html = `<div class="compare-col-header"><div class="compare-col-title">${esc(entry.title)}</div><div class="compare-col-date">${formatDate(entry.created_at)}</div></div>`;
  html += `<div class="compare-cat"><div class="compare-cat-name">Overall</div>${field('What matters most', d.overall_matters)}${field('Value to embody', d.overall_value)}</div>`;
  CATS.forEach(c => {
    html += `<div class="compare-cat"><div class="compare-cat-name">${CAT_NAMES[c]}</div>${field('Going well', d[c + '_well'])}${field('To nurture', d[c + '_improve'])}${field('Intention', d[c + '_intention'])}</div>`;
  });
  html += `<div class="compare-cat"><div class="compare-cat-name">Closing</div>${field('Focus for this period', d.closing_one)}${field('Compassionate reminder', d.closing_reminder)}</div>`;
  return `<div class="compare-col">${html}</div>`;
}

async function runComparison(modal, entries, idA, idB) {
  const content = modal.querySelector('#cmpContent');
  if (!idA || !idB) { content.innerHTML = '<div class="compare-loading">Choose two worksheets above.</div>'; return; }
  if (idA === idB) { content.innerHTML = '<div class="compare-loading">Please select two different worksheets.</div>'; return; }
  content.innerHTML = '<div class="compare-loading">Decrypting…</div>';
  try {
    const [a, b] = await Promise.all([store.get(idA), store.get(idB)]);
    if (modal.querySelector('#cmpA').value !== idA || modal.querySelector('#cmpB').value !== idB) return; // selection changed meanwhile
    content.innerHTML = `<div class="compare-grid">${column(a, a.payload.data || {})}${column(b, b.payload.data || {})}</div>`;
  } catch (err) {
    content.innerHTML = `<div class="compare-loading">Could not load comparison: ${esc(err.message)}</div>`;
  }
}
