/** /assets/js/worksheets/pages/goals-values.js */
import { bySlug } from '../registry.js';
import { mountCompare } from '../compare.js';

function render() {
  const categories = [
    { id: 'work',     name: 'Work / School' },
    { id: 'mental',   name: 'Mental Health' },
    { id: 'social',   name: 'Social' },
    { id: 'love',     name: 'Love & Romance' },
    { id: 'family',   name: 'Family' },
    { id: 'physical', name: 'Physical Health' },
    { id: 'creative', name: 'Creative' },
  ];

  const catRows = categories.map(c => `
    <div class="cat-row">
      <div class="cat-row-header">
        <span class="cat-name">${c.name}</span>
      </div>
      <div class="cat-grid-inner">
        <div class="ws-field">
          <label class="ws-label">What is going well?</label>
          <textarea class="ws-input sm" data-field="${c.id}_well" placeholder="Reflect on what's working…"></textarea>
        </div>
        <div class="ws-field">
          <label class="ws-label">What would I like to nurture or improve?</label>
          <textarea class="ws-input sm" data-field="${c.id}_improve" placeholder="Be specific and kind to yourself…"></textarea>
        </div>
        <div class="ws-field">
          <label class="ws-label">My intention here</label>
          <textarea class="ws-input sm" data-field="${c.id}_intention" placeholder="One clear intention…"></textarea>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="ws-callout">
      <strong>How to use this worksheet</strong>
      For each life area, take a moment to notice what's already going well — before focusing on what to change. Intentions work best when they're honest, specific, and grounded in your values rather than external pressure.
    </div>

    <div class="ws-section">
      <div class="ws-section-title">
        Overall reflection
      </div>
      <div class="ws-field">
        <label class="ws-label">Right now, what matters most to me?</label>
        <textarea class="ws-input md" data-field="overall_matters" placeholder="Write freely…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What value or quality do I most want to embody in this period of my life?</label>
        <textarea class="ws-input md" data-field="overall_value" placeholder="e.g. patience, courage, presence, creativity…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; padding:0;">
      <div style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border);">
        <div class="ws-section-title" style="margin-bottom:0;">
          By life area
        </div>
      </div>
      <div class="cat-grid">${catRows}</div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">
        Closing
      </div>
      <div class="ws-field">
        <label class="ws-label">If I could focus on only one thing this week, it would be…</label>
        <textarea class="ws-input md" data-field="closing_one" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">A compassionate reminder to myself</label>
        <textarea class="ws-input sm" data-field="closing_reminder" placeholder="Something kind and true…"></textarea>
      </div>
    </div>
  `;
}


export default {
  ...bySlug('goals-values'),
  savedNoun: 'Saved Goals & Values worksheets',
  render,
  mountExtras: mountCompare,
  onEntriesChanged(entries) { window.dispatchEvent(new CustomEvent('ws:entries', { detail: entries })); },
};
