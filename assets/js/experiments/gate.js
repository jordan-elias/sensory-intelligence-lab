/**
 * /assets/js/experiments/gate.js
 * Experiments in Creativity is part of the paid plan. Subscribers get the course; everyone else gets one page that says what the
 * course is for, what is in it and what you leave with, with a link to subscribe. Nothing of the course itself is loaded for them.
 */
import { isPaidUser } from '/assets/js/gating.js';
import { COURSE, UNITS, METHOD } from '/assets/js/experiments/catalog.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function previewHtml() {
  const count = UNITS.reduce((n, u) => n + u.experiments.length, 0);
  return `<div class="xp-preview">
    <h1>${esc(COURSE.name)}</h1>
    <p class="xp-lead">${esc(COURSE.tagline)}</p>
    <p>The course is part of the Lab’s paid plan. This page tells you what is in it.</p>
    <p><a class="xp-btn" href="/subscribe/" id="xpSubscribe" style="text-decoration:none;display:inline-flex;align-items:center">Subscribe to begin</a></p>

    <h2>What it is for</h2>
    <p>To get curious about how you make sound and music, to get unstuck, and to leave with small starts of ideas that are yours to build on. Each experiment sets one small limit and walks you through it one step at a time, with the tools built into the page. You go at your own pace, in any order, and nothing is scored or compared.</p>

    <h2>What is inside</h2>
    <p>${count} experiments in ${UNITS.length} sections.</p>
    <ol class="xp-prev-units">${UNITS.map(u => `<li><b>${esc(u.title)}</b> <span>${esc(u.intro)} (${u.experiments.length} ${u.experiments.length === 1 ? 'experiment' : 'experiments'})</span></li>`).join('')}</ol>

    <h2>How it works</h2>
    <ol class="xp-prev-method">${METHOD.steps.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join('')}</ol>

    <h2>What stays with you</h2>
    <p>The things you make and the notes you write are kept on your own device. Syncing is optional and encrypted before it leaves your device. If you stop subscribing, your work stays saved, and the course and its materials are locked until you subscribe again.</p>
    <p><a class="xp-btn" href="/subscribe/">Subscribe to begin</a></p>
  </div>`;
}

export async function start(root = document.getElementById('xpRoot')) {
  if (window._currentUser === undefined) await new Promise(r => window.addEventListener('authReady', r, { once: true }));
  if (isPaidUser()) { await import('/assets/js/experiments/page.js'); return 'course'; }
  root.innerHTML = previewHtml();
  const foot = document.querySelector('footer'); if (foot) foot.textContent = 'Nothing is loaded or recorded on this page.';
  return 'preview';
}
start();
