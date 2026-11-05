/**
 * /assets/js/vault/vault.js
 * The one object pages talk to. Holds the unlocked session in memory only.
 *
 *   await vault.load()                       -> { state: 'no-vault' | 'locked' | 'unlocked', ... }
 *   vault.getSession()                       -> session | null     (session.encrypt / decrypt / open / sign)
 *   vault.requireSession()                   -> session or throws VaultError('locked')
 *
 * Setup and recovery-key rotation are two-phase on purpose: nothing is written to
 * the server until the user confirms they saved the recovery key, so an abandoned
 * attempt never leaves an account in a half-finished state.
 */
import * as C from './vault-crypto.js';
import * as store from './vault-store.js';
import * as device from './trusted-device.js';

export { VaultError, checkPassphrase } from './vault-crypto.js';

let userId = null;
let record = null;          // { bundle, updated_at, recovery_acknowledged_at } or null
let session = null;
let trusted = false;
let pending = null;         // { kind: 'setup' | 'rotate', bundle, session?, recoveryKey }
let loaded = false;
let signOutWatch = false;
const TAB_FLAG = 'sil-vault-tab';
const IDLE_MS = 30 * 60e3;       // an unlocked tab with no activity for this long locks itself
let lastActivity = Date.now();
let idleTimer = null;
const listeners = new Set();

function snapshot() {
  return {
    state: !record ? 'no-vault' : session ? 'unlocked' : 'locked',
    fingerprint: record?.bundle?.fingerprint || null,
    trusted,
    userId,
  };
}
const emit = () => listeners.forEach(f => { try { f(snapshot()); } catch { /* listener errors never break the vault */ } });
export const onChange = f => { listeners.add(f); return () => listeners.delete(f); };

async function watchSignOut() {
  if (signOutWatch) return;
  signOutWatch = true;
  try {
    const sb = await store.client();
    sb.auth.onAuthStateChange(evt => { if (evt === 'SIGNED_OUT') lock(); });
  } catch { /* best effort */ }
}

export async function load({ force = false } = {}) {
  if (loaded && !force) return snapshot();
  userId = await store.currentUserId();
  record = await store.fetchKeys(userId);
  session = null; trusted = false;
  if (record) {
    const key = await device.load(userId);
    if (key) {
      try { session = await C.sessionFromContentKey(key, record.bundle, userId); trusted = true; }
      catch { await device.clear(); }
    }
    // Not a trusted device: carry an unlock between pages of the same tab, for a short time.
    if (!session && tabFlag()) {
      const tabKey = await device.loadTab(userId);
      if (tabKey) {
        try { session = await C.sessionFromContentKey(tabKey, record.bundle, userId); }
        catch { await device.dropTab(); }
      }
    }
    if (session) watchIdle();
  }
  if (!session && !tabFlag()) await device.dropTab();
  loaded = true;
  watchSignOut();
  emit();
  return snapshot();
}

function tabFlag(set) {
  try {
    if (set === true) sessionStorage.setItem(TAB_FLAG, '1');
    else if (set === false) sessionStorage.removeItem(TAB_FLAG);
    else return sessionStorage.getItem(TAB_FLAG) === '1';
  } catch { return false; }
}

/** Called after every successful unlock. */
async function remember() {
  lastActivity = Date.now();
  if (!trusted && session && await device.saveTab(userId, session.contentKey)) tabFlag(true);
  watchIdle();
}

let lastTouch = 0;
function touch() {
  lastActivity = Date.now();
  if (!session || trusted || lastActivity - lastTouch < 30e3) return;
  lastTouch = lastActivity;
  device.saveTab(userId, session.contentKey);   // slides the 30 minutes forward
}
function watchIdle() {
  if (idleTimer) return;
  for (const evt of ['pointerdown', 'keydown']) window.addEventListener(evt, touch, { passive: true, capture: true });
  idleTimer = setInterval(() => {
    if (session && !trusted && Date.now() - lastActivity > IDLE_MS) lock();
  }, 15e3);
}

export const getSession = () => session;
export const legacyMigrated = () => !!record?.legacy_migrated_at;
export async function markLegacyMigrated() {
  if (!record) throw new C.VaultError('no-vault', 'No vault yet.');
  record = await store.updateBundle(userId, record.bundle, record.updated_at, { legacy_migrated_at: new Date().toISOString() });
}
export function requireSession() {
  if (!session) throw new C.VaultError('locked', 'Your vault is locked.');
  return session;
}

// ── setup ───────────────────────────────────────────────
/** Creates keys locally. Returns the recovery key to show once. Nothing is saved yet. */
export async function startSetup(passphrase) {
  if (record) throw new C.VaultError('exists', 'A vault already exists for this account.');
  const r = await C.createVault({ passphrase, userId });
  pending = { kind: 'setup', bundle: r.bundle, session: r.session, recoveryKey: r.recoveryKey };
  return { recoveryKey: r.recoveryKey };
}

/** Call after the user confirms they saved the recovery key. */
export async function finishSetup({ keepUnlocked = false } = {}) {
  if (!pending || pending.kind !== 'setup') throw new C.VaultError('no-setup', 'Start the setup first.');
  try {
    record = await store.insertKeys(userId, pending.bundle);
  } catch (e) {
    if (e.code === 'exists') { pending = null; await load({ force: true }); }
    throw e;
  }
  session = pending.session;
  pending = null;
  if (keepUnlocked) await setTrusted(true);
  await remember();
  emit();
  return snapshot();
}

export function cancelPending() { pending = null; }

// ── unlock ──────────────────────────────────────────────
export async function unlock(passphrase, { keepUnlocked = false } = {}) {
  if (!record) throw new C.VaultError('no-vault', 'No vault yet.');
  session = await C.unlockWithPassphrase(record.bundle, passphrase, userId);
  if (keepUnlocked) await setTrusted(true);
  await remember();
  upgradeKdf(passphrase).catch(() => {});
  emit();
  return snapshot();
}

/** If stored Argon2 settings are weaker than today's default, re-wrap with the current ones. */
async function upgradeKdf(passphrase) {
  if (!C.needsKdfUpgrade(record.bundle)) return;
  const next = await C.changePassphrase(record.bundle, { passphrase }, passphrase, userId);
  record = await store.updateBundle(userId, next, record.updated_at);
}

/** Forgot the passphrase: the recovery key sets a new one and unlocks. */
export async function recover(recoveryKey, newPassphrase, { keepUnlocked = false } = {}) {
  if (!record) throw new C.VaultError('no-vault', 'No vault yet.');
  const next = await C.changePassphrase(record.bundle, { recoveryKey }, newPassphrase, userId);
  record = await store.updateBundle(userId, next, record.updated_at);
  session = await C.unlockWithRecoveryKey(record.bundle, recoveryKey, userId);
  if (keepUnlocked) await setTrusted(true);
  await remember();
  emit();
  return snapshot();
}

export async function changePassphrase(currentPassphrase, newPassphrase) {
  if (!record) throw new C.VaultError('no-vault', 'No vault yet.');
  const next = await C.changePassphrase(record.bundle, { passphrase: currentPassphrase }, newPassphrase, userId);
  record = await store.updateBundle(userId, next, record.updated_at);
  emit();
}

// ── recovery key rotation (two-phase) ───────────────────
export async function startRecoveryRotation(passphrase) {
  if (!record) throw new C.VaultError('no-vault', 'No vault yet.');
  const r = await C.newRecoveryKey(record.bundle, { passphrase }, userId);
  pending = { kind: 'rotate', bundle: r.bundle, recoveryKey: r.recoveryKey };
  return { recoveryKey: r.recoveryKey };
}
export async function finishRecoveryRotation() {
  if (!pending || pending.kind !== 'rotate') throw new C.VaultError('no-rotation', 'Start again.');
  record = await store.updateBundle(userId, pending.bundle, record.updated_at, { recovery_acknowledged_at: new Date().toISOString() });
  pending = null;
  emit();
}

// ── this device ─────────────────────────────────────────
export async function setTrusted(on) {
  if (on) {
    if (!session) throw new C.VaultError('locked', 'Unlock first.');
    trusted = await device.save(userId, session.contentKey);
  } else {
    await device.clear();
    trusted = false;
    await remember();      // still unlocked, but only for this tab and 30 quiet minutes
  }
  emit();
  return trusted;
}

export async function lock() {
  session = null; trusted = false; pending = null;
  tabFlag(false);
  await device.clear();
  emit();
}
