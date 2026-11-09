/** Registers the service worker so tools you have opened keep working without a connection. Safe to fail. */
export function registerOffline() {
  try { if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch (_) {}
}
