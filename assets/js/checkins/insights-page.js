/**
 * /assets/js/checkins/insights-page.js
 * The "Surroundings and mood" page. All numbers are worked out in the browser from the
 * user's decrypted check-ins and places.
 */
import * as store from './store.js';
import { byFactor, byTimeOfDay, bySun, highlights, recommend, MIN_N } from './insights.js';
import { elevationGrid, daylightHours, sunPosition, sunLabel } from './sun.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABELS = {
  noise: l => `${l} of 5`, crowd: l => `${l} of 5`,
  light: l => ({ direct: 'Direct sun', bright: 'Bright', dim: 'Dim', dark: 'Dark' }[l] || l),
  sun: l => l, time: l => l[0].toUpperCase() + l.slice(1),
};

function bars(title, rows, label) {
  if (!rows.length) return '';
  return `<h3>${esc(title)}</h3>` + rows.map(r => `
    <div class="in-bar-name">${esc(label(r.level))}</div>
    <div class="in-bar ${r.enough ? '' : 'thin'}" role="img" aria-label="Mood ${r.mood ?? 'unknown'} out of 10"><i style="width:${r.mood == null ? 0 : r.mood * 10}%"></i></div>
    <div class="in-val">${r.mood ?? '–'} · ${r.n} check-in${r.n === 1 ? '' : 's'}${r.enough ? '' : ' *'}</div>`).join('');
}

function sunColor(e) {
  if (e <= -6) return '#1f2a44'; if (e <= 0) return '#4a5578'; if (e < 10) return '#e9c46a';
  if (e < 30) return '#f4a261'; return '#e76f51';
}

export async function mountInsights(root) {
  let checkins, places;
  try {
    [checkins, places] = await Promise.all([store.load({ sinceDays: null }), store.listPlaces()]);
  } catch (e) {
    root.innerHTML = `<div class="in-notice">Could not load your data: ${esc(e.message)}</div>`; return;
  }

  const withEnv = checkins.filter(c => c.env && (c.env.noise || c.env.crowd || c.env.light || c.env.sun_elevation != null));
  const draw = () => {
    const hl = highlights(checkins);
    root.innerHTML = `
      <section class="in-section" aria-labelledby="h1">
        <h2 id="h1">How your surroundings relate to your mood</h2>
        <p>Mood is your valence score, 1 to 10. Bars drawn faint and marked * rest on fewer than ${MIN_N} check-ins, so treat them as a hint only. These are patterns in your own notes, not proof that one thing causes another.</p>
        ${!withEnv.length ? `<div class="in-notice">No check-ins with surroundings yet. When you check in, fill in "Your surroundings" and this page will start to fill.</div>` : ''}
        ${hl.length ? `<ul class="in-highlights">${hl.map(h => `<li>${esc(h.text)}</li>`).join('')}</ul>` : (withEnv.length ? '<p class="in-muted">No clear pattern yet. More check-ins in different surroundings will help.</p>' : '')}
        <div class="in-bars">
          ${bars('Noise', byFactor(checkins, 'noise'), LABELS.noise)}
          ${bars('Crowdedness', byFactor(checkins, 'crowd'), LABELS.crowd)}
          ${bars('Light', byFactor(checkins, 'light'), LABELS.light)}
          ${bars('Sun height', bySun(checkins), LABELS.sun)}
          ${bars('Time of day', byTimeOfDay(checkins), LABELS.time)}
        </div>
      </section>

      <section class="in-section" aria-labelledby="h2">
        <h2 id="h2">Where to go</h2>
        <p>Pick what you want and when. Saved places are ranked using your own past check-ins there, and the sun is calculated for that time.</p>
        ${places.length ? `
        <div class="in-want">
          <div><label for="wWhen">When</label><input id="wWhen" type="datetime-local" value="${toLocalInput(new Date())}"></div>
          <div><label for="wNoise">Noise</label><select id="wNoise"><option value="">Any</option><option value="quiet">Quiet</option><option value="lively">Lively</option></select></div>
          <div><label for="wCrowd">Crowds</label><select id="wCrowd"><option value="">Any</option><option value="empty">Empty</option><option value="busy">Busy</option></select></div>
          <div><label for="wSun">Sun</label><select id="wSun"><option value="">Any</option><option value="sunny">Sunny</option><option value="shade">Shade or dark</option></select></div>
        </div>
        <ul class="in-results" id="results"></ul>` : `<div class="in-notice">You have no saved places yet. On the check-in page, choose "Save this as a new place" under Your surroundings.</div>`}
      </section>

      <section class="in-section" aria-labelledby="h3">
        <h2 id="h3">Sun through the year</h2>
        <p>How high the sun gets at a place, by month and hour in your time zone. Needs a saved place with coordinates.</p>
        <div id="sunPick"></div><div id="sunOut"></div>
      </section>

      <section class="in-section" aria-labelledby="h4">
        <h2 id="h4">Your saved places</h2>
        ${places.length ? `<ul class="in-places">${places.map(p => `<li><span>${esc(p.name)} <span class="in-muted">${Number.isFinite(p.lat) ? (p.exact ? 'exact spot' : 'about 1 km') : 'no coordinates'}</span></span><button type="button" data-del="${esc(p.id)}">Delete</button></li>`).join('')}</ul>` : '<p class="in-muted">None yet.</p>'}
      </section>`;
    wire();
  };

  function toLocalInput(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

  function renderResults() {
    const el = root.querySelector('#results'); if (!el) return;
    const when = new Date(root.querySelector('#wWhen').value || Date.now());
    const want = { noise: root.querySelector('#wNoise').value || null, crowd: root.querySelector('#wCrowd').value || null, sun: root.querySelector('#wSun').value || null };
    const rows = recommend(checkins, places, want, when);
    el.innerHTML = rows.map(r => `<li class="${r.matches > r.misses ? 'good' : ''}">
      <strong>${esc(r.place.name)}</strong>
      <div class="in-meta">${r.sun ? `Sun then: ${esc(r.sun.label)} (${r.sun.elevation}°)` : 'No coordinates, so no sun reading'} ·
        ${r.mood != null ? `your mood here averages ${r.mood} (${r.n} check-in${r.n === 1 ? '' : 's'}, ${esc(r.basis)})` : 'no check-ins here yet'}
        ${r.notes.length ? ' · ' + esc(r.notes.join(', ')) : ''}</div></li>`).join('');
  }

  function renderSun() {
    const geo = places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const pick = root.querySelector('#sunPick'), out = root.querySelector('#sunOut');
    if (!geo.length) { pick.innerHTML = '<div class="in-notice">No saved place has coordinates yet. When you save a place, choose "Use my current location".</div>'; out.innerHTML = ''; return; }
    pick.innerHTML = `<div class="in-pick"><label for="sunPlace" class="in-muted">Place</label><select id="sunPlace">${geo.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>`;
    const show = () => {
      const p = geo.find(x => x.id === root.querySelector('#sunPlace').value) || geo[0];
      const g = elevationGrid(p.lat, p.lng);
      const today = new Date(), dl = daylightHours(today, p.lat), dl6 = daylightHours(new Date(Date.UTC(today.getUTCFullYear(), 5, 21, 12)), p.lat), dl12 = daylightHours(new Date(Date.UTC(today.getUTCFullYear(), 11, 21, 12)), p.lat);
      out.innerHTML = `<p class="in-muted">Daylight: about ${dl.toFixed(1)} h today, ${dl6.toFixed(1)} h at midsummer, ${dl12.toFixed(1)} h at midwinter (in the northern hemisphere; reversed in the south).</p>
        <div class="in-gridwrap"><div class="in-grid" role="img" aria-label="Sun height by month and hour">
          <div></div>${Array.from({ length: 24 }, (_, h) => `<div class="in-hlabel">${h % 3 === 0 ? h : ''}</div>`).join('')}
          ${g.map((row, m) => `<div class="in-mlabel">${MONTHS[m]}</div>${row.map((e, h) => `<div class="in-cell" style="background:${sunColor(e)}" title="${MONTHS[m]} ${h}:30, sun ${e}° (${sunLabel(e)})"></div>`).join('')}`).join('')}
        </div></div>
        <div class="in-legend"><span><i style="background:#1f2a44"></i>dark</span><span><i style="background:#4a5578"></i>twilight</span><span><i style="background:#e9c46a"></i>low sun (under 10°)</span><span><i style="background:#f4a261"></i>mid-height (10–30°)</span><span><i style="background:#e76f51"></i>high (over 30°)</span></div>`;
    };
    root.querySelector('#sunPlace').addEventListener('change', show); show();
  }

  function wire() {
    root.querySelectorAll('.in-want select, .in-want input').forEach(e => e.addEventListener('change', renderResults));
    renderResults(); renderSun();
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this place? Check-ins that used it keep their other details.')) return;
      try { await store.removePlace(b.dataset.del); places = places.filter(p => p.id !== b.dataset.del); draw(); }
      catch (e) { alert('Could not delete: ' + e.message); }
    }));
  }
  draw();
}
