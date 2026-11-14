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

**Privacy and professional questions to settle first**
1. Notes are the therapist's, private to that therapist, encrypted so we cannot read them. Our privacy policy and Supabase RLS must say and enforce this.
2. Clients have legal rights to access their records in many places (GDPR access requests in the EU). Decide how that works with encrypted therapist notes: an export the therapist can generate, rather than us holding readable copies.
3. What happens when a client leaves or a therapist stops using the platform: export and deletion.
4. Whether anything is ever sent to an AI. Default: no. Any optional local-only suggestions (for example "this theme has not been revisited in 6 sessions") should run without sending note text anywhere.
5. Shared Cal.com account and freelancer-by-invoice model: notes must be scoped per therapist, not per account.
6. Client-visible parts (for example homework the therapist chooses to share) stay a separate, explicit, per-item action.

**Possible build order**
1. Session notes per client, encrypted on the therapist's device, with date and free text. Intake and family history shown as the first entries.
2. `[[links]]` and `#themes` parsed on save; backlinks panel.
3. Entities with short descriptions (people, events); themes list with counts.
4. Timeline and themes × sessions table.
5. Graph view and pre-session brief.
6. Markdown export (and import) for portability.

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
