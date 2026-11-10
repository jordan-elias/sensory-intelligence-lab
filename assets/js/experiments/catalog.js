/**
 * /assets/js/experiments/catalog.js
 * The experiments. Plain data, so the same text can become a printed book later.
 *
 * Each one has a hard limit, a short process, a rule for letting the result surprise you,
 * and one question to ask afterwards. `tools` are the interactive parts shown in the app;
 * `solo` says how to do the same thing with nothing but dice, paper and your own recorder.
 *
 * tools: { type: 'gen', kind, ...spec }   a number / note / choice generator
 *        { type: 'timer', minutes }
 *        { type: 'clip', ops: [...] }     load or record audio, then change it
 *        { type: 'loops', lengths: [..] } loops of different lengths running together
 *        { type: 'assign' }               give each of your things a new place
 */
export const CATEGORIES = {
  melody: 'Melody & harmony',
  rhythm: 'Rhythm & time',
  field: 'Field recordings',
  production: 'DAW & sequencer',
  limits: 'Limits & subtraction',
};
export const NEEDS = {
  any: 'Any instrument or voice',
  daw: 'DAW or sequencer',
  audio: 'A recording',
  none: 'Nothing but you',
};

const DICE = 'Use a real die, or slips of paper in a hat. ';

export const EXPERIMENTS = [
  // ───────────── Melody & harmony
  {
    id: 'dice-melody', title: 'Dice melody', category: 'melody', needs: 'any', minutes: 20,
    summary: 'Let seven rolls choose your notes, then find three ways to play them.',
    limit: 'Seven notes, chosen by the dice. You may change the rhythm and the order of playing. You may not change a note.',
    steps: [
      'Pick a key and a scale, and roll seven scale degrees.',
      'Play the seven notes as a phrase, once through, in the order rolled.',
      'Make a second version by changing only the rhythm. Make a third by playing the notes backwards.',
      'Record all three, whatever they sound like.',
    ],
    surprise: 'Keep whichever version surprises you most, even if it is not the one you like best.',
    reflect: 'What did the dice do that you would not have done?',
    tools: [{ type: 'gen', kind: 'degrees', count: 7, label: 'Roll seven notes', keyPicker: true }, { type: 'timer', minutes: 20 }],
    solo: DICE + 'Roll an eight-sided die seven times, re-rolling any 8. The numbers are scale degrees (1 is the key note). Write them down before you touch your instrument.',
  },
  {
    id: 'wrong-tuning', title: 'Wrong-tuning chords', category: 'melody', needs: 'any', minutes: 25,
    summary: 'Change one string or oscillator, then build a progression from the shapes you already know.',
    limit: 'Only the chord shapes you already know. Only one thing is retuned. No fixing the tuning back.',
    steps: [
      'Roll which string (or oscillator, or key group) to retune, and by how much.',
      'Retune it. A synth owner can detune one oscillator by the same number of semitones.',
      'Play three shapes you know well, exactly as you always play them. Listen to what they have become.',
      'Chain the three into a progression. Repeat it four times.',
    ],
    surprise: 'The shapes will not sound like themselves. Follow the sound, not the name of the chord.',
    reflect: 'Which chord felt most wrong, and did it become the best one?',
    tools: [{ type: 'gen', kind: 'tuning', label: 'Roll the retuning' }, { type: 'timer', minutes: 25 }],
    solo: DICE + 'Number your strings (or groups of keys) on slips of paper and draw one. Roll a die twice for the shift: the first roll for the direction (even is down, odd is up), the second for the number of semitones.',
  },
  {
    id: 'five-note-cage', title: 'Five-note cage', category: 'melody', needs: 'any', minutes: 25,
    summary: 'Draw five notes at random and write a whole piece with nothing else.',
    limit: 'Five notes, in any octave. No transposing, no sixth note, no exceptions.',
    steps: [
      'Draw five notes.',
      'Listen to them once, then put the sound away.',
      'Write or improvise sixteen bars using only those notes. Finish before you judge it.',
      'Play it through once without stopping.',
    ],
    surprise: 'If two of your notes clash, use the clash on purpose and keep going.',
    reflect: 'Where did the limit force a choice you would never have made?',
    tools: [{ type: 'gen', kind: 'notes', count: 5, label: 'Draw five notes' }, { type: 'timer', minutes: 25 }],
    solo: DICE + 'Write the twelve note names on twelve slips of paper, fold them and draw five.',
  },
  {
    id: 'nine-feelings', title: 'One chord, nine ways', category: 'melody', needs: 'any', minutes: 20,
    summary: 'Take one chord and play it nine different ways, in a random order.',
    limit: 'One chord only. It never changes. Only how you play it.',
    steps: [
      'Choose a chord you know well, and hold it in mind or on the instrument.',
      'Roll the order of the nine ways.',
      'Play each way for about a minute. Do not move on until the time is up.',
      'Keep the one you would never choose on purpose.',
    ],
    surprise: 'Let the last two feel strange. The strange ones are the point.',
    reflect: 'What changed more: the chord, or the way you listened to it?',
    tools: [{ type: 'gen', kind: 'shuffle', label: 'Roll the order', options: [
      'Very soft', 'Very loud', 'Broken, one note at a time', 'Struck once, then silence', 'High register only',
      'Low register only', 'Held low note, the rest above', 'Spread out slowly', 'Quick repetition'] }, { type: 'timer', minutes: 9 }],
    solo: DICE + 'Write the nine ways on slips of paper and draw them one at a time.',
  },

  // ───────────── Rhythm & time
  {
    id: 'loop-mismatch', title: 'Loops that do not line up', category: 'rhythm', needs: 'any', minutes: 20,
    summary: 'Three loops of different lengths, running together, until something unexpected lines up.',
    limit: 'Three loops: 3, 4 and 5 beats. They never change length. You only add and remove sound.',
    steps: [
      'Start the three loops and listen for a few minutes without playing.',
      'Add one sound to one loop. Leave the others alone.',
      'Add a second, then a third. Mute things as well as adding them.',
      'Keep going until you hear a moment that only exists because the loops disagree.',
    ],
    surprise: 'The pattern repeats only every 60 beats. Do not wait for it to "resolve"; find one good moment in it.',
    reflect: 'What happened that you could not have planned?',
    tools: [{ type: 'loops', lengths: [3, 4, 5] }, { type: 'timer', minutes: 20 }],
    solo: 'Clap or tap three patterns at once with a friend, one counting to 3, one to 4, one to 5, each stressing its first beat. Or set three simple loops of different lengths in any looper.',
  },
  {
    id: 'odd-meter', title: 'Count to a random number', category: 'rhythm', needs: 'any', minutes: 20,
    summary: 'A random count of beats. A groove that must fit it.',
    limit: 'The whole groove is one bar of exactly that many beats. No grouping it into fours.',
    steps: [
      'Roll the number of beats.',
      'Start the pulse and count it out loud until the length feels natural.',
      'Make a groove that loops after that many beats. Find where the weight falls and lean on it.',
      'Play it for five minutes without changing it.',
    ],
    surprise: 'After a while the odd length stops feeling odd. Note the moment that happens.',
    reflect: 'Where did your body want the downbeat to be?',
    tools: [{ type: 'gen', kind: 'range', min: 5, max: 13, count: 1, label: 'Roll the number of beats' }, { type: 'loops', lengths: [7] }, { type: 'timer', minutes: 20 }],
    solo: DICE + 'Roll two dice and add them, then add 3. Count aloud to that number, and tap the groove.',
  },
  {
    id: 'borrowed-rhythm', title: 'Borrowed rhythm', category: 'rhythm', needs: 'any', minutes: 15,
    summary: 'Tap the rhythm of a spoken sentence. Put just three notes on it.',
    limit: 'The rhythm of the sentence, exactly. Only three notes.',
    steps: [
      'Draw a sentence and three notes.',
      'Say the sentence out loud a few times, then tap its rhythm on your knee.',
      'Play the rhythm on your instrument using only the three notes, in any order you choose.',
      'Say it, tap it, then play it, one more time, without the sentence.',
    ],
    surprise: 'Do not smooth out the awkward stresses. They are what you borrowed.',
    reflect: 'Could anyone guess the sentence from your music?',
    tools: [{ type: 'gen', kind: 'choice', label: 'Draw a sentence', options: [
      'The kettle is louder than I remembered.', 'Nobody told the pigeons about the plan.', 'We left before the rain made up its mind.',
      'A very small door in a very large wall.', 'Please keep the tune you almost lost.', 'Somebody is practising scales next door.',
      'Wait for it, wait for it, now.', 'The last train hums to itself.', 'I only came in to turn the light off.'] },
      { type: 'gen', kind: 'notes', count: 3, label: 'Draw three notes' }],
    solo: 'Open a book to a random page, point to a sentence, and use that. Choose three notes from a hat.',
  },

  // ───────────── Field recordings
  {
    id: 'scale-contrast', title: 'Contrast of scale', category: 'field', needs: 'audio', minutes: 20,
    summary: 'One recording, very slow and very fast at the same time.',
    limit: 'One clip, from a place you recorded or chose. No other sounds, no instruments.',
    steps: [
      'Record or load a short clip: 5 to 20 seconds of a place.',
      'Listen to it slowed down to a quarter of its speed, and sped up four times.',
      'Layer them. The fast one repeats under the slow one.',
      'Listen three times without doing anything else. Then save it, or record yourself responding to it.',
    ],
    surprise: 'Small sounds become landscapes and big sounds become texture. Do not decide what it "is" for the first listen.',
    reflect: 'Which sound in the clip changed the most when you changed its size?',
    tools: [{ type: 'clip', ops: ['slow', 'fast', 'contrast'] }, { type: 'timer', minutes: 20 }],
    solo: 'In any editor, copy your clip to a second track. Slow one copy to 25% and speed the other to 400%, with pitch following speed. Play them together.',
  },
  {
    id: 'chop-reorder', title: 'Chop and reorder', category: 'field', needs: 'audio', minutes: 20,
    summary: 'Cut a recording into equal pieces and let chance put them back.',
    limit: 'Equal slices only. No editing inside a slice. No fixing the order once it is rolled.',
    steps: [
      'Record or load a clip.',
      'Roll how many slices to cut it into.',
      'Chop and shuffle. Listen to the new order once, all the way through.',
      'Shuffle again as many times as you like, and keep the version you did not expect.',
    ],
    surprise: 'You will want to move one slice. Do not. Learn the order instead.',
    reflect: 'Did a new meaning appear when the order changed?',
    tools: [{ type: 'gen', kind: 'range', min: 6, max: 24, count: 1, label: 'Roll the number of slices' }, { type: 'clip', ops: ['chop'] }],
    solo: 'Cut the clip into that many equal pieces on paper or in an editor, number them, and draw the numbers from a hat to set the order.',
  },
  {
    id: 'reverse-answer', title: 'Reverse and answer', category: 'field', needs: 'audio', minutes: 20,
    summary: 'Play a recording forwards, then backwards, and answer it with your instrument or voice.',
    limit: 'Your answer is no longer than the clip. You answer the backwards version, not the original.',
    steps: [
      'Record or load a clip.',
      'Listen to it forwards once, then backwards twice.',
      'Play along with the backwards version. Do not look for the beat; follow the shape.',
      'Record your answer.',
    ],
    surprise: 'Backwards sounds have a swell where the original had an attack. Play the swell.',
    reflect: 'What did you notice about the sound only after it was reversed?',
    tools: [{ type: 'clip', ops: ['reverse'] }, { type: 'timer', minutes: 20 }],
    solo: 'Any editor has a Reverse command. Reverse your clip and play along.',
  },
  {
    id: 'grain-melody', title: 'One grain, many pitches', category: 'field', needs: 'audio', minutes: 25,
    summary: 'Pick a tiny piece of a recording and play a melody made from it.',
    limit: 'The whole melody comes from one short piece of the clip, played at different pitches.',
    steps: [
      'Record or load a clip, and choose a small piece of it. A tenth of a second is enough.',
      'Roll a melody. It is a set of pitch steps.',
      'Listen. Try a different piece of the same clip, or a different roll.',
      'Keep one. Play something over it.',
    ],
    surprise: 'Short sounds have a pitch you cannot hear until you play them in a row. Listen for it.',
    reflect: 'What was in that tiny piece of sound that you never noticed?',
    tools: [{ type: 'clip', ops: ['grain'] }],
    solo: 'Sample a short sound into any sampler and play it across the keys. Draw seven keys from a hat and play them.',
  },
  {
    id: 'stutter', title: 'Stutter', category: 'field', needs: 'audio', minutes: 15,
    summary: 'Repeat one tiny fragment until it becomes a rhythm.',
    limit: 'One fragment, under a quarter of a second. Repeated exactly.',
    steps: [
      'Record or load a clip.',
      'Pick a moment, then stutter it.',
      'Listen for the rhythm the repetition makes, and the pitch the repetition makes.',
      'Pick another moment. Compare.',
    ],
    surprise: 'Most moments are dull. One in ten is startling. Look for the one.',
    reflect: 'What did the repetition turn the sound into?',
    tools: [{ type: 'clip', ops: ['stutter'] }],
    solo: 'In an editor, loop a very short selection. Nudge the selection start by a tiny amount until it makes a pulse.',
  },
  {
    id: 'listen-first', title: 'Listen first', category: 'field', needs: 'audio', minutes: 15,
    summary: 'Record a minute of a place and do nothing to it.',
    limit: 'No processing. You may only listen, and write down what you heard.',
    steps: [
      'Record one minute of wherever you are.',
      'Listen to it with your eyes closed.',
      'Write down three sounds that were musical, and one that was not.',
      'Play one of the musical sounds on your instrument, as close as you can.',
    ],
    surprise: 'You will hear things in the recording that you did not hear when you were there.',
    reflect: 'What was in the room that you had stopped noticing?',
    tools: [{ type: 'clip', ops: [] }, { type: 'timer', minutes: 15 }],
    solo: 'Use your phone voice recorder. Listen on headphones.',
  },

  // ───────────── DAW & sequencer
  {
    id: 'random-pitch-fixed-rhythm', title: 'Random pitch, fixed rhythm', category: 'production', needs: 'daw', minutes: 25,
    summary: 'A steady eight-step pattern with pitches chosen by chance, five versions.',
    limit: 'Eight steps. One sound. The rhythm never changes, only the pitches.',
    steps: [
      'Program a steady eight-step rhythm on one sound.',
      'Roll a pattern. It gives you a five-note set and a pitch for each step.',
      'Enter the pitches and listen to it for four minutes.',
      'Roll four more versions. Keep the third, whatever it sounds like.',
    ],
    surprise: 'You will prefer another version. Keep the third anyway, and ask why you do not like it yet.',
    reflect: 'What did the third version teach you about your taste?',
    tools: [{ type: 'gen', kind: 'pattern', steps: 8, setSize: 5, label: 'Roll a pattern' }, { type: 'timer', minutes: 25 }],
    solo: DICE + 'Pick five notes from a hat, then roll a five-sided choice for each of eight steps.',
  },
  {
    id: 'sample-first', title: 'Sample first', category: 'production', needs: 'audio', minutes: 30,
    summary: 'Build a whole track from ten seconds of room sound.',
    limit: 'One recording, ten seconds. No synths, no other samples.',
    steps: [
      'Record or load ten seconds of a room.',
      'Take a short piece and pitch it so it plays as a bass. Take another as a percussive hit.',
      'Build a track from pieces of that recording only.',
      'Stop at the time limit, even if it feels unfinished.',
    ],
    surprise: 'You will run out of material. Treat that as the start of the idea.',
    reflect: 'Did the track sound like the room?',
    tools: [{ type: 'clip', ops: ['grain', 'stutter'] }, { type: 'timer', minutes: 30 }],
    solo: 'Record with a phone and import the recording into your DAW or sampler.',
  },
  {
    id: 'one-knob', title: 'One knob', category: 'production', needs: 'daw', minutes: 20,
    summary: 'A single control changes everything for four minutes.',
    limit: 'One effect, one parameter, nothing else. The notes and the rhythm do not change.',
    steps: [
      'Make a short loop and leave it alone.',
      'Roll the one control you are allowed to touch.',
      'Move it slowly across its whole range over four minutes. Record it.',
      'Listen back. Choose your favourite 20 seconds.',
    ],
    surprise: 'Resist touching anything else. The limit makes you hear this one control deeply.',
    reflect: 'What does that control do that you had not noticed?',
    tools: [{ type: 'gen', kind: 'choice', label: 'Roll the control', options: [
      'Filter cutoff', 'Reverb size', 'Delay time', 'Pitch of everything', 'Bit depth', 'Playback speed', 'Stereo width', 'Grain size', 'Distortion drive', 'Envelope release'] }, { type: 'timer', minutes: 4 }],
    solo: DICE + 'Write ten controls on slips of paper and draw one.',
  },
  {
    id: 'swap-the-track', title: 'Swap the track', category: 'production', needs: 'daw', minutes: 30,
    summary: 'Every track gets a different instrument and nothing else changes.',
    limit: 'Notes and timing stay exactly as they are. Only the sound on each track changes.',
    steps: [
      'List the tracks in an unfinished piece.',
      'Reassign: every track must receive a different instrument from the one it had.',
      'Play it back without touching anything. Wait an hour before you judge it.',
      'Keep at least one swap, even if you hate it.',
    ],
    surprise: 'A bass line on a bell, or a melody on a drum, gives you a new piece.',
    reflect: 'Which swap changed the meaning of the music most?',
    tools: [{ type: 'assign' }],
    solo: 'Write the instruments on cards and deal them to the tracks, making sure no track keeps its own.',
  },
  {
    id: 'soundscape-seed', title: 'Soundscape seed', category: 'production', needs: 'any', minutes: 30,
    summary: 'A soundscape sets the mood. Your melody may only answer it.',
    limit: 'The soundscape stays as it is. Your part may not use its notes in the first minute.',
    steps: [
      'Roll a mood, and make a soundscape for it in the Soundscape Machine.',
      'Let it run. Listen for the part you want to answer.',
      'Play a melody that responds to the soundscape. Avoid its notes for the first minute.',
      'Record the pair.',
    ],
    surprise: 'The soundscape will drift. Follow what it does, not what you planned.',
    reflect: 'Who was leading, you or the soundscape?',
    tools: [{ type: 'gen', kind: 'choice', label: 'Roll a mood', options: ['Waiting', 'Relief', 'Restless', 'Tender', 'Suspicious', 'Wide open', 'Tired but fond', 'Ceremonial'] }],
    links: [{ href: '/soundscape-machine/', label: 'Open the Soundscape Machine' }],
    solo: 'Use any ambient recording or a drone from your instrument as the soundscape.',
  },

  // ───────────── Limits & subtraction
  {
    id: 'weakest-hand', title: 'The wrong hand', category: 'limits', needs: 'any', minutes: 15,
    summary: 'A physical limit, chosen by chance, for ten minutes.',
    limit: 'You work inside the limit for the whole time. No stopping to change it.',
    steps: [
      'Roll your limit.',
      'Improvise for ten minutes inside it.',
      'Keep the phrase that looks the least tidy and play it again.',
    ],
    surprise: 'You will sound clumsy. Look for the clumsy phrase that is also the most alive.',
    reflect: 'What did you do when your usual fluency was taken away?',
    tools: [{ type: 'gen', kind: 'choice', label: 'Roll your limit', options: [
      'Your non-dominant hand only', 'Black keys only', 'One string only', 'Only the top three strings', 'Only notes within a fifth',
      'Only three different notes', 'No note longer than a beat', 'Eyes closed'] }, { type: 'timer', minutes: 10 }],
    solo: DICE + 'Write the limits on slips of paper and draw one.',
  },
  {
    id: 'subtract', title: 'Subtract', category: 'limits', needs: 'any', minutes: 20,
    summary: 'Take an unfinished piece and remove half.',
    limit: 'You may only remove. You may not add or fix.',
    steps: [
      'Choose something unfinished.',
      'Decide which half you would least want to lose. Remove that half.',
      'Play, or listen to, what is left.',
      'Remove again if it still feels crowded.',
    ],
    surprise: 'What you hold on to most tightly is often the thing in the way.',
    reflect: 'What did the piece still say after the loss?',
    tools: [{ type: 'timer', minutes: 20 }],
    solo: 'Copy your piece before you start, so that nothing is really lost.',
  },
];

export const byId = id => EXPERIMENTS.find(e => e.id === id) || null;
