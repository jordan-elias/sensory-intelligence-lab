# What only you can do

Tick these off in roughly this order. I cannot reach your Supabase, Netlify, Resend, Stripe, Cal.com, DNS or Play Console accounts from here, so nothing below has been done or checked live. "Check" means I could not verify it.

## 1. Email (Resend)
- [ ] **Verify your domain in Resend** (Resend dashboard, Domains). It shows the DNS records to add at your domain host. If `hello@jordanelias.de` is already sending your confirmation emails, this is probably done: check that the domain shows "Verified".
- [ ] **SPF and DKIM:** the records Resend gives you. They prove the email really came from your domain.
- [ ] **DMARC** (optional but advised, Resend does not add it): one TXT record, name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:hello@jordanelias.de`. Start with `p=none`, which only sends you reports.
- [ ] **A mailbox that receives mail** at `hello@jordanelias.de`. It is the contact address in about 15 places on the site and the default sender in the reminder functions. People will reply to reminders.
- [ ] **Netlify env var `RESEND_FROM_ADDRESS`** (optional): only if you want a different sender than `Jordan Elias <hello@jordanelias.de>`. `RESEND_API_KEY` must be set.
- [ ] **Supabase Auth emails:** Supabase, Authentication, Emails (SMTP). Check that custom SMTP uses Resend, so password reset, magic link and "change email" go through Resend too, not only the signup confirmation. Check the template wording for each.

## 2. Supabase
- [ ] **Run `docs/sql/phase15_001_share_journal.sql`** (new, needed for journal sharing; safe to run twice).
- [ ] **SQL to run, in the SQL editor:** `phase14_001_course_progress.sql` (in `docs/sql/`, new course sync table). Also `phase11_001_family_history.sql` (if not yet) and `phase12_001_keep_therapist_records.sql`. **I could not find those two files in this repository**; they were run or written earlier, so check they exist and ran. If they are missing, tell me and I will recreate them from the code.
- [ ] **Auth URL settings:** Site URL and Redirect URLs include `https://lab.jordanelias.de` (and later the app deep link).
- [ ] **Row Level Security** is on for every table (Table Editor shows a shield). Worth one look after the SQL runs.
- [ ] **Backups:** check what your plan includes. The client-side vault means a lost recovery key cannot be recovered by us.

## 3. Netlify (environment variables, Site settings)
Set (names as the code reads them): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_LAB_MONTHLY_PRICE_ID`, `STRIPE_LAB_YEARLY_PRICE_ID`, `CAL_WEBHOOK_SECRET`, `GENIUS_CLIENT_TOKEN`, `YOUTUBE_API_KEY`. Optional: `RESEND_FROM_ADDRESS`.
- [ ] Scheduled functions (`send-session-reminders`, hourly; `send-checkin-reminders`, daily 17:00 UTC) show up under Functions after the first deploy.
- [ ] After the first deploy, check the photo-words OCR works (Netlify serving the `.gz` data files).

## 4. Stripe and Cal.com
- [ ] **Stripe webhook** points to `https://lab.jordanelias.de/.netlify/functions/stripe-webhook` and its signing secret is in `STRIPE_WEBHOOK_SECRET`. Test mode first.
- [ ] **Customer portal** is configured (cancel, update card), because the account page links to it.
- [ ] **Cal.com webhook** points to `https://lab.jordanelias.de/.netlify/functions/cal-webhook`, with the same secret as `CAL_WEBHOOK_SECRET`.

## 5. Go-live (target 1 January 2027)
- [ ] Merge the stacked branches in order (app-26 up to app-47 on top of what is already on main). Because each branch is stacked, merging the last one brings in the rest. Do it with one pull request or a fast-forward.
- [ ] **Deploy once by hand** (this is what costs Netlify credits). Then `git pull` and `npm run sync` for the Android copy.
- [ ] **Open the site up to search engines:** in `robots.txt` remove `Disallow: /` and add allows for the public pages, and remove the `noindex` tags on the pages that should appear. Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- [ ] Listen once to: breathing sounds, workbench, strings, versions loops, regulation voice, piano roll. Tell me what to change.

## 6. Legal and privacy (not legal advice; check with a professional)
- [ ] **Impressum:** the page is built (`/impressum/`, linked from the footers, in robots and the sitemap) but the blanks marked in yellow need your details: street, postcode, phone (optional), VAT ID or the small-business sentence, and the dispute-resolution sentence. Run `npm run check:launch` to list what is still blank. Have it checked, since the exact wording depends on your status.
- [ ] **Privacy policy** must match what the app now does: encrypted course sync, worksheets you can share with a therapist, the therapist Folder, family history, Stripe, Resend, Supabase, Netlify. Journal sharing is not built, so it stays out until you say go.
- [ ] **Data-processing agreements** with Supabase, Netlify, Resend and Stripe (most offer them in their dashboards).
- [ ] **Therapist record retention:** decide the default and get a legal opinion for the countries you serve.

## 7. Android (last, as agreed)
- [ ] Google Play developer account; set up the app `de.jordanelias.sil`.
- [ ] **Deep links:** needs the app's signing-key SHA-256 fingerprint and a `/.well-known/assetlinks.json` file on the site. Send me the fingerprint and I will add the file.
- [ ] A **review account** for Google's testers (a login they can use), a **Data safety** form, the privacy policy URL, screenshots, and an **internal testing track** release.
- [ ] A phone test of the app (nothing has run on a real device yet).

## Ambience
- [ ] Add the nature loops as listed in `docs/ambience-audio.md` (ocean, rain, stream, fire; birds already exists), with their sources in `audio/ambience/SOURCES.md`.
- [ ] Listen: balance between rows, whether the lofi drums, chords and melody feel calm, whether Drift changes feel natural. Tell me what to change.
- [ ] Spoken word files and where they come from (public domain, Creative Commons, or your own).

## Things I need from you
- A decision on journal sharing, health wording, and what is missing from the Soundscape Machine.
- Whether `phase11` and `phase12` SQL files exist on your side.
- The SHA-256 fingerprint once the Play app signing key exists.

- [ ] Run docs/sql/phase16_001_recovery_checked.sql in Supabase (recovery key check; the app works without it).
