# Google Play Console: answers to give

Draft for the Console forms. Every answer below must stay true to /privacy/ and to the app. Items marked ASK need a decision or a fact from Jordan; items marked CHECK must be read against Google's live form on the day, because the wording of the forms changes.

## App access (reviewers must be able to sign in)
* The app needs an account. Create a permanent review account (a Lab subscriber) and give its email and password under "App access", with a note that a vault passphrase is created on first save and that there is no two-factor step. ASK: create `review@...` with an active Lab plan that never expires.

## Ads
* Does the app contain ads? No.

## Target audience and content
* Target age: 18 and over only. Not designed for children. Do not tick any child age band.
* Content rating questionnaire (IARF): category "Utility, productivity, communication or other" is not right for a health tool; choose the closest wellness or reference option. Answer No to violence, sexual content, profanity, gambling and drugs. User-generated content: users can write private notes and send messages only to their own therapist; nothing is public. Users can interact: yes (messages with a therapist the person chose). Shares location: no. Digital purchases: no (the app sells nothing; see the consumption-only note below).

## Data safety (what to declare)
Collected, and sent off the device:
* Personal info: email address, name (display name), date of birth and pronouns (inside the encrypted intake form), contact and emergency contact (inside the encrypted intake form). Purpose: app functionality, account management. Optional: name and the intake form are optional; email is required. Encrypted in transit: yes. Not shared.
* Health and fitness: mood and energy check-ins, medications and health history in the intake form. All encrypted in the browser before upload, so Google's form should be answered "collected" with "end-to-end encrypted: yes, the developer cannot read it". Purpose: app functionality. Optional. Not shared (a therapist sees items only after the person sends them: this is the person's own sharing action, so it is not "sharing" with a third party in the form's terms, but say so in the description).
* Messages: messages with a therapist. Encrypted end to end. App functionality.
* Photos, audio: audio recordings the person saves (encrypted, stored in private storage). Photos used in an experiment are read on the device and not uploaded.
* App activity: game scores and instrument or mixer settings (stored unencrypted, disclosed in the privacy page); booking times. App functionality.
* Financial info: none collected by the app. Payment is handled by Stripe on the website only; the app has no purchase flow.
* Device or other IDs, location, contacts, calendar, web browsing, SMS, files and docs, installed apps: not collected.
* Crash logs and diagnostics: not collected (no analytics or crash SDK). CHECK that none is added later.
Shared with third parties: No data is shared for advertising or analytics. Service providers acting for us (Supabase for storage in Frankfurt, Netlify for hosting, Stripe for payments, Cal.com for booking) are processors and are not "sharing" in the form's terms; say so under the description if the form asks.
Security: data encrypted in transit (HTTPS): yes. Users can request that data be deleted: yes. Independent security review: no.
Deletion: in the app under Account, Delete account. Web link for deletion requests (required by Google): https://lab.jordanelias.de/privacy/#account-deletion (it explains the in-app path and the email route). ASK: confirm that URL is live after the deploy.

## Health apps declaration
* Does the app have health features? Yes: it is a self-directed wellness tool with music-therapy-informed exercises, mood and sensory check-ins, breathing and sound regulation tools, and a way to book and message a music therapist.
* It is not a medical device, makes no diagnosis, and gives no treatment claims. Say exactly that. Do not claim effects on the nervous system or any condition in the listing.
* It does not access Health Connect or any health sensor. Answer "No" to Health Connect and to clinical or medical device claims.
* Add the in-app crisis text (Telefonseelsorge 0800 111 0 111; findahelpline.com) in the description of the declaration, since the app shows it.

## Permissions declarations
* Microphone (RECORD_AUDIO): used only when the person presses a record button in a recording tool. Core to the recording and voice-note tools.
* Foreground service, type media playback (FOREGROUND_SERVICE_MEDIA_PLAYBACK): the app plays soundscapes and regulation audio and keeps them playing with the screen off, with a visible notification and a Pause button. Google asks for a short video showing a person start playback, turn the screen off, hear it continue, and see the notification. ASK: record this on a real phone once the build works.
* Notifications (POST_NOTIFICATIONS): check-in reminders the person sets and the playback notice.
* Wake lock: only while that service runs, at most six hours.

## Financial features, news, government, COVID, other declarations
* Financial features: none (no loans, banking, crypto, trading). Not a news app. Not a government app. No COVID-19 features.

## In-app products and subscriptions
* Decided 15 Nov: none. The app is consumption-only. It gives access to a plan bought on the website and never sells it, prices it, or links to buying it (the plans page and every purchase link or billing button are hidden in the app, see `assets/js/app/consumption.js`). Do not create any in-app products. Do not add wording in the app, the listing screenshots or the description that sends people to the website to pay; Google's payments policy only allows that under its external-offers programme. Telling people on the website, in emails, and on social media is fine.
* If you later want an in-app link to the website, look at Google's EEA external offers programme (enrolment, API integration, reporting, fees).

## Store listing
* Title, short and full description: android-app/store/listing.md. The wording there says nothing about effects on the body and must stay that way.
* Icon: android-app/store/play-icon-512.png. Feature graphic: android-app/store/play-feature-graphic-1024x500.png. Phone screenshots (at least two, 16:9 or 9:16): ASK, or I can make a set with the browser at phone size, but remember the app blocks screenshots, so they must be taken from the website at phone width or from a phone with the block off in a test build.
* Privacy policy URL: https://lab.jordanelias.de/privacy/
* Contact email: hello@jordanelias.de. Website: https://lab.jordanelias.de

## Account and testing
* ASK: personal or organisation account. A personal account created after November 2023 must run a closed test with at least twelve testers opted in for fourteen days before production access; an organisation account is exempt. CHECK Google's current page when you register.
* Signing: use Play App Signing (the default). After the first upload, the Console shows the SHA-256 certificate fingerprint; send it to me for the sign-in deep links.
