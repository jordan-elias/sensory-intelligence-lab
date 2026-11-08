/**
 * /assets/js/sharing/sharing-card.js
 * The "Share my check-ins" switch inside the connected-therapist card.
 * Off by default. Turning it on needs the vault unlocked, because the copies are encrypted here.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { pairSafetyCode } from '../vault/vault-crypto.js';
import * as checkinStore from '../checkins/store.js';
import * as S from './store.js';
import { SHARING_TEXT as T } from './consent.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function mountSharing(root, { sb, uid, link, therapistName }) {
  root.innerHTML = '<p style="font-size:.8rem;color:var(--muted)">Loading sharing settings…</p>';
  let pref, target, count = 0;
  try {
    pref = await S.getPreference(sb, link.link_id);
    target = await S.therapistTarget(sb);
    if (pref.enabled) count = (await S.sharedSourceIds(sb, link.link_id)).size;
  } catch (e) { root.innerHTML = `<p class="msg show error">Could not load sharing settings: ${esc(e.message)}</p>`; return; }

  const ready = !!target;     // the therapist has set up their vault
  const name = esc(therapistName);
  root.innerHTML = `
    <p style="font-size:.8rem;font-weight:500;margin:1.2rem 0 .4rem">Sharing with ${name}
      <span style="margin-left:.4rem;padding:.1rem .5rem;border:1px solid var(--border);font-size:.7rem;font-weight:600;${pref.enabled ? 'background:var(--accent-light);color:var(--accent)' : 'color:var(--muted)'}">${pref.enabled ? 'Shared' : 'Private'}</span></p>
    <p style="font-size:.8rem;line-height:1.6;margin-bottom:.6rem">${esc(T.what)}</p>
    <label style="display:flex;gap:.6rem;align-items:flex-start;font-size:.85rem;margin-bottom:.5rem">
      <input type="checkbox" id="shEnable" ${pref.enabled ? 'checked' : ''} ${ready ? '' : 'disabled'} style="margin-top:.2rem">
      <span>Share my check-ins with ${name}</span></label>
    <label style="display:flex;gap:.6rem;align-items:flex-start;font-size:.85rem;margin:0 0 .6rem 1.6rem">
      <input type="checkbox" id="shNotes" ${pref.include_notes ? 'checked' : ''} ${ready && pref.enabled ? '' : 'disabled'} style="margin-top:.2rem">
      <span>${esc(T.notes)}</span></label>
    ${ready ? '' : `<p style="font-size:.8rem;color:var(--muted);margin-bottom:.6rem">${name} has not finished setting up their secure vault yet, so sharing is not available. Nothing is shared.</p>`}
    <p style="font-size:.75rem;color:var(--muted);line-height:1.6;margin-bottom:.4rem">${esc(T.never)}</p>
    <p style="font-size:.75rem;color:var(--muted);line-height:1.6;margin-bottom:.4rem">${esc(T.off)}</p>
    <p style="font-size:.75rem;color:var(--muted);line-height:1.6;margin-bottom:.6rem">${esc(T.seen)}</p>
    <div id="shInfo" style="font-size:.8rem;margin-bottom:.6rem"></div>
    <div class="msg" id="shMsg" role="status"></div>
    <div class="btn-row" style="margin-top:0">
      <button type="button" class="btn btn-outline" id="shRemove" ${pref.enabled || count ? '' : 'hidden'}>Remove copies ${name} already has</button>
    </div>`;

  const $ = id => root.querySelector('#' + id);
  const msg = (t, k) => { const m = $('shMsg'); m.textContent = t; m.className = 'msg show ' + (k || ''); };
  const remount = () => mountSharing(root, { sb, uid, link, therapistName });

  if (pref.enabled) {
    $('shInfo').textContent = `${count} check-in${count === 1 ? '' : 's'} shared with ${therapistName}.`;
    try {
      const session = await ensureVaultReady();
      $('shInfo').textContent += ` Safety code with ${therapistName}: ${await pairSafetyCode(session.fingerprint, target.fingerprint)}. You can compare it with them to be sure nobody is in between.`;
    } catch { /* locked: skip the code, the rest still works */ }
  }

  const run = async (label, fn) => {
    for (const id of ['shEnable', 'shNotes', 'shRemove']) $(id).disabled = true;
    msg(label);
    try { await fn(); await remount(); }
    catch (e) { await remount(); const m = root.querySelector('#shMsg'); m.textContent = e.message; m.className = 'msg show error'; }
  };

  const syncAll = async includeNotes => {
    const session = await ensureVaultReady();
    const records = await checkinStore.load({ sinceDays: null });
    await S.syncCheckins({ sb, session, target, records, includeNotes, refresh: true });
  };

  $('shEnable').onchange = e => run(e.target.checked ? 'Turning sharing on…' : 'Turning sharing off…', async () => {
    if (e.target.checked) {
      await ensureVaultReady();   // asks for the passphrase first if the vault is locked
      await S.setPreference(sb, uid, link.link_id, { enabled: true, include_notes: false });
      await syncAll(false);
    } else {
      await S.setPreference(sb, uid, link.link_id, { enabled: false, include_notes: false });
    }
  });
  $('shNotes').onchange = e => run('Updating…', async () => {
    await ensureVaultReady();
    await S.setPreference(sb, uid, link.link_id, { enabled: true, include_notes: e.target.checked });
    await syncAll(e.target.checked);
  });
  $('shRemove').onclick = () => run('Removing copies…', async () => {
    await S.setPreference(sb, uid, link.link_id, { enabled: false, include_notes: false });
    await S.withdrawAll(sb, link.link_id);
  });
}
