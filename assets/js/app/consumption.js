/**
 * /assets/js/app/consumption.js
 * The installed Android app is consumption-only: it gives access to a plan that already exists on the account, and it never sells,
 * prices, or links to buying one. Google Play's payments policy allows that without Play Billing. Purchases and billing management
 * happen on the website only, outside the app. Runs only inside the app, never on the website.
 */
export const HIDE_CSS = 'a[href*="/subscribe"],[data-purchase],.billing-actions{display:none!important}';

export const isSubscribePath = (p = '') => /^\/subscribe(\/|\/index\.html)?$/.test(p);

export function installConsumptionOnly(doc = document, loc = location) {
  const st = doc.createElement('style'); st.id = 'sil-consumption'; st.textContent = HIDE_CSS; doc.head.appendChild(st);
  if (isSubscribePath(loc.pathname)) {
    const show = () => {
      const m = doc.querySelector('main'); if (!m) return;
      m.innerHTML = '<section style="max-width:36rem;margin:3rem auto;padding:0 16px"><h1 style="font-size:1.4rem">Your plan</h1>' +
        '<p>Plans are not sold in this app. If your account has a plan, it works here once you sign in.</p>' +
        '<p><a href="/dashboard/" style="display:inline-block;padding:.7rem 1.1rem;border-radius:0;background:#1C554E;color:#fff;text-decoration:none">Back to the dashboard</a></p></section>';
    };
    // The page renders its own content after sign-in; replace it now and once more when it has finished.
    show(); doc.addEventListener('DOMContentLoaded', show); setTimeout(show, 1200); setTimeout(show, 3000);
  }
}
