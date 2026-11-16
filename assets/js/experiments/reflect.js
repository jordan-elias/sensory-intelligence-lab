/**
 * /assets/js/experiments/reflect.js
 * Looking back at your own notes, on this device. It counts the words you wrote; it does not interpret you.
 * Pure: takes the units, the done set and a note lookup, returns plain numbers and words.
 */
import { recurring, wordCount } from '../notes/analysis.js';

export function reflect({ units, done, saved }) {
  const rows = [], all = [];
  for (const u of units) {
    const notes = u.experiments.map(e => ({ id: e.id, title: e.title, text: String(saved(e.id) || '').trim() })).filter(n => n.text);
    notes.forEach(n => all.push(n.text));
    rows.push({ unit: u.title, number: u.number, finished: u.experiments.every(e => done.has(e.id)), done: u.experiments.filter(e => done.has(e.id)).length, of: u.experiments.length, notes: notes.length, words: notes.reduce((a, n) => a + wordCount(n.text), 0), top: recurring(notes.map(n => n.text), 3).filter(w => w.count >= 2) });
  }
  const words = all.reduce((a, t) => a + wordCount(t), 0);
  return { notes: all.length, words, units: rows, recurring: all.length >= 2 ? recurring(all, 10).filter(w => w.count >= 2) : [] };
}
