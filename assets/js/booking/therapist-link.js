/**
 * /assets/js/booking/therapist-link.js
 * Turns a therapist's saved booking link into what the booking page should show.
 *  - a Cal.com link is embedded as a calendar
 *  - any other https link opens in a new tab as a button
 *  - no link yet shows a plain message instead of a calendar
 *  (A therapist who cannot take bookings switches off "taking new clients"; existing clients still see the link.)
 */
const CAL_HOSTS = new Set(['cal.com', 'www.cal.com', 'app.cal.com']);

/** @returns {{kind:'cal', calLink:string}|{kind:'external', url:string}|null} */
export function parseBookingLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (CAL_HOSTS.has(u.hostname.toLowerCase())) {
    const calLink = u.pathname.replace(/^\/+|\/+$/g, '');
    if (/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(calLink)) return { kind: 'cal', calLink };
    return null;
  }
  return { kind: 'external', url: u.toString() };
}

/**
 * What to show for a client's active therapist.
 * @returns {{kind:'cal', calLink:string}|{kind:'external', url:string}|{kind:'paused', reason:'no-link'}}
 */
export function planFor(therapist) {
  if (!therapist) return { kind: 'none' };
  return parseBookingLink(therapist.booking_link) || { kind: 'paused', reason: 'no-link' };
}
