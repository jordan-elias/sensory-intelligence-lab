# SIL Android app (Capacitor)

The website is the single source. `www/` is generated from it and never edited by hand.

## First time (one machine)
1. Install Node 20+, a JDK 17+, and Android Studio (it brings the Android SDK).
2. `cd android-app && npm install`

## Every build
```
npm run sync      # builds www/ from the website and copies it into the Android project
npm run open      # opens the project in Android Studio; press Run to install on a phone or emulator
```
Run `npm run sync` again after any website change; the app does not update by itself.

## What the build step does (`scripts/build-web.mjs`)
- Turns clean addresses (`/account`) into real files, using the same table as `netlify.toml`.
- Points calls to the server functions at the live site (`SIL_API_BASE`, default `https://lab.jordanelias.de`).
- Leaves out the service worker and the test, docs and server folders.
- Adds `assets/js/app/native.js` to every page (back button, external links, return from the browser, reminders).

## Already set in the Android project
- Package `de.jordanelias.sil`, secure origin `https://localhost`.
- Permissions: internet, microphone, audio settings, notifications.
- No cloud backup or device-to-device copy of app data (the vault keys stay on the phone).
- Screenshots and the recent-apps preview are blocked on every screen (`FLAG_SECURE` in `MainActivity.java`).
- Return from the phone's browser after paying: `de.jordanelias.sil://open?path=/subscribe/` (via `/app-return/` on the site).

## Not done yet
- Sound with the screen off (needs a foreground service with a media notification).
- App icon and splash artwork (the Capacitor defaults are in place).
- Sign-in email links opening the app, and the payment-rules decision (Google Play Billing or not).
- Signing and the Play Console setup.

## Tests
`npm test` in the repository root covers the build (every link in the built app points at a real file), the reminder
scheduling, and the return-from-payment links.
