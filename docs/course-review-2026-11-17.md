# Experiments in Creativity: second review (17 Nov 2026)

Brief from Jordan: judge the minicourse on **usability, creativity, content and workflow**. Live-instrument experiments are fine. Wherever possible the app should carry out every step, because the experiments are **seeds**: small, surprising starts of ideas that the person later takes to a DAW or an instrument and builds into something. They should be fun, engaging, easy, inspiring and surprising. Verdict so far: on the way, not there.

How this was done: read all 36 experiments (166 steps), audited which steps have an in-app tool (`/tmp` audit, table below), walked dice-melody, subtract and stutter at phone width, and read the list page.

## 1. The big finding: the course produces results, but not seeds

Today an experiment ends with a note ("what did you notice"), and optionally some saved text. A seed needs to be **a thing you can carry**: something you can open in your DAW tomorrow, play on your instrument, or send to yourself. Only one experiment (melody over chords) offers a file (MIDI), and clips can be kept on the device. Nothing else leaves the app as something you can use. That is the biggest gap between what the course is and what you described.

**Recommendation: every experiment ends in a Seed card.** One small card per finished experiment with: the title, the rule you worked under, what you made (notes and rhythm, a clip, a poem, a list), a one-line "next" prompt, and buttons for the formats that fit it:
- notes and rhythm → **Download MIDI** (the MIDI writer already exists in `music-ops.js`; the phrase player's grid maps straight onto it)
- sound → **Download WAV**
- words → copy text, download .txt
- everything → a shareable image of the card, and "Open in…" guidance for common DAWs
The Keep shelf becomes **My seeds**: browse, play, export, and combine.

## 2. Usability

What works: one thing at a time, a progress bar, big targets, plain language, no scoring, a calm end screen. The one-screen start is much better than before.

What gets in the way (seen on a phone):
1. **Next sits between the instruction and the tool.** The order on screen is step text, Next/Back, then the tool. People can press Next before doing the thing. Put Next below the tool (sticky bar on phones), or make it the last thing in the step card.
2. **Two rhythm grids at once.** In dice-melody step 3 you see the Metronome grid and the Play it grid, both 4 to 16 boxes. It is unclear which one the notes go onto. Fold them into one: the rhythm tool should be the rhythm, and Play it should use it directly (the shared pattern), not copy it.
3. **Play it is heavy.** Twelve note buttons, a 16-box grid with tiny selects, three dropdowns and a slider, before you hear anything. Needs a "quick start": one tap puts the drawn notes on the rolled rhythm and plays (the in-order rule), with everything else under "Change it".
4. **Clutter around rolls:** "Seed 3919489826", "The seed makes a roll repeatable", "Earlier rolls". Useful to a few people, noise to everyone. Collapse into one "Details" line.
5. **Jargon in chips:** "1 E (degree 3)". Show the note, add the degree only on request.
6. **The list page is a wall:** 36 cards, filters, "Begin", "Surprise me", "Do a pair", "My notebook", "Keep shelf" all in the first screen. First visit should show one card ("Start here" or "Today's seed") and the rest below.
7. **"From earlier" blocks repeat things the person just saw** and push the tool down. Show them as one line.

## 3. Creativity: is it surprising and fun?

Strengths: the constraint idea (limits, chance, subtraction) is the right engine; the "do not re-roll" and "no second takes" rules are the heart of it.

Where it stays flat:
- **Everything sounds the same.** Every in-app sound is a plain triangle or square oscillator. A rolled melody played as a triangle wave is not inspiring. Offer a few real voices (pluck, marimba, soft keys, bowed, bell, noise hit) so a seed already sounds like something. This alone changes the feel more than any wording.
- **The chance is mostly dice, not discovery.** Rolls give a list of values. There is no moment of "oh". Ideas: reveal rolls one at a time with a short sound; a **Mutate** button that changes one thing and plays both; **Combine two seeds** (the rhythm from yesterday's seed, the notes from today's) as a standing "Surprise me"; a "weird" setting that bends one rule.
- **No play before you commit.** Several experiments ask you to imagine before you hear. Let people hear a version first (a preview), then do the real thing under the rule.
- **Few moments of reward.** A finished experiment ends with a checkbox. A short "here is your seed, listen" end moment, with the sound and the rule, would give the payoff.

## 4. Content

36 experiments in 7 units. Quality of the ideas is high; what changes is how well each one fits the app.

| Group | Experiments | In-app today |
|---|---|---|
| Fully doable in the app | borrowed-end-words, burning-page, list-prompts, photo-words, blackout-poem, strategy-cards, two-notes-and-a-word | yes, end to end |
| Mostly doable | dice-melody, five-note-cage, fixed-notes-rhythm, fixed-groove-chords, borrowed-rhythm, borrowed-contour, borrowed-chords, melody-over-chords, loop-mismatch, odd-meter, one-sample-beat, all clip experiments | roll and hear; playing and recording is yours |
| Rolls only, the rest is elsewhere | wrong-tuning, nine-feelings, random-pitch-fixed-rhythm, one-knob, weakest-hand, soundscape-seed, swap-the-track, treatment-swap | few steps have any tool |
| No tool at all | subtract, borrowed-form | text only |

Specific gaps:
- **Subtract** (no tools): a tool that takes a list of parts (or a loaded loop) and removes half at a time, with a hear-it button, would do it in app.
- **Borrowed form**: a timeline builder. Tap to mark section starts while a song plays elsewhere (or a timer runs), then get the blank timeline with lengths to fill.
- **One knob**: an in-app mini synth with the rolled control on a slider and a record button. The whole experiment then happens on the page.
- **Wrong tuning**: a plucked-string instrument with the retuned string, playable by tapping.
- **Random pitch, fixed rhythm**: the phrase player does this already (a fixed rhythm with a different pitch roll each time); it should be wired in with a "next version" button and a ranking list.
- **Weakest hand, soundscape seed**: live instrument is fine; the app should still give the limit as a card and a timer, which it does.
- **Unit balance**: Melody 8, Capstone 1, Limits 4. The capstone should offer three or four choices.
- **Steps still referencing outside things** ("open your DAW") are fine for the DAW unit, but each should be marked "away from the app" so the person knows when to switch.

## 5. Workflow: from open to seed to DAW

Current flow: list → start → steps → end note → keep shelf. It works. For the idea you described the flow should be:

1. **Pick or be given one** (one card, not a list).
2. **Do it** with every step's tool on the page (or clearly marked as "on your instrument").
3. **Hear what you made** (a real voice, not a bare oscillator).
4. **Save it as a seed** (one tap, pre-ticked).
5. **Take it away** (MIDI/WAV/text/card).
6. **Come back to it** (My seeds: play, remix, combine, add a note).

Steps 3, 5 and 6 are missing or weak today.

## 6. Recommended next work, in order

| # | Branch | Work | Why |
|---|---|---|---|
| 1 | app-37-seeds | Seed card at the end, Download MIDI/WAV/text, My seeds list (rename the Keep shelf) | The core promise |
| 2 | app-38-voices | Playback voices (pluck, marimba, keys, bell, noise hit) shared by Play it, rolls and grooves | Biggest change to how it feels |
| 3 | app-39-one-workbench | One shared rhythm and notes workbench per experiment (fixes the duplicate grids), a quick-start Play it, Mutate, preview before commit | Easier and more surprising |
| 4 | app-40-layout | Next below the tool, rolls details collapsed, plain note names, shorter list page with one "start here" card | Usability |
| 5 | app-41-gaps | Subtract, borrowed form, one knob, wrong tuning tools; capstone choices | In-app coverage |
| 6 | app-42-combine | Combine two seeds, Surprise me across the shelf, daily seed | Surprise and return visits |

Each stays local to the device, with the encrypted sync as before. Nothing here sends sounds or text anywhere.

## 7. What I could not judge from here
Sound by ear (all voices), real-hand feel on a phone, and whether the prompts are *fun* for someone who has not seen them. A short test with two or three people doing one experiment each, then telling you what they would do next, would answer that better than any further review.
