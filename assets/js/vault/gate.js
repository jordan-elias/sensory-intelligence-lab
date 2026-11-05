/**
 * /assets/js/vault/gate.js
 * What every page that handles private content imports.
 *
 *   const session = await ensureVaultReady();   // resolves once the vault is open
 *   await encrypt(text) / decrypt(payload)      // shorthand for the above
 *
 * If the vault does not exist yet, or is locked, a dialog is shown on top of the page
 * (create vault / enter passphrase) and the promise resolves when the user is through.
 * "Not now" returns to the dashboard: private content is never shown without the key.
 * On first unlock, entries saved under the old server-held key are upgraded.
 */
import * as vault from './vault.js';
import { mountVaultPanel } from './vault-ui.js';
import { countLegacy, fetchLegacyKey, migrateLegacy, retireLegacyKey } from './migrate-legacy.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let running = null;

function ensureStyles() {
  if (document.querySelector('link[data-vault-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/assets/css/vault.css'; l.dataset.vaultCss = '1';
  document.head.appendChild(l);
}

function openDialog({ dismissable = false } = {}) {
  ensureStyles();
  const previous = document.activeElement;
  const el = document.createElement('div');
  el.className = 'vault-gate';
  el.innerHTML = `
    <div class="vault-gate__box" role="dialog" aria-modal="true" aria-labelledby="vaultGateTitle">
      <h2 class="vault-gate__title" id="vaultGateTitle">Your private vault</h2>
      <div id="vaultGatePanel"></div>
      <div id="vaultGateStatus" hidden></div>
      <p class="vault-gate__foot">${dismissable ? '<button type="button" class="vault-link" data-dismiss>Not now</button>' : '<a class="vault-link" href="/dashboard/">Not now, back to the dashboard</a>'}</p>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('vault-gate-open');
  const focusSoon = (tries = 20) => {
    const f = el.querySelector('input:not([type=checkbox]), button');
    if (f) f.focus(); else if (tries) setTimeout(() => focusSoon(tries - 1), 100);
  };
  focusSoon();
  return {
    el,
    panel: el.querySelector('#vaultGatePanel'),
    status: el.querySelector('#vaultGateStatus'),
    title: t => { el.querySelector('#vaultGateTitle').textContent = t; },
    close() { el.remove(); document.body.classList.remove('vault-gate-open'); try { previous?.focus?.(); } catch { /* gone */ } },
  };
}

function showStatus(dlg, html) {
  dlg.panel.hidden = true; dlg.status.hidden = false;
  dlg.el.querySelector('.vault-gate__foot').hidden = true;
  dlg.status.innerHTML = `<div class="vault-card">${html}</div>`;
}
const choose = (dlg, ...actions) => new Promise(resolve => {
  const h = e => { const a = e.target.closest('[data-gate]'); if (a && actions.includes(a.dataset.gate)) { dlg.status.removeEventListener('click', h); resolve(a.dataset.gate); } };
  dlg.status.addEventListener('click', h);
});

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Moves old-format entries to the new key. Returns when finished or when the user chooses to continue. */
async function upgradeOldEntries(dlg, session) {
  if (vault.legacyMigrated()) return;
  const sb = window._supabase;
  const uid = session.userId;
  const { data: prof } = await sb.from('profiles').select('encryption_key_enc').eq('id', uid).single();
  if (!prof?.encryption_key_enc) { await vault.markLegacyMigrated(); return; }   // never had an old key
  const finish = async () => { await vault.markLegacyMigrated(); retireLegacyKey(sb); };

  const n = await countLegacy(sb, uid);
  if (n === 0) { await finish(); return; }

  for (;;) {
    dlg.title('Upgrading your saved entries');
    showStatus(dlg, `
      <p class="vault-lead">You have <strong>${n}</strong> saved ${n === 1 ? 'entry' : 'entries'} (worksheets, journal, check-in notes) that were locked with the old key, which our server could provide. They will now be locked with your passphrase instead, so that only you can read them.</p>
      <p class="vault-help">Each entry is checked after it is converted, and nothing is replaced unless the check passes. If you like, download a copy first. The copy is <strong>not encrypted</strong>: anyone holding the file can read it, so delete it when you are done.</p>
      <div class="vault-row">
        <button type="button" class="action-btn" data-gate="go">Upgrade now</button>
        <button type="button" class="action-btn outline" data-gate="backup">Download a copy first</button>
      </div>
      <div class="msg" role="status" id="gateMsg"></div>`);
    let choice = await choose(dlg, 'go', 'backup');
    try {
      if (choice === 'backup') {
        const legacyKey = await fetchLegacyKey(sb);
        const { backup } = await migrateLegacy({ sb, userId: uid, session, legacyKey, collect: true });
        download('sil-backup-unencrypted.json', JSON.stringify(backup, null, 2));
        showStatus(dlg, `<p class="vault-lead">Your copy has been downloaded. Keep it somewhere safe and delete it when you no longer need it.</p>
          <div class="vault-row"><button type="button" class="action-btn" data-gate="go">Upgrade now</button></div>`);
        await choose(dlg, 'go');
      }
      showStatus(dlg, `<div class="vault-working" role="status"><div class="vault-spinner" aria-hidden="true"></div><p class="vault-lead" id="gateProgress">Upgrading…</p></div>`);
      const legacyKey = await fetchLegacyKey(sb);
      const r = await migrateLegacy({
        sb, userId: uid, session, legacyKey,
        onProgress: d => { const p = dlg.el.querySelector('#gateProgress'); if (p) p.textContent = `Upgraded ${d} of ${n}…`; },
      });
      if (r.failed === 0) { await finish(); return; }
      showStatus(dlg, `<p class="vault-lead">${r.upgraded} upgraded. ${r.failed} could not be converted and have been left exactly as they were. We will try again next time you unlock.</p>
        <div class="vault-row"><button type="button" class="action-btn" data-gate="continue">Continue</button><button type="button" class="action-btn outline" data-gate="retry">Try again</button></div>`);
      if ((await choose(dlg, 'continue', 'retry')) === 'continue') return;
    } catch (e) {
      showStatus(dlg, `<div class="msg error" role="alert">${esc(e.message || 'Something went wrong.')}</div>
        <p class="vault-help">Nothing was lost: entries are only replaced after they have been checked.</p>
        <div class="vault-row"><button type="button" class="action-btn" data-gate="retry">Try again</button><button type="button" class="action-btn outline" data-gate="continue">Continue without upgrading</button></div>`);
      if ((await choose(dlg, 'continue', 'retry')) === 'continue') return;
    }
  }
}

const DISMISSED = Symbol('dismissed');

async function run({ dismissable = false } = {}) {
  let state = await vault.load();
  let dlg = null;
  try {
    if (state.state !== 'unlocked') {
      dlg = openDialog({ dismissable });
      dlg.title(state.state === 'no-vault' ? 'Protect your private writing' : 'Unlock your private vault');
      mountVaultPanel(dlg.panel, vault);
      const outcome = await new Promise(resolve => {
        const off = vault.onChange(s => { if (s.state === 'unlocked') { off(); resolve(); } });
        dlg.el.addEventListener('click', e => { if (e.target.closest('[data-dismiss]')) { off(); resolve(DISMISSED); } });
        if (vault.getSession()) { off(); resolve(); }
      });
      if (outcome === DISMISSED) return null;
    }
    if (!vault.legacyMigrated()) {
      dlg ||= openDialog({ dismissable });
      try { await upgradeOldEntries(dlg, vault.requireSession()); }
      catch (e) { console.warn('[vault] upgrade skipped:', e.message); }
    }
  } finally { dlg?.close(); }
  return vault.requireSession();
}

/** Resolves with the unlocked session; shows the unlock dialog first when needed. */
export function ensureVaultReady() {
  const s = vault.getSession();
  if (s && (vault.legacyMigrated() || migratedThisPage)) return Promise.resolve(s);
  running ||= run().then(r => { migratedThisPage = true; return r; }).finally(() => { running = null; });
  return running;
}
let migratedThisPage = false;

export async function encrypt(text) { return (await ensureVaultReady()).encrypt(text); }
export async function decrypt(payload) { return (await ensureVaultReady()).decrypt(payload); }
export async function decryptSafe(payload) { if (!payload) return null; try { return await decrypt(payload); } catch { return null; } }
export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  try { const p = JSON.parse(value); return typeof p.iv === 'string' && typeof p.ciphertext === 'string'; } catch { return false; }
}
/**
 * For the dashboard: people who still have entries under the old key are asked once,
 * right after they sign in, to create their passphrase. They can dismiss it; it is asked
 * again next time. People with nothing to upgrade are never interrupted here.
 */
export async function promptIfOldEntries() {
  try {
    const st = await vault.load();
    if (st.state !== 'no-vault' && vault.legacyMigrated()) return;
    const { data: prof } = await window._supabase.from('profiles').select('encryption_key_enc').eq('id', st.userId).single();
    if (!prof?.encryption_key_enc) return;
    if (running) return;
    running = run({ dismissable: true }).finally(() => { running = null; });
    await running;
  } catch (e) { console.warn('[vault] prompt skipped:', e.message); }
}
export const lockVault = () => vault.lock();
export const hasUserKey = () => !!vault.getSession();
