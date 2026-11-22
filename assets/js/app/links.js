/**
 * /assets/js/app/links.js
 * Works out where inside the app a link that opened it should go. Two kinds open the app:
 *  1. de.jordanelias.sil://open?path=/subscribe/   (the return from paying in the phone's browser)
 *  2. https://lab.jordanelias.de/account/ ...       (sign-in email links and the like, opened by Android App Links)
 * Only paths on this site are ever followed, never another address. Returns a path (with its query and hash) or null.
 */
export const SITE_HOST = 'lab.jordanelias.de';
/** Paths the app agrees to open from a web link. Keep in step with the intent filter in AndroidManifest.xml. */
export const APP_LINK_PREFIXES = ['/account/', '/dashboard/', '/app-return/'];

const plain = p => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && !/[\u0000-\u001f]/.test(p);
const withIndex = p => p.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html');   // the app serves real files, so /x/ becomes /x/index.html

export function appPathFromUrl(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol === 'de.jordanelias.sil:') {
    const to = u.searchParams.get('path') || '/dashboard/';
    return plain(to) ? withIndex(to) : null;
  }
  if (u.protocol === 'https:' && u.hostname === SITE_HOST && !u.port && !u.username) {
    if (!APP_LINK_PREFIXES.some(p => u.pathname.startsWith(p))) return null;
    if (u.pathname.startsWith('/app-return/')) {   // the hand-back page: follow its own "to"
      const to = u.searchParams.get('to') || '/dashboard/'; return plain(to) ? withIndex(to) : null;
    }
    const p = u.pathname + u.search + u.hash;      // keep the sign-in code or token so the app can finish signing in
    return plain(p) ? withIndex(p) : null;
  }
  return null;
}
