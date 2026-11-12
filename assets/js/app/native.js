/**
 * /assets/js/app/native.js
 * Loaded on every page of the installed Android app (never on the website). Handles what a browser tab does for you:
 * the back button, the status bar, links that leave the app, and reminder taps.
 */
import { refreshReminder, listenForTaps } from './reminders.js';
import { mountShell } from './shell.js';

// The app frame (tab bar, top bar) is for the installed app only; SIL_APP is set by the app build.
if (window.SIL_APP) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountShell()); else mountShell(); }

const cap = window.Capacitor;
if (cap?.isNativePlatform?.()) {
  const P = cap.Plugins || {};
  document.documentElement.classList.add('is-app');

  // Back: go back inside the app; on the first page, leave the app.
  P.App?.addListener?.('backButton', ({ canGoBack }) => {
    const home = ['/', '/index.html', '/dashboard/index.html'];
    if (history.length > 1 && !home.includes(location.pathname)) history.back();
    else if (canGoBack && !home.includes(location.pathname)) history.back();
    else P.App.exitApp?.();
  });

  // Links that leave the site open in the system browser, not inside the app.
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch { return; }
    if (/^https?:$/.test(u.protocol) && u.origin !== location.origin && u.hostname !== 'lab.jordanelias.de') {
      e.preventDefault(); P.Browser?.open?.({ url: u.href });
    }
  }, true);

  // Coming back from the phone's browser (payment, billing portal): de.jordanelias.sil://open?path=/subscribe/?success=true
  P.App?.addListener?.('appUrlOpen', ({ url }) => {
    try {
      const to = new URL(url).searchParams.get('path') || '/dashboard/';
      if (!to.startsWith('/') || to.startsWith('//')) return;
      location.href = to.replace(/^([^?#]*\/)(?=[?#]|$)/, '$1index.html');
    } catch (_) {}
  });

  P.StatusBar?.setStyle?.({ style: 'DEFAULT' });
  listenForTaps();
  refreshReminder();
}
