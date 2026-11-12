/**
 * /assets/js/experiments/cards.js
 * A deck of strategy cards in the spirit of Oblique Strategies, but each one is specific: an action and a hard limit.
 * Every card has a number in it, so it can be followed exactly.
 */
import { shuffle } from './rng.js';

export const DECK = [
  ['Play it with one finger. Only one finger, on one hand, for the whole piece.', '3 minutes'],
  ['Use only the first four notes of any scale, in any order. Do not add a fifth.', '8 minutes'],
  ['Make the quietest part the main part. Nothing may be louder than it.', '10 minutes'],
  ['Repeat one bar exactly 8 times, then change one note only.', '10 minutes'],
  ['Write the last 4 bars first. Then write toward them.', '15 minutes'],
  ['Remove every note shorter than a quarter note.', '10 minutes'],
  ['Start in the middle of a phrase: your first note may not be on a downbeat or a chord tone.', '10 minutes'],
  ['Mute your favourite 1 of every 3 elements before you listen again.', '5 minutes'],
  ['Change the tempo by a third, faster or slower, and keep everything else.', '10 minutes'],
  ['Only play intervals larger than a fourth.', '8 minutes'],
  ['Only play intervals of one or two semitones.', '8 minutes'],
  ['Play the whole thing in a different octave from where it wants to live: 2 octaves higher or lower.', '10 minutes'],
  ['Record a take with your eyes closed. Do not edit it. Keep or bin it.', '5 minutes'],
  ['Let a second person (or a recording of one) choose 3 notes. You may use only those 3.', '10 minutes'],
  ['Sing or hum the melody with no words and no instrument. Then find it.', '6 minutes'],
  ['Write a melody that begins and ends on the same note and never repeats any other note.', '10 minutes'],
  ['Leave a silence of exactly 2 beats after every phrase. Do not fill it.', '10 minutes'],
  ['Use only 2 sounds for the entire piece. Make the third by combining them.', '15 minutes'],
  ['Copy a rhythm from a sound in the room: a fan, a clock, a tap. Use it for every part.', '10 minutes'],
  ['Make the piece with the instrument you are worst at.', '10 minutes'],
  ['Every note must be held for exactly the same length.', '8 minutes'],
  ['Number your 7 favourite sounds. Roll a die. Build the piece around that one only.', '15 minutes'],
  ['Build a bass part that stays on one note. All the movement is above it.', '12 minutes'],
  ['Write the same melody 3 times, each with a different rhythm. Keep the one you like least. Why?', '15 minutes'],
  ['Start from the ending of a piece you abandoned. Use only its last 8 beats.', '15 minutes'],
  ['Delete the first 16 beats of what you have and begin there.', '5 minutes'],
  ['Put your tuner to a different reference pitch (for example 432 or 450 Hz) and play along with an in-tune track.', '10 minutes'],
  ['Make a version with no drums, and then a version with only drums.', '15 minutes'],
  ['Slow it to half speed. Listen for one thing you had not heard. Build on that.', '8 minutes'],
  ['Write down 5 adjectives for the piece. Make the part that matches the 5th.', '10 minutes'],
  ['You may play only on the offbeats (the "and" of each beat).', '8 minutes'],
  ['Layer exactly 3 loops of different lengths: 3, 4 and 5 beats.', '12 minutes'],
  ['Trade the lead and the accompaniment: the accompaniment is now the melody.', '10 minutes'],
  ['Rewrite the first phrase using only the notes you did not use the first time.', '10 minutes'],
  ['Play it as if every note were the last of the phrase: short, final, and with space after.', '6 minutes'],
  ['Go outside, record 30 seconds of anything, and use only that sound.', '20 minutes'],
  ['Copy one piece you admire, bar for bar, and change one thing only.', '15 minutes'],
  ['Make a part so simple that a child could play it. Then do not improve it.', '8 minutes'],
  ['Finish it in 12 minutes. When the timer ends, the piece is done.', '12 minutes'],
].map(([text, limit], i) => ({ id: 'c' + (i + 1), text, limit }));

/** Draws `n` cards at random, without repeating any in `seen`, and starts again when the deck is used up. */
export function draw(rng, n = 1, seen = new Set()) {
  let pool = DECK.filter(c => !seen.has(c.id));
  if (pool.length < n) { seen.clear(); pool = DECK.slice(); }
  const hand = shuffle(rng, pool).slice(0, n);
  hand.forEach(c => seen.add(c.id));
  return hand;
}
