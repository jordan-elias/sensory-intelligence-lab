/**
 * /assets/js/worksheets/core.js
 * Shared plumbing for every worksheet page: header/footer, auth, vault, helpers.
 * Depends on /dashboard/auth-guard.js, which sets window._supabase and
 * window._currentUser and fires "authReady".
 */
import { ensureVaultReady as openVault, lockVault } from '/assets/js/vault/gate.js';

// ── Helpers ────────────────────────────────────────────
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function formatDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('en-GB', opts);
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// ── Auth ───────────────────────────────────────────────
export function whenAuthReady() {
  return new Promise(resolve => {
    if (window._currentUser && window._supabase) return resolve();
    window.addEventListener('authReady', () => resolve(), { once: true });
  });
}

export async function getSupabase() {
  await whenAuthReady();
  return window._supabase;
}

export function getUser() {
  return window._currentUser;
}

// ── Vault ──────────────────────────────────────────────
// Resolves with the unlocked vault session; shows the unlock / create-vault dialog if needed.
export const ensureVaultReady = openVault;

// ── Layout (header, breadcrumb, footer) ─
export function mountLayout({ crumbs = [] } = {}) {
  const header = document.getElementById('sil-header');
  if (header) {
    header.outerHTML = `
      <header class="sil-header">
        <a class="sil-header__wordmark" href="/dashboard/">Sensory Intelligence Lab</a>
        <button class="sil-header__toggle" id="silMenuToggle" aria-label="Toggle navigation" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
        <nav class="sil-header__nav" id="silNav">
          <a href="/dashboard/">Dashboard</a>
          <a href="/account/">Account</a>
          <a href="/booking/">Book a session</a>
          <button class="sil-header__signout" id="silSignOut">Sign out</button>
        </nav>
      </header>
      <nav aria-label="Breadcrumb" class="bc">
        <ol>
          <li><a href="/dashboard/">Dashboard</a></li>
          ${crumbs.map(c => c.href
            ? `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`
            : `<li aria-current="page">${esc(c.label)}</li>`).join('')}
        </ol>
      </nav>`;
  }

  const footer = document.getElementById('sil-footer');
  if (footer) {
    footer.outerHTML = `
      <footer>
        <p>Jordan Elias Music Therapy · Berlin ·
          <a href="https://jordanelias.de/contact/" target="_blank" rel="noopener">Contact</a>
        </p>
      </footer>`;
  }

  const toggle = document.getElementById('silMenuToggle');
  const nav = document.getElementById('silNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('sil-open');
      toggle.setAttribute('aria-expanded', open);
    });
    nav.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => nav.classList.remove('sil-open')));
  }

  const signOut = document.getElementById('silSignOut');
  if (signOut) {
    signOut.addEventListener('click', async () => {
      signOut.disabled = true; signOut.textContent = 'Signing out…';
      try { await lockVault(); } catch { /* signing out anyway */ }
      try { const sb = await getSupabase(); await sb.auth.signOut(); }
      finally { window.location.replace('/'); }
    });
  }
}
