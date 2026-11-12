/**
 * /assets/js/experiments/text-ops.js
 * Pure text functions for the writing experiments. Nothing here touches the page or the network.
 */
import { shuffle } from './rng.js';

/** Words as written, with edge punctuation removed. Apostrophes and hyphens inside a word stay. */
export function wordsOf(text) {
  return String(text || '').split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
}

/** A rough English syllable count. Good enough to build a haiku from; it is a guide, not a dictionary. */
export function syllables(word) {
  let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

const TARGET = [5, 7, 5];

/**
 * Finds words, in their original order, that make a 5-7-5 haiku, and chooses one at random.
 * Returns an array of three arrays of indices, or null when the text does not hold one.
 */
export function findHaiku(words, rng) {
  const syl = words.map(syllables), n = words.length, memo = new Map();
  const can = (i, l, s) => {
    if (l === 3) return true;
    if (i >= n) return false;
    const k = i * 100 + l * 20 + s;
    if (memo.has(k)) return memo.get(k);
    let ok = can(i + 1, l, s);
    if (!ok && syl[i] > 0 && s + syl[i] <= TARGET[l]) ok = s + syl[i] === TARGET[l] ? can(i + 1, l + 1, 0) : can(i + 1, l, s + syl[i]);
    memo.set(k, ok); return ok;
  };
  if (!can(0, 0, 0)) return null;
  const lines = [[], [], []]; let l = 0, s = 0;
  for (let i = 0; i < n && l < 3; i++) {
    const takeOk = syl[i] > 0 && s + syl[i] <= TARGET[l] && (s + syl[i] === TARGET[l] ? can(i + 1, l + 1, 0) : can(i + 1, l, s + syl[i]));
    const skipOk = can(i + 1, l, s);
    const take = takeOk && (!skipOk || rng() < 0.5);
    if (take) { lines[l].push(i); s += syl[i]; if (s === TARGET[l]) { l++; s = 0; } }
  }
  return l === 3 ? lines : null;
}

/** The order in which words burn: everything that is not in the haiku, in a random order; the haiku survives. */
export function burnPlan(text, rng) {
  const words = wordsOf(text), haiku = findHaiku(words, rng);
  const keep = new Set(haiku ? haiku.flat() : []);
  const order = shuffle(rng, words.map((_, i) => i).filter(i => !keep.has(i)));
  return { words, haiku, keep, order };
}

/** Which words are gone after `burned` steps. */
export const burnedAfter = (plan, burned) => new Set(plan.order.slice(0, burned));

/** A frame for a poem: each line must end with one of these words, in this order (or shuffled). */
export function endWordFrame(text, rng, { shuffled = false, max = 16 } = {}) {
  const words = wordsOf(text).slice(0, max);
  const list = shuffled ? shuffle(rng, words) : words;
  return list.map((w, i) => ({ line: i + 1, word: w }));
}

/** Words of a page of text for blackout poetry. Long pages are cut, so the choice stays a choice. */
export function pageWords(text, max = 360) { return String(text || '').split(/\s+/).filter(Boolean).slice(0, max); }

/** The poem left after a blackout: the kept words, in order. */
export const blackoutPoem = (words, kept) => words.filter((_, i) => kept.has(i)).join(' ');
