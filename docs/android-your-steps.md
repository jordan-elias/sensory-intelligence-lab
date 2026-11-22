# Android: what only you can do

Everything I could do without your phone, your keys or the Play Console is in the repository (branch `app-66-android-prep`). The cloud workspace I work in has no Android SDK and cannot reach Google's servers, so **nothing here has been built into an APK or tried on a phone yet.** Expect the first build to need small fixes.

## 1. On your computer (once)
- [ ] Install Android Studio (it brings the SDK and a JDK). Install Node 20+.
- [ ] `cd android-app && npm install`
- [ ] Every time the website changes: `npm run sync`, then `npm run open` and press Run (phone or emulator).
- [ ] If Gradle or the build stops with an error, paste me the first red lines. I can fix most from the text.

## 2. First test on your phone (the important one)
Turn on Developer options and USB debugging, plug in, press Run. Then check, in this order:
- [ ] The app opens, you can sign in, the tab bar shows, the back button behaves.
- [ ] **Sound with the screen off:** start a soundscape, switch the screen off, listen for ten minutes. The notification "SIL is playing" shows with a Pause button, and Pause stops the sound.
- [ ] Sequencer and Neural Synthesis keep time with the screen off (the sequencer now looks further ahead while hidden; tell me if it drifts).
- [ ] Screen on while playing (sequencer, guided sessions): it stays on, and goes back to normal after Stop.
- [ ] Recording a voice note works (microphone permission asks once).
- [ ] A check-in reminder arrives at the time you set.
- [ ] The app shows no plans page, price or buy link anywhere (consumption-only).
- [ ] A screenshot attempt is blocked (this is on purpose).
- [ ] Paying on the website from the phone browser and tapping back returns into the app.

## 3. Your signing key (never send me the file or the passwords)
- [ ] In Android Studio: Build > Generate Signed App Bundle > Android App Bundle > Create new keystore. Keep the `.jks` file and both passwords somewhere safe and backed up (a password manager plus a second copy). **If you lose it, updates are painful.**
- [ ] For building from the command line, copy `android-app/android/keystore.properties.example` to `keystore.properties` and fill it in. It is git-ignored.
- [ ] For every upload to Google Play, raise the number: `./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.1` (or set it in Android Studio's signed-bundle dialog).

## 4. Google Play Console
- [ ] Create the developer account (personal or organisation; a personal account made after Nov 2023 needs a closed test of at least 12 testers for 14 days before production. See `android-app/store/play-console-answers.md`).
- [ ] Create the app, accept Play App Signing (the default), and upload the first bundle to Internal testing.
- [ ] Fill in the forms using `android-app/store/play-console-answers.md` and the text in `android-app/store/listing.md`. Read every answer against Google's live form on the day.
- [ ] Make a permanent review account (a Lab subscriber) and put it under "App access".
- [ ] Record the short video Google asks for showing the "SIL is playing" notification (foreground service).
- [ ] Phone screenshots (at least two). The app blocks screenshots, so use the website at phone size or an emulator; tell me if you want me to make a set.
- [ ] Confirm https://lab.jordanelias.de/privacy/#account-deletion is live after the deploy.

## 5. Make sign-in email links open the app
After your first upload, the Console shows the signing fingerprint (Setup > App signing > SHA-256 certificate fingerprint).
- [ ] Send me that fingerprint (it is public, not secret), or run it yourself: `node android-app/scripts/make-assetlinks.mjs <SHA-256>` (add your upload key's fingerprint too while testing).
- [ ] That writes `.well-known/assetlinks.json`; include it in your single manual deploy. Check https://lab.jordanelias.de/.well-known/assetlinks.json opens as JSON.
- [ ] On the phone: tap a sign-in email link. It should open the app. (If it opens the browser, Android has not verified the link yet; `adb shell pm get-app-links de.jordanelias.sil` shows why.)
- [ ] In Supabase (Authentication > URL configuration) the site URL and redirect URLs should stay as the website addresses. No change is needed for the app.

## 6. Also yours
- [ ] App icon and splash artwork (the Capacitor defaults are in place).
- [ ] Choose the content-rating answers and Health apps declaration text (drafts in `play-console-answers.md`).
- [ ] Legal check of the privacy policy and Impressum before launch (1 January 2027).
