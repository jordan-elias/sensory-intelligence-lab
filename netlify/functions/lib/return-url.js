/**
 * Where Stripe sends the person back to. From the website that is the page itself. From the Android app the payment
 * happens in the phone's browser, so Stripe returns to a small bridge page that hands the person back to the app.
 */
export function returnUrl(site, path, fromApp) {
  if (!fromApp) return site + path;
  return `${site}/app-return/?to=${encodeURIComponent(path)}`;
}
