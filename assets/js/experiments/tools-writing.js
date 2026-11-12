/**
 * /assets/js/experiments/tools-writing.js
 * Interactive tools for the writing and card experiments. Everything runs in the browser.
 * Photos and documents you add are read here and never uploaded.
 */
import { el } from './tools.js';
import { mulberry32, newSeed } from './rng.js';
import { endWordFrame, burnPlan, burnedAfter, pageWords, blackoutPoem } from './text-ops.js';
import { draw } from './cards.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const readDataUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });

// ── a frame of end-words, from a borrowed line or from words found in a photo ──
export function wordPoemTool(cfg) {
  const photo = cfg.source === 'photo';
  const area = el('textarea', { rows: photo ? 3 : 2, id: 'xpWords', 'aria-label': photo ? 'Words you found in the photo' : 'The borrowed line',
    placeholder: photo ? 'Type the words and signs you can see in the photo, separated by spaces or lines.' : 'Type or paste one line from a poem or song.' });
  const shuf = el('input', { type: 'checkbox', id: 'xpShuffle' }); shuf.checked = !!photo;
  const out = el('div', { class: 'xp-out', 'aria-live': 'polite' });
  const preview = el('div', { class: 'xp-photo' });
  const make = el('button', { type: 'button', class: 'xp-btn', id: 'xpFrame' }, 'Make the frame');
  make.onclick = () => {
    const frame = endWordFrame(area.value, mulberry32(newSeed()), { shuffled: shuf.checked, max: cfg.max || 16 });
    if (frame.length < (cfg.min || 4)) { out.replaceChildren(el('p', { class: 'xp-hint' }, `Give me at least ${cfg.min || 4} words.`)); return; }
    out.replaceChildren(el('p', { class: 'xp-hint' }, `Write ${frame.length} lines. Each line must end with its word.`),
      el('ol', { class: 'xp-frame' }, frame.map(f => el('li', {}, el('span', { class: 'xp-blank' }, '………………'), ' ', el('strong', {}, f.word)))));
  };
  const parts = [el('p', { class: 'xp-k' }, photo ? 'Words from a photo' : 'The borrowed line')];
  if (photo) {
    const file = el('input', { type: 'file', accept: 'image/*', class: 'xp-file', 'aria-label': 'Choose a photo' });
    file.onchange = async () => { const f = file.files && file.files[0]; if (!f) return;
      try { const url = await readDataUrl(f); preview.replaceChildren(el('img', { src: url, alt: 'Your photo, shown here only', style: 'max-width:100%;max-height:320px;border-radius:4px' })); }
      catch { preview.replaceChildren(el('p', { class: 'xp-hint' }, 'That photo could not be opened.')); } };
    parts.push(el('div', { class: 'xp-row' }, file), preview, el('p', { class: 'xp-hint' }, 'The photo stays in this page. It is not uploaded.'));
  }
  parts.push(area, el('div', { class: 'xp-row' }, el('label', {}, shuf, ' Shuffle the order'), make), out);
  return el('div', { class: 'xp-tool' }, ...parts);
}

// ── a page that burns until a haiku is left ──
export function burnTool() {
  const area = el('textarea', { rows: 8, id: 'xpBurnText', 'aria-label': 'Your page', placeholder: 'Press Start, then write without stopping for one minute. Do not fix anything.' });
  const clock = el('p', { class: 'xp-time', 'aria-live': 'off' }, '1:00');
  const page = el('div', { class: 'xp-page', 'aria-live': 'polite' });
  const start = el('button', { type: 'button', class: 'xp-btn', id: 'xpBurnStart' }, 'Start the minute');
  const burn = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpBurn', hidden: true }, 'Burn the page');
  let left = 60, timer = null;
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const finishWriting = () => { clearInterval(timer); timer = null; area.readOnly = true; start.hidden = true; burn.hidden = false; clock.textContent = 'Time. Now burn it.'; };
  start.onclick = () => { area.readOnly = false; area.focus(); start.disabled = true;
    timer = setInterval(() => { left--; clock.textContent = fmt(Math.max(0, left)); if (left <= 0) finishWriting(); }, 1000); };
  burn.onclick = () => {
    burn.disabled = true;
    const plan = burnPlan(area.value, mulberry32(newSeed()));
    if (plan.words.length < 12) { page.replaceChildren(el('p', { class: 'xp-hint' }, 'There is not enough on the page to burn. Write at least 12 words next time.')); burn.disabled = false; return; }
    const spans = plan.words.map(w => el('span', { class: 'xp-w' }, w + ' '));
    page.replaceChildren(el('p', { class: 'xp-burnt' }, ...spans)); area.hidden = true;
    const total = plan.order.length, show = () => {
      if (!plan.haiku) { page.append(el('p', { class: 'xp-hint' }, 'No haiku was hiding in that page. Everything burned. Next time, write a little more.')); return; }
      page.replaceChildren(el('div', { class: 'xp-haiku', id: 'xpHaiku' }, plan.haiku.map(line => el('p', {}, line.map(i => plan.words[i]).join(' ')))),
        el('p', { class: 'xp-hint' }, 'This is what the fire left. Write it down exactly as it is.'));
    };
    const gone = n => { const g = burnedAfter(plan, n); spans.forEach((s, i) => s.classList.toggle('gone', g.has(i))); };
    if (reduced() || !total) { gone(total); show(); return; }
    let n = 0; const step = Math.max(1, Math.ceil(total / 40));
    const t = setInterval(() => { n = Math.min(total, n + step); gone(n); if (n >= total) { clearInterval(t); setTimeout(show, 900); } }, 280);
  };
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'The burning page'), clock, area, el('div', { class: 'xp-row' }, start, burn), page,
    el('p', { class: 'xp-hint' }, 'Nothing you type here is saved or sent anywhere. It is gone when you leave.'));
}

// ── a deck of strategy cards ──
export function cardsTool(cfg) {
  const seen = new Set(), n = cfg.count || 1;
  const hand = el('div', { class: 'xp-hand', 'aria-live': 'polite' }, el('p', { class: 'xp-hint' }, 'No card drawn yet.'));
  const btn = el('button', { type: 'button', class: 'xp-btn', id: 'xpDraw' }, n > 1 ? `Draw ${n} cards` : 'Draw a card');
  btn.onclick = () => {
    const cards = draw(mulberry32(newSeed()), n, seen);
    hand.replaceChildren(...cards.map(c => el('div', { class: 'xp-card-face' }, el('p', { class: 'xp-card-text' }, c.text), el('p', { class: 'xp-card-limit' }, 'Limit: ', c.limit))));
  };
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'The deck'), el('div', { class: 'xp-row' }, btn), hand,
    el('p', { class: 'xp-hint' }, 'Cards are not repeated until the whole deck has been drawn. You do not get to put one back.'));
}

// ── blackout poetry from a PDF, a text file, or pasted text ──
export function blackoutTool() {
  let words = [], kept = new Set(), pdf = null, covered = false;
  const status = el('p', { class: 'xp-hint', 'aria-live': 'polite' }, 'Choose a PDF or text file, or paste some text. It stays in this page.');
  const file = el('input', { type: 'file', accept: '.pdf,.txt,.md,text/plain,application/pdf', class: 'xp-file', 'aria-label': 'Choose a PDF or text file' });
  const paste = el('textarea', { rows: 3, id: 'xpPaste', 'aria-label': 'Or paste text', placeholder: 'Or paste a page of text here.' });
  const pageNo = el('input', { type: 'number', min: 1, value: 1, id: 'xpPageNo', 'aria-label': 'Page number' });
  const pageRow = el('div', { class: 'xp-row', hidden: true }, el('label', {}, 'Page ', pageNo), el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpPageGo' }, 'Show this page'),
    el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpPageRandom' }, 'Random page'));
  const board = el('div', { class: 'xp-blackout', id: 'xpBoard' });
  const poem = el('p', { class: 'xp-poem', id: 'xpPoem', 'aria-live': 'polite' });
  const cover = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpCover', hidden: true }, 'Black out the rest');
  const clear = el('button', { type: 'button', class: 'xp-btn xp-btn--alt', id: 'xpClear', hidden: true }, 'Start again on this page');

  const draw = () => {
    board.replaceChildren(...words.map((w, i) => {
      const b = el('button', { type: 'button', class: 'xp-bw' + (kept.has(i) ? ' keep' : covered ? ' cover' : ''), 'aria-pressed': String(kept.has(i)),
        onclick: () => { kept.has(i) ? kept.delete(i) : kept.add(i); draw(); } }, w);
      return b;
    }));
    poem.textContent = kept.size ? blackoutPoem(words, kept) : '';
    cover.hidden = clear.hidden = !words.length;
    cover.textContent = covered ? 'Show the page again' : 'Black out the rest';
  };
  const setText = text => { words = pageWords(text); kept = new Set(); covered = false;
    status.textContent = words.length ? `${words.length} words. Tap the ones you want to keep. Keep at most 25 words.` : 'No text was found on that page. Try another page, or a different file.'; draw(); };
  const showPage = async n => {
    const p = await pdf.getPage(n), tc = await p.getTextContent();
    setText(tc.items.map(i => i.str).join(' '));
  };
  file.onchange = async () => {
    const f = file.files && file.files[0]; if (!f) return;
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        status.textContent = 'Opening the PDF…';
        const lib = await import('/assets/js/vendor/pdf.min.js');
        lib.GlobalWorkerOptions.workerSrc = '/assets/js/vendor/pdf.worker.min.js';
        pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        pageNo.max = pdf.numPages; pageRow.hidden = false; pageNo.value = 1;
        await showPage(1);
      } else { pdf = null; pageRow.hidden = true; setText(await f.text()); }
    } catch (e) { status.textContent = 'That file could not be read. A scanned PDF has no text in it; try a PDF made from a document, or paste the text.'; }
  };
  pageRow.querySelector('#xpPageGo').onclick = () => { const n = Math.min(pdf.numPages, Math.max(1, +pageNo.value || 1)); pageNo.value = n; showPage(n); };
  pageRow.querySelector('#xpPageRandom').onclick = () => { const n = 1 + Math.floor(mulberry32(newSeed())() * pdf.numPages); pageNo.value = n; showPage(n); };
  paste.oninput = () => { pdf = null; pageRow.hidden = true; setText(paste.value); };
  cover.onclick = () => { covered = !covered; draw(); };
  clear.onclick = () => { kept = new Set(); covered = false; draw(); };
  return el('div', { class: 'xp-tool' }, el('p', { class: 'xp-k' }, 'Blackout poetry'), el('div', { class: 'xp-row' }, file), paste, pageRow, status, board,
    el('div', { class: 'xp-row' }, cover, clear), el('p', { class: 'xp-k' }, 'Your poem'), poem);
}
