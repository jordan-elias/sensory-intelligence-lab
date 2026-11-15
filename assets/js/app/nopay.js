/**
 * /assets/js/app/nopay.js
 * The installed Android app does not sell anything and does not lead anyone to a payment. Subscriptions are bought on the
 * website, and the app only shows what a person already has. So inside the app every purchase and billing link is hidden,
 * the subscribe page is not reachable, and nothing here opens the payment provider. (Google Play's payment rules do not allow
 * an app to lead people to another way of paying.) Loaded by native.js; it never runs on the website.
 */
export const HIDE = [
  'a[href*="subscribe"]', '#portalBtnMain', '#deleteGatePortalBtn', '.billing-link', '.sil-upgrade-banner__cta',
  '.nudge-actions a[href*="subscribe"]', '[data-purchase]', '[data-billing]',
].join(',');
export const isPurchasePath = p => /(^|\/)subscribe(\/|$|\/index\.html)/.test(String(p || ''));

export function installNoPay(win = window) {
  const d = win.document;
  if (isPurchasePath(win.location.pathname)) { win.location.replace('/dashboard/index.html'); return; }
  const st = d.createElement('style'); st.textContent = `${HIDE}{display:none!important}`; (d.head || d.documentElement).appendChild(st);
  // Anything that still tries to reach the subscribe page or the payment provider is turned back.
  d.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    let u; try { u = new URL(a.href, win.location.href); } catch { return; }
    if (isPurchasePath(u.pathname) || /(^|\.)stripe\.com$/.test(u.hostname)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}
