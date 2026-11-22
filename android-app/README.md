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
- Permissions: internet, microphone, audio settings, notifications, foreground service (media playback), wake lock (only while sound plays, at most six hours).
- No cloud backup or device-to-device copy of app data (the vault keys stay on the phone).
- Screenshots and the recent-apps preview are blocked on every screen (`FLAG_SECURE` in `MainActivity.java`).
- Return from the phone's browser after paying: `de.jordanelias.sil://open?path=/subscribe/` (via `/app-return/` on the site).

## Not done yet
- Sound with the screen off: written (`PlaybackService.java`, `PlaybackPlugin.java`, `assets/js/app/playback.js`) but NOT yet built or tried on a phone. Test: start a soundscape, switch the screen off, listen for ten minutes; check the notification "SIL is playing" and its Pause button; check the sequencer and Neural Synthesis keep time (the web page's timers may be slowed while hidden).
- App icon and splash artwork (the Capacitor defaults are in place).
- Sign-in email links opening the app: the app side is written (`assets/js/app/links.js`, an App Links filter in `AndroidManifest.xml`) but only works once `.well-known/assetlinks.json` lists the signing fingerprint: `node android-app/scripts/make-assetlinks.mjs <SHA-256>`.
- Signing and the Play Console setup: the Gradle side is ready (reads `android-app/android/keystore.properties`, which is git-ignored; `-PversionCode=N` for each upload). The key and the Console are yours: see `docs/android-your-steps.md`.
- The sequencer looks further ahead while the page is hidden, so it keeps time with the screen off (also to be checked on a phone).
- Payment rules are decided: the app is consumption-only; no Play Billing.

## Tests
`npm test` in the repository root covers the build (every link in the built app points at a real file), the reminder
scheduling, and the return-from-payment links.
