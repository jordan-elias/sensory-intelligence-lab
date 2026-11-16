/**
 * /assets/js/therapist/archive-page.js
 * Records a therapist keeps about people who are no longer connected to them, including clients who have deleted their account.
 * Everything here is the therapist's own encrypted record (session notes, and the copies of the intake form and family history
 * they saved), opened with their own vault. Nothing on this page comes from the client's account.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { makeNotesStore } from './notes.js';
import { mountRecord } from './record.js';
import * as ret from './retention.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export async function mountArchivePage(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const fail = (t, m) => { root.innerHTML = `<div class="ws-callout"><strong>${esc(t)}</strong>${esc(m)}</div>`; };
  const { data: tp } = await sb.from('therapist_profiles').select('user_id').eq('user_id', window._currentUser.id).maybeSingle();
  if (!tp) return fail('This page is for therapists', 'If you should have access, please contact the practice owner.');
  const id = new URLSearchParams(location.search).get('client');
  root.innerHTML = '<p class="th-muted">Opening your records…</p>';
  let session; try { session = await ensureVaultReady(); } catch (e) { return fail('Your vault is locked', e.message); }
  const store = makeNotesStore(sb, session);
  const nameOf = rows => { const p = rows.find(r => r.kind === 'profile'); return (p && p.data && p.data.name) || null; };

  if (id) {
    let rows; try { rows = await store.list(id); } catch (e) { return fail('Could not open these records', e.message); }
    if (!rows.length) return fail('Nothing kept here', 'You do not hold any records for this person.');
    const name = nameOf(rows) || 'Former client';
    root.innerHTML = `<p class="th-back"><a href="/therapist/archive/">&larr; Kept records</a></p><h1 class="th-title">${esc(name)}</h1>
      <p class="th-muted">No longer connected to you. These records are yours: your session notes and the copies you saved of what they sent. Keep them or delete them when you choose.</p>
      <div id="retBox"></div>
      <p><button type="button" class="action-btn sm outline" id="rename">Change the name shown here</button> <span class="msg" id="renameMsg" role="status"></span></p><div id="recBox"></div>`;
    root.querySelector('#rename').onclick = async () => {
      const v = prompt('Name to show for these records', name); if (!v || !v.trim()) return;
      try { await store.keep(id, 'profile', { name: v.trim().slice(0, 80) }); location.reload(); } catch (e) { const m = root.querySelector('#renameMsg'); m.textContent = e.message; m.className = 'msg show error'; }
    };
    const uid = window._currentUser.id, cfg = ret.settings(uid);
    const st = ret.retentionStatus(ret.lastActivity({ noteDates: rows.flatMap(r => [r.date, r.created_at]) }), cfg.years, new Date(), cfg.snooze[id]);
    const line = ret.sentence(st, cfg.years);
    if (line && st.state !== 'ok') {
      root.querySelector('#retBox').innerHTML = `<div class="ws-callout" id="retNote"><strong>${st.state === 'due' ? 'Retention period over' : 'Retention reminder'}</strong>${esc(line)} ${st.state === 'snoozed' ? '' : '<button type="button" class="action-btn sm outline" id="retSnooze">Remind me again in a year</button>'}</div>`;
      const b = root.querySelector('#retSnooze'); if (b) b.onclick = () => { ret.snoozeFor(uid, id); location.reload(); };
    }
    await mountRecord(root.querySelector('#recBox'), { store, clientId: id, clientName: name, active: false, onDeleted: () => { location.href = '/therapist/archive/'; } });
    return;
  }

  let people, linked;
  try {
    people = await store.people();
    const { data } = await sb.from('my_clients').select('client_id'); linked = new Set((data || []).map(r => r.client_id));
  } catch (e) { return fail('Could not list your records', e.message); }
  const kept = people.filter(p => !linked.has(p.client_id));
  const named = [];
  for (const p of kept) { let n = null; try { n = nameOf(await store.list(p.client_id)); } catch { /* shown without a name */ } named.push({ ...p, name: n }); }
  const uid = window._currentUser.id, cfg = ret.settings(uid);
  const chipFor = p => { const st = ret.retentionStatus(ret.lastActivity({ noteDates: [p.last] }), cfg.years, new Date(), cfg.snooze[p.client_id]); return st.state === 'due' ? '<span class="th-chip alert">Retention period over</span>' : st.state === 'soon' ? `<span class="th-chip">Period ends in ${st.daysLeft} days</span>` : ''; };
  root.innerHTML = `<p class="th-back"><a href="/therapist/">&larr; All clients</a></p><h1 class="th-title">Kept records</h1>
    <p class="th-lede">Your own encrypted records about people who are no longer connected to you, including anyone who has deleted their account. Only you can open them.</p>
    ${named.length ? named.map(p => `<a class="th-client th-client-link" href="/therapist/archive/?client=${encodeURIComponent(p.client_id)}"><div class="th-client-main"><strong>${esc(p.name || 'Former client')}</strong><span class="th-muted">Records from ${esc(day(p.first))} to ${esc(day(p.last))}</span><span class="th-chips">${chipFor(p)}</span></div><span class="th-open" aria-hidden="true">Open &rarr;</span></a>`).join('') : '<p class="th-muted">Nothing here. Records about current and ended clients are on their own pages.</p>'}
    <h2 class="th-h2">Retention reminder</h2>
    <p class="th-hint">${esc(ret.NOTE)}</p>
    <label class="ws-label" for="retYears">Remind me when this many years have passed since treatment ended (0 turns it off)</label>
    <input class="ws-input" id="retYears" type="number" min="0" max="99" step="1" value="${cfg.years}" style="max-width:8rem">
    <span class="msg" id="retMsg" role="status"></span>`;
  root.querySelector('#retYears').onchange = e => { const ok = ret.setYears(uid, e.target.value); const m = root.querySelector('#retMsg'); m.textContent = ok ? 'Saved on this device.' : 'Could not save on this device.'; m.className = 'msg show ' + (ok ? '' : 'error'); };
}
