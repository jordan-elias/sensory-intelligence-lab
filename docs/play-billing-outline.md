> **Not used. Decided 15 Nov 2026:** the app is consumption-only and Stripe on the website is the only payment system. This outline is kept only in case that changes.

# Selling the Lab plan in the Android app (Google Play Billing next to Stripe)

Status: outline for decision. Nothing here is built. Stripe is not changed by any of it.

## The idea in one paragraph
The website and the web app keep selling the Lab plan through Stripe, exactly as now. The Android app sells it through Google Play Billing.
Both write to the same place, so the rest of the product (gating, the account page, reminders) does not know or care where a plan was bought.
The "Subscribe" and "See plans" links stay in the app. In the app they open the Play purchase screen instead of Stripe Checkout.

## Why not Stripe links inside the app
Google's payments policy, as read on 15 November 2026, does not allow an app on Google Play to lead people to another way of paying for digital
subscriptions (buttons, links, web views), apart from regions covered by Google's own external-offers or alternative-billing programmes.
Keeping Stripe Checkout inside the Play build would risk the app being rejected or removed. The route above keeps every subscribe link and
still follows the rule. The region details (Germany and the rest of the EEA have programmes of their own) must be checked against the live
policy text before the app is submitted.

## What stays the same
* Stripe checkout, the Stripe webhook and the billing portal on the website and web app.
* `profiles.subscription_status / subscription_plan / subscription_tier / current_period_end`: still the single source the app reads.
* Therapy sessions: unchanged (booked on Cal.com, paid to the therapist by invoice, not through the app).

## What is new

### 1. Database (one migration, nothing removed)
`subscriptions` gets: `provider` ('stripe' default, or 'play'), `play_purchase_token` (unique, nullable), `play_product_id`, `play_order_id`.
`profiles` already has the entitlement columns; Play writes the same ones. `stripe_*` columns stay as they are and are simply empty for Play plans.

### 2. Play Console (needs the developer account)
* A subscription product `lab_monthly` (and `lab_yearly` if wanted) with a base plan at the same price as Stripe.
* A merchant (payments) profile and tax details in the Console.
* Licence testers, and the app uploaded to the internal test track (billing cannot be tried before an app build is uploaded).
* A Google Cloud service account with access to the Play Developer API, and a Pub/Sub topic for real-time notifications.

### 3. In the app
* A billing plug-in for Capacitor. Preferred: the open-source `cordova-plugin-purchase` (no third party sees the purchase). The alternative,
  RevenueCat, is easier but puts a company between us and the customer, so it is not recommended for this project.
* `assets/js/app/billing.js` (only runs in the app): the subscribe page and "See plans" call it, show the Play price, start the purchase,
  and send the purchase token to our server. On success the page refreshes the entitlement as it does today after Stripe.
* The account page shows the right management link for where the plan was bought: "Manage in Google Play" for Play plans, the billing portal
  for Stripe plans on the website. A Stripe plan seen inside the app shows its status without a link.
* Restore: on sign-in the app asks Play for the person's existing purchases and re-checks them with the server.

### 4. Netlify functions (new files; Stripe functions untouched)
* `play-verify-purchase`: receives the token from a signed-in user, asks the Google Play Developer API (`purchases.subscriptionsv2.get`) if it is
  genuine and active, maps the product to a tier, writes `subscriptions` and `profiles`, then acknowledges the purchase (Google refunds
  unacknowledged purchases after three days).
* `play-notifications`: receives Google's real-time notifications (renewed, cancelled, in grace period, on hold, expired, revoked), re-reads the
  subscription from the API and updates the same rows. This is what ends access when someone stops paying.
* Guard against paying twice: both `create-checkout-session` and the Play purchase check for an active plan from either provider first and say so.
* `delete-account`: also cancels an active Play subscription through the API, as it already does for Stripe.

### 5. Privacy and the store forms
* The privacy page lists Google Play (payments in the Android app) next to Stripe, and says we store a purchase token and what the plan is, never
  card details.
* Data Safety: "Purchase history" is declared as collected, used for app functionality, not shared.

## Money
Google keeps a service fee on subscriptions (15% at the time of writing: check the Console) against Stripe's card fees, which are smaller. In
return Google is the seller for VAT on Play sales and handles refunds and receipts. Setting the Play price a little higher than the web price is
allowed; whether that is wise is a business decision.

## What I can build before the account exists, and what needs it
* Now, with the Google API mocked in tests: the migration, both functions, the checks against double payment, the changes to the account page,
  `billing.js`, and delete-account.
* Needs the Play Console: creating the product, the service account, Pub/Sub, a test build on the internal track, and trying a real purchase.
* Expect one to two sessions of work, plus the testing time on a real phone, and the closed test if the account is a personal one.

## Decisions I need
1. Go ahead with Play Billing in the app, keeping Stripe on the web (recommended)?
2. Monthly only, or monthly and yearly?
3. Same price as the web, or a little higher in the app to cover the fee?
4. Billing plug-in: `cordova-plugin-purchase` (recommended) or RevenueCat?
