import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { pickWords, flattenWords, LANGS } from '../../assets/js/experiments/ocr.js';
const W = (text, confidence = 90) => ({ text, confidence });
test('only confident, readable words are kept, once each, in order', () => {
  assert.deepEqual(pickWords([W('OPEN'), W('Hotel,'), W('open'), W('x'), W('12'), W('€5.50'), W('Bäckerei'), W('l|l', 30), W('"EXIT"'), W('---')]), ['OPEN', 'Hotel', 'Bäckerei', 'EXIT']);
});
test('low confidence and junk are dropped, and the list is capped', () => {
  assert.deepEqual(pickWords([W('maybe', 40), W('sure', 80)]), ['sure']);
  assert.equal(pickWords(Array.from({ length: 200 }, (_, i) => W('word' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))))).length, 60);
  assert.deepEqual(pickWords(null), []);
});
test('words come out of blocks in reading order, or from a flat list', () => {
  const data = { blocks: [{ paragraphs: [{ lines: [{ words: [W('a1'), W('b2')] }, { words: [W('c3')] }] }] }] };
  assert.deepEqual(flattenWords(data).map(w => w.text), ['a1', 'b2', 'c3']);
  assert.deepEqual(flattenWords({ words: [W('flat')] }).map(w => w.text), ['flat']); assert.deepEqual(flattenWords(null), []);
});
test('the reader is served from this site and never talks to a network service', () => {
  const src = fs.readFileSync(new URL('../../assets/js/experiments/ocr.js', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no external addresses');
  assert.ok(/cacheMethod: 'none'/.test(src) && /workerBlobURL: false/.test(src));
  assert.deepEqual(Object.keys(LANGS), ['eng+deu', 'eng', 'deu']);
});
test('every vendored file the reader needs is present', () => {
  const d = new URL('../../assets/js/vendor/tesseract/', import.meta.url);
  for (const f of ['tesseract.esm.min.js', 'worker.min.js', 'core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js', 'lang/eng.traineddata.gz', 'lang/deu.traineddata.gz', 'tesseract-js-LICENSE.txt']) assert.ok(fs.existsSync(new URL(f, d)), f);
});
