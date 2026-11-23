# Ambience: the recorded sounds

Everything musical in Ambience is generated in the browser. Only nature and spoken word are recorded files.

## Nature (up to two at once)

The files you uploaded are in `audio/` (all `.mp3`). The page looks there first, then in `audio/ambience/` for `.m4a`. A sound whose file is missing is simply not shown, so you can add them one at a time.

| Sound  | File                         | Notes |
|--------|------------------------------|-------|
| Ocean  | `audio/ocean.mp3`            | 38 s |
| Rain   | `audio/rain.mp3`             | 3 min 45 s |
| Birds  | `audio/maskers/nature.mp3`   | the Cocktail Party Problem recording |
| Stream | `audio/stream.mp3`           | 50 s |
| Fire   | `audio/fire.mp3`             | only 7.5 s, so the page stretches it into a minute from random pieces so the repeat is not heard every few seconds. A longer recording (about a minute) would still sound better. |

`.mp3` with the same base name also works if you prefer it (the page tries `.m4a` first, then `.mp3`).

### How to record or choose
- 60 to 90 seconds each. Stereo AAC at 96 to 128 kbps is about 1 to 1.5 MB.
- A steady texture with nothing that stands out: no single loud bird call, car, voice, wind gust on the microphone or footsteps. The loop point is hidden by a 5 second crossfade that the page does itself, so the ends need no editing.
- Your own recordings, or clearly licensed ones (CC0 is simplest). Keep the source and licence of each file in `audio/ambience/SOURCES.md`.

## Spoken word

Three public-domain readings are in `audio/`: `lookingglass.mp3` (Through the Looking-Glass, chapter 1), `montechristo.mp3` (The Count of Monte Cristo, chapter 1), `potatoes.mp3` (twenty ways of cooking potatoes). They are listed in `assets/js/ambience/catalog.js` (`SPOKEN`).

- They are streamed, not loaded whole (the Monte Cristo reading would take about 180 MB of memory decoded), and they pause rather than restart when switched off, so a reading carries on where it left off.
- The service worker does not copy them into the offline cache, so they need a connection on the web. In the Android app they are inside the app.
- In Drift a reading comes in rarely and leaves after a few phrases. In Steady it plays while it is on.
- Size: about 32 MB together, mono 128 kbps. Dropping them to 64 kbps mono (still clear for speech) would halve that.
- Credits: please tell me the reader and the source (for example LibriVox) of each recording and I will add a small credits line to the page.

## Checking by ear (not done by me)
I could check that every sound renders, is finite and stays in range, but not how it sounds. When you listen, tell me about: the balance between rows (drums, bass, chords, melody, pad against noise and nature), whether lofi drums feel lofi, whether the chord and melody patterns feel calm, and whether Drift changes feel natural.
