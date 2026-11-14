# Improvements plan

Open work, roughly in the order it was raised. Constraints that apply to everything: private until the client shares; sharing never on by default; privacy claims must be true; no Netlify deploys from branches; Android API calls go through `assets/js/api.js`.

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
4. Key recovery: if the therapist loses their device key, the notes are gone. Offer a recovery key they store themselves, and say so plainly.

**On-device analysis: what is possible without an LLM**
Built (`assets/js/notes/`, tested): all of this is plain code over the therapist's own words.
- Word counts, recurring words across the record, and distinctive words per session (TF-IDF).
- Backlinks for any person, event or theme; a themes-by-sessions table; a graph where two things are joined when they come up in the same session or the same sentence.
- "Not revisited lately": a theme that used to come up and has been quiet for N sessions.
- A tone reading per session from a small sentiment word list (handles "not happy", "really sad"), plus six emotion families per 100 words, shown with how many words were counted so thin evidence is visible.
- Style markers researchers use descriptively: first-person share, absolutes ("always", "never"), questions, past versus future focus.
- Theme suggestions from seed word lists (sleep, anxiety, low mood, grief, anger, self-criticism, avoidance, relationships, work, body, self-worth, trauma). Suggestions only: the therapist accepts, renames or ignores.
- Markdown export with [[links]] kept, so notes open in Obsidian or any notes app.

Possible later, still on-device: a small embedding model run in the browser (tens of MB, downloaded once from our own hosting, never sent anywhere) for "find sessions like this one" and grouping similar passages; German word lists; a therapist-editable theme dictionary; simple trend lines per theme.

Honest limits: lexicons miss irony, slang, negation across clauses and context, and they only know the words in their lists. Counts describe the notes; they do not describe the client. They are there to point the therapist back to what they wrote, never to score, label or diagnose a client, and the interface should say so.

**Possible build order**
0. Done: parsing, analysis, graph and export modules with tests (no interface yet).
1. Session notes per client, encrypted on the therapist's device, with date and free text. Intake and family history shown as the first entries.
2. `[[links]]` and `#themes` parsed on save; backlinks panel.
3. Entities with short descriptions (people, events); themes list with counts.
4. Timeline and themes × sessions table.
5. Graph view and pre-session brief.
6. Markdown export (and import) for portability, record export for the client on request, keep-or-delete when a client leaves.

### Other open items
- Background audio with the screen off (Android).
- Daily path.
- Deep links for sign-in emails.
- Play Store listing and Play Billing decisions.
- Journal sharing with a therapist (needs go-ahead and a privacy policy change).
- Regulation "worlds of sound"; Tone.js, Pure Data and SuperCollider spikes.
- Deepen Soundscape Machine and Sequencer (priority order not yet chosen).
- Photo-words experiment: automatic OCR (currently typed by hand).
- Listening test of the piano roll and sampler by ear.
