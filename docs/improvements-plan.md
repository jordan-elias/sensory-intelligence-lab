# Improvements plan

Open work, roughly in the order it was raised. Constraints that apply to everything: private until the client shares; sharing never on by default; privacy claims must be true; no Netlify deploys from branches; Android API calls go through `assets/js/api.js`.

Full review and the ordered plan: see `docs/review-2026-11.md`.

## In progress
- **Neural Synthesis**: Instrument mode (network as oscillator), inspector, essay. Remaining: listening check by ear, mobile layout check.
- **Experiments in Creativity**: guided one-step-at-a-time flow; drop hypothesis, prediction and the 1–5 surprise; open-ended reflection at the end.

## Planned

### Therapist client notes: a connected web of context
**Goal.** Give a human therapist the context advantage people go to AI therapy for: everything about a client reachable in a click, and the links between things visible. The therapist stays the author and the decision-maker.

**What it holds, per client**
- Intake form and family history (already collected) as the first notes.
- A note for each session (date, free text, optional structure: mood, goals, homework).
- **Entities**: people (mother, ex-partner, boss), events (the move in 2019, the diagnosis), places, and recurring things.
- **Themes and patterns** (perfectionism, avoidance, grief, sleep, "freezes when criticised"), each with a short description the therapist can refine over time.
- **Links** between any two items, with an optional label ("triggered by", "same pattern as", "began after"). Written inline as `[[Mother]]` or `#perfectionism` while typing a note, Obsidian-style, so linking costs nothing.

**Views**
- Backlinks: open "Mother" and see every session and theme that mentions her.
- Timeline: events and sessions along one line, filterable by theme.
- Graph: people, events and themes as a network; click through to the notes.
- Relational tables: themes × sessions (when did each come up), people × themes, with counts.
- Pre-session brief: one screen with the last session's open threads, active themes, and anything the client shared since (check-ins, journal items they chose to share).

**Obsidian ideas worth borrowing:** wiki-style links, backlinks, graph view, tags, daily-note feel, everything searchable as plain text, export as Markdown so the therapist is never locked in.

**Decisions (from Jordan, 14 Nov)**
- Total encryption: notes are encrypted on the therapist's device before they leave it. We cannot read them. Privacy comes first, ahead of any convenience feature.
- Clients can have their records sent to them on request. The therapist generates the export (Markdown plus a PDF) from their own device and sends it; we hold nothing readable.
- If a client leaves, the therapist chooses whether to keep or delete that client's records. Nothing is deleted or kept automatically. Provide both a one-click export-then-delete and a keep-as-archive option, each with a clear confirmation.
- No LLM and no network: any analysis runs on the therapist's device.

**Still to settle**
1. How long records should be kept by default, and what the platform says about professional retention duties (these differ by country and profession; the therapist decides, we do not advise).
2. Shared Cal.com account and freelancer-by-invoice model: notes are scoped per therapist, never per account.
3. Anything the client sees (for example homework) stays a separate, explicit, per-item action.
4. Key recovery: already handled by the vault's recovery key. The page should say plainly that without the passphrase and recovery key the notes cannot be opened by anyone.
5. **Decided (14 Nov): therapists keep their records if the client deletes their account.** `phase12_001_keep_therapist_records.sql` removes the foreign key so notes survive, and the app copies the intake form, family history and client name into the therapist's own encrypted record when they open them. The privacy policy and the client-facing send screens say so plainly. Kept records open from the Archive page (`/therapist/archive/`). Still worth a short legal check by country on how long records should be kept and how a client's erasure request interacts with professional record-keeping duties.

**On-device analysis: what is possible without an LLM**
Built (`assets/js/notes/`, tested): all of this is plain code over the therapist's own words.
- Word counts, recurring words across the record, and distinctive words per session (TF-IDF).
- Backlinks for any person, event or theme; a themes-by-sessions table; a graph where two things are joined when they come up in the same session or the same sentence.
- "Not revisited lately": a theme that used to come up and has been quiet for N sessions.
- A tone reading per session from a small sentiment word list (handles "not happy", "really sad"), plus six emotion families per 100 words, shown with how many words were counted so thin evidence is visible.
- Style markers researchers use descriptively: first-person share, absolutes ("always", "never"), questions, past versus future focus.
- Theme suggestions from seed word lists (sleep, anxiety, low mood, grief, anger, self-criticism, avoidance, relationships, work, body, self-worth, trauma). Suggestions only: the therapist accepts, renames or ignores.
- Markdown export with [[links]] kept, so notes open in Obsidian or any notes app.

Possible later, still on-device: a small embedding model run in the browser (tens of MB, downloaded once from our own hosting, never sent anywhere) for "find sessions like this one" and grouping similar passages; (done) German word lists; a therapist-editable theme dictionary; simple trend lines per theme.

Honest limits: lexicons miss irony, slang, negation across clauses and context, and they only know the words in their lists. Counts describe the notes; they do not describe the client. They are there to point the therapist back to what they wrote, never to score, label or diagnose a client, and the interface should say so.

**Possible build order**
0. Done: parsing, analysis, graph and export modules with tests.
0c. Done: life story timeline filled in automatically from years, ages and life stages in the text; phrases (bigrams), rising and fading words, emotion trends, follow-a-word charts, and "comes up with / words around it" for every person or theme.
0b. Done (branch app-18): the Record tab on the therapist's client page: notes with session dates, [[links]] and #themes, intake and family history in the same record, backlinks, search, map, themes by session, timeline with tone and theme suggestions, before-a-session brief, Markdown and text export, keep-or-delete with typed confirmation. Uses the existing vault (passphrase and recovery key), so no new key design was needed.
1. Session notes per client, encrypted on the therapist's device, with date and free text. Intake and family history shown as the first entries.
2. (done) `[[links]]` and `#themes`, backlinks.
3. (done) A short description per person, event and theme, saved encrypted and included in the export.
4. (done) Timeline and themes × sessions table.
5. (done) Graph view and pre-session brief. Zoom and pan are done; arranging nodes by hand is not.
6. (done) Markdown and text export, keep-or-delete. PDF is done through the print dialog (Save as PDF). Import of Markdown is done (app-57). Still to do: an optional reminder when a retention period the therapist sets has passed.

0c. Done (branch app-20): retention reminder (default 10 years for Germany, the therapist's own setting, 0 = off; in-app only on the therapist's device; counts from the latest of end of connection, last session, last note; never deletes anything; "remind me again in a year"). Caseload page (`/therapist/caseload/`): sessions with no note yet, clients not written up lately, themes across clients; people are never matched across clients. Markdown import dropped (notes are written in the Lab). To check with a lawyer: retention duty and client erasure rights by country.

0d. Done (branch app-21): Regulation sound. The current-to-target arc and the drone/rhythm layers are unchanged. New: a melodic voice (`assets/js/regulation/character.js`, tested) whose scale, register, speed, note length, tone colour and echo move from the current state's character to the target's; a transparent safety limiter; page copy rewritten to make no claims about the nervous system. Plain Web Audio kept (live and WAV render share one graph); Tone.js not needed. Still to do: listen by ear and tune the per-state values in `character.js`. The home page meta description still says "nervous system regulation".

0e. Done (branch app-22): Sequencer step velocity (100/75/50/25 %), step chance, per-track length (polymeter), and savable patterns on the device only (`assets/js/seq/patterns.js`, validated on load, up to 30). Tested in `tests/seq/steps.test.mjs` and `t50`. Chance makes WAV export vary from run to run when a step is below 100 %.

0g. Done (branch app-28): Experiments in Creativity, storage and guidance (plan sections 2E and 4 of `docs/review-2026-11.md`).
- Storage: one record (`assets/js/experiments/progress.js`): done, notes, saved step, Keep shelf. Local first; the two old keys are migrated once; merges across tabs and devices (newer wins, done never undone, deletes stay deleted). Optional encrypted sync (`sync.js`, table `course_progress`, SQL in `docs/sql/phase14_001_course_progress.sql`, ciphertext only, never prompts for the passphrase on page load). Recordings stay on the device (IndexedDB) and are never synced. Account deletion removes the row.
- Guidance: tools shown with the step that uses them (rolled values carry forward), inline timers for steps that ask for a time (chime and vibration at the end), "before you begin" list, resume at the saved step, "which one for me?" suggestion, unit-finished note, capstone "ready" hint, screen kept awake during steps, Keep shelf (`#/keep`), looking-back counts on the notebook page.
- Not done: spoken steps; a bank of capstones; more no-equipment experiments (content decisions); haptics through a native plugin (the browser vibrate call is used). Sitemap now lists about and therapy (robots.txt allows them).

0h. Done (branch app-29): session comfort (`assets/js/app/session.js`). The screen stays on while breathing, regulation, the timed journal and the Soundscape Machine are running (Screen Wake Lock; released on pause, end or leaving). A phone buzzes once when a timed session ends; a gentle buzz with each breath phase is opt-in (breathing page, shown only where the phone can vibrate). Breathing now ends on a calm note with next steps. The Sequencer does not hold the screen yet.

0f. Done (branch app-23): photo-words reads the words in the photo on the device (Tesseract, vendored under `assets/js/vendor/tesseract`, English and German, loaded only on button press, nothing stored or sent; typed words still work and the list is always editable). About 16 MB in the repo and, after `npm run sync`, in the Android app too. Not checked: how Netlify serves the `.gz` language files (if it adds `Content-Encoding: gzip` the reader will fail and show the typed fallback message); check once after the first deploy.

### Simplify the experiments, match the lab's look, and finish in place (raised 16 Nov 2026)
Feedback: the course asks for too much, repeats itself, and looks unlike the rest of the lab. Principle for everything below: **the person should never have to confirm something the app can decide, and should never need another tool or sheet of paper to finish an experiment.** Nothing here changes privacy: results stay on the device unless the person turns on the existing encrypted sync.

**A. Fewer decisions: auto-keep, redo, one save**
- Remove the per-tool "Keep this" button. Every roll, draw or result is held automatically in that experiment's working record. The button becomes **Roll again** (or **Redo**), and the last result is the one that counts.
- Keep is never required to move on. Reaching the end counts as done.
- One **Save** at the end, pre-ticked: note, rolled values, chosen rhythm, and any clip (clip stays on the device). Untick to finish without saving.
- Auto-roll when a step opens, so the first thing seen is a result, not a button.
- Merge trivial steps (for example "draw", then "write down what you drew") so most experiments take 3 to 5 taps, not 8 to 12.
- Sticky Next on phones; offer the next experiment on the end screen with one tap.

**B. A one-screen start**
- Start screen = title, one-line question, the first step, one **Begin**. Nothing else.
- Drop the Time / You need / Steps / The limits block and the "Before you begin" checklist. Move everything into a collapsed **About this experiment** (time, what you need, limits).
- Limits appear only as a small hint inside the step they apply to ("2 pitches", "12 minutes").

**C. Square, like the rest of the lab**
- Boxes, chips, toggles, progress bar and buttons use `border-radius: 0`, hairline borders and the `.btn` classes from `assets/css/ui.css` (heading font, no pills or circles).
- Same fix for the rounded dashboard **check-in banner** (`.checkin-hero`), the **insight card** (`.insight-card`), the Today path (`assets/css/today.css`) and the course CSS in `experiments/index.html`.
- Check: a test that fails if any lab stylesheet or page sets a radius above 0 (allow-list for avatars/dots if needed).

**D. Do it right there**
- **Written part in place:** photo-words and every experiment whose step says "write..." gets a text area under the step. Text saves with the experiment note automatically (no "keep"). Words from a photo: the word list, the shuffled frame and the line-per-word writing all in one screen, with a counter.
- **Phrase player** (new tool for fixed-notes-rhythm, five-note-cage, borrowed-chords, dice-melody, borrowed-rhythm, random-pitch-fixed-rhythm and similar): take the rolled notes and the rolled rhythm and **apply the notes to the rhythm any way the person wants**: in order, cycle, reverse, random per hit, or tap a note onto each step by hand; octave and tempo controls; **Play** and loop so they hear it at once. Optional "record this" saves a clip to the shelf.
- **Audit pass over all 36 experiments**: for each, list what the person still has to do outside the page (open another tool, use paper, play an instrument) and add an in-page version where it is feasible (a tap pad, a simple keyboard, a text area, a built-in recorder for clip experiments). The on-paper and instrument versions stay as the default wording.
- Tool groups that exist today and will gain a "finish here" action: gen+groove (9 experiments), clip (6), gen+clip (1), wordpoem (2), cards (2), assign (2), loops (2).

**E. Tool improvements**
- **Breathing**: richer sound (soft pad plus a filtered noise "breath" that rises and falls with the phase), choice of sound (tones, pad, noise, silence), per-phase fades so there are no clicks, optional bell at the end. Needs a listening check by ear.
- **Cocktail party problem**: an immediate visible **Loading sounds... n%** state; Play stays disabled until ready; show an error with Retry (the loader currently swallows failures); the three empty choice buttons get accessible names before the first round.
- **Spatial game**: streaks and a combo score; endless/adaptive mode that gets harder or easier from how the person is doing; a daily challenge; a headphones check before round one; replay the path after a miss; environments with different reverb; haptics on Android; personal bests kept on the device. Goal: more fun and more of a reason to come back, with no leaderboards and nothing sent anywhere.

**F. Account page and worksheets**
- **Therapists**: add "Edit your therapist profile" (to `/therapist/profile/`) on the account page, shown only when the person has a `therapist_profiles` row.
- **Worksheets**: make "Before we begin" and "Reflection" collapsible like the other sections, and add **Expand all / Collapse all** on every worksheet (music autobiography first). Remember open/closed state on the device; printing always expands everything.

**G. Today path (done, branch app-30)**
- Dashboard "Today" card: check-in, then one tool chosen from the person's answers and recent use, then a one-line note; first-run questions are local and skippable. Needs the square styling from C.

**Progress**
- Done (branch app-32): C square styling for the course, Today card, dashboard check-in banner and insight card, app shell; F therapist-profile link on the account page; F worksheet sections collapsible with Expand all / Collapse all (state remembered per device, always open in print). Test: `tests/browser/t57.mjs`.
- Done (branch app-33): B one-screen start (title, question, first step, Begin; time/needs/limits/solo/method folded into "About this experiment"; checklist removed). A auto-roll when a step opens for dice and rolled rhythms, "Roll again", per-tool Keep button removed, one pre-ticked "Save on this device" list on the end screen (saving again replaces, never duplicates), Keep never required, sticky Next on phones. Not done from A/B: merging trivial steps (needs a content pass over the catalog) and limits as inline hints (steps already state their numbers; limits stay in About).
- Correction (17 Nov): drawing and rolling stay manual. Auto-roll was removed; only the per-tool Keep button is gone (results are saved once at the end).
- Done (branch app-34): D phrase player "Play it" (appears wherever notes are drawn: set notes by hand or use the drawn ones, switch beats on and off or use the rolled rhythm, choose which note each beat plays or fill by rule (in order, backwards, random, first note), octave and tempo, Play/Stop, offered for saving as "My phrase"). Steps made clearer: about 30 steps now say exactly which button to press, and each step shows a "Use ... below" cue for its tool. Tests t58, steps unit test.
- Done (branch app-34): in-place writing: a line to type under each end-word in the poem tools (Words from a photo, Borrowed end-words), a counting writing pad for List prompts (n of 15); both offered for saving at the end.
- Done (branch app-35): E cocktail party (visible "Loading sounds… n%" from first paint, Play off until ready, Try again on failure, named answer buttons); spatial game (in-a-row and longest-run counters kept on the device, optional "move the level up and down for me", haptics, headphone check); breathing sound choice (soft drone as before, drone with an audible breath, warm pad, quiet chimes; remembered on the device). Tests t59 to t62.
- Not done yet: spatial game daily challenge (needs seeded paths), environments with different reverb, path replay after a miss (the path is already drawn); breathing sounds need a listening check by ear; the "do it right there" audit for clip, loops and DAW-style experiments (they still rely on your own instrument or software for some steps); merging trivial steps.

**Round 2 (17 Nov review: the experiments as seeds of inspiration)**: see `docs/course-review-2026-11-17.md`. Headline: every experiment should end in a Seed card you can take away (MIDI, WAV, text, image), played with real voices instead of bare oscillators, with one shared rhythm/notes workbench, Next below the tool, a shorter list page, in-app tools for subtract, borrowed form, one knob and wrong tuning, then combining seeds. Proposed branches app-37 to app-42.

**Round 2 direction (17 Nov, Jordan): better, more refined in-app tools, closer to the lab's own modules. Not voices, not mutate.**
- Done (branch app-37-real-tools):
  - **Workbench** (`bench.js`, `bench-core.js`, `seq/voices.js`): replaces "Play it" and the loops tool. A step sequencer in the Sequencer's style: kick, snare, hi-hat, bass and lead tracks using the Sequencer's own sounds and rules (`seq/groove.js`: swing, chance, velocity, per-track length, mute/solo, Euclidean spread); scale-locked note picker for bass and lead; Loudness and Chance modes; per-track cycle length with "lines up again every N steps"; tempo, key and scale; bring in the notes you drew (in order, backwards, random, first) and the rhythm you rolled; Download MIDI (type 1, drums on channel 10); offered for saving as "My loop". Used in every experiment that draws notes, and in Loop mismatch (cycles 3, 4, 5, locked) and Odd meter (every track takes the rolled number).
  - **Stopwatch with marks**: Borrowed form (time the sections, edit times and names, see the timeline, play it through with a chime at each boundary) and One knob (mark sweet spots).
  - **Take it apart**: Subtract (list the parts, remove half each round, rate clarity per round).
- In-app coverage: plucked strings (app-43), 64-step loops (app-40), versions and ranking (app-45), WAV render (app-38), note lengths (app-44) and the take-it-with-you downloads (app-39) are DONE. Still open: share the Sequencer's voices and saved patterns with the course (the sound code is copied, not shared); capstone choices; merge trivial steps (needs a wording pass); seed combining and a daily seed. See `docs/status-2026-11-19.md`.

**Suggested order**
1. C (styling, small and visible) and F (account link, worksheets).
2. B and A (start screen, auto-keep, one Save), with the existing `t37`/`t54` tests updated.
3. D (writing area, phrase player, audit).
4. E (cocktail loading first, then breathing, then spatial game).
Each as its own stacked branch after app-31; tests for each; no deploys.

### Other open items
- Background audio with the screen off (Android).
- Daily path: done (app-30), see the simplify section.
- Deep links for sign-in emails.
- Play Store listing. Payments decided: Stripe on the website only; the Android app is consumption-only (no purchase links or billing buttons, `assets/js/app/consumption.js`). Look at the EEA external offers programme only if an in-app link to the website is wanted later.
- Journal sharing with a therapist (needs go-ahead and a privacy policy change).
- Regulation "worlds of sound"; Tone.js, Pure Data and SuperCollider spikes.
- Sequencer: done (branch app-19): swing, mute/solo per track, Euclidean fill, WAV export matches. Soundscape Machine reviewed, already deep; waiting for the user to say what is missing.
- Photo-words experiment: automatic OCR was built in app-23. Check it after the first deploy (Netlify serving the `.gz` OCR data).
- Listening test of the piano roll and sampler by ear.

### Progress: app-38 worksheets and therapist folder
- New worksheets **DEAR MAN**, **GROW** and **FAST** (`/worksheets/dear-man|grow|fast/`), each with a side-by-side comparison (two versions of the ask; three options with effort/fit ratings; give in vs hold steady). Shared builders in `assets/js/worksheets/frame.js`. Types are free-form in the `worksheets` table, so no SQL is needed.
- Every worksheet already offers "Share with <therapist>" (generic in `page.js`). t65 checks this on all nine pages: hidden until saved, never shared by default.
- Therapist client page: **Shared** and **Intake** tabs merged into one **Folder** tab (contents list, intake form, family history, worksheets grouped by type, check-ins). Messages stays separate. Old `#shared` / `#intake` links open the Folder. Tests t22, t66.
- Workbench: **Download WAV** (offline render of two passes of the loop, plus tail) next to Download MIDI. Test t58.

### Progress: app-39 take it with you
- Course end screen: the save list is now "Take it with you" with per-item downloads (text as .txt, recordings as .wav, the workbench loop also as .mid). Items still go on the Keep shelf when ticked. Test t58.

### Progress: app-40 longer loops
- Workbench takes `steps: 16 | 32 | 64` (rows of 16, cycle lengths up to the full length). One knob now has a 64-step, four-bar loop at 100 BPM (kick, snare, hat, bass) that exports as MIDI and WAV. Test t67.

### Progress: app-41 Today is app-only
- The dashboard "Today" path (two questions, short path) now appears only in the installed app (`window.SIL_APP`). The website dashboard goes straight to the modules. Tests t56 (app behaviour plus "not shown on the website"), t34.

### Progress: app-42 sliders
- The 0 to 10 ratings on DEAR MAN, GROW and FAST are small sliders (start unset, value shown, Clear). Saved in a hidden field so saving, restore, text export and therapist sharing are unchanged. Test t65.

### Progress: app-43 plucked strings
- New `strings` tool (Wrong-tuning chords): six plucked strings made in the page (Karplus-Strong), retune each string by up to an octave, three chord shapes by fret, strum, "standard then retuned" comparison, play shapes 1-2-3 at the experiment's tempo, standard-tuning reset. The roll stays the user's own. Kept as text. Tests: unit `strings-core.test.mjs`, browser t68. (t54 flakes occasionally; passes on rerun.)

### Progress: app-44 note lengths
- Melody over chords: notes have lengths (sixteenth, eighth, quarter, half), drawn as bars. A note stops at the next one, a note placed inside a longer one shortens it, playback and the MIDI file keep the lengths, and there is a Clear button. Tests: unit (experiments.test.mjs), browser t37.

### Progress: app-45 versions
- New `versions` tool (Random pitch, fixed rhythm): save each roll as a version (up to five), loop it, give it one word, put the versions in order with arrows, then put them in order again after listening and see which moved ("Version 5 moved from 5th to 3rd."). The roll stays the user's own. Kept as text. Tests: unit `versions-core.test.mjs`, browser t69.

### Progress: app-46 course layout
- Next now sits below the tool (sticky bar on phones). "From earlier" is one line. Roll clutter (seed, "the seed makes a roll repeatable", earlier rolls) is folded into one "Details". Scale-degree chips show the plain note ("E"), with the degree as a tooltip. List page: first-time visitors see one "Start here" card and one Continue button; paper, notebook and Keep shelf are small links; "Which one for me?" is collapsed. Tests t54 (also made less flaky), t37, t58.

### Progress: app-48 privacy policy 2.1 (19 Nov 2026)
- Added: an Email section and a Resend row (confirmation, post-session, subscription, optional check-in reminder; never content), the Lab member rate on Cal.com bookings, the on-device Today path and settings, and wording that matches "Take it with you" (ticked items are kept, downloads stay on the device). Version 2.1.
- Not yet reflected, pending the owner's answers: how session payment works on Cal.com, and any journal-sharing decision.

### Progress: app-49 share one journal entry
- A saved journal entry can be shared with a connected therapist, one at a time, with a confirmation that says so. The therapist gets a copy of title, date and text only (not soundscape, prompt, timer or counts), listed under "Journal entries" in the client Folder and kept in their client file. The client can take the copy back from the platform; deleting the entry withdraws it. There is no "share all" switch. New SQL: `docs/sql/phase15_001_share_journal.sql` (widens the allowed `shared_copies.category` values; run once). Privacy policy 2.2 and the journal page text updated. Tests t70, t66, unit.

### Progress: app-50 Impressum
- `/impressum/` (provider, contact, tax, content responsibility, dispute resolution, links, privacy), linked from the landing page, dashboard, subscribe, privacy and Neural Synthesis footers; in robots.txt, the sitemap and the Netlify redirects. Blanks the owner must fill in are marked `[[LIKE THIS]]`; `npm run check:launch` lists them. Test t71.

### Progress: app-51 one plan, sessions on Cal.com
- Removed `create-single-session-checkout` and the call1/call2 plans and their monthly allowance and carry-over logic (`booking/entitlement-logic.js` is now small). The one plan is Lab; sessions are booked and paid on Cal.com. Privacy policy 2.3: session payment is entered with Cal.com, we keep only that a session was booked; therapist retention reminder after ten years, nothing deleted automatically.

- app-52: the Sequencer holds the screen awake while it plays (same helper as guided sessions), released on stop. Test t72.

- app-53: Keep shelf renamed "My seeds"; "Today's roll" on roll tools (same seed all day, from the local date); pick two text rolls and combine them (taking turns). seeds-core.js, t73.

- app-54: My seeds empty-state wording; the Sequencer now plays through assets/js/seq/voices.js (one set of sounds, shared with the workbench); the workbench can open a loop of a pattern saved in the Sequencer (a copy). t74.

- app-55: the capstone is now four choices: three limits, a loop from chance (workbench), a short piece of writing, remake something of yours. Unit wording and the "ready" note say "these". t75. Still open from the course list: merge trivial steps (a wording pass over all experiments), spatial game daily challenge and rooms with reverb, Markdown import for therapist records, then Android.

- app-56: spatial game: "Today's challenge" (seeded paths, same for everyone each day, per level and trial) and four rooms with different reverb (small room is the usual; other rooms are practice and do not set best scores). Room and mode remembered on the device. daily.js, t76. Course/minicourse: finished for now, awaiting review.

- app-57: Markdown import for therapist records: Record tab, "Export and delete", "Import notes". Reads a .md/.txt on the device, previews dated sections ("## 2026-03-04" or 04.03.2026), skips undated sections and ones already in the record, saves nothing until Import, each note encrypted as usual. notes/import.js, t77.

- app-58: session note templates (short, first session, SOAP, DAP, after check-ins) in the Record tab note box; the therapist's own templates are kept on that device only. notes/templates.js, t77.

- app-59: "This week" page at the top of the client Folder tab (last 7 days of check-ins vs the week before, worksheets, journal titles) with Copy as text. therapist/week.js.

- app-60: a therapist can assign a worksheet from the Messages tab (sent inside the encrypted message, so no new table or SQL); the client gets a card with an Open link in Messages and the usual unread badge, and chooses whether to share the result back. messages/store.js `assign`, test in messages.test.mjs.

- app-61: "Sessions by month" page for therapists (/therapist/sessions/): a month of booked sessions from the Cal.com records they can already see, totals per client, CSV download made on the device; prices stay on Cal.com. therapist/month.js, t78. A Cal.com calendar embed is not done (needs each therapist's Cal.com link).

- app-62: recovery key check in Vault settings (type the key to see it still opens the vault; nothing changes, key not kept) and a gentle, dismissible reminder on the dashboard when 180 days have passed since the key was set up or last checked. docs/sql/phase16_001_recovery_checked.sql adds recovery_checked_at (the app works without it). Second device: a new device already needs only the passphrase; a transfer from an unlocked device is NOT built, because the content key is deliberately non-extractable (see report).

- app-63: copy edits (reminder, sessions page); handover to another therapist: the client agrees in Messages ("Hand my record to another therapist", a signed message, can be withdrawn); the therapist then prepares a Markdown file on their own device (Record tab, "Hand over to another therapist") that the new therapist brings in with Import notes. Therapists keep deciding for themselves whether they take new clients (no capacity switch). Privacy policy 2.4.

- app-64: spare recovery key (Vault settings: make or remove one; either key works; replacing the first leaves the spare alone; slots cannot be swapped). Fixed a bug found on the way: after a recovery-key check the saved vault version was stale, which could make the next save report a conflict. Privacy 2.5. t38 test fixed (public key export). t79.

- app-65: Lyric analysis: "Fill the screen" button shows all the lyrics in a full-screen layer with larger type (Escape or Close to leave). t80.

- app-66: Android prep done without a phone: App Links filter + links.js (sign-in email links), make-assetlinks.mjs + Netlify header, release signing and versionCode from Gradle properties, sequencer looks ahead further when the page is hidden, listing/Console answers updated (Cal.com, Resend, Stripe wording). Nothing built or tried on a device: see docs/android-your-steps.md.
