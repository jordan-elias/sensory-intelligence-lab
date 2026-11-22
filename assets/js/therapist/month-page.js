/**
 * /assets/js/therapist/month-page.js
 * Sessions by month, for invoicing. Reads only the session times the therapist can already see; nothing is written.
 */
import { monthList, toCsv, monthOf, shiftMonth } from './month.js';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function mountMonthPage(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const fail = (t, m) => { root.innerHTML = `<div class="ws-callout"><strong>${esc(t)}</strong>${esc(m)}</div>`; };
  const { data: tp } = await sb.from('therapist_profiles').select('user_id').eq('user_id', window._currentUser.id).maybeSingle();
  if (!tp) return fail('This page is for therapists', 'If you should have access, please contact the practice owner.');
  let sessions, names = new Map();
  try {
    const [c, s] = await Promise.all([sb.from('my_clients').select('link_id, full_name'), sb.from('my_client_sessions').select('*')]);
    if (c.error) throw new Error(c.error.message); if (s.error) throw new Error(s.error.message);
    for (const x of c.data || []) names.set(x.link_id, x.full_name || 'Client'); sessions = s.data || [];
  } catch (e) { return fail('Could not load your sessions', e.message); }
  let ym = monthOf(), cancelled = false;
  const label = m => new Date(m + '-01T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  function draw() {
    const l = monthList(sessions, names, ym, { cancelled });
    root.innerHTML = `<p class="th-back"><a href="/therapist/">&larr; All clients</a></p><h1 class="th-title">Sessions by month</h1>
      <p class="th-lede">Sessions booked with you through Cal.com</p>
      <p><button type="button" class="action-btn outline sm" id="mPrev">&larr; ${esc(label(shiftMonth(ym, -1)))}</button>
        <strong style="margin:0 .8rem">${esc(label(ym))}</strong>
        <button type="button" class="action-btn outline sm" id="mNext">${esc(label(shiftMonth(ym, 1)))} &rarr;</button></p>
      <label><input type="checkbox" id="mCan" ${cancelled ? 'checked' : ''}> Show cancelled sessions</label>
      <h2 class="th-h2">${l.count} session${l.count === 1 ? '' : 's'}</h2>
      ${l.rows.length ? `<div class="th-scroll" style="overflow-x:auto"><table class="th-table"><thead><tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Client</th><th scope="col">Kind</th><th scope="col">Minutes</th><th scope="col">Status</th></tr></thead><tbody>${l.rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${esc(r.client)}</td><td>${esc(r.kind)}</td><td>${r.minutes ?? ''}</td><td>${esc(r.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="th-muted">No sessions this month.</p>'}
      ${l.totals.length ? `<h2 class="th-h2">By client</h2><ul class="th-list">${l.totals.map(t => `<li><strong>${esc(t.client)}</strong> <span class="th-muted">${t.sessions} session${t.sessions === 1 ? '' : 's'}${t.minutes ? `, ${t.minutes} minutes` : ''}</span></li>`).join('')}</ul>` : ''}
      <p style="margin-top:1rem"><button type="button" class="action-btn" id="mCsv" ${l.rows.length ? '' : 'disabled'}>Download as CSV</button></p>
      <p class="th-hint">Made on this device from the session times in your client list. Minutes show only where Cal.com recorded an end time.</p>`;
    root.querySelector('#mPrev').onclick = () => { ym = shiftMonth(ym, -1); draw(); };
    root.querySelector('#mNext').onclick = () => { ym = shiftMonth(ym, 1); draw(); };
    root.querySelector('#mCan').onchange = e => { cancelled = e.target.checked; draw(); };
    root.querySelector('#mCsv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCsv(l)], { type: 'text/csv;charset=utf-8' })); a.download = `sessions-${ym}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  }
  draw();
}
