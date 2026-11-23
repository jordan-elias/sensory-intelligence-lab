# Ambience: the recorded sounds

Everything musical in Ambience is generated in the browser. Only nature and spoken word are recorded files.

## Nature (up to two at once)

Put each file in `audio/ambience/` with exactly these names. A sound whose file is missing is simply not shown, so you can add them one at a time.

| Sound  | File                         | Notes |
|--------|------------------------------|-------|
| Ocean  | `audio/ambience/ocean.m4a`   | gentle shore, no crashing surf |
| Rain   | `audio/ambience/rain.m4a`    | steady, no thunder |
| Birds  | `audio/maskers/nature.mp3`   | already in the repo (the Cocktail Party Problem recording); nothing to add |
| Stream | `audio/ambience/stream.m4a`  | small brook |
| Fire   | `audio/ambience/fire.m4a`    | soft crackle |

`.mp3` with the same base name also works if you prefer it (the page tries `.m4a` first, then `.mp3`).

### How to record or choose
- 60 to 90 seconds each. Stereo AAC at 96 to 128 kbps is about 1 to 1.5 MB.
- A steady texture with nothing that stands out: no single loud bird call, car, voice, wind gust on the microphone or footsteps. The loop point is hidden by a 5 second crossfade that the page does itself, so the ends need no editing.
- Your own recordings, or clearly licensed ones (CC0 is simplest). Keep the source and licence of each file in `audio/ambience/SOURCES.md`.

## Spoken word

Not yet. The catalog has an empty `SPOKEN` list in `assets/js/ambience/catalog.js`. Add entries like
`{ id: 'talk-1', label: 'Talk', src: ['/audio/ambience/spoken/talk-1.m4a'] }`
and the Spoken row appears. In Drift it comes in rarely and leaves again after a few phrases. Use only recordings you have the rights to (public domain, Creative Commons with credit, or your own).

## Checking by ear (not done by me)
I could check that every sound renders, is finite and stays in range, but not how it sounds. When you listen, tell me about: the balance between rows (drums, bass, chords, melody, pad against noise and nature), whether lofi drums feel lofi, whether the chord and melody patterns feel calm, and whether Drift changes feel natural.
